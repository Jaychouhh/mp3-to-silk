#!/bin/bash

# MP3 to SILK Converter - 一键安装脚本
# 支持: Linux, macOS, Termux (Android)
# FFmpeg 已内置，无需系统安装

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "=========================================="
echo "   MP3 to SILK Converter 一键安装"
echo "=========================================="
echo ""

# 检测系统类型
detect_system() {
    if [ -f /data/data/com.termux/files/usr/bin/pkg ]; then
        echo "termux"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command -v apt-get &> /dev/null; then
            echo "debian"
        elif command -v yum &> /dev/null; then
            echo "centos"
        elif command -v dnf &> /dev/null; then
            echo "fedora"
        elif command -v pacman &> /dev/null; then
            echo "arch"
        elif command -v apk &> /dev/null; then
            echo "alpine"
        else
            echo "linux"
        fi
    else
        echo "unknown"
    fi
}

# 安装 Node.js
install_nodejs() {
    echo -e "${YELLOW}[*] 安装 Node.js...${NC}"

    case $SYSTEM in
        termux)
            # 检查并设置 Termux 镜像源
            if ! pkg update -y 2>&1 | grep -q "Reading package"; then
                echo -e "${YELLOW}[*] 配置 Termux 镜像源...${NC}"
                # 使用清华镜像源
                mkdir -p $PREFIX/etc/apt/sources.list.d
                echo "deb https://mirrors.tuna.tsinghua.edu.cn/termux/apt/termux-main stable main" > $PREFIX/etc/apt/sources.list.d/tuna.list
                pkg update -y
            fi
            pkg install -y nodejs ffmpeg git
            ;;
        macos)
            if command -v brew &> /dev/null; then
                brew install node
            else
                echo -e "${YELLOW}[*] 安装 Homebrew...${NC}"
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
                brew install node
            fi
            ;;
        debian)
            # 使用 NodeSource 安装最新 LTS
            curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
            sudo apt-get install -y nodejs git
            ;;
        centos)
            curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
            sudo yum install -y nodejs git
            ;;
        fedora)
            sudo dnf install -y nodejs npm git
            ;;
        arch)
            sudo pacman -Sy --noconfirm nodejs npm git
            ;;
        alpine)
            sudo apk add --no-cache nodejs npm git
            ;;
        *)
            echo -e "${RED}[!] 未知系统，请手动安装 Node.js 16+${NC}"
            echo "    访问: https://nodejs.org/"
            exit 1
            ;;
    esac
}

SYSTEM=$(detect_system)
echo -e "${GREEN}[*] 检测到系统: $SYSTEM${NC}"

# 检查 Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    echo -e "${GREEN}[*] Node.js 已安装: $(node -v)${NC}"

    if [ "$NODE_VERSION" -lt 16 ]; then
        echo -e "${YELLOW}[!] Node.js 版本过低，需要 16+，正在升级...${NC}"
        install_nodejs
    fi
else
    echo -e "${YELLOW}[*] 未检测到 Node.js${NC}"
    install_nodejs
fi

# 检查 git
if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}[*] 安装 git...${NC}"
    case $SYSTEM in
        termux) pkg install -y git ;;
        macos) brew install git ;;
        debian) sudo apt-get install -y git ;;
        centos) sudo yum install -y git ;;
        fedora) sudo dnf install -y git ;;
        arch) sudo pacman -S --noconfirm git ;;
        alpine) sudo apk add --no-cache git ;;
    esac
fi

# Termux 需要单独安装 ffmpeg (ffmpeg-static 不兼容 Android)
if [ "$SYSTEM" = "termux" ]; then
    if ! command -v ffmpeg &> /dev/null; then
        echo -e "${YELLOW}[*] 安装 FFmpeg (Termux 需要)...${NC}"
        pkg install -y ffmpeg
    else
        echo -e "${GREEN}[*] FFmpeg 已安装${NC}"
    fi
fi

# 设置安装目录
INSTALL_DIR="$HOME/mp3-to-silk"

# 克隆或更新项目
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${GREEN}[*] 更新项目...${NC}"
    cd "$INSTALL_DIR"
    git pull 2>/dev/null || true
else
    echo -e "${GREEN}[*] 下载项目...${NC}"
    git clone https://github.com/jaychouhh/mp3-to-silk.git "$INSTALL_DIR" 2>/dev/null || {
        # 如果 git clone 失败，使用备用方法
        echo -e "${YELLOW}[*] Git clone 失败，尝试直接下载...${NC}"
        mkdir -p "$INSTALL_DIR"
        cd "$INSTALL_DIR"
        curl -fsSL https://github.com/jaychouhh/mp3-to-silk/archive/main.tar.gz | tar -xz --strip-components=1
    }
    cd "$INSTALL_DIR"
fi

# 安装 npm 依赖
if [ "$SYSTEM" = "termux" ]; then
    echo -e "${GREEN}[*] 安装依赖 (Termux 使用系统 FFmpeg)...${NC}"
    # 跳过 ffmpeg-static 的安装脚本，因为它在 Android 上不可用
    npm install --ignore-scripts
else
    echo -e "${GREEN}[*] 安装依赖 (包含 FFmpeg)...${NC}"
    npm install
fi

echo ""
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}   安装完成!${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""
echo "启动命令:"
echo -e "  ${YELLOW}cd $INSTALL_DIR && npm start${NC}"
echo ""
echo "浏览器访问:"
echo -e "  ${YELLOW}http://localhost:9527${NC}"
echo ""

# 获取局域网 IP
get_local_ip() {
    if command -v ip &> /dev/null; then
        ip route get 1 2>/dev/null | awk '{print $7; exit}'
    elif command -v ifconfig &> /dev/null; then
        ifconfig 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | head -1
    fi
}

LOCAL_IP=$(get_local_ip)
if [ -n "$LOCAL_IP" ]; then
    echo "手机访问 (同一局域网):"
    echo -e "  ${YELLOW}http://$LOCAL_IP:9527${NC}"
    echo ""
fi

# 自动启动服务器
echo -e "${GREEN}[*] 启动服务器...${NC}"
echo ""
npm start
