#!/bin/bash
# OpenClaw onboard 向导启动脚本
# 兼容 macOS / Linux (含 Deepin) / Windows (Git Bash / WSL)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_DIR="$SCRIPT_DIR/.openclaw-zero-state"
CONFIG_FILE="$STATE_DIR/openclaw.json"

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

detect_node() {
  if command -v node >/dev/null 2>&1; then
    echo "$(command -v node)"
    return
  fi
  # Windows 常见路径
  for p in \
    "$PROGRAMFILES/nodejs/node.exe" \
    "$LOCALAPPDATA/Programs/nodejs/node.exe"; do
    [ -f "$p" ] && echo "$p" && return
  done
  echo ""
}

OS=$(detect_os)
NODE=$(detect_node)

if [ -z "$NODE" ]; then
  echo "✗ 未找到 node，请先安装 Node.js: https://nodejs.org"
  exit 1
fi

echo "系统: $OS  |  Node: $($NODE --version 2>/dev/null)"

# ─── 初始化目录与配置 ─────────────────────────────────────────
mkdir -p "$STATE_DIR"

EXAMPLE_CONFIG="$SCRIPT_DIR/.openclaw-state.example/openclaw.json"
if [ ! -f "$CONFIG_FILE" ]; then
  if [ -f "$EXAMPLE_CONFIG" ]; then
    cp "$EXAMPLE_CONFIG" "$CONFIG_FILE"
    echo "已从示例复制配置文件: $EXAMPLE_CONFIG -> $CONFIG_FILE"
  else
    echo '{}' > "$CONFIG_FILE"
    echo "已创建空配置文件: $CONFIG_FILE（建议从 .openclaw-state.example/openclaw.json 复制完整配置）"
  fi
fi

export OPENCLAW_CONFIG_PATH="$CONFIG_FILE"
export OPENCLAW_STATE_DIR="$STATE_DIR"
export OPENCLAW_GATEWAY_PORT=3001

echo "配置文件: $OPENCLAW_CONFIG_PATH"
echo "状态目录: $OPENCLAW_STATE_DIR"
echo "端口: $OPENCLAW_GATEWAY_PORT"
echo ""

# ─── 运行 ────────────────────────────────────────────────────
if [ $# -eq 0 ]; then
  echo "启动 onboard 向导..."
  "$NODE" "$SCRIPT_DIR/dist/index.mjs" onboard
else
  "$NODE" "$SCRIPT_DIR/dist/index.mjs" "$@"
fi
