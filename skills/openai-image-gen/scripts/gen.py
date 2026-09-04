#!/usr/bin/env python3
import argparse
import base64
import datetime as dt
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from html import escape as html_escape
from pathlib import Path


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-{2,}", "-", text).strip("-")
    return text or "image"


def default_out_dir() -> Path:
    now = dt.datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
    preferred = Path.home() / "Projects" / "tmp"
    base = preferred if preferred.is_dir() else Path("./tmp")
    base.mkdir(parents=True, exist_ok=True)
    return base / f"openai-image-gen-{now}"


def pick_prompts(count: int) -> list[str]:
    subjects = [
        "a lobster astronaut",
        "a brutalist lighthouse",
        "a cozy reading nook",
        "a cyberpunk noodle shop",
        "a Vienna street at dusk",
        "a minimalist product photo",
        "a surreal underwater library",
    ]
    styles = [
        "ultra-detailed studio photo",
        "35mm film still",
        "isometric illustration",
        "editorial photography",
        "soft watercolor",
        "architectural render",
        "high-contrast monochrome",
    ]
    lighting = [
        "golden hour",
        "overcast soft light",
        "neon lighting",
        "dramatic rim light",
        "candlelight",
        "foggy atmosphere",
    ]
    prompts: list[str] = []
    for _ in range(count):
        prompts.append(
            f"{random.choice(styles)} of {random.choice(subjects)}, {random.choice(lighting)}"
        )
    return prompts


def get_model_defaults(model: str) -> tuple[str, str]:
    """Return (default_size, default_quality) for the given model."""
    if model == "dall-e-2":
        # quality will be ignored
        return ("1024x1024", "standard")
    elif model == "dall-e-3":
        return ("1024x1024", "standard")
    else:
        # GPT image or future models
        return ("1024x1024", "high")


def normalize_optional_flag(
    *,
    model: str,
    raw_value: str,
    flag_name: str,
    supported: Callable[[str], bool],
    allowed: set[str],
    allowed_text: str,
    unsupported_message: str,
    aliases: dict[str, str] | None = None,
) -> str:
    """Normalize a string flag, warn when unsupported, and reject invalid values."""
    value = raw_value.strip().lower()
    if not value:
        return ""

    if not supported(model):
        print(unsupported_message.format(model=model), file=sys.stderr)
        return ""

    if aliases:
        value = aliases.get(value, value)

    if value not in allowed:
        raise ValueError(
            f"Invalid --{flag_name} '{raw_value}'. Allowed values: {allowed_text}."
        )
    return value


def normalize_background(model: str, background: str) -> str:
    """Validate --background for GPT image models."""
    return normalize_optional_flag(
        model=model,
        raw_value=background,
        flag_name="background",
        supported=lambda candidate: candidate.startswith("gpt-image"),
        allowed={"transparent", "opaque", "auto"},
        allowed_text="transparent, opaque, auto",
        unsupported_message=(
            "Warning: --background is only supported for gpt-image models; "
            "ignoring for '{model}'."
        ),
    )


def normalize_style(model: str, style: str) -> str:
    """Validate --style for dall-e-3."""
    return normalize_optional_flag(
        model=model,
        raw_value=style,
        flag_name="style",
        supported=lambda candidate: candidate == "dall-e-3",
        allowed={"vivid", "natural"},
        allowed_text="vivid, natural",
        unsupported_message=(
            "Warning: --style is only supported for dall-e-3; ignoring for '{model}'."
        ),
    )


def normalize_output_format(model: str, output_format: str) -> str:
    """Normalize output format for GPT image models and validate allowed values."""
    return normalize_optional_flag(
        model=model,
        raw_value=output_format,
        flag_name="output-format",
        supported=lambda candidate: candidate.startswith("gpt-image"),
        allowed={"png", "jpeg", "webp"},
        allowed_text="png, jpeg, webp",
        unsupported_message=(
            "Warning: --output-format is only supported for gpt-image models; "
            "ignoring for '{model}'."
        ),
        aliases={"jpg": "jpeg"},
    )


