const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { encode } = require('silk-wasm');
const ffmpeg = require('fluent-ffmpeg');

// 检测是否在 Termux 环境
const isTermux = fs.existsSync('/data/data/com.termux');

// 设置 ffmpeg 路径
if (isTermux) {
  // Termux 使用系统安装的 ffmpeg
  const termuxFfmpeg = '/data/data/com.termux/files/usr/bin/ffmpeg';
  if (fs.existsSync(termuxFfmpeg)) {
    ffmpeg.setFfmpegPath(termuxFfmpeg);
    console.log('[*] 使用 Termux ffmpeg');
  } else {
    console.error('[!] 请先安装 ffmpeg: pkg install ffmpeg');
    process.exit(1);
  }
} else {
  // 其他平台使用 ffmpeg-static
  try {
    const ffmpegStatic = require('ffmpeg-static');
    ffmpeg.setFfmpegPath(ffmpegStatic);
    console.log('[*] 使用内置 ffmpeg');
  } catch (e) {
    // 尝试使用系统 ffmpeg
    try {
      execSync('ffmpeg -version', { stdio: 'ignore' });
      console.log('[*] 使用系统 ffmpeg');
    } catch {
      console.error('[!] 未找到 ffmpeg，请安装 ffmpeg');
      process.exit(1);
    }
  }
}

const app = express();
const PORT = process.env.PORT || 9527;

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件格式'));
    }
  }
});

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

/**
 * 将音频转换为 PCM 格式
 */
function convertToPCM(inputPath, outputPath, sampleRate = 24000) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioFrequency(sampleRate)
      .audioChannels(1)
      .audioCodec('pcm_s16le')
      .format('s16le')
      .on('error', reject)
      .on('end', resolve)
      .save(outputPath);
  });
}

// 转换API
app.post('/api/convert', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请上传音频文件' });
  }

  const inputPath = req.file.path;
  const pcmPath = inputPath + '.pcm';
  const outputPath = inputPath.replace(/\.[^.]+$/, '.silk');

  const cleanup = () => {
    fs.unlink(inputPath, () => {});
    fs.unlink(pcmPath, () => {});
    fs.unlink(outputPath, () => {});
  };

  try {
    // 1. 转换为 PCM
    await convertToPCM(inputPath, pcmPath, 24000);

    // 2. 读取 PCM 数据
    const pcmBuffer = fs.readFileSync(pcmPath);

    // 3. 编码为 SILK
    const result = await encode(pcmBuffer, 24000);

    // 4. 写入文件
    fs.writeFileSync(outputPath, Buffer.from(result.data));

    // 5. 下载
    const originalName = path.basename(req.file.originalname, path.extname(req.file.originalname));
    res.download(outputPath, `${originalName}.silk`, (err) => {
      cleanup();
      if (err && !res.headersSent) {
        res.status(500).json({ error: '下载失败' });
      }
    });
  } catch (error) {
    console.error('转换失败:', error);
    cleanup();
    res.status(500).json({ error: `转换失败: ${error.message}` });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', port: PORT });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log(`局域网访问: http://0.0.0.0:${PORT}`);
});
