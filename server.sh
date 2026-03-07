#!/bin/bash
# OpenClaw Gateway 服务启动脚本
# 兼容 macOS / Linux (含 Deepin) / Windows (Git Bash / WSL)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_DIR="$SCRIPT_DIR/.openclaw-zero-state"
CONFIG_FILE="$STATE_DIR/openclaw.json"
PID_FILE="$SCRIPT_DIR/.gateway.pid"
PORT=3001

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
  for p in \
    "$PROGRAMFILES/nodejs/node.exe" \
    "$LOCALAPPDATA/Programs/nodejs/node.exe"; do
    [ -f "$p" ] && echo "$p" && return
  done
  echo ""
}

# 查询占用指定端口的 PID（跨平台）
port_pid() {
  local port=$1
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti:"$port" 2>/dev/null
  elif command -v ss >/dev/null 2>&1; then
    ss -tlnp 2>/dev/null | awk -v p="$port" '$4 ~ ":"p"$" {match($6,/pid=([0-9]+)/,a); if(a[1]) print a[1]}'
  elif command -v netstat >/dev/null 2>&1; then
    # Git Bash / Windows netstat
    netstat -ano 2>/dev/null | awk -v p="$port" '$2 ~ ":"p"$" && $4=="LISTENING" {print $5; exit}'
  fi
}

# 打开浏览器（跨平台）
open_browser() {
  local url=$1
  case "$OS" in
    mac) open "$url" ;;
    win) start "" "$url" 2>/dev/null || cmd.exe /c start "" "$url" 2>/dev/null ;;
    wsl) cmd.exe /c start "" "$url" 2>/dev/null ;;
    linux)
      if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$url" 2>/dev/null &
      else
        echo "请手动在浏览器中打开: $url"
      fi
      ;;
  esac
}

# 临时日志路径（Windows 不一定有 /tmp）
tmp_log() {
  if [ -d /tmp ]; then
    echo "/tmp/openclaw-zero-gateway.log"
  else
    echo "$SCRIPT_DIR/logs/openclaw-zero-gateway.log"
  fi
}

OS=$(detect_os)
NODE=$(detect_node)
LOG_FILE="$SCRIPT_DIR/logs/openclaw-zero.log"
TMP_LOG=$(tmp_log)

if [ -z "$NODE" ]; then
  echo "✗ 未找到 node，请先安装 Node.js: https://nodejs.org"
  exit 1
fi

# ─── 初始化 ──────────────────────────────────────────────────
mkdir -p "$STATE_DIR"
mkdir -p "$SCRIPT_DIR/logs"

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

# 从配置文件动态读取 token，回退到环境变量
GATEWAY_TOKEN=$(jq -r '.gateway.auth.token // empty' "$CONFIG_FILE" 2>/dev/null)
if [ -z "$GATEWAY_TOKEN" ]; then
  GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-}"
fi

# ─── 功能函数 ────────────────────────────────────────────────
stop_gateway() {
  if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
      echo "停止旧进程 (PID: $OLD_PID)..."
      kill "$OLD_PID" 2>/dev/null
      sleep 1
      if kill -0 "$OLD_PID" 2>/dev/null; then
        kill -9 "$OLD_PID" 2>/dev/null
      fi
    fi
    rm -f "$PID_FILE"
  fi

  PORT_PID=$(port_pid "$PORT")
  if [ -n "$PORT_PID" ]; then
    echo "停止占用端口 $PORT 的进程 (PID: $PORT_PID)..."
    kill "$PORT_PID" 2>/dev/null
    sleep 1
  fi
}

