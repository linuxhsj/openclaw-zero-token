# 🚀 从这里开始

## 📖 文档导航

### 🔧 安装
- **INSTALLATION.md** - 安装指南（首次使用必读）

### 🎯 快速开始
- **TEST_STEPS.md** - 完整测试步骤（推荐阅读）

### 📚 详细文档
- **ARCHITECTURE.md** - 系统架构说明
- **README.md** / **README_zh-CN.md** - 项目总览与支持平台

---

## ⚡ 配置步骤（6 步）

**首次使用？先阅读 INSTALLATION.md 完成安装！**

```bash
# 1. 编译
npm install
npm run build
pnpm ui:build   # 构建 Web UI

# 2. 打开浏览器调试
./start-chrome-debug.sh

# 3. 登录各大网站（千问、Kimi 等，不含 DeepSeek，在 Chrome 中登录）

# 4. 配置 onboard
./onboard.sh

# 5. 登录 DeepSeek（在 onboard 中选择 deepseek-web 完成认证）

# 6. 启动 server
./server.sh start
```

> **关键规则：** 只有在 `./onboard.sh` 中完成配置的平台，才会写入 `openclaw.json` 并出现在 `/models` 列表中。

然后访问：http://127.0.0.1:3001/#token=62b791625fa441be036acd3c206b7e14e2bb13c803355823

---

## 📋 需要登录的平台

**步骤 3**（不含 DeepSeek）：千问国际版、千问国内版、Kimi、Claude、Doubao、ChatGPT、Gemini、Grok、GLM Web（智谱清言）、GLM 国际版  
**步骤 5**（仅 DeepSeek）：https://chat.deepseek.com  

**Manus API**（已测试）：在 onboard 中配置 API Key，无需浏览器登录

---

## ✅ 测试状态

| 平台 | 状态 |
|------|------|
| DeepSeek、千问国际版、千问国内版、Kimi、Claude Web、豆包、ChatGPT Web、Gemini Web、Grok Web、GLM Web、GLM 国际版、Manus API | ✅ 已测试可用 |

---

## 🎯 预期结果

测试完成后，你将拥有：

- ✅ 12 个可用的平台（含 11 个 Web 平台 + Manus API）
- ✅ 28+ 个可选的 AI 模型
- ✅ 完全免费的 AI 对话服务
- ✅ 统一的浏览器方案

---

## 📞 需要帮助？

查看 **TEST_STEPS.md** 获取详细的测试步骤和故障排查指南。

---

开始测试吧！🎉

---

## English Version

### 🚀 Start Here

#### Quick Setup (6 Steps)

**First time? Read INSTALLATION.md first!**

```bash
# 1. Build
npm install
npm run build

# 2. Open browser debug mode
./start-chrome-debug.sh

# 3. Login to platforms (Qwen, Kimi, Claude, etc. — exclude DeepSeek)
# 4. Configure onboard
./onboard.sh

# 5. Login DeepSeek (Chrome + onboard deepseek-web)
# 6. Start server
./server.sh start
```

> **Important:** Only platforms completed in `./onboard.sh` are written into `openclaw.json` and shown in `/models`.

Then visit: http://127.0.0.1:3001/#token=62b791625fa441be036acd3c206b7e14e2bb13c803355823

#### Platforms to Login

**Step 3 (exclude DeepSeek)**  
1. https://chat.qwen.ai  
2. https://www.qianwen.com  
3. https://kimi.moonshot.cn  
4. https://claude.ai  
5. https://www.doubao.com/chat/  
6. https://chatgpt.com  
7. https://gemini.google.com/app  
8. https://grok.com  
9. https://chatglm.cn  
10. https://chat.z.ai/

**Step 5 (DeepSeek only)**  
11. https://chat.deepseek.com

#### Test Status

| Platform | Status |
|----------|--------|
| DeepSeek, Qwen International, Qwen CN, Kimi, Claude Web, Doubao, ChatGPT Web, Gemini Web, Grok Web, GLM Web, GLM International, Manus API | ✅ Tested |

#### Expected Results

After testing, you will have:

- ✅ 12 available platforms (11 Web platforms + Manus API)
- ✅ 28+ selectable AI models
- ✅ Completely free AI conversation service
- ✅ Unified browser approach

#### Need Help?

See **TEST_STEPS.md** for detailed testing steps and troubleshooting.
