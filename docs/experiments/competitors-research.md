# 类似项目调研报告

> 调研时间：2026-04-19
> 核心筛选条件：**免费提供模型** + **支持免费 Claude** + **无需用户提供 API Key** + **排除纯本地模型** + **近 3 个月有更新**

---

## 筛选标准

| 维度             | 标准                                                    |
| ---------------- | ------------------------------------------------------- |
| **免费模型**     | 项目本身提供免费额度/免费层，不要求用户提供付费 API Key |
| **Claude 支持**  | 支持通过某种方式免费调用 Claude（不限版本）             |
| **API Key 要求** | 不要求用户提供 OpenAI/Anthropic 等官方 API Key          |
| **本地模型**     | 排除 Ollama、llama.cpp 等纯本地推理方案                 |
| **活跃度**       | 最后更新在 2026-01-19 之后（约 3 个月）                 |
| **规模参考**     | Stars > 100（参考维度，非硬门槛）                       |

> **免费≠无账号**："免费"的合法路径是复用用户自己的账号免费额度（OAuth/Cookie/CLI 登录），不是盗用他人服务，也不是需要用户自购 API Key。

---

## 最终入选 Top 10（按技术路线分类）

### 一、CLI/IDE 订阅转 API（最核心路线，OAuth/CLI 模拟，免费 Claude 最佳来源）