start_gateway() {
  export OPENCLAW_CONFIG_PATH="$CONFIG_FILE"
  export OPENCLAW_STATE_DIR="$STATE_DIR"
  export OPENCLAW_GATEWAY_PORT="$PORT"

  echo "系统: $OS  |  Node: $($NODE --version 2>/dev/null)"
  echo "启动 Gateway 服务..."
  echo "配置文件: $OPENCLAW_CONFIG_PATH"
  echo "状态目录: $OPENCLAW_STATE_DIR"
  echo "日志文件: $TMP_LOG"
  echo "端口: $PORT"
  echo ""

  nohup "$NODE" "$SCRIPT_DIR/dist/index.mjs" gateway --port "$PORT" > "$TMP_LOG" 2>&1 &
  GATEWAY_PID=$!
  echo "$GATEWAY_PID" > "$PID_FILE"

  echo "等待 Gateway 就绪..."
  WEBUI_READY=0
  i=0
  while [ $i -lt 30 ]; do
    i=$((i + 1))
    if curl -s -o /dev/null --connect-timeout 1 "http://127.0.0.1:$PORT/" 2>/dev/null; then
      echo "Gateway 已就绪 (${i}s)"
      WEBUI_READY=1
      break
    fi
    if ! kill -0 $GATEWAY_PID 2>/dev/null; then
      echo "Gateway 进程已退出，启动失败"
      cat "$TMP_LOG"
      rm -f "$PID_FILE"
      exit 1
    fi
    sleep 1
  done

  if kill -0 $GATEWAY_PID 2>/dev/null; then
    if [ "$WEBUI_READY" -eq 0 ]; then
      echo "⚠ curl 检测未成功，Gateway 可能尚未就绪，请稍后手动打开 Web UI"
    fi
    WEBUI_URL="http://127.0.0.1:$PORT/#token=${GATEWAY_TOKEN}"
    echo "Gateway 服务已启动 (PID: $GATEWAY_PID)"
    echo "Web UI: $WEBUI_URL"
    if [ "$WEBUI_READY" -eq 1 ]; then
      echo "正在打开浏览器..."
      open_browser "$WEBUI_URL"
    else
      echo "请手动在浏览器中打开上述地址"
    fi
  else
    echo "Gateway 服务启动失败，请查看日志:"
    cat "$TMP_LOG"
    rm -f "$PID_FILE"
    exit 1
  fi
}

update_cookie() {
  echo "更新 Claude Web Cookie..."

  if [ -z "$2" ]; then
    echo "错误：请提供完整的 cookie 字符串"
    echo "用法: $0 update-cookie \"完整的cookie字符串\""
    echo ""
    echo "从浏览器获取 cookie："
    echo "1. 打开 https://claude.ai"
    echo "2. 按 F12 打开开发者工具"
    echo "3. 切换到 Network 标签"
    echo "4. 发送一条消息"
    echo "5. 找到 completion 请求"
    echo "6. 复制 Request Headers 中的完整 cookie 值"
    exit 1
  fi

  COOKIE_STRING="$2"
  AUTH_FILE="$STATE_DIR/agents/main/agent/auth-profiles.json"

  SESSION_KEY=$(echo "$COOKIE_STRING" | grep -oP 'sessionKey=\K[^;]+' || echo "")

  if [ -z "$SESSION_KEY" ]; then
    echo "错误：cookie 中未找到 sessionKey"
    exit 1
  fi

  JSON_DATA=$(cat <<EOF
{
  "sessionKey": "$SESSION_KEY",
  "cookie": "$COOKIE_STRING",
  "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}
EOF
)

  if [ -f "$AUTH_FILE" ]; then
    jq --arg key "$JSON_DATA" '.profiles["claude-web:default"].key = $key' "$AUTH_FILE" > "$AUTH_FILE.tmp" && mv "$AUTH_FILE.tmp" "$AUTH_FILE"
    echo "✓ Claude Web cookie 已更新"
    echo "✓ SessionKey: ${SESSION_KEY:0:50}..."
    echo ""
    echo "现在重启服务："
    echo "  $0 restart"
  else
    echo "错误：auth-profiles.json 不存在，请先运行 ./onboard.sh"
    exit 1
  fi
}

# ─── 入口 ────────────────────────────────────────────────────
case "${1:-start}" in
  start)
    stop_gateway
    start_gateway
    ;;
  stop)
    stop_gateway
    echo "Gateway 服务已停止"
    ;;
  restart)
    stop_gateway
    start_gateway
    ;;
  status)
    if [ -f "$PID_FILE" ]; then
      PID=$(cat "$PID_FILE")
      if kill -0 "$PID" 2>/dev/null; then
        echo "Gateway 服务运行中 (PID: $PID)"
        echo "Web UI: http://127.0.0.1:$PORT/#token=${GATEWAY_TOKEN}"
      else
        echo "Gateway 服务未运行 (PID 文件存在但进程已退出)"
      fi
    else
      PORT_PID=$(port_pid "$PORT")
      if [ -n "$PORT_PID" ]; then
        echo "端口 $PORT 被进程 $PORT_PID 占用，但不是本脚本启动的 Gateway"
      else
        echo "Gateway 服务未运行"
      fi
    fi
    ;;
  update-cookie)
    update_cookie "$@"
    ;;
  *)
    echo "用法: $0 {start|stop|restart|status|update-cookie}"
    echo ""
    echo "命令说明："
    echo "  start         - 启动 Gateway 服务"
    echo "  stop          - 停止 Gateway 服务"
    echo "  restart       - 重启 Gateway 服务"
    echo "  status        - 查看服务状态"
    echo "  update-cookie - 更新 Claude Web cookie"
    echo ""
    echo "示例："
    echo "  $0 update-cookie \"sessionKey=sk-ant-...; anthropic-device-id=...\""
    exit 1
    ;;
esac
