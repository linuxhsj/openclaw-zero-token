# OpenClaw Zero Token

**Zero API Token Cost** — Free access to AI models via browser-based authentication (ChatGPT, Claude, Gemini, DeepSeek, Qwen International & China, Doubao, Kimi, GLM, Grok, Manus, and more).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](README.md) | [简体中文](README_zh-CN.md)

---

## Overview

OpenClaw Zero Token is a fork of [OpenClaw](https://github.com/openclaw/openclaw) with a core mission: **eliminate API token costs** by capturing session credentials through browser automation, enabling free access to major AI platforms.

### Why Zero Token?

| Traditional Approach | Zero Token Approach |
|---------------------|---------------------|
| Requires purchasing API tokens | **Completely free** |
| Pay per API call | No usage limits |
| Credit card binding required | Only web login needed |
| Potential token leakage | Credentials stored locally |

### Supported Platforms

#### International (海外)

| Platform | Status | Domain | Models |
|----------|--------|--------|--------|
| Qwen (International) | ✅ **Tested** | chat.qwen.ai | Qwen 3.5 Plus, Qwen 3.5 Turbo |
| Claude Web | ✅ **Tested** | claude.ai | claude-sonnet-4-6, claude-opus-4-6, claude-haiku-4-6 |
| ChatGPT Web | ✅ **Tested** | chatgpt.com | GPT-4, GPT-4 Turbo |
| Gemini Web | ✅ **Tested** | gemini.google.com | Gemini Pro, Gemini Ultra |
| Grok Web | ✅ **Tested** | grok.com | Grok 1, Grok 2 |
| GLM Web (International) | ✅ **New** | chat.z.ai | GLM-4 Plus, GLM-4 Think |

#### 国内 (China)

| Platform | Status | Domain | Models |
|----------|--------|--------|--------|
| DeepSeek | ✅ **Tested** | chat.deepseek.com | deepseek-chat, deepseek-reasoner |
| Qwen (国内版) | ✅ **New** | qianwen.com | Qwen 3.5 Plus, Qwen 3.5 Turbo |
| Doubao (豆包) | ✅ **Tested** | doubao.com | doubao-seed-2.0, doubao-pro |
| Kimi | ✅ **Tested** | kimi.com | Moonshot v1 8K, 32K, 128K |
| GLM Web (智谱清言) | ✅ **Tested** | chatglm.cn | glm-4-Plus, glm-4-Think |

#### API Providers

| Platform | Status | Models |
|----------|--------|--------|
| Manus API | ✅ **Tested** | Manus 1.6, Manus 1.6 Lite (API key, free tier) |

> **Qwen 国内 vs 海外区别：**
> - **Qwen International** (chat.qwen.ai) — 面向全球用户，无需翻墙
> - **Qwen 国内版** (qianwen.com) — 面向中国用户，速度更快，功能更全（支持深度搜索、代码助手、图片生成等）

> **Note:** All web-based providers use browser automation (Playwright) for authentication and API access. Platforms marked **Tested** have been verified to work.

### Tool Calling (Local Tools)

All supported models can call **local tools** (e.g. exec, read_file, list_dir, browser, apply_patch) so the agent can run commands, read/write files in the workspace, and automate the browser.

| Provider type | Tool support | Notes |
|---------------|--------------|--------|
| **Web (DeepSeek, Qwen, Kimi, Claude, Doubao, GLM, Grok)** | ✅ | XML-based tool instructions in system prompt; stream parser extracts `<tool_call>` and executes locally. |
| **ChatGPT Web / Gemini Web / Manus API** | ✅ | Same approach: tool instructions + multi-turn context + `<tool_call>` parsing (see [Tool Calling doc](docs/TOOL_CALLING_MODELS.md)). |
| **OpenRouter / OpenAI-compatible API** | ✅ | Native `tools` / `tool_calls` API. |
| **Ollama** | ✅ | Native `/api/chat` tools. |

The agent’s file access is limited to the configured **workspace** directory (see `agents.defaults.workspace` in config). For details and verification steps, see **[docs/TOOL_CALLING_MODELS.md](docs/TOOL_CALLING_MODELS.md)**.

### Setup Steps (6 Steps)

```bash
# 1. Build
npm install && npm run build && pnpm ui:build

# 2. Open browser debug
./start-chrome-debug.sh

# 3. Login to platforms (Qwen, Kimi, Claude, etc. — exclude DeepSeek)
# 4. Configure onboard
./onboard.sh

# 5. Login DeepSeek (Chrome + onboard select deepseek-web)
# 6. Start server
./server.sh start
```

> **Important:** Only platforms completed in `./onboard.sh` are written into `openclaw.json` and shown in `/models`.

> **Platform support:**
> - **macOS / Linux:** Follow [START_HERE.md](START_HERE.md) for the step-by-step flow; see [INSTALLATION.md](INSTALLATION.md) for detailed setup. Run `./check-setup.sh` (on macOS you can also use `./check-mac-setup.sh`).
> - **Windows:** Use WSL2, then follow the Linux flow ([START_HERE.md](START_HERE.md), [INSTALLATION.md](INSTALLATION.md)). Install WSL2: `wsl --install`; guide: https://docs.microsoft.com/en-us/windows/wsl/install.

See **START_HERE.md**, **INSTALLATION.md**, and **TEST_STEPS.md** for details.

---

## System Architecture

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

## How It Works

### Zero Token Authentication Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│                     DeepSeek Web Authentication Flow                        │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Launch Browser                                                          │
│     ┌─────────────┐                                                        │
│     │ openclaw    │ ──start──▶ Chrome (CDP Port: 18892)                    │
│     │ gateway     │             with user data directory                   │
│     └─────────────┘                                                        │
│                                                                             │
│  2. User Login                                                              │
│     ┌─────────────┐                                                        │
│     │ User logs in│ ──visit──▶ https://chat.deepseek.com                   │
│     │  browser    │             scan QR / password login                    │
│     └─────────────┘                                                        │
│                                                                             │
│  3. Capture Credentials                                                     │
│     ┌─────────────┐                                                        │
│     │ Playwright  │ ──listen──▶ Network requests                           │
│     │ CDP Connect │              Intercept Authorization Header            │
│     └─────────────┘              Extract Cookies                            │
│                                                                             │
│  4. Store Credentials                                                       │
│     ┌─────────────┐                                                        │
│     │ auth.json   │ ◀──save── { cookie, bearer, userAgent }               │
│     └─────────────┘                                                        │
│                                                                             │
│  5. API Calls                                                               │
│     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐               │
│     │ DeepSeek    │ ──▶ │ DeepSeek    │ ──▶ │ chat.deep-  │               │
│     │ WebClient   │     │ Web API     │     │ seek.com    │               │
│     └─────────────┘     └─────────────┘     └─────────────┘               │
│         Using stored Cookie + Bearer Token                                  │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

### Key Technical Components

| Component | Implementation |
|-----------|----------------|
| **Browser Automation** | Playwright CDP connection to Chrome |
| **Credential Capture** | Network request interception, Authorization Header extraction |
| **PoW Challenge** | WASM SHA3 computation for anti-bot bypass |
| **Streaming Response** | SSE parsing + custom tag parser |

---

## Roadmap

### Current Focus
- ✅ DeepSeek Web, Qwen International, Qwen CN, Kimi, Claude Web, Doubao, ChatGPT Web, Gemini Web, Grok Web, GLM Web, GLM International, Manus API — all **tested and working**
- 🔧 Improving credential capture reliability
- 📝 Documentation improvements

### Planned Features
- 🔜 Auto-refresh for expired sessions

---

## Adding New Platforms

To add support for a new platform, create the following files:

### 1. Authentication Module (`src/providers/{platform}-web-auth.ts`)

```typescript
export async function loginPlatformWeb(params: {
  onProgress: (msg: string) => void;
  openUrl: (url: string) => Promise<boolean>;
}): Promise<{ cookie: string; bearer: string; userAgent: string }> {
  // Browser automation login, capture credentials
}
```

### 2. API Client (`src/providers/{platform}-web-client.ts`)

```typescript
export class PlatformWebClient {
  constructor(options: { cookie: string; bearer?: string }) {}
  
  async chatCompletions(params: ChatParams): Promise<ReadableStream> {
    // Call platform Web API
  }
}
```

### 3. Stream Handler (`src/agents/{platform}-web-stream.ts`)

```typescript
export function createPlatformWebStreamFn(credentials: string): StreamFn {
  // Handle platform-specific response format
}
```

---

## File Structure

```
openclaw-zero-token/
├── src/
│   ├── providers/           # Web auth & API clients
│   ├── agents/              # Stream handlers
│   ├── commands/            # Auth flows
│   └── browser/             # Chrome automation
├── ui/                      # Web UI (Lit 3.x)
├── .openclaw-zero-state/    # Local state (not committed)
│   ├── openclaw.json        # Config
│   └── agents/main/agent/
│       └── auth.json        # Credentials (sensitive)
└── .gitignore               # Includes .openclaw-zero-state/
```

---

## License

[MIT License](LICENSE)
