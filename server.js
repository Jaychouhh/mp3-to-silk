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
  const termuxFfmpeg = '/data/data/com.termux/files/usr/bin/ffmpeg';
  if (fs.existsSync(termuxFfmpeg)) {
    ffmpeg.setFfmpegPath(termuxFfmpeg);
    console.log('[*] 使用 Termux ffmpeg');
  } else {
    console.error('[!] 请先安装 ffmpeg: pkg install ffmpeg');
    process.exit(1);
  }
} else {
  try {
    const ffmpegStatic = require('ffmpeg-static');
    ffmpeg.setFfmpegPath(ffmpegStatic);
    console.log('[*] 使用内置 ffmpeg');
  } catch (e) {
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
app.use(express.json());
const PORT = process.env.PORT || 9527;

// 文件夹监控相关
const WATCH_INPUT = isTermux ? '/sdcard/ToSilk' : path.join(__dirname, 'ToSilk');
const WATCH_OUTPUT = isTermux ? '/sdcard/SilkOutput' : path.join(__dirname, 'SilkOutput');
let watchInterval = null;
let processedFiles = new Set();

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

/**
 * 转换单个文件
 */
async function convertFile(inputPath, outputPath) {
  const pcmPath = inputPath + '.pcm';

  try {
    await convertToPCM(inputPath, pcmPath, 24000);
    const pcmBuffer = fs.readFileSync(pcmPath);
    const result = await encode(pcmBuffer, 24000);
    fs.writeFileSync(outputPath, Buffer.from(result.data));
    fs.unlinkSync(pcmPath);
    return true;
  } catch (error) {
    if (fs.existsSync(pcmPath)) fs.unlinkSync(pcmPath);
    throw error;
  }
}

/**
 * 检查并处理监控文件夹中的文件
 */
async function checkWatchFolder() {
  if (!fs.existsSync(WATCH_INPUT)) return;

  const allowedTypes = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];
  const files = fs.readdirSync(WATCH_INPUT);

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!allowedTypes.includes(ext)) continue;

    const inputPath = path.join(WATCH_INPUT, file);
    const fileKey = `${file}-${fs.statSync(inputPath).mtime.getTime()}`;

    if (processedFiles.has(fileKey)) continue;

    const outputName = path.basename(file, ext) + '.silk';
    const outputPath = path.join(WATCH_OUTPUT, outputName);

    console.log(`[监控] 发现新文件: ${file}`);
    processedFiles.add(fileKey);

    try {
      await convertFile(inputPath, outputPath);
      console.log(`[监控] 转换成功: ${file} -> ${outputName}`);
      // 删除原文件
      fs.unlinkSync(inputPath);
    } catch (error) {
      console.error(`[监控] 转换失败: ${file}`, error.message);
      processedFiles.delete(fileKey);
    }
  }
}

/**
 * 启动文件夹监控
 */
function startWatch() {
  if (watchInterval) return false;

  // 创建目录
  if (!fs.existsSync(WATCH_INPUT)) {
    fs.mkdirSync(WATCH_INPUT, { recursive: true });
  }
  if (!fs.existsSync(WATCH_OUTPUT)) {
    fs.mkdirSync(WATCH_OUTPUT, { recursive: true });
  }

  processedFiles.clear();
  watchInterval = setInterval(checkWatchFolder, 2000);
  console.log(`[监控] 已启动，监控目录: ${WATCH_INPUT}`);
  console.log(`[监控] 输出目录: ${WATCH_OUTPUT}`);
  return true;
}

/**
 * 停止文件夹监控
 */
function stopWatch() {
  if (!watchInterval) return false;
  clearInterval(watchInterval);
  watchInterval = null;
  console.log('[监控] 已停止');
  return true;
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
    await convertToPCM(inputPath, pcmPath, 24000);
    const pcmBuffer = fs.readFileSync(pcmPath);
    const result = await encode(pcmBuffer, 24000);
    fs.writeFileSync(outputPath, Buffer.from(result.data));

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

// 监控状态API
app.get('/api/watch/status', (req, res) => {
  res.json({
    enabled: watchInterval !== null,
    inputDir: WATCH_INPUT,
    outputDir: WATCH_OUTPUT,
    isTermux
  });
});

// 启动监控API
app.post('/api/watch/start', (req, res) => {
  const success = startWatch();
  res.json({
    success,
    enabled: watchInterval !== null,
    inputDir: WATCH_INPUT,
    outputDir: WATCH_OUTPUT
  });
});

// 停止监控API
app.post('/api/watch/stop', (req, res) => {
  const success = stopWatch();
  res.json({
    success,
    enabled: watchInterval !== null
  });
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', port: PORT, isTermux });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log(`局域网访问: http://0.0.0.0:${PORT}`);
  if (isTermux) {
    console.log(`[提示] 可在网页中开启文件夹监控功能`);
    console.log(`[提示] 监控目录: ${WATCH_INPUT}`);
  }
});