| 项目                                                                                  | Stars      | 语言       | 最后更新   | 免费 Claude 来源                  | 其他免费模型                 | 技术亮点                                            |
| ------------------------------------------------------------------------------------- | ---------- | ---------- | ---------- | --------------------------------- | ---------------------------- | --------------------------------------------------- |
| **[router-for-me/CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)**         | **27,163** | Go         | 2026-04-19 | ✅ Gemini CLI OAuth + GPT-5 等    | Gemini 2.5 Pro / GPT-5 等    | 周边最完整（macOS/Win/VSCode 插件），OAuth 自动刷新 |
| **[justlovemaki/AIClient-2-API](https://github.com/justlovemaki/aiclient-2-api)**     | **7,053**  | JavaScript | 2026-04-19 | ✅ **Kiro**（含 Opus 4.5）        | Gemini/Qwen/Grok/Claude Code | TLS 指纹绕过，OAuth 突破，多账户池                  |
| **[decolua/9router](https://github.com/decolua/9router)**                             | **2,669**  | JavaScript | 2026-04-17 | ✅ Anthropic 无限                 | Gemini/iFlow/Qwen            | Combo 路由（三级 fallback），可视化仪表盘           |
| **[Alishahryar1/free-claude-code](https://github.com/Alishahryar1/free-claude-code)** | **1,968**  | Python     | 2026-04-18 | ✅ OpenRouter 免费层 / NVIDIA NIM | DeepSeek/Qwen 等             | 按模型自动路由，Discord/Telegram Bot 支持           |
| **[musistudio/claude-code-router](https://github.com/musistudio/claude-code-router)** | **18,338** | TypeScript | 2026-03-04 | ✅ Claude Code 订阅映射           | DeepSeek/Kimi 等             | Cloudflare Workers 边缘部署，全球 300+ 节点         |
| **[codeking-ai/cligate](https://github.com/codeking-ai/cligate)**                     | 25         | JavaScript | 2026-04-19 | ✅ DeepSeek/Qwen 等免费路由       | DeepSeek/Qwen/MiniMax        | Claude Code 专用，支持账号池和 Dashboard            |

---

### 二、浏览器自动化 / Web 逆向（openclaw-zero-token 同路线，稳定但依赖登录态）

| 项目                                                              | Stars      | 语言   | 最后更新   | 免费 Claude 来源            | 其他免费模型                              | 技术亮点                                            |
| ----------------------------------------------------------------- | ---------- | ------ | ---------- | --------------------------- | ----------------------------------------- | --------------------------------------------------- |
| **[xtekky/gpt4free](https://github.com/xtekky/gpt4free)**         | **66,030** | Python | 2026-04-18 | ✅ Claude（逆向）           | 50+ providers（GPT/DeepSeek/Kimi/Gemini） | 体量最大，50+ provider，OpenAI 兼容 API             |
| **[Xerxes-2/clewdr](https://github.com/Xerxes-2/clewdr)**         | **1,124**  | Rust   | 2026-04-07 | ✅ Claude Web Cookie        | ❌                                        | 单二进制 <10MB，Rust 高性能，管理 UI                |
| **[mirrorange/clove](https://github.com/mirrorange/clove)**       | **708**    | Python | 2026-03-28 | ✅ **Claude OAuth**（首创） | ❌                                        | OAuth + 网页反代双模式，OpenAI/Anthropic 双协议兼容 |
| **[caiwuu/web2api](https://github.com/caiwuu/web2api)**           | **480**    | Python | 2026-04-15 | ✅ Claude Web Cookie        | GPT/DeepSeek/Grok                         | 轻量，专注多平台聚合                                |
| **[Amm1rr/WebAI-to-API](https://github.com/Amm1rr/WebAI-to-API)** | **1,024**  | Python | 2025-12-31 | ✅ Claude（逆向）           | Gemini/DeepSeek/Grok                      | Gemini Web 为核心，Cookie 自动鉴权                  |

---

## 特别收录：Kiro/AWS 专项

| 项目                                                              | Stars   | 语言   | 最后更新   | 免费 Claude 来源                           | 技术亮点                                                 |
| ----------------------------------------------------------------- | ------- | ------ | ---------- | ------------------------------------------ | -------------------------------------------------------- |
| **[jwadow/kiro-gateway](https://github.com/jwadow/kiro-gateway)** | **959** | Python | 2026-04-19 | ✅ **Kiro 全系列**（Sonnet 4.5/Haiku 4.5） | Anthropic IDE/CLI 专项，双协议（OpenAI + Anthropic）支持 |

> **关于 Kiro**：Kiro（AWS CodeWhisperer 底层）目前提供 **Claude Opus 4.5 / Haiku 4.5 无限免费**，是免费 Claude 中最稳定的来源之一。建议重点关注。

---

## 排除项目及原因

| 项目                      | 排除原因                                   |
| ------------------------- | ------------------------------------------ |
| LibreChat（35k stars）    | 需要用户提供官方 API Key，违反"免费"条件   |
| one-api（32k stars）      | 商业 key 中转，不提供免费模型              |
| Trae Agent（11k stars）   | 官方字节项目，非 API 代理，且 2 个月无更新 |
| raycast-g4f（1k stars）   | 最后更新 2025-12，无 Kiro/CLI 路线         |
| free-one-api（810 stars） | 聚合逆向库，稳定性较差，Cluade 支持不确定  |
| Poe API（2.4k stars）     | 已标注 UNMAINTAINED，2023-09 停更          |

---

## 关键结论

**最值得参考的 3 个项目（按优先级）：**

1. **[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)**（27k stars）—— 规模最大、生态最完整，将 Gemini CLI / Claude Code / Codex 等官方工具转为 API，支持 OAuth 免费认证
2. **[AIClient-2-API](https://github.com/justlovemaki/aiclient-2-api)**（7k stars）—— TLS 指纹绕过 + Anthropic 免费 Opus 4.5，路线与 openclaw-zero-token 不同但互补
3. **[gpt4free](https://github.com/xtekky/gpt4free)**（66k stars）—— 体量最大，50+ provider，但依赖逆向维护（不稳定风险）

**openclaw-zero-token 的差异化定位**（与上述项目比）：

- **CDP 浏览器自动化** vs 逆向工程 / CLI 模拟——更稳定，依赖真实登录态
- **多 Web 平台聚合** vs 单一路线——覆盖 Claude/ChatGPT/Gemini/DeepSeek/Qwen/Kimi 等
- **Gateway HTTP API** vs Python 库 / CLI 工具——开箱即用，适合集成各种客户端

---

## Trae / Anthropic 特别说明

- **Trae**：字节官方 IDE，内置免费 Claude 3.7/4.0 Sonnet，但未暴露独立 Web API，目前无成熟开源反向工程代理（Trae-Proxy 已停更 2025-08）
- **Kiro**：AWS CodeWhisperer 底层，Claude Opus 4.5/Haiku 4.5 **无限免费**，是目前最稳定的免费 Claude 来源，`kiro-gateway`、`9router`、`AIClient-2-API` 均已支持

---

## 深度技术分析：Top 3 竞品实现路线

### 一、CLIProxyAPI（27k stars）——OAuth 自动化 + CLI 模拟路线

**技术架构：**

```
客户端（Claude Code / Cursor）
        ↓ OpenAI 兼容请求
  CLIProxyAPI（Go，二进制）
        ↓
  ┌─ Gemini CLI（OAuth 登录，180K tokens/月免费）
  ├─ Claude Code（OAuth 登录）
  ├─ OpenAI Codex（OAuth 登录）
  ├─ Anthropic 兼容上游（OpenRouter 等）
  └─ Claude Code / Anthropic / Qwen CLI
```

**核心实现原理：**

1. **OAuth 认证流程**：项目内置 OAuth 流程引导用户完成 Google/微软账号授权，获取 access_token + refresh_token，自动刷新
2. **CLI 进程注入**：通过 subprocess 启动 Gemini CLI / Claude Code 进程，劫持其 HTTP 请求，注入用户的 OAuth token
3. **请求劫持**：在 Go 层拦截 OpenAI 格式请求，转换为各 CLI 的内部协议（env 变量注入、subprocess stdio）
4. **流式响应处理**：通过 stdio 或 websocket 中继 CLI 的流式输出
5. **多账号池 + 轮询**：配置多个 OAuth 账号，按 round-robin 分配，某个账号配额耗尽自动切换

**关键代码模块：**

- `internal/provider/` — 各 CLI provider 的执行器和协议转换器
- `internal/translator/` — OpenAI ↔ Anthropic ↔ Gemini 格式互转
- `auths/` — OAuth token 持久化存储（JSON 文件）
- `internal/browser/` — 内置浏览器 OAuth 引导（无需手动打开 URL）

**openclaw-zero-token 可借鉴点：**

- OAuth 自动刷新机制（无需用户手动续期 token）
- 多账号池 + 轮询（提高可用性）
- 内置 OAuth 引导浏览器（降低用户配置门槛）

---

### 二、AIClient-2-API（7k stars）——TLS 指纹绕过 + Anthropic 格式模拟

**技术架构：**

```
客户端（任意 OpenAI 兼容工具）
        ↓ OpenAI 兼容请求
  AIClient-2-API（Node.js）
        ↓
  ┌─ Anthropic API（含免费 Claude Opus 4.5）
  ├─ Gemini CLI（OAuth 认证）
  ├─ Claude Code / Grok / Qwen
  └─ Anthropic 原生 API（OAuth 注入）
```

**核心实现原理：**

1. **TLS 指纹绕过**（关键差异化）：内置 `tls-sidecar`（Go uTLS），模拟 Chrome/Firefox 的 TLS 握手指纹（ClientHello），绕过 Cloudflare 等 CDN 的 Bot 检测
2. **Anthropic 格式注入**：将 Claude Code 的 Anthropic 格式请求（含 `require_auth: true`）注入 OAuth token，转发到 Anthropic 兼容端点
3. **Kiro API 接入**：Kiro 底层是 AWS CodeWhisperer，通过 `kirocli:social:token` / `kirocli:odic:token` SQLite token 注入，实现 Claude Opus 4.5 无限免费调用
4. **OAuth token 持久化**：通过 SQLite 存储 token，自动刷新，避免用户反复登录

**关键代码模块：**

- `src/providers/` — 各 provider 的适配器（adapter.js）
  - `claude/` — Claude API 请求构造
  - `gemini/` — Gemini CLI 请求构造
  - `forward/` — 上游转发
- `tls-sidecar/` — Go uTLS 库，Node.js 通过 FFI 调用
- `src/auth/` — OAuth 认证流程管理

**openclaw-zero-token 可借鉴点：**

- uTLS 指纹绕过（应对 Cloudflare Bot 检测，当前 openclaw-zero-token 的 CDP 方案天然规避了这个问题）
- Anthropic SQLite token 提取（`~/.kiro/` 下的 token.db，可直接复用）
- Anthropic 原生 API 格式兼容（比 OpenAI 格式更完整）

---

### 三、kiro-gateway（959 stars）——Kiro/AWS 专项，最稳定的免费 Claude 来源

**技术架构：**

```
客户端（Claude Code / Cursor / OpenClaw）
        ↓ OpenAI 格式 或 Anthropic 格式
  kiro-gateway（Python/FastAPI）
        ↓
  Anthropic IDE/CLI 内部 API
  （AWS CodeWhisperer 底层）
  https://prod.{region}.auth.desktop.kiro.dev/refreshToken
        ↓
  Claude Opus 4.5 / Haiku 4.5 / Opus 4.5（无限免费）
```

**核心实现原理：**

1. **两种认证方式**：
   - **KIRO_DESKTOP**：Kiro IDE 桌面客户端 token（`kirocli:social:token`），OAuth 刷新
   - **AWS_SSO_OIDC**：`kirocli:odic:token`，AWS SSO OIDC 协议（企业版）
2. **Token 存储**：从 SQLite 数据库（`~/.kiro/token.db`）读取，按优先级搜索多个 key
3. **自动刷新**：asyncio.Lock 保证线程安全，超时前自动刷新
4. **格式转换**：完整实现 OpenAI `/v1/chat/completions` 和 Anthropic `/v1/messages` 双协议端点
5. **思考过程解析**：内置 `thinking_parser.py` 处理 Claude 的 `think` 标签块

**关键代码模块：**

- `kiro/auth.py` — 认证生命周期管理（加载→存储→刷新）
- `kiro/routes_openai.py` — OpenAI 兼容端点
- `kiro/routes_anthropic.py` — Anthropic 原生端点
- `kiro/converters_anthropic.py` — 响应格式互转
- `kiro/streaming_anthropic.py` — SSE 流式解析
- `kiro/truncation_recovery.py` — 截断恢复（Claude 长输出中断恢复）
- `kiro/tokenizer.py` — token 计数（用于 context window 管理）

**openclaw-zero-token 可借鉴点：**

- **Kiro token 直接复用**：openclaw-zero-token 可以像 kiro-gateway 一样，直接读取 `~/.kiro/token.db` 的 SQLite token，无需 OAuth 流程
- **双协议端点**：`/v1/chat/completions` + `/v1/messages` 同时支持，兼容所有客户端
- **truncation_recovery.py**：Claude 长输出被截断后的自动续接，对长任务处理很有价值

---

## 三家关键技术横向对比

| 技术维度             | CLIProxyAPI                          | AIClient-2-API                   | kiro-gateway                      |
| -------------------- | ------------------------------------ | -------------------------------- | --------------------------------- |
| **语言**             | Go                                   | Node.js + Go（tls-sidecar）      | Python                            |
| **认证方式**         | OAuth 自动引导 + 浏览器注入          | OAuth + uTLS 指纹 + SQLite token | SQLite token 直接读取             |
| **Cloudflare 绕过**  | ✅ Claude Code/Gemini CLI 本身已绕过 | ✅ uTLS 指纹                     | ❌ 直接 API 请求                  |
| **多账号池**         | ✅ round-robin                       | ✅ provider-pool-manager         | ❌ 单账号                         |
| **流式输出**         | ✅ stdio/ws 中继                     | ✅ adapter 层                    | ✅ SSE 解析                       |
| **Anthropic 格式**   | ✅ 双向转换                          | ✅                               | ✅ 原生支持                       |
| **工具调用**         | ✅                                   | ✅                               | ✅                                |
| **Claude 思考解析**  | ✅                                   | ✅                               | ✅                                |
| **免费 Claude 版本** | Claude Code 订阅映射                 | Opus 4.5（Kiro）                 | Opus 4.5 / Sonnet 4.5 / Haiku 4.5 |
| **依赖外部进程**     | ✅（CLI 进程）                       | 部分                             | ❌（直接 HTTP）                   |
| **可嵌入 SDK**       | ✅（Go SDK）                         | ❌                               | ❌                                |

---

## 对 openclaw-zero-token 的具体借鉴建议

### 高优先级（最容易集成，效果最明显）

**1. Anthropic token 直接复用**

- kiro-gateway 已验证：从 `~/.kiro/token.db` SQLite 读取 token 即可
- 只需安装 Anthropic IDE，登录后 token 持久化，无需 OAuth 流程
- 收益：立即获得 Claude Opus 4.5 / Sonnet 4.5 无限免费调用
- 集成方式：在 `src/providers/` 下新增 `kiro-web-auth.ts` + `kiro-web-client.ts`

**2. Anthropic 原生格式支持**

- kiro-gateway 完整实现了 `/v1/messages` 端点
- 当前 openclaw-zero-token 只暴露 OpenAI 兼容格式，对 Claude Code 的完整功能（如 thinking 预算、扩展工具）支持受限
- 集成方式：参考 `kiro/routes_anthropic.py` 实现 `/v1/messages` 路由

**3. truncation_recovery 思路**

- Claude 长输出（如代码生成）超过 context window 会被截断
- kiro-gateway 有续接机制，可以自动补全
- 对 openclaw-zero-token 的 Agent 任务长链处理有直接价值

### 中优先级（需要更多开发工作）

**4. OAuth 自动刷新机制（CLIProxyAPI 风格）**

- 用户只需做一次 OAuth 登录，之后 token 自动续期
- 当前 openclaw-zero-token 的 Cookie 认证需要用户手动刷新
- 收益：降低长期使用的手动维护成本

**5. 多账号池 + 轮询（CLIProxyAPI 风格）**

- Kiro/AWS 账号有速率限制，多账号轮询可提高并发可用性
- 已有 9router、CLIProxyAPI 验证可行
- 集成复杂度中等，需要账号管理 UI

### 低优先级（openclaw-zero-token 已有 CDP 方案更优）

**6. TLS 指纹绕过（AIClient-2-API 风格）**

- CDP 方案天然绕过 Cloudflare，无需 uTLS
- 但对于非 CDP provider（如直接 HTTP 的 Anthropic API）可能有用
- 权衡：引入 Go uTLS 依赖增加复杂度，只对部分 provider 有价值
