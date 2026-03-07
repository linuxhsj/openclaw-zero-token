# OpenClaw Zero Token

**免 API Token 使用大模型** - 通过浏览器登录方式免费使用 ChatGPT、Claude、Gemini、DeepSeek、千问国际版、千问国内版、豆包、Kimi、智谱清言、Grok、Manus 等 AI 模型。

[License: MIT](https://opensource.org/licenses/MIT)

[English](README.md) | 简体中文

---

## 项目简介

OpenClaw Zero Token 是 [OpenClaw](https://github.com/openclaw/openclaw) 的分支版本，核心目标是**免除 API Token 费用**，通过模拟浏览器登录捕获会话凭证，实现对各大 AI 平台的免费访问。

### 为什么选择 Zero Token？


| 传统方式           | Zero Token 方式 |
| -------------- | ------------- |
| 需要购买 API Token | **完全免费**      |
| 按调用次数计费        | 无使用限制         |
| 需要绑定信用卡        | 仅需网页登录        |
| Token 可能泄露     | 凭证本地存储        |


### 支持的平台


| 平台                         | 状态        | 模型                                                   |
| -------------------------- | --------- | ---------------------------------------------------- |
| DeepSeek                   | ✅ **已测试** | deepseek-chat, deepseek-reasoner                     |
| 千问国际版 (Qwen International) | ✅ **已测试** | Qwen 3.5 Plus, Qwen 3.5 Turbo                        |
| 千问国内版 (Qwen 国内版)           | ✅ **新增**  | Qwen 3.5 Plus, Qwen 3.5 Turbo                        |
| Kimi                       | ✅ **已测试** | Moonshot v1 8K, 32K, 128K                            |
| Claude Web                 | ✅ **已测试** | claude-sonnet-4-6, claude-opus-4-6, claude-haiku-4-6 |
| 豆包 (Doubao)                | ✅ **已测试** | doubao-seed-2.0, doubao-pro                          |
| ChatGPT Web                | ✅ **已测试** | GPT-4, GPT-4 Turbo                                   |
| Gemini Web                 | ✅ **已测试** | Gemini Pro, Gemini Ultra                             |
| Grok Web                   | ✅ **已测试** | Grok 1, Grok 2                                       |
| GLM Web (智谱清言)             | ✅ **已测试** | glm-4-Plus, glm-4-Think                              |
| GLM Web (国际版)              | ✅ **新增**  | GLM-4 Plus, GLM-4 Think                              |
| Manus API                  | ✅ **已测试** | Manus 1.6, Manus 1.6 Lite（API key，免费额度）              |




> **千问国内 vs 海外区别：**
>
> - **千问国际版**（chat.qwen.ai）— 面向全球用户
> - **千问国内版**（qianwen.com）— 面向中国用户，功能更完整（如深度搜索、代码助手、图片生成等）

### 工具调用（本地工具）支持

当前支持的模型均可调用**本地工具**（如 exec、read_file、list_dir、browser、apply_patch 等），从而执行命令、读写工作区文件、进行网页自动化等。


| 提供商类型                                          | 工具支持 | 说明                                                                               |
| ---------------------------------------------- | ---- | -------------------------------------------------------------------------------- |
| **Web（DeepSeek、千问、Kimi、Claude、豆包、GLM、Grok 等）** | ✅    | 在 system 中注入 XML 工具说明，流式解析 `<tool_call>` 并在本地执行。                                 |
| **ChatGPT Web / Gemini Web / Manus API**       | ✅    | 同样通过工具说明 + 多轮上下文 + `<tool_call>` 解析实现。 |
| **OpenRouter / OpenAI 兼容 API**                 | ✅    | 使用原生 `tools` / `tool_calls` 接口。                                                  |
| **Ollama**                                     | ✅    | 使用原生 `/api/chat` 的 tools。                                                        |


Agent 的文件访问范围受配置中的**工作区**目录限制（见配置项 `agents.defaults.workspace`）。

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              OpenClaw Zero Token                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │   Web UI    │    │  CLI/TUI    │    │   Gateway   │    │  Channels   │  │
│  │  (Lit 3.x)  │    │             │    │  (Port API) │    │ (Telegram…) │  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘  │
│         │                  │                  │                  │          │
│         └──────────────────┴──────────────────┴──────────────────┘          │
│                                    │                                         │
│                           ┌────────▼────────┐                               │
│                           │   Agent Core    │                               │
│                           │  (PI-AI Engine) │                               │
│                           └────────┬────────┘                               │
│                                    │                                         │
│  ┌─────────────────────────────────┼─────────────────────────────────────┐  │
│  │                          Provider Layer                               │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │ DeepSeek Web │  │  Doubao Web  │  │   OpenAI     │  │ Anthropic   │  │  │
│  │  │ (Zero Token) │  │ (Zero Token) │  │   (Token)    │  │  (Token)    │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 免 Token 实现原理

### 核心流程

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        DeepSeek Web 认证流程                                │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. 启动浏览器                                                              │
│     ┌─────────────┐                                                        │
│     │ openclaw    │ ──启动──▶ Chrome (CDP Port: 18892)                     │
│     │ gateway     │           带用户数据目录                                │
│     └─────────────┘                                                        │
│                                                                             │
│  2. 用户登录                                                                │
│     ┌─────────────┐                                                        │
│     │ 用户在浏览器 │ ──访问──▶ https://chat.deepseek.com                    │
│     │ 中手动登录  │           扫码/账号密码登录                             │
│     └─────────────┘                                                        │
│                                                                             │
│  3. 捕获凭证                                                                │
│     ┌─────────────┐                                                        │
│     │ Playwright  │ ──监听──▶ 网络请求                                     │
│     │ CDP 连接    │           拦截 Authorization Header                    │
│     └─────────────┘           获取 Cookie                                   │
│                                                                             │
│  4. 存储凭证                                                                │
│     ┌─────────────┐                                                        │
│     │ auth.json   │ ◀──保存── { cookie, bearer, userAgent }               │
│     └─────────────┘                                                        │
│                                                                             │
│  5. API 调用                                                                │
│     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐               │
│     │ DeepSeek    │ ──▶ │ DeepSeek    │ ──▶ │ chat.deep-  │               │
│     │ WebClient   │     │ Web API     │     │ seek.com    │               │
│     └─────────────┘     └─────────────┘     └─────────────┘               │
│         使用存储的 Cookie + Bearer Token                                    │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

### 关键技术点


| 技术点        | 实现方式                           |
| ---------- | ------------------------------ |
| **浏览器自动化** | Playwright CDP 连接 Chrome       |
| **凭证捕获**   | 监听网络请求，提取 Authorization Header |
| **PoW 挑战** | WASM SHA3 计算反爬答案               |
| **流式响应**   | SSE 解析 + 自定义标签解析器              |


### 配置步骤

1. **编译**：`npm install && npm run build && pnpm ui:build`
2. **打开浏览器调试**：`./start-chrome-debug.sh`
3. **登录各大网站**：在 Chrome 中登录各模型网页版
4. **配置 onboard**：`./onboard.sh`
5. **启动 server**：`./server.sh start`

### 注意事项

- **会话有效期**：会话可能定期失效，需重新登录
- **浏览器依赖**：需要保持 Chrome 调试模式运行
- **合规使用**：仅供个人学习研究，商用请使用官方API

## 快速开始

> **平台支持：**
>
> - 🍎 **macOS** / 🐧 **Linux**：按 [START_HERE.md](START_HERE.md) 步骤操作；详细安装与配置见 [INSTALLATION.md](INSTALLATION.md)。环境检查：`./check-setup.sh`（Mac 也可用 `./check-mac-setup.sh`）。
> - 🪟 **Windows**：推荐使用 WSL2，安装后按 Linux 流程操作（[START_HERE.md](START_HERE.md)、[INSTALLATION.md](INSTALLATION.md)）。WSL2 安装：`wsl --install`；指南：<https://docs.microsoft.com/zh-cn/windows/wsl/install>

### 环境要求

- Node.js >= 22.12.0
- pnpm >= 9.0.0
- Chrome 浏览器
- **操作系统**: macOS, Linux, 或 Windows (WSL2)

### 脚本说明

本项目提供了多个辅助脚本，适用于不同场景：

```
┌─────────────────────────────────────────────────────────────────────┐
│                           脚本关系图                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  首次使用流程：                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 1. 编译                npm install && npm run build && pnpm ui:build │  │
│  │ 2. 打开浏览器调试       ./start-chrome-debug.sh               │  │
│  │ 3. 登录各大网站         千问国际版/国内版、Kimi 等 
│  │ 4. 配置 onboard        ./onboard.sh                          │  │
│  │ 5. 启动 server         ./server.sh start                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  日常使用：                                                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ start-chrome-debug.sh → onboard.sh → server.sh start         │  │
│  │ server.sh [start|stop|restart|status]  管理 Gateway          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**脚本对比：**（核心 3 个脚本）


| 脚本                      | 用途             | 使用场景                                                     |
| ----------------------- | -------------- | -------------------------------------------------------- |
| `start-chrome-debug.sh` | 启动 Chrome 调试模式 | 步骤 2：打开浏览器，端口 9222，供各平台登录与 onboard 连接                    |
| `onboard.sh`            | 配置认证向导         | 步骤 4、5：选择平台（deepseek-web 等），捕获 Cookie/Token              |
| `server.sh`             | 管理 Gateway 服务  | 步骤 6 及日常：`start` / `stop` / `restart` / `status`，端口 3001 |


### 安装

```bash
# 克隆仓库
git clone https://github.com/linuxhsj/openclaw-zero-token.git
cd openclaw-zero-token

# 安装依赖
pnpm install
```

### 安装步骤

#### 步骤 1：编译

```bash
pnpm build
pnpm ui:build   # 构建 Web UI，访问 http://127.0.0.1:3001 时需要
```

#### 步骤 2：配置认证

```bash
# 拷贝配置文件（可选：若不存在，onboard 或 server 会自动从 .openclaw-state.example 复制）
首次运行可复制 .openclaw-state.example/openclaw.json 到 .openclaw-zero-state/openclaw.json


# 运行配置向导
./onboard.sh

# 或使用编译后的版本
node openclaw.mjs onboard

# 选择认证方式
? Auth provider: DeepSeek (Browser Login)

# 选择登录模式
? DeepSeek Auth Mode: 
  > Automated Login (Recommended)  # 自动捕获凭证
```

#### 步骤 3：启动 Gateway

```bash
# 使用辅助脚本（推荐）
./server.sh 
```

---

## 使用方式

### Web UI

执行./server.sh 后会自动启动webui，在聊天界面直接使用 AI 模型。
后续也可以自己启动http://127.0.0.1:3001/chat?session=62b791625fa441be036acd3c206b7e14e2bb13c803355823

#### 切换模型

在聊天界面中使用 `/model` 命令可以切换不同的 AI 模型：

```bash
# 切换到 Claude Web
/model claude-web

# 切换到豆包
/model doubao-web

# 切换到 DeepSeek
/model deepseek-web

# 或者指定具体的模型
/model claude-web/claude-sonnet-4-6
/model doubao-web/doubao-seed-2.0
/model deepseek-web/deepseek-chat
```

#### 查看可用模型

使用 `/models` 命令可以查看所有已配置的模型：

```bash
/models
```

> **关键规则：** 只有在 `./onboard.sh` 中完成配置的平台，才会写入 `openclaw.json` 并显示在 `/models` 列表中。

这将显示：

- 所有可用的提供商（claude-web、doubao-web、deepseek-web 等）
- 每个提供商下的模型列表
- 当前激活的模型
- 模型别名和配置信息

**示例输出：**

```
Model                                      Input      Ctx      Local Auth  Tags
doubao-web/doubao-seed-2.0                 text       63k      no    no    default,configured,alias:Doubao Browser
claude-web/claude-sonnet-4-6         text+image 195k     no    no    configured,alias:Claude Web
deepseek-web/deepseek-chat                 text       64k      no    no    configured
```

### API 调用

```bash
# 使用 Gateway Token 调用
curl http://127.0.0.1:3001/v1/chat/completions \
  -H "Authorization: Bearer YOUR_GATEWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-web/deepseek-chat",
    "messages": [{"role": "user", "content": "你好！"}]
  }'
```

### CLI 模式

```bash
# 交互式命令行
node openclaw.mjs tui
```

---

## 配置说明

### openclaw.json

```json
{
  "auth": {
    "profiles": {
      "deepseek-web:default": {
        "provider": "deepseek-web",
        "mode": "api_key"
      }
    }
  },
  "models": {
    "providers": {
      "deepseek-web": {
        "baseUrl": "https://chat.deepseek.com",
        "api": "deepseek-web",
        "models": [
          {
            "id": "deepseek-chat",
            "name": "DeepSeek Chat",
            "contextWindow": 64000,
            "maxTokens": 4096
          },
          {
            "id": "deepseek-reasoner",
            "name": "DeepSeek Reasoner",
            "reasoning": true,
            "contextWindow": 64000,
            "maxTokens": 8192
          }
        ]
      }
    }
  },
  "gateway": {
    "port": 3001,
    "auth": {
      "mode": "token",
      "token": "your-gateway-token"
    }
  }
}
```

---

## 故障排查

### 首次运行：使用配置向导（推荐）

**首次运行项目时，直接运行配置向导：**

```bash
./onboard.sh
```

**配置向导会自动创建所有必需的文件和目录！**

### 修复问题：使用诊断命令

**如果项目已经运行过，但遇到目录或文件缺失问题，运行诊断命令：**

```bash
node dist/index.mjs doctor
```

**诊断命令会自动：**

- ✅ 检查所有必需的目录
- ✅ 自动创建缺失的目录
- ✅ 修复文件权限问题
- ✅ 检查配置文件完整性
- ✅ 检测多个状态目录冲突
- ✅ 提供详细的修复建议

**⚠️ 重要限制：**

- ❌ `doctor` 命令**不会**创建配置文件（`openclaw.json`）
- ❌ `doctor` 命令**不会**创建认证文件（`auth-profiles.json`）
- ✅ 如果配置文件缺失或损坏，需要重新运行 `./onboard.sh`

**何时使用：**

- 目录被意外删除
- 遇到"权限被拒绝"错误
- 验证环境是否正常
- 会话历史丢失
- **不适合首次运行**（应该用 `onboard.sh`）


---

## 开发路线

### 当前重点

- ✅ DeepSeek Web、千问国际版、千问国内版、Kimi、Claude Web、豆包、ChatGPT Web、Gemini Web、Grok Web、GLM Web、GLM 国际版、Manus API — **均已测试通过**
- 🔧 提高凭证捕获可靠性
- 📝 文档改进

### 计划功能

- 🔜 过期会话自动刷新

---

## 扩展其他平台

要添加新的 Web 认证平台，需要创建以下文件：

### 1. 认证模块 (`src/providers/{platform}-web-auth.ts`)

```typescript
export async function loginPlatformWeb(params: {
  onProgress: (msg: string) => void;
  openUrl: (url: string) => Promise<boolean>;
}): Promise<{ cookie: string; bearer: string; userAgent: string }> {
  // 浏览器自动化登录，捕获凭证
}
```

### 2. API 客户端 (`src/providers/{platform}-web-client.ts`)

```typescript
export class PlatformWebClient {
  constructor(options: { cookie: string; bearer?: string }) {}
  
  async chatCompletions(params: ChatParams): Promise<ReadableStream> {
    // 调用平台 Web API
  }
}
```

### 3. 流处理器 (`src/agents/{platform}-web-stream.ts`)

```typescript
export function createPlatformWebStreamFn(credentials: string): StreamFn {
  // 处理平台特有的响应格式
}
```

---

## 文件结构

```
openclaw-zero-token/
├── src/
│   ├── providers/
│   │   ├── deepseek-web-auth.ts      # DeepSeek 登录捕获
│   │   └── deepseek-web-client.ts    # DeepSeek API 客户端
│   ├── agents/
│   │   └── deepseek-web-stream.ts    # 流式响应处理
│   ├── commands/
│   │   └── auth-choice.apply.deepseek-web.ts  # 认证流程
│   └── browser/
│       └── chrome.ts                 # Chrome 自动化
├── ui/                               # Web UI (Lit 3.x)
├── .openclaw-zero-state/             # 本地状态 (不提交)
│   ├── openclaw.json                 # 配置
│   └── agents/main/agent/
│       └── auth.json                 # 凭证 (敏感)
└── .gitignore                        # 包含 .openclaw-zero-state/
```

---

## 安全注意事项

1. **凭证存储**: Cookie 和 Bearer Token 存储在本地 `auth.json`，**绝不提交到 Git**
2. **会话有效期**: Web 会话可能过期，需要定期重新登录
3. **使用限制**: Web API 可能有速率限制，不适合高频调用
4. **合规使用**: 仅用于个人学习研究，请遵守平台服务条款

---

## 与上游同步

本项目基于 OpenClaw，可以通过以下方式同步上游更新：

```bash
# 添加上游仓库
git remote add upstream https://github.com/openclaw/openclaw.git

# 同步上游更新
git fetch upstream
git merge upstream/main
```

---

## 贡献指南

欢迎贡献代码，特别是：

- Bug 修复
- 文档改进

---

## 许可证

[MIT License](LICENSE)

---

## 致谢

- [OpenClaw](https://github.com/openclaw/openclaw) - 原始项目
- [DeepSeek](https://deepseek.com) - 优秀的 AI 模型

---

## 免责声明

本项目仅供学习和研究使用。使用本项目访问任何第三方服务时，请确保遵守该服务的使用条款。开发者不对因使用本项目而产生的任何问题负责。