def request_images(
    api_key: str,
    prompt: str,
    model: str,
    size: str,
    quality: str,
    background: str = "",
    output_format: str = "",
    style: str = "",
) -> dict:
    url = "https://api.openai.com/v1/images/generations"
    args = {
        "model": model,
        "prompt": prompt,
        "size": size,
        "n": 1,
    }

    # Quality parameter - dall-e-2 doesn't accept this parameter
    if model != "dall-e-2":
        args["quality"] = quality

    # Note: response_format no longer supported by OpenAI Images API
    # dall-e models now return URLs by default

    if model.startswith("gpt-image"):
        if background:
            args["background"] = background
        if output_format:
            args["output_format"] = output_format

    if model == "dall-e-3" and style:
        args["style"] = style

    body = json.dumps(args).encode("utf-8")
    req = urllib.request.Request(
        url,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        data=body,
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        payload = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI Images API failed ({e.code}): {payload}") from e


ATLAS_BASE_URL = "https://api.atlascloud.ai/api/v1/model"
ATLAS_DEFAULT_MODEL = "alibaba/wan-2.7/text-to-image"
ATLAS_POLL_TIMEOUT_S = 300
ATLAS_POLL_INTERVAL_S = 3
# Atlas sits behind an edge that rejects the stock urllib User-Agent with a
# 403 (error code 1010), so send an explicit one on every request.
ATLAS_USER_AGENT = "openclaw-openai-image-gen/1.0"


def atlas_size(size: str) -> str:
    """Atlas expects width*height, not the OpenAI width x height form."""
    return size.replace("x", "*")


def request_images_atlas(api_key: str, prompt: str, model: str, size: str) -> dict:
    """Generate one image through Atlas Cloud's async API.

    Atlas is not OpenAI Images API compatible: a POST queues a prediction and
    the result is fetched by polling. The return value is shaped like an
    OpenAI Images response so the caller stays provider-agnostic.
    """
    body = json.dumps(
        {"model": model, "prompt": prompt, "size": atlas_size(size)}
    ).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": ATLAS_USER_AGENT,
    }
    req = urllib.request.Request(
        f"{ATLAS_BASE_URL}/generateImage", method="POST", headers=headers, data=body
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            submitted = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        payload = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Atlas Cloud submit failed ({e.code}): {payload}") from e

    prediction_id = (submitted.get("data") or {}).get("id")
    if not prediction_id:
        raise RuntimeError(f"Unexpected Atlas submit response: {json.dumps(submitted)[:400]}")

    deadline = time.monotonic() + ATLAS_POLL_TIMEOUT_S
    while True:
        time.sleep(ATLAS_POLL_INTERVAL_S)
        poll = urllib.request.Request(
            f"{ATLAS_BASE_URL}/prediction/{prediction_id}",
            method="GET",
            headers={
                "Authorization": f"Bearer {api_key}",
                "User-Agent": ATLAS_USER_AGENT,
            },
        )
        try:
            with urllib.request.urlopen(poll, timeout=60) as resp:
                result = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            payload = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Atlas Cloud poll failed ({e.code}): {payload}") from e

        data = result.get("data") or {}
        status = data.get("status")
        if status == "completed":
            outputs = data.get("outputs") or []
            if not outputs:
                raise RuntimeError(f"Atlas Cloud returned no output: {json.dumps(result)[:400]}")
            return {"data": [{"url": outputs[0]}]}
        if status == "failed":
            raise RuntimeError(f"Atlas Cloud generation failed: {data.get('error') or result}")
        if time.monotonic() > deadline:
            raise RuntimeError(
                f"Atlas Cloud prediction {prediction_id} still {status} after "
                f"{ATLAS_POLL_TIMEOUT_S}s"
            )


def write_gallery(out_dir: Path, items: list[dict]) -> None:
    thumbs = "\n".join(
        [
            f"""
<figure>
  <a href="{html_escape(it["file"], quote=True)}"><img src="{html_escape(it["file"], quote=True)}" loading="lazy" /></a>
  <figcaption>{html_escape(it["prompt"])}</figcaption>
</figure>
""".strip()
            for it in items
        ]
    )
    html = f"""<!doctype html>
<meta charset="utf-8" />
<title>openai-image-gen</title>
<style>
  :root {{ color-scheme: dark; }}
  body {{ margin: 24px; font: 14px/1.4 ui-sans-serif, system-ui; background: #0b0f14; color: #e8edf2; }}
  h1 {{ font-size: 18px; margin: 0 0 16px; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }}
  figure {{ margin: 0; padding: 12px; border: 1px solid #1e2a36; border-radius: 14px; background: #0f1620; }}
  img {{ width: 100%; height: auto; border-radius: 10px; display: block; }}
  figcaption {{ margin-top: 10px; color: #b7c2cc; }}
  code {{ color: #9cd1ff; }}
</style>
<h1>openai-image-gen</h1>
<p>Output: <code>{html_escape(out_dir.as_posix())}</code></p>
<div class="grid">
{thumbs}
</div>
"""
    (out_dir / "index.html").write_text(html, encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Generate images via the OpenAI Images API (or Atlas Cloud with --provider atlas)."
    )
    ap.add_argument(
        "--provider",
        default="openai",
        choices=["openai", "atlas"],
        help="Image backend. 'atlas' uses Atlas Cloud's async API and ATLASCLOUD_API_KEY.",
    )
    ap.add_argument("--prompt", help="Single prompt. If omitted, random prompts are generated.")
    ap.add_argument("--count", type=int, default=8, help="How many images to generate.")
    ap.add_argument("--model", default="", help="Image model id. Defaults per provider.")
    ap.add_argument("--size", default="", help="Image size (e.g. 1024x1024, 1536x1024). Defaults based on model if not specified.")
    ap.add_argument("--quality", default="", help="Image quality (e.g. high, standard). Defaults based on model if not specified.")
    ap.add_argument("--background", default="", help="Background transparency (GPT models only): transparent, opaque, or auto.")
    ap.add_argument("--output-format", default="", help="Output format (GPT models only): png, jpeg, or webp.")
    ap.add_argument("--style", default="", help="Image style (dall-e-3 only): vivid or natural.")
    ap.add_argument("--out-dir", default="", help="Output directory (default: ./tmp/openai-image-gen-<ts>).")
    args = ap.parse_args()

    key_env = "ATLASCLOUD_API_KEY" if args.provider == "atlas" else "OPENAI_API_KEY"
    api_key = (os.environ.get(key_env) or "").strip()
    if not api_key:
        print(f"Missing {key_env}", file=sys.stderr)
        return 2

    if not args.model:
        args.model = ATLAS_DEFAULT_MODEL if args.provider == "atlas" else "gpt-image-1"

    # Apply model-specific defaults if not specified
    default_size, default_quality = get_model_defaults(args.model)
    size = args.size or default_size
    quality = args.quality or default_quality

    count = args.count
    if args.model == "dall-e-3" and count > 1:
        print(f"Warning: dall-e-3 only supports generating 1 image at a time. Reducing count from {count} to 1.", file=sys.stderr)
        count = 1

    out_dir = Path(args.out_dir).expanduser() if args.out_dir else default_out_dir()
    out_dir.mkdir(parents=True, exist_ok=True)

    prompts = [args.prompt] * count if args.prompt else pick_prompts(count)

    if args.provider == "atlas":
        for flag, value in (
            ("--quality", args.quality),
            ("--background", args.background),
            ("--output-format", args.output_format),
            ("--style", args.style),
        ):
            if value:
                print(
                    f"Warning: {flag} is an OpenAI-only option; ignoring for --provider atlas.",
                    file=sys.stderr,
                )
        normalized_background = normalized_style = normalized_output_format = ""
    else:
        try:
            normalized_background = normalize_background(args.model, args.background)
            normalized_style = normalize_style(args.model, args.style)
            normalized_output_format = normalize_output_format(args.model, args.output_format)
        except ValueError as e:
            print(str(e), file=sys.stderr)
            return 2

    # Determine file extension based on output format
    if args.model.startswith("gpt-image") and normalized_output_format:
        file_ext = normalized_output_format
    else:
        file_ext = "png"

    items: list[dict] = []
    for idx, prompt in enumerate(prompts, start=1):
        print(f"[{idx}/{len(prompts)}] {prompt}")
        if args.provider == "atlas":
            res = request_images_atlas(api_key, prompt, args.model, size)
        else:
            res = request_images(
                api_key,
                prompt,
                args.model,
                size,
                quality,
                normalized_background,
                normalized_output_format,
                normalized_style,
            )
        data = res.get("data", [{}])[0]
        image_b64 = data.get("b64_json")
        image_url = data.get("url")
        if not image_b64 and not image_url:
            raise RuntimeError(f"Unexpected response: {json.dumps(res)[:400]}")

        filename = f"{idx:03d}-{slugify(prompt)[:40]}.{file_ext}"
        filepath = out_dir / filename
        if image_b64:
            filepath.write_bytes(base64.b64decode(image_b64))
        else:
            try:
                urllib.request.urlretrieve(image_url, filepath)
            except urllib.error.URLError as e:
                raise RuntimeError(f"Failed to download image from {image_url}: {e}") from e

        items.append({"prompt": prompt, "file": filename})

    (out_dir / "prompts.json").write_text(json.dumps(items, indent=2), encoding="utf-8")
    write_gallery(out_dir, items)
    print(f"\nWrote: {(out_dir / 'index.html').as_posix()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
