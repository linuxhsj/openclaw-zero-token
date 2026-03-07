#!/bin/bash
# 启动 Chrome 调试模式（用于 OpenClaw 连接）
# 兼容 macOS / Linux (含 Deepin) / Windows (Git Bash / WSL)
# 单实例：若已有调试 Chrome 则先关闭再重启

echo "=========================================="
echo "  启动 Chrome 调试模式"
echo "=========================================="
echo ""

# ─── 环境检测 ────────────────────────────────────────────────
detect_os() {
  case "$OSTYPE" in
    darwin*)  echo "mac" ;;
    msys*|cygwin*|mingw*) echo "win" ;;
    *)
      if grep -qi microsoft /proc/version 2>/dev/null; then
        echo "wsl"
      else
        echo "linux"
      fi
      ;;
  esac
}

detect_chrome() {
  # Linux: 按优先级逐一检测
  local linux_paths=(
    "/opt/apps/cn.google.chrome-pre/files/google/chrome/google-chrome"  # Deepin
    "/opt/google/chrome/google-chrome"
    "/usr/bin/google-chrome"
    "/usr/bin/google-chrome-stable"
    "/usr/bin/chromium"
    "/usr/bin/chromium-browser"
    "/snap/bin/chromium"
  )
  local mac_paths=(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    "/Applications/Chromium.app/Contents/MacOS/Chromium"
  )
  local win_paths=(
    "$PROGRAMFILES/Google/Chrome/Application/chrome.exe"
    "$PROGRAMFILES (x86)/Google/Chrome/Application/chrome.exe"
    "$LOCALAPPDATA/Google/Chrome/Application/chrome.exe"
    "$PROGRAMFILES/Chromium/Application/chrome.exe"
  )

  case "$OS" in
    mac)
      for p in "${mac_paths[@]}"; do
        [ -f "$p" ] && echo "$p" && return
      done
      # 也尝试命令方式
      command -v google-chrome >/dev/null 2>&1 && echo "google-chrome" && return
      ;;
    win|wsl)
      for p in "${win_paths[@]}"; do
        [ -f "$p" ] && echo "$p" && return
      done
      ;;
    linux)
      for p in "${linux_paths[@]}"; do
        [ -f "$p" ] && echo "$p" && return
      done
      # 命令回退
      for cmd in google-chrome google-chrome-stable chromium chromium-browser; do
        command -v "$cmd" >/dev/null 2>&1 && echo "$cmd" && return
      done
      ;;
  esac
  echo ""
}

detect_user_data_dir() {
  case "$OS" in
    mac)  echo "$HOME/Library/Application Support/Chrome-OpenClaw-Debug" ;;
    win)  echo "$LOCALAPPDATA/Chrome-OpenClaw-Debug" ;;
    wsl)  echo "$HOME/.config/chrome-openclaw-debug" ;;
    *)    echo "$HOME/.config/chrome-openclaw-debug" ;;
  esac
}

OS=$(detect_os)
CHROME_PATH=$(detect_chrome)
USER_DATA_DIR=$(detect_user_data_dir)

echo "系统: $OS"

if [ -z "$CHROME_PATH" ]; then
  echo "✗ 未找到 Chrome / Chromium，请先安装后重试"
  echo ""
  case "$OS" in
    linux) echo "  Ubuntu/Debian: sudo apt install google-chrome-stable" ;;
    mac)   echo "  下载: https://www.google.com/chrome/" ;;
    win)   echo "  下载: https://www.google.com/chrome/" ;;
  esac
  exit 1
fi

echo "Chrome: $CHROME_PATH"
echo "用户数据目录: $USER_DATA_DIR"
echo ""

# ─── 单实例：关闭已有调试 Chrome ─────────────────────────────
if pgrep -f "chrome.*remote-debugging-port=9222" > /dev/null 2>&1; then
  echo "检测到已有调试 Chrome，正在关闭..."
  pkill -f "chrome.*remote-debugging-port=9222" 2>/dev/null
  sleep 2

  if pgrep -f "chrome.*remote-debugging-port=9222" > /dev/null 2>&1; then
    echo "普通关闭失败，尝试强制关闭..."
    pkill -9 -f "chrome.*remote-debugging-port=9222" 2>/dev/null
    sleep 1
  fi

  if pgrep -f "chrome.*remote-debugging-port=9222" > /dev/null 2>&1; then
    echo "✗ 无法关闭现有 Chrome，请手动执行: pkill -9 -f 'chrome.*remote-debugging-port=9222'"
    exit 1
  fi
  echo "✓ 已关闭"
  echo ""
