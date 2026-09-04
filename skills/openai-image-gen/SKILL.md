---
name: openai-image-gen
description: Batch-generate images via OpenAI Images API (or Atlas Cloud). Random prompt sampler + `index.html` gallery.
homepage: https://platform.openai.com/docs/api-reference/images
metadata:
  {
    "openclaw":
      {
        "emoji": "🎨",
        "requires": { "bins": ["python3"], "env": ["OPENAI_API_KEY"] },
        "primaryEnv": "OPENAI_API_KEY",
        "install":
          [
            {
              "id": "python-brew",
              "kind": "brew",
              "formula": "python",
              "bins": ["python3"],
              "label": "Install Python (brew)",
            },
          ],
      },
  }
---

# OpenAI Image Gen

Generate a handful of “random but structured” prompts and render them via the OpenAI Images API.

## Run

Note: Image generation can take longer than common exec timeouts (for example 30 seconds).
When invoking this skill via OpenClaw’s exec tool, set a higher timeout to avoid premature termination/retries (e.g., exec timeout=300).

```bash
python3 {baseDir}/scripts/gen.py
open ~/Projects/tmp/openai-image-gen-*/index.html  # if ~/Projects/tmp exists; else ./tmp/...
```

Useful flags:

```bash
# GPT image models with various options
python3 {baseDir}/scripts/gen.py --count 16 --model gpt-image-1
python3 {baseDir}/scripts/gen.py --prompt "ultra-detailed studio photo of a lobster astronaut" --count 4
python3 {baseDir}/scripts/gen.py --size 1536x1024 --quality high --out-dir ./out/images
python3 {baseDir}/scripts/gen.py --model gpt-image-1.5 --background transparent --output-format webp

# DALL-E 3 (note: count is automatically limited to 1)
python3 {baseDir}/scripts/gen.py --model dall-e-3 --quality hd --size 1792x1024 --style vivid
python3 {baseDir}/scripts/gen.py --model dall-e-3 --style natural --prompt "serene mountain landscape"

# DALL-E 2
python3 {baseDir}/scripts/gen.py --model dall-e-2 --size 512x512 --count 4
```

## Alternative Provider: Atlas Cloud

`--provider atlas` swaps the backend to [Atlas Cloud](https://www.atlascloud.ai/?utm_source=github&utm_medium=link&utm_campaign=openclaw-zero-token) and reads `ATLASCLOUD_API_KEY` instead of `OPENAI_API_KEY`. Everything else — prompt sampler, output layout, `prompts.json`, `index.html` gallery — is unchanged. The default (`--provider openai`) is untouched.

```bash
export ATLASCLOUD_API_KEY=<atlascloud-api-key>
python3 {baseDir}/scripts/gen.py --provider atlas --count 4
python3 {baseDir}/scripts/gen.py --provider atlas --model google/nano-banana-pro/text-to-image --size 1536x1024
```

Notes:

- Default model is `alibaba/wan-2.7/text-to-image`. Other options include `black-forest-labs/flux-schnell`, `bytedance/seedream-v5.0-lite`, `google/imagen4`, `google/nano-banana-pro/text-to-image`, `openai/gpt-image-2/text-to-image`, `qwen/qwen-image-2.0/text-to-image` and `z-image/turbo` — see [atlascloud.ai/models](https://www.atlascloud.ai/models).
- Atlas is **not** OpenAI Images API compatible: the script submits a job and polls the prediction (up to 300s), so keep the exec timeout high as noted above.
- `--size` keeps the familiar `1024x1024` form; the script converts it to the `width*height` form Atlas expects.
- `--quality`, `--background`, `--output-format` and `--style` are OpenAI-only; passing them with `--provider atlas` prints a warning and ignores them.

## Model-Specific Parameters

Different models support different parameter values. The script automatically selects appropriate defaults based on the model.

### Size

- **GPT image models** (`gpt-image-1`, `gpt-image-1-mini`, `gpt-image-1.5`): `1024x1024`, `1536x1024` (landscape), `1024x1536` (portrait), or `auto`
  - Default: `1024x1024`
- **dall-e-3**: `1024x1024`, `1792x1024`, or `1024x1792`
  - Default: `1024x1024`
- **dall-e-2**: `256x256`, `512x512`, or `1024x1024`
  - Default: `1024x1024`

### Quality

- **GPT image models**: `auto`, `high`, `medium`, or `low`
  - Default: `high`
- **dall-e-3**: `hd` or `standard`
  - Default: `standard`
- **dall-e-2**: `standard` only
  - Default: `standard`

### Other Notable Differences

- **dall-e-3** only supports generating 1 image at a time (`n=1`). The script automatically limits count to 1 when using this model.
- **GPT image models** support additional parameters:
  - `--background`: `transparent`, `opaque`, or `auto` (default)
  - `--output-format`: `png` (default), `jpeg`, or `webp`
  - Note: `stream` and `moderation` are available via API but not yet implemented in this script
- **dall-e-3** has a `--style` parameter: `vivid` (hyper-real, dramatic) or `natural` (more natural looking)

## Output

- `*.png`, `*.jpeg`, or `*.webp` images (output format depends on model + `--output-format`)
- `prompts.json` (prompt → file mapping)
- `index.html` (thumbnail gallery)
