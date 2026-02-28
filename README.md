# OpenClaw Zero Token

**Zero API Token Cost** — Free access to AI models via browser-based authentication (DeepSeek, Qwen, Kimi, Claude, Doubao, ChatGPT, and more).

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

| Platform | Status | Models |
|----------|--------|--------|
| DeepSeek | ✅ **Tested** | deepseek-chat, deepseek-reasoner |
| Qwen (千问) | ✅ **Tested** | Qwen 3.5 Plus, Qwen 3.5 Turbo |
| Kimi | ✅ **Tested** | Moonshot v1 8K, 32K, 128K |
| Claude Web | ✅ **Tested** | claude-3-5-sonnet-20241022, claude-3-opus-20240229, claude-3-haiku-20240307 |
| Doubao (豆包) | ✅ **Tested** | doubao-seed-2.0, doubao-pro |
| ChatGPT Web | ✅ **Tested** | GPT-4, GPT-4 Turbo |
| Gemini Web | ✅ **Tested** | Gemini Pro, Gemini Ultra |
| Grok Web | ✅ **Tested** | Grok 1, Grok 2 |
| Z Web | ⏳ Untested | GLM-4, GLM-3 Turbo |
| Manus Web | ⏳ Untested | Manus 1 |
| Manus API | ✅ **Tested** | Manus 1.6, Manus 1.6 Lite (API key, free tier) |

> **Note:** All web-based providers use browser automation (Playwright) for authentication and API access. Platforms marked **Tested** have been verified to work.

### Setup Steps (6 Steps)

```bash
# 1. Build
npm install && npm run build

# 2. Open browser debug
./start-chrome-debug.sh

# 3. Login to platforms (Qwen, Kimi, Claude, etc. — exclude DeepSeek)
# 4. Configure onboard
./onboard.sh

# 5. Login DeepSeek (Chrome + onboard select deepseek-web)
# 6. Start server
./server.sh start
```

See **START_HERE.md** and **TEST_STEPS.md** for details.

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

## Doubao Web Usage

Doubao integration uses **browser automation** (Playwright) for authentication and API access, similar to Claude Web.

### How It Works

```
Browser Login (Playwright)
    ↓
Capture sessionid & ttwid (Cookies)
    ↓
Keep Browser Connection Open
    ↓
Execute Requests in Browser Context (page.evaluate)
    ↓
Doubao API Response (SSE Stream)
```

**Key Features:**
- ✅ **No Proxy Required**: Direct browser-based access
- ✅ **Automatic Parameter Handling**: Browser generates dynamic parameters (msToken, a_bogus, fp, etc.)
- ✅ **Cloudflare Bypass**: Requests sent in real browser context
- ✅ **Simple Authentication**: Only needs sessionid and ttwid
- ✅ **Streaming Support**: Real-time response streaming

### Quick Start (Doubao)

Same 6-step flow: build → Chrome debug → login platforms → onboard → DeepSeek auth → server. For Doubao, select **doubao-web** in `./onboard.sh`.

### Available Models

| Model ID | Name | Features |
|----------|------|----------|
| `doubao-seed-2.0` | Doubao-Seed 2.0 | Supports reasoning |
| `doubao-pro` | Doubao Pro | Standard model |

### Configuration

The configuration is stored in `.openclaw-state/openclaw.json`:

```json
{
  "browser": {
    "attachOnly": true,
    "defaultProfile": "my-chrome",
    "profiles": {
      "my-chrome": {
        "cdpUrl": "http://127.0.0.1:9222"
      }
    }
  },
  "models": {
    "providers": {
      "doubao-web": {
        "baseUrl": "https://www.doubao.com",
        "api": "doubao-web",
        "models": [
          {
            "id": "doubao-seed-2.0",
            "name": "Doubao-Seed 2.0 (Web)"
          }
        ]
      }
    }
  }
}
```

### Troubleshooting

**Chrome connection failed:**
```bash
# Check if Chrome is running
ps aux | grep "chrome.*9222"
```

See **INSTALLATION.md** and **START_HERE.md** for full setup and troubleshooting.

---

## Roadmap

### Current Focus
- ✅ DeepSeek Web, Qwen, Kimi, Claude Web, Doubao, Manus API — all **tested and working**
- 🔧 Improving credential capture reliability
- 📝 Documentation improvements

### Planned Features
- 🔜 ChatGPT Web authentication support
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

## License

[MIT License](LICENSE)
