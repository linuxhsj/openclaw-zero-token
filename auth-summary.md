# OpenClaw Web 模型认证总结

## 已认证的模型

### 1. Doubao Web (豆包)

- **认证状态**: ✅ 已完成
- **模型**:
  - `doubao-seed-2.0` (Doubao-Seed 2.0 Web)
  - `doubao-pro` (Doubao Pro Web)
- **认证链接**: https://www.doubao.com

### 2. GLM Web (智谱清言)

- **认证状态**: ✅ 已完成
- **模型**:
  - `glm-4-plus` (glm-4 Plus Web)
  - `glm-4-think` (glm-4 Think Web)
- **认证链接**: https://chatglm.cn

### 3. Kimi Web

- **认证状态**: ✅ 已完成
- **模型**:
  - `moonshot-v1-8k` (Moonshot v1 8K Web)
  - `moonshot-v1-32k` (Moonshot v1 32K Web)
  - `moonshot-v1-128k` (Moonshot v1 128K Web)
- **认证链接**: https://api.moonshot.ai/v1

### 4. DeepSeek Web

- **认证状态**: ✅ 已完成
- **模型**:
  - `deepseek-chat` (DeepSeek V3 Web)
  - `deepseek-reasoner` (DeepSeek R1 Web)
- **认证链接**: https://chat.deepseek.com

### 5. Qwen Web (通义千问)

- **认证状态**: ✅ 已完成
- **模型**:
  - `qwen-max` (Qwen Max Web)
  - `qwen-plus` (Qwen Plus Web)
  - `qwen-turbo` (Qwen Turbo Web)
- **认证链接**: https://chat.qwen.ai

## 配置文件位置

- **配置文件**: `C:\Users\Administrator\tk\.openclaw-upstream-state\openclaw.json`
- **认证信息**: `C:\Users\Administrator\tk\.openclaw-upstream-state\agents\main\agent\auth-profiles.json`

## 使用方法

### 启动 Gateway 服务

```bash
./onboard.sh gateway
```

### 访问 Web UI

- URL: http://127.0.0.1:3001
- Token: `Auto Build`

### 在代码中使用模型

```javascript
// Doubao
const doubaoModel = "doubao-web/doubao-seed-2.0";

// GLM
const glmModel = "glm-web/glm-4-plus";

// Kimi
const kimiModel = "kimi-web/moonshot-v1-32k";

// DeepSeek
const deepseekModel = "deepseek-web/deepseek-chat";

// Qwen
const qwenModel = "qwen-web/qwen-max";
```

## 注意事项

1. **Chrome 调试模式**: 确保 Chrome 已启动调试模式
   - Windows: `chrome.exe --remote-debugging-port=9222`
2. **认证有效期**: Web 模型认证通常有有效期，需要定期重新认证

3. **模型别名**: 配置中已设置模型别名，便于识别：
   - Doubao Browser
   - GLM Web
   - Kimi Web
   - DeepSeek V3 / DeepSeek R1
