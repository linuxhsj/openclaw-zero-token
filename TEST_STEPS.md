# 测试步骤（完整版）

## 🎯 配置步骤

### 步骤 1：编译

**目的**：编译 TypeScript 代码为可执行的 JavaScript

```bash
npm install
npm run build
```

**验证**：
```bash
ls dist/index.mjs
# 应该看到编译后的文件
```

**注意**：如果修改了源代码，需要重新编译

---

### 步骤 2：打开浏览器调试

**目的**：提供浏览器环境（端口 9222）

```bash
./start-chrome-debug.sh
```

**验证**：
```bash
ps aux | grep "chrome.*9222" | grep -v grep
# 应该看到 Chrome 进程
```

---

### 步骤 3：登录各大网站（不含 DeepSeek）

**目的**：在 Chrome 调试浏览器中建立登录会话

**重要**：必须在 `start-chrome-debug` 启动的 Chrome 中登录（不是普通浏览器）。**DeepSeek 在第 5 步单独处理**

在 Chrome 中打开并登录以下平台：

1. **千问 (Qwen)**: https://chat.qwen.ai
2. **Kimi**: https://kimi.moonshot.cn
3. **Claude**: https://claude.ai
4. **Doubao**: https://www.doubao.com/chat/
5. **ChatGPT**: https://chatgpt.com
7. **Gemini**: https://gemini.google.com/app
8. **Grok**: https://grok.com
9. **Z**: https://chat.z.ai
10. **Manus**: https://manus.im/app

---

### 步骤 4：配置 onboard

**目的**：为各平台配置认证信息

```bash
./onboard.sh
```

**操作**：选择平台（如 `deepseek-web`），按提示完成认证

---

### 步骤 5：登录 DeepSeek

**目的**：在 Chrome 中登录 DeepSeek，并通过 onboard 捕获认证

1. 在 Chrome 中访问 https://chat.deepseek.com 并登录
2. 运行 `./onboard.sh`，选择 **deepseek-web** 完成凭证捕获

---

### 步骤 6：启动 server

**目的**：启动 Web UI 服务（端口 3001）

```bash
./server.sh start
```

**验证**：
```bash
./server.sh status
# 应该显示：Gateway 服务运行中
```

---

### 访问 Web UI

**访问地址**：
```
http://127.0.0.1:3001/#token=62b791625fa441be036acd3c206b7e14e2bb13c803355823
```

浏览器应该会自动打开，如果没有，手动访问上面的地址。

---

### 步骤 7：查看所有模型

在 Web UI 的聊天框中输入：
```
/models
```

**预期结果**：应该看到 23 个模型

```
claude-web/claude-3-5-sonnet-20241022
claude-web/claude-3-opus-20240229
claude-web/claude-3-haiku-20240307
doubao-web/doubao-seed-2.0
doubao-web/doubao-pro
chatgpt-web/gpt-4
chatgpt-web/gpt-4-turbo
chatgpt-web/gpt-3.5-turbo
qwen-web/qwen-max
qwen-web/qwen-plus
qwen-web/qwen-turbo
kimi-web/moonshot-v1-8k
kimi-web/moonshot-v1-32k
kimi-web/moonshot-v1-128k
gemini-web/gemini-pro
gemini-web/gemini-ultra
grok-web/grok-2
grok-web/grok-1
z-web/glm-4
z-web/glm-3
manus-web/manus-1
```

---

### 步骤 8：测试对话

**操作**：
1. 在 Web UI 中选择一个模型（如 `chatgpt-web/gpt-4`）
2. 发送测试消息："你好，请介绍一下你自己"
3. 检查是否能正常收到回复

**对每个平台重复测试**：
- ✅ claude-web
- ✅ doubao-web
- ⏳ chatgpt-web
- ⏳ qwen-web
- ⏳ kimi-web
- ✅ gemini-web
- ✅ grok-web
- ⏳ z-web
- ⏳ manus-web

---

## 📊 配置流程图

```
┌─────────────────────────────────────┐
│ 1. 编译                             │
│    npm install && npm run build     │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ 2. 打开浏览器调试                   │
│    ./start-chrome-debug.sh          │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ 3. 登录各大网站（不含 DeepSeek）     │
│    (千问、Kimi 等，DeepSeek 在第 5 步)│
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ 4. 配置 onboard                     │
│    ./onboard.sh                     │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ 5. 登录 DeepSeek                    │
│    (Chrome 登录 + onboard 捕获)     │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ 6. 启动 server                      │
│    ./server.sh start                │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ 打开 Web UI → http://127.0.0.1:3001 │
│ 输入 /models → 测试对话             │
└─────────────────────────────────────┘
```

---

## 🔧 故障排查

### 问题 1：端口冲突

**症状**：Gateway 启动失败，提示端口被占用

**解决**：
```bash
# 查找占用 3001 端口的进程
lsof -i :3001

# 关闭进程
kill <PID>

# 或者强制关闭
./server.sh stop
```

### 问题 2：Chrome 调试浏览器未启动

**症状**：onboard 提示无法连接浏览器

**解决**：
```bash
# 检查 Chrome 是否运行
ps aux | grep "chrome.*9222"

# 重新启动
./start-chrome-debug.sh
```

### 问题 3：认证失败

**症状**：测试对话时提示认证错误

**解决**：
1. 确保在 Chrome 调试浏览器中已登录
2. 重新运行 `./onboard.sh` 配置认证
3. 检查 cookie 是否正确

### 问题 4：模型列表为空

**症状**：`/models` 命令没有显示模型

**解决**：
```bash
# 重启 Gateway
./server.sh restart

# 检查配置文件
cat .openclaw-state/openclaw.json | jq '.models.providers | keys'

# 查看日志
tail -f /tmp/openclaw-gateway.log
```

---

## 📝 快速命令参考

```bash
# 首次使用：安装依赖并编译
npm install
npm run build

# 关闭系统 Gateway
openclaw gateway stop

# 启动 Chrome 调试
./start-chrome-debug.sh

# 配置认证
./onboard.sh

# 启动本地 Gateway
./server.sh start

# 查看状态
./server.sh status

# 重启 Gateway
./server.sh restart

# 停止 Gateway
./server.sh stop

# 查看日志
tail -f /tmp/openclaw-gateway.log

# 检查配置
cat .openclaw-state/openclaw.json | jq '.models.providers | keys'

# 检查认证
cat .openclaw-state/agents/main/agent/auth-profiles.json | jq '.profiles | keys'
```

---

## ✅ 测试完成标志

- ✅ 所有 10 个平台都能在 `/models` 中看到
- ✅ 每个平台都能成功发送消息并收到回复
- ✅ 流式响应正常工作（逐字显示）
- ✅ 没有认证错误或 API 错误

---

祝测试顺利！🚀
