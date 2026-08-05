---
summary: "Use MiniMax M3 and M2.7 in OpenClaw"
read_when:
  - You want MiniMax models in OpenClaw
  - You need MiniMax setup or endpoint guidance
title: "MiniMax"
---

# MiniMax

OpenClaw includes a bundled MiniMax provider for API-key and Token Plan OAuth setup.
MiniMax M3 is the default model, while MiniMax M2.7 remains available for existing
text-only workflows.

Official references:

- [Model invocation](https://platform.minimax.io/docs/guides/text-generation)
- [Pay-as-you-go pricing](https://platform.minimax.io/docs/guides/pricing-paygo)

## Model catalog

| Model ID       |                          Context window | OpenClaw input declaration | Thinking behavior                  |
| -------------- | --------------------------------------: | -------------------------- | ---------------------------------- |
| `MiniMax-M3`   | 1,000,000 total input and output tokens | Text and image             | Supports `adaptive` and `disabled` |
| `MiniMax-M2.7` |   204,800 total input and output tokens | Text                       | Always on                          |

The upstream M3 APIs also accept video content blocks. OpenClaw's current model input
declaration represents text and image inputs, which are the modalities the agent runtime
can pass directly to this provider.

M3 thinking defaults depend on the selected protocol. The Anthropic-compatible API leaves
thinking off when the parameter is omitted; the OpenAI-compatible API leaves it on. M2.7
thinking cannot be disabled. OpenClaw normalizes enabled M3 thinking requests to
`{"type":"adaptive"}` for the Anthropic-compatible API.

## Configure with the wizard

For a global API key:

```bash
openclaw setup --wizard --auth-choice minimax-global-api
```

For a CN API key:

```bash
openclaw setup --wizard --auth-choice minimax-cn-api
```

For Token Plan OAuth:

```bash
openclaw models auth login --provider minimax-portal --set-default
```

The wizard uses MiniMax M3 and the Anthropic-compatible endpoint for the selected region.

## Manual API-key configuration

The global Anthropic-compatible configuration is:

```json5
{
  env: { MINIMAX_API_KEY: "sk-..." },
  agents: {
    defaults: {
      model: { primary: "minimax/MiniMax-M3" },
      models: {
        "minimax/MiniMax-M3": { alias: "minimax" },
        "minimax/MiniMax-M2.7": { alias: "minimax-m2.7" },
      },
    },
  },
  models: {
    mode: "merge",
    providers: {
      minimax: {
        baseUrl: "https://api.minimax.io/anthropic",
        apiKey: "${MINIMAX_API_KEY}",
        api: "anthropic-messages",
        authHeader: true,
        models: [
          {
            id: "MiniMax-M3",
            name: "MiniMax M3",
            reasoning: true,
            input: ["text", "image"],
            cost: { input: 0.6, output: 2.4, cacheRead: 0.12, cacheWrite: 0 },
            contextWindow: 1000000,
            maxTokens: 131072,
          },
          {
            id: "MiniMax-M2.7",
            name: "MiniMax M2.7",
            reasoning: true,
            input: ["text"],
            cost: { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0.375 },
            contextWindow: 204800,
            maxTokens: 131072,
          },
        ],
      },
    },
  },
}
```

## Region and protocol endpoints

OpenClaw stores one `baseUrl` and one `api` value per provider entry. Use one matching pair
from this table; no additional endpoint fields are required.

| Region | Protocol             | `baseUrl`                            | `api`                |
| ------ | -------------------- | ------------------------------------ | -------------------- |
| Global | Anthropic-compatible | `https://api.minimax.io/anthropic`   | `anthropic-messages` |
| Global | OpenAI-compatible    | `https://api.minimax.io/v1`          | `openai-completions` |
| CN     | Anthropic-compatible | `https://api.minimaxi.com/anthropic` | `anthropic-messages` |
| CN     | OpenAI-compatible    | `https://api.minimaxi.com/v1`        | `openai-completions` |

For an OpenAI-compatible CN override:

```json5
{
  models: {
    providers: {
      minimax: {
        baseUrl: "https://api.minimaxi.com/v1",
        api: "openai-completions",
      },
    },
  },
}
```

Keep Anthropic Base URLs ending in `/anthropic`. The Anthropic SDK appends
`/v1/messages`; adding `/v1` to the configured Base URL would duplicate that path. The
OpenAI client appends `/chat/completions` to the `/v1` Base URL.

## Pricing

Catalog costs are USD per million tokens:

| Model        | Input | Output | Cache read | Cache write |
| ------------ | ----: | -----: | ---------: | ----------: |
| MiniMax M3   | $0.60 |  $2.40 |      $0.12 |  Not listed |
| MiniMax M2.7 | $0.30 |  $1.20 |      $0.06 |      $0.375 |

The M3 catalog uses `cacheWrite: 0` because the model schema requires a numeric value and
the official pricing does not list a prompt-cache write charge.

## Troubleshooting

### Unknown model: minimax/MiniMax-M3

Confirm that the provider is configured through the wizard, JSON, or a MiniMax auth
profile. Model IDs are case-sensitive:

- `minimax/MiniMax-M3`
- `minimax/MiniMax-M2.7`

Then run:

```bash
openclaw models list
```
