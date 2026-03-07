# OpenClaw State Directory Example

English | [简体中文](README.md)

Example configuration files for the `.openclaw-zero-state/` directory.

## Directory Structure

```
.openclaw-zero-state/
├── openclaw.json                          # Main config file
└── agents/
    └── main/
        └── agent/
            └── auth-profiles.json         # Auth credentials (sensitive)
```

## Important Notes

⚠️ **The `.openclaw-zero-state/` directory contains sensitive information and should NOT be committed to Git!**

- Excluded in `.gitignore`
- Contains auth credentials (sessionKey, cookies, etc.)
- Contains personal config and workspace data

## First Run

The `.openclaw-zero-state/` directory is created automatically on first run.

⚠️ **Important:** `openclaw.json` must not be empty, or the Gateway will fail to start. On first run, the full config template is automatically copied from `.openclaw-state.example/openclaw.json`.

### Auto-Create (Recommended)

When running the config wizard or `server.sh`, if `.openclaw-zero-state/openclaw.json` does not exist, it is automatically copied from the example:

```bash
./onboard.sh
# or
./server.sh start
```

**What gets created:**
1. ✅ `.openclaw-zero-state/` directory
2. ✅ `openclaw.json` config file (copied from `.openclaw-state.example/openclaw.json`, not empty)
3. ✅ `agents/main/agent/` subdirectory
4. ✅ `agents/main/sessions/` sessions directory
5. ✅ `credentials/` directory
6. ✅ `auth-profiles.json` auth file (after config completes)

**What you need to do:**
1. Run `./onboard.sh` or `./server.sh start`
2. Select AI provider (e.g. Claude Web)
3. Log in via the browser
4. Wait for the system to save credentials

**No manual file or directory creation required!**

### Manual Create (Optional)

If auto-copy does not work (e.g. example file missing), copy manually:

```bash
mkdir -p .openclaw-zero-state
cp .openclaw-state.example/openclaw.json .openclaw-zero-state/openclaw.json
```

Then edit `.openclaw-zero-state/openclaw.json` and at least update:
- `workspace` path (to your actual path)
- `gateway.auth.token` (generate a random token)

## Config File Reference

### openclaw.json

Main config file (minimal template), includes:

- **browser**: Browser config (CDP connection)
- **models**: AI model config (initially empty)
- **agents**: Agent defaults
- **gateway**: Gateway service config

### Onboard Incremental Write (Important)

`openclaw.json` uses **on-demand incremental writes**, not a single full write:

1. Initial template has empty `models.providers` and `agents.defaults.models`
2. Each time you complete a platform auth in `./onboard.sh`
3. Only that platform’s provider/models/alias are written

**Platforms not completed in onboard will not appear in the runtime `openclaw.json`.**

Minimal template example:

```json
{
  "models": { "mode": "merge", "providers": {} },
  "agents": { "defaults": { "models": {} } }
}
```

### auth-profiles.json

Auth credentials file, contains:

- Claude Web sessionKey
- DeepSeek Web cookie
- Doubao Web sessionid
- Other API keys

**Example format:**

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

## Path Configuration

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

## Security Recommendations

1. ✅ Ensure `.openclaw-zero-state/` is in `.gitignore`
2. ✅ Do not share `auth-profiles.json`
3. ✅ Rotate expired credentials regularly
4. ✅ Use a strong random Gateway Token

## Troubleshooting

### First Run: Use Config Wizard (Recommended)

**On first run, start the config wizard:**

```bash
./onboard.sh
```

**The wizard will create:**
- ✅ `.openclaw-zero-state/` directory
- ✅ `openclaw.json` config file (copied from example if missing)
- ✅ `agents/main/agent/` directory
- ✅ `agents/main/sessions/` directory
- ✅ `credentials/` directory
- ✅ `auth-profiles.json` auth file (after config completes)

**No manual creation needed!**

### Fix Issues: Use Doctor Command

**If the project has run before but directories/files are missing:**

```bash
node dist/index.mjs doctor
```

**⚠️ Note: The `doctor` command will only:**
- ✅ Check and create missing **directories**
- ✅ Fix file permissions
- ❌ **Not** create config file (`openclaw.json`)
- ❌ **Not** create auth file (`auth-profiles.json`)

**Use when:**
- Directories were accidentally deleted
- File permission issues
- Config file corrupted (re-run `onboard.sh`)
- Verifying environment

**Example output:**
```
State integrity
- CRITICAL: Sessions dir missing (~/.openclaw-zero/agents/main/sessions)
? Create Sessions dir at ~/.openclaw-zero/agents/main/sessions? (Y/n)

Doctor changes
- Created Sessions dir: ~/.openclaw-zero/agents/main/sessions
- Tightened permissions on ~/.openclaw-zero to 700
```

### Config File Missing or Corrupted

```bash
# Running onboard or server will auto-copy config from .openclaw-state.example/openclaw.json
./onboard.sh
# or
./server.sh start
```

### Path Errors

Check and update the `workspace` path in `openclaw.json`:

```bash
# macOS
sed -i '' 's|/home/|/Users/|g' .openclaw-zero-state/openclaw.json

# Linux
sed -i 's|/Users/|/home/|g' .openclaw-zero-state/openclaw.json
```

### Auth Failure

Remove old auth file and reconfigure:

```bash
rm .openclaw-zero-state/agents/main/agent/auth-profiles.json
./onboard.sh
```