fi

# ─── 启动 Chrome ─────────────────────────────────────────────
TMP_LOG="/tmp/chrome-debug.log"
[ ! -d /tmp ] && TMP_LOG="$HOME/chrome-debug.log"

echo "正在启动 Chrome 调试模式..."
echo "端口: 9222"
echo ""

"$CHROME_PATH" \
  --remote-debugging-port=9222 \
  --user-data-dir="$USER_DATA_DIR" \
  --no-first-run \
  --no-default-browser-check \
  --disable-background-networking \
  --disable-sync \
  --disable-translate \
  --disable-features=TranslateUI \
  --remote-allow-origins=* \
  > "$TMP_LOG" 2>&1 &

CHROME_PID=$!
echo "Chrome 日志: $TMP_LOG"

# ─── 等待启动 ────────────────────────────────────────────────
echo "等待 Chrome 启动..."
for i in {1..15}; do
  if curl -s http://127.0.0.1:9222/json/version > /dev/null 2>&1; then
    break
  fi
  echo -n "."
  sleep 1
done
echo ""
echo ""

# ─── 检查结果 ────────────────────────────────────────────────
if curl -s http://127.0.0.1:9222/json/version > /dev/null 2>&1; then
  VERSION_INFO=$(curl -s http://127.0.0.1:9222/json/version | jq -r '.Browser' 2>/dev/null || echo "未知版本")

  echo "✓ Chrome 调试模式启动成功！"
  echo ""
  echo "Chrome PID: $CHROME_PID"
  echo "Chrome 版本: $VERSION_INFO"
  echo "调试端口: http://127.0.0.1:9222"
  echo "用户数据目录: $USER_DATA_DIR"
  echo ""
  echo "正在打开各 Web 平台登录页（便于授权）..."

  WEB_URLS=(
    "https://claude.ai/new"
    "https://chatgpt.com"
    "https://www.doubao.com/chat/"
    "https://chat.qwen.ai"
    "https://www.kimi.com"
    "https://gemini.google.com/app"
    "https://grok.com"
    "https://chat.deepseek.com/"
    "https://chatglm.cn"
    "https://chat.z.ai/"
  )
  for url in "${WEB_URLS[@]}"; do
    "$CHROME_PATH" --remote-debugging-port=9222 --user-data-dir="$USER_DATA_DIR" "$url" > /dev/null 2>&1 &
    sleep 0.5
  done

  echo "✓ 已打开: Claude, ChatGPT, Doubao, Qwen, Kimi, Gemini, Grok, GLM（DeepSeek 在第 5 步单独登录）"
  echo ""
  echo "=========================================="
  echo "下一步操作："
  echo "=========================================="
  echo "1. 在各标签页中登录需要使用的平台"
  echo "2. 确保 config 中 browser.attachOnly=true 且 browser.cdpUrl=http://127.0.0.1:9222"
  echo "3. 运行 ./onboard.sh 选择对应平台完成授权（将复用此浏览器）"
  echo ""
  echo "停止调试模式："
  echo "  pkill -f 'chrome.*remote-debugging-port=9222'"
  echo "=========================================="
else
  echo "✗ Chrome 启动失败"
  echo ""
  echo "请检查："
  echo "  1. Chrome 路径: $CHROME_PATH"
  echo "  2. 端口 9222 是否被占用: lsof -i:9222"
  echo "  3. 用户数据目录权限: $USER_DATA_DIR"
  echo "  4. 启动日志: $TMP_LOG"
  echo ""
  echo "尝试手动启动："
  echo "  \"$CHROME_PATH\" --remote-debugging-port=9222 --user-data-dir=\"$USER_DATA_DIR\""
  exit 1
fi
