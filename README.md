# MP3 to SILK Converter

将 MP3 等音频格式转换为 SILK 格式（微信语音格式）的网页工具。

**特性：**
- 支持批量转换
- 移动端友好
- FFmpeg 内置（Termux 需单独安装）
- 一键安装脚本

## 一键安装

**Linux / macOS / Termux (Android):**

```bash
curl -fsSL https://raw.githubusercontent.com/jaychouhh/mp3-to-silk/main/install.sh | bash
```

或者使用 wget:

```bash
wget -qO- https://raw.githubusercontent.com/jaychouhh/mp3-to-silk/main/install.sh | bash
```

**Termux 用户如果没有 curl:**

```bash
pkg install curl && curl -fsSL https://raw.githubusercontent.com/jaychouhh/mp3-to-silk/main/install.sh | bash
```

脚本会自动：
- 检测系统类型
- 安装 Node.js（如果未安装）
- 下载项目并安装依赖
- Termux 会额外安装 FFmpeg（其他平台已内置）

## 手动安装

### 前置要求

- Node.js 16+（FFmpeg 已内置，无需安装）

### Termux (Android) 安装

```bash
pkg update && pkg install nodejs ffmpeg git
git clone https://github.com/jaychouhh/mp3-to-silk.git
cd mp3-to-silk
npm install
npm start
```

> 注意：Termux 必须安装系统的 ffmpeg，因为 ffmpeg-static 不兼容 Android。

### Linux (Debian/Ubuntu) 安装

```bash
# 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs git

git clone https://github.com/jaychouhh/mp3-to-silk.git
cd mp3-to-silk
npm install
npm start
```

### macOS 安装

```bash
brew install node
git clone https://github.com/jaychouhh/mp3-to-silk.git
cd mp3-to-silk
npm install
npm start
```

## 使用方法

1. 启动服务器后，在浏览器访问 `http://localhost:9527`
2. 上传音频文件（支持多选批量转换）
3. 点击"开始批量转换"
4. 自动下载转换后的 .silk 文件

## 支持的格式

- 输入: MP3, WAV, OGG, M4A, FLAC, AAC
- 输出: SILK (微信语音格式，24000Hz)

## 端口配置

默认端口 9527，可通过环境变量修改:

```bash
PORT=8080 npm start
```

## 手机访问

启动服务器后，同一局域网内的手机可以通过电脑 IP 访问：

```
http://电脑IP:9527
```

## 技术栈

- Express.js - Web 服务器
- silk-wasm - SILK 编码器 (WebAssembly)
- ffmpeg-static - 内置 FFmpeg 二进制

## 许可证

MIT
