# OpenClaw State Directory Example

[English](README.en.md) | 简体中文

这是 `.openclaw-zero-state/` 目录的示例配置文件。

## 目录结构

```
.openclaw-zero-state/
├── openclaw.json                          # 主配置文件
└── agents/
    └── main/
        └── agent/
            └── auth-profiles.json         # 认证凭证（敏感信息）
```

## 重要说明

⚠️ **`.openclaw-zero-state/` 目录包含敏感信息，不应该提交到 Git！**

- 已在 `.gitignore` 中排除
- 包含认证凭证（sessionKey、cookie 等）
- 包含个人配置和工作空间数据

## 首次运行

首次运行时，`.openclaw-zero-state/` 目录会自动创建。

⚠️ **重要**：`openclaw.json` 不能为空，否则 Gateway 无法正常启动。首次运行时会自动从 `.openclaw-state.example/openclaw.json` 复制完整配置模板。

### 自动创建（推荐）

运行配置向导或 `server.sh` 时，若 `.openclaw-zero-state/openclaw.json` 不存在，会自动从示例复制：

```bash
./onboard.sh
# 或
./server.sh start
```

**自动创建的内容：**
1. ✅ `.openclaw-zero-state/` 目录
2. ✅ `openclaw.json` 配置文件（从 `.openclaw-state.example/openclaw.json` 复制，非空）
3. ✅ `agents/main/agent/` 子目录
4. ✅ `agents/main/sessions/` 会话目录
5. ✅ `credentials/` 认证目录
6. ✅ `auth-profiles.json` 认证凭证文件（配置完成后）

**你需要做的：**
1. 运行 `./onboard.sh` 或 `./server.sh start`
2. 选择 AI 提供商（如 Claude Web）
3. 在浏览器中登录账号
4. 等待系统自动保存凭证

**完全不需要手动创建任何文件或目录！**

### 手动创建（可选）

若自动复制未生效（例如示例文件不存在），可手动复制：

```bash
mkdir -p .openclaw-zero-state
cp .openclaw-state.example/openclaw.json .openclaw-zero-state/openclaw.json
```

然后编辑 `.openclaw-zero-state/openclaw.json`，至少修改：
- `workspace` 路径（改为你的实际路径）
- `gateway.auth.token`（生成一个随机 token）

## 配置文件说明

### openclaw.json

主配置文件（最小模板），包含：

- **browser**: 浏览器配置（CDP 连接）
- **models**: AI 模型配置（初始为空）
- **agents**: Agent 默认配置
- **gateway**: Gateway 服务配置

### onboard 增量写入机制（重要）

`openclaw.json` 采用**按需增量写入**，不是一次性写入所有平台：

1. 初始模板里 `models.providers` 和 `agents.defaults.models` 为空
2. 每次你在 `./onboard.sh` 里选择并完成一个平台认证
3. 系统仅写入该平台对应的 provider/models/alias

也就是说：**没有在 onboard 里选过的平台，不会出现在运行态 `openclaw.json` 中。**

最小模板示意：

```json
{
  "models": { "mode": "merge", "providers": {} },
  "agents": { "defaults": { "models": {} } }
}
```

### auth-profiles.json

认证凭证文件，包含：

- Claude Web sessionKey
- DeepSeek Web cookie
- Doubao Web sessionid
- 其他 API keys

**格式示例：**

```json
{
  "version": 1,
  "profiles": {
    "claude-web:default": {
      "type": "api_key",
      "provider": "claude-web",
      "key": "{\"sessionKey\":\"sk-ant-sid02-...\",\"userAgent\":\"...\"}"
    }
  }
}
```

## 路径配置

### macOS

```json
{
  "agents": {
    "defaults": {
      "workspace": "/Users/YOUR_USERNAME/Documents/openclaw-zero-token/.openclaw-zero-state/workspace"
    }
  }
}
```

### Linux

```json
{
  "agents": {
    "defaults": {
      "workspace": "/home/YOUR_USERNAME/Documents/openclaw-zero-token/.openclaw-zero-state/workspace"
    }
  }
}
```

## 安全建议

1. ✅ 确保 `.openclaw-zero-state/` 在 `.gitignore` 中
2. ✅ 不要分享 `auth-profiles.json` 文件
3. ✅ 定期更新过期的认证凭证
4. ✅ 使用强随机 Gateway Token

## 故障排查

### 首次运行：使用配置向导（推荐）

**首次运行项目时，直接运行配置向导：**

```bash
./onboard.sh
```

**配置向导会自动创建：**
- ✅ `.openclaw-zero-state/` 目录
- ✅ `openclaw.json` 配置文件（从示例复制，若不存在）
- ✅ `agents/main/agent/` 目录
- ✅ `agents/main/sessions/` 目录
- ✅ `credentials/` 目录
- ✅ `auth-profiles.json` 认证文件（配置完成后）

**完全不需要手动创建任何文件或目录！**

### 修复问题：使用诊断命令

**如果项目已经运行过，但遇到目录或文件缺失问题，运行诊断命令：**

```bash
node dist/index.mjs doctor
```

**⚠️ 注意：`doctor` 命令只会：**
- ✅ 检查和创建缺失的**目录**
- ✅ 修复文件权限问题
- ❌ **不会**创建配置文件（`openclaw.json`）
- ❌ **不会**创建认证文件（`auth-profiles.json`）

**使用场景：**
- 目录被意外删除
- 文件权限出现问题
- 配置文件损坏（需要重新运行 `onboard.sh`）
- 验证环境是否正常

**示例输出：**
```
State integrity
- CRITICAL: Sessions dir missing (~/.openclaw-zero/agents/main/sessions)
? Create Sessions dir at ~/.openclaw-zero/agents/main/sessions? (Y/n)

Doctor changes
- Created Sessions dir: ~/.openclaw-zero/agents/main/sessions
- Tightened permissions on ~/.openclaw-zero to 700
```

### 配置文件不存在或损坏

```bash
# 运行 onboard 或 server 会自动从 .openclaw-state.example/openclaw.json 复制配置
./onboard.sh
# 或
./server.sh start
```

### 路径错误

检查并修改 `openclaw.json` 中的 `workspace` 路径：

```bash
# macOS
sed -i '' 's|/home/|/Users/|g' .openclaw-zero-state/openclaw.json

# Linux
sed -i 's|/Users/|/home/|g' .openclaw-zero-state/openclaw.json
```

### 认证失败

删除旧的认证文件，重新配置：

```bash
rm .openclaw-zero-state/agents/main/agent/auth-profiles.json
./onboard.sh
```
