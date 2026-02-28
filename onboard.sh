#!/bin/bash
# OpenClaw DeepSeek 独立环境启动脚本
# 设置独立的状态目录和配置文件，不影响系统安装的 OpenClaw

# 使用项目目录下的独立状态目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_DIR="$SCRIPT_DIR/.openclaw-state"
CONFIG_FILE="$STATE_DIR/openclaw.json"

# 创建配置目录（如果不存在）
mkdir -p "$STATE_DIR"

# 创建空配置文件（如果不存在）
if [ ! -f "$CONFIG_FILE" ]; then
  echo '{}' > "$CONFIG_FILE"
  echo "已创建空配置文件: $CONFIG_FILE"
fi

# 设置环境变量
export OPENCLAW_CONFIG_PATH="$CONFIG_FILE"
export OPENCLAW_STATE_DIR="$STATE_DIR"
export OPENCLAW_GATEWAY_PORT=3001

echo "使用独立配置文件: $OPENCLAW_CONFIG_PATH"
echo "使用独立状态目录: $OPENCLAW_STATE_DIR"
echo "使用端口: $OPENCLAW_GATEWAY_PORT"
echo ""

# 如果没有传递参数，默认运行 onboard 向导
if [ $# -eq 0 ]; then
  echo "启动 onboard 向导..."
  node "$SCRIPT_DIR/dist/index.mjs" onboard
else
  # 运行用户指定的命令
  node "$SCRIPT_DIR/dist/index.mjs" "$@"
fi
