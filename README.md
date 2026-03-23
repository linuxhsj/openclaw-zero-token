# OpenClaw Zero Token

**Use LLMs without API tokens** — log in via browser once, then call ChatGPT, Claude, Gemini, DeepSeek, Qwen (intl/cn), Doubao, Kimi, Zhipu GLM, Grok, Manus and more for free through a unified gateway.

[License: MIT](https://opensource.org/licenses/MIT)

English | [简体中文](README.zh-CN.md)

---

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [Adding New Platforms](#adding-new-platforms)
- [File Structure](#file-structure)
- [Security Notes](#security)
- [Sync With Upstream](#upstream-sync)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgments](#acknowledgments)
- [Disclaimer](#disclaimer)

---

## Overview

OpenClaw Zero Token is a fork of [OpenClaw](https://github.com/openclaw/openclaw) that focuses on **removing API token cost** by driving the official web UIs (browser login) instead of paid API keys.

### Why Zero Token?

| Traditional usage    | Zero Token way           |
| -------------------- | ------------------------ |
| Buy API tokens       | **Completely free**      |
| Pay per request      | No enforced quota        |
| Credit card required | Browser login only       |
| API tokens may leak  | Credentials stored local |

### Supported providers

| Provider                | Status    | Models (examples)                                    |
| ----------------------- | --------- | ---------------------------------------------------- |
| DeepSeek                | ✅ tested | deepseek-chat, deepseek-reasoner                     |
| Qwen International      | ✅ tested | Qwen 3.5 Plus, Qwen 3.5 Turbo                        |
| Qwen China              | ✅ tested | Qwen 3.5 Plus, Qwen 3.5 Turbo                        |
| Kimi                    | ✅ tested | Moonshot v1 8K / 32K / 128K                          |
| Claude Web              | ✅ tested | claude-sonnet-4-6, claude-opus-4-6, claude-haiku-4-6 |
| Doubao                  | ✅ tested | doubao-seed-2.0, doubao-pro                          |
| ChatGPT Web             | ✅ tested | GPT-4, GPT-4 Turbo                                   |
| Gemini Web              | ✅ tested | Gemini Pro, Gemini Ultra                             |
| Grok Web                | ✅ tested | Grok 1, Grok 2                                       |
| GLM Web (Zhipu)         | ✅ tested | glm-4-Plus, glm-4-Think                              |
| GLM Web (International) | ✅ tested | GLM-4 Plus, GLM-4 Think                              |
| Manus API               | ✅ tested | Manus 1.6, Manus 1.6 Lite (API key, free quota)      |

### Tool calling

All supported models can call **local tools** (`exec`, `read_file`, `list_dir`, `browser`, `apply_patch`, etc.) so that agents can run commands, read/write workspace files, and automate the browser.

| Provider type                                               | Tools | Notes                                                                  |
| ----------------------------------------------------------- | ----- | ---------------------------------------------------------------------- |
| Web (DeepSeek, Qwen, Kimi, Claude, Doubao, GLM, Grok, etc.) | ✅    | Inject XML tool descriptions in `system`, parse `<tool_call>` streams. |
| ChatGPT Web / Gemini Web / Manus API                        | ✅    | Similar via tool descriptions + multi-turn context + `<tool_call>`.    |
| OpenRouter / OpenAI-compatible APIs                         | ✅    | Uses native `tools` / `tool_calls`.                                    |
| Ollama                                                      | ✅    | Uses native `/api/chat` tools.                                         |

Agent file access is restricted by the configured **workspace** directory (see `agents.defaults.workspace`).

### Extra features

**AskOnce: one question, answers from all models.**  
AskOnce can broadcast a single query to multiple configured providers and show their replies side by side.

![AskOnce: ask once, multi-model answers](askonce.png)

---

## How It Works

### High-level architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                              OpenClaw Zero Token                            │
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
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Provider Layer                                                       │  │
│  │  DeepSeek Web (Zero Token)                                       ✅   │  │
│  │  Qwen Web intl/cn (Zero Token)                                  ✅   │  │
│  │  Kimi (Zero Token)                                              ✅   │  │
│  │  Claude Web (Zero Token)                                        ✅   │  │
│  │  Doubao (Zero Token)                                            ✅   │  │
│  │  ChatGPT Web (Zero Token)                                       ✅   │  │
│  │  Gemini Web (Zero Token)                                        ✅   │  │
│  │  Grok Web (Zero Token)                                          ✅   │  │
│  │  GLM Web (Zero Token)                                           ✅   │  │
│  │  Manus API (Token)                                              ✅   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### DeepSeek auth flow (example)

```text
1. Start browser
   openclaw gateway  ──▶  Chrome (CDP: 18892, user-data-dir)

2. User logs in
   Browser  ──▶  https://chat.deepseek.com  (scan / password login)

3. Capture credentials
   Playwright CDP  ──▶  listen network requests
                    └─▶ intercept Authorization header + cookies

4. Store credentials
   auth.json  ◀──  { cookie, bearer, userAgent }

5. Call web API
   DeepSeek WebClient  ──▶  DeepSeek Web API  ──▶  chat.deepseek.com
   (reuses stored cookie + bearer token)
```

---

## Quick Start

> **Platforms**
>
> - 🍎 **macOS** / 🐧 **Linux**: follow [START_HERE.md](START_HERE.md); full install/config in [INSTALLATION.md](INSTALLATION.md).
> - 🪟 **Windows**: use WSL2 and then follow the Linux steps. Install WSL2: `wsl --install`, docs: <https://docs.microsoft.com/windows/wsl/install>

### Requirements

- Node.js >= 22.12.0
- pnpm >= 9.0.0
- Chrome browser
- OS: macOS, Linux, or Windows (via WSL2)

### Helper scripts (first-time & daily use)

```text
First-time:
  1. Build          pnpm install && pnpm build && pnpm ui:build
  2. Start Chrome   ./start-chrome-debug.sh
  3. Login sites    Qwen intl/cn, Kimi, DeepSeek, ...
  4. Onboard        ./onboard.sh webauth
  5. Start server   ./server.sh

Daily:
  start-chrome-debug.sh → onboard.sh → server.sh
  server.sh [start|stop|restart|status] manages the gateway
```

**Script overview (core 3 scripts):**

| Script                  | Purpose                    | When to use                                                              |
| ----------------------- | -------------------------- | ------------------------------------------------------------------------ |
| `start-chrome-debug.sh` | Start Chrome in debug mode | Step 2: open browser on port 9222 for logins + onboarding                |
| `onboard.sh`            | Auth/onboarding wizard     | Step 4/5: select provider (e.g. `deepseek-web`) and capture credentials  |
| `server.sh`             | Manage gateway service     | Step 5 & daily use: `start` / `stop` / `restart` / `status` on port 3002 |

### Installation

#### Clone the repo

```bash
git clone https://github.com/linuxhsj/openclaw-zero-token.git
cd openclaw-zero-token
```

#### Install dependencies

```bash
pnpm install
```

#### Step 1: Build

```bash
pnpm build
pnpm ui:build
```

#### Step 2: Configure authentication

```bash
# (Optional but recommended before the very first ./onboard.sh webauth)
# Copy the example config to your local state directory:
# cp .openclaw-state.example/openclaw.json .openclaw-upstream-state/openclaw.json

# On first run, onboard.sh will prompt whether to copy the configuration file, just select yes.
# It will copy .openclaw-state.example/openclaw.json to .openclaw-upstream-state/openclaw.json;
# for non-first runs, there's no need to copy these configuration files.

# Start Chrome in debug mode
./start-chrome-debug.sh

# IMPORTANT: Do not close this terminal, otherwise subsequent steps will fail.
# Keep this terminal open throughout the process.

# Log into each web model once (for example DeepSeek)
#   https://chat.deepseek.com/

# Run onboarding wizard
# IMPORTANT: Open a new terminal for this step (do not use the same terminal as the previous step,
# because the ./start-chrome-debug.sh terminal needs to stay open).
./onboard.sh webauth


# Or use the built version
node openclaw.mjs onboard

# Example DeepSeek flow in the wizard:
# ? Auth provider: DeepSeek (Browser Login)
#
# ? DeepSeek Auth Mode:
#   > Automated Login (Recommended)   # capture cookies/tokens automatically

# Once you see that auth succeeded, you are done.
# To add more providers later, just run ./onboard.sh webauth again.
```

Follow the prompts (choose e.g. **DeepSeek (Browser Login)** and **Automated Login (Recommended)**).  
To add more providers later, just run `./onboard.sh webauth` again.

#### Step 3: Start the gateway

```bash
./server.sh
```

This will start the HTTP gateway and Web UI.

---

## Usage

### Web UI

After `./server.sh` the Web UI is started automatically. Open it in your browser and chat with any configured model.

#### Switch models

Use `/model` inside the chat box:

```bash
# Switch to Claude Web
/model claude-web

# Switch to Doubao
/model doubao-web

# Switch to DeepSeek
/model deepseek-web

# Or specify exact models
/model claude-web/claude-sonnet-4-6
/model doubao-web/doubao-seed-2.0
/model deepseek-web/deepseek-chat
```

#### List available models

```bash
/models
```

> **Important:** Only providers configured via `./onboard.sh webauth` are written into `openclaw.json` and shown in `/models`.

The output shows:

- All available providers (e.g. `claude-web`, `doubao-web`, `deepseek-web`)
- Models under each provider
- Currently active model
- Aliases and config

Example:

```text
Model                                      Input      Ctx      Local Auth  Tags
doubao-web/doubao-seed-2.0                 text       63k      no    no    default,configured,alias:Doubao Browser
claude-web/claude-sonnet-4-6         text+image 195k     no    no    configured,alias:Claude Web
deepseek-web/deepseek-chat                 text       64k      no    no    configured
```

### HTTP API

```bash
curl http://127.0.0.1:3002/v1/chat/completions \
  -H "Authorization: Bearer YOUR_GATEWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-web/deepseek-chat",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### CLI / TUI

```bash
node openclaw.mjs tui
```

---

## Configuration

### Example `openclaw.json`

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
    "port": 3002,
    "auth": {
      "mode": "token",
      "token": "your-gateway-token"
    }
  }
}
```

---

## Troubleshooting

### First run: use the onboarding wizard (recommended)

```bash
./onboard.sh webauth
```

The wizard will create all required directories and basic files.

### Fix issues: doctor command

If you already ran the project but see missing-directories or similar errors:

```bash
node dist/index.mjs doctor
```

The doctor command will:

- ✅ Check all required directories
- ✅ Create missing directories
- ✅ Fix common permission issues
- ✅ Validate config file structure
- ✅ Detect multiple conflicting state directories
- ✅ Print detailed suggestions

**Limitations:**

- ❌ Does **not** create `openclaw.json`
- ❌ Does **not** create `auth-profiles.json`
- ✅ If those are missing/corrupt, rerun `./onboard.sh webauth`

---

## Roadmap

### Current focus

- ✅ DeepSeek Web, Qwen intl/cn, Kimi, Claude Web, Doubao, ChatGPT Web, Gemini Web, Grok Web, GLM Web, GLM intl, Manus API — all tested
- 🔧 Improve credential capture robustness
- 📝 Documentation improvements

### Planned

- 🔜 Auto-refresh for expired web sessions

---

## Adding New Platforms

To add a new web provider you usually need:

### 1. Auth module (`src/providers/{platform}-web-auth.ts`)

```ts
export async function loginPlatformWeb(params: {
  onProgress: (msg: string) => void;
  openUrl: (url: string) => Promise<boolean>;
}): Promise<{ cookie: string; bearer: string; userAgent: string }> {
  // Automate browser login and capture credentials
}
```

### 2. API client (`src/providers/{platform}-web-client.ts`)

```ts
export class PlatformWebClient {
  constructor(options: { cookie: string; bearer?: string }) {}

  async chatCompletions(params: ChatParams): Promise<ReadableStream> {
    // Call platform web API
  }
}
```

### 3. Stream handler (`src/agents/{platform}-web-stream.ts`)

```ts
export function createPlatformWebStreamFn(credentials: string): StreamFn {
  // Handle provider-specific streaming format
}
```

---

## File Structure

```text
openclaw-zero-token/
├── src/
│   ├── providers/
│   │   ├── deepseek-web-auth.ts          # DeepSeek login capture
│   │   └── deepseek-web-client.ts        # DeepSeek API client
│   ├── agents/
│   │   └── deepseek-web-stream.ts        # Streaming response handling
│   ├── commands/
│   │   └── auth-choice.apply.deepseek-web.ts  # Auth flow
│   └── browser/
│       └── chrome.ts                     # Chrome automation
├── ui/                                   # Web UI (Lit 3.x)
├── .openclaw-zero-state/                 # Local state (ignored)
│   ├── openclaw.json                     # Config
│   └── agents/main/agent/
│       └── auth.json                     # Credentials (sensitive)
└── .gitignore                            # Includes .openclaw-zero-state/
```

---

## Security Notes

1. **Credential storage**: cookies and bearer tokens live in local `auth.json` and must **never** be committed.
2. **Session lifetime**: web sessions expire; you may need to re-login from time to time.
3. **Rate limiting**: web endpoints may enforce rate limits; they are not suited for heavy production workloads.
4. **Compliance**: this project is for personal learning and experimentation. Always follow each platform’s Terms of Service.

---

## Sync With Upstream OpenClaw

This project is based on OpenClaw. To sync upstream changes:

```bash
git remote add upstream https://github.com/openclaw/openclaw.git
git fetch upstream
git merge upstream/main
```

---

## Contributing

PRs are welcome, especially for:

- Bug fixes
- Documentation improvements

---

## License

[MIT License](LICENSE)

---

## Acknowledgments

- [OpenClaw](https://github.com/openclaw/openclaw) — original project
- [DeepSeek](https://deepseek.com) — excellent AI models

---

## Disclaimer

This project is for learning and research only.  
When using it to access any third-party service, you are responsible for complying with that service’s Terms of Use.  
The authors are not liable for any issues caused by misuse of this project.
