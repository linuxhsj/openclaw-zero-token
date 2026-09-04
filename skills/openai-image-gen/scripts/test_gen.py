"""Tests for openai-image-gen helpers."""

import json
import tempfile
from pathlib import Path

import gen
import pytest
from gen import (
    atlas_size,
    normalize_background,
    normalize_output_format,
    normalize_style,
    request_images_atlas,
    write_gallery,
)


def test_normalize_background_allows_empty_for_non_gpt_models():
    assert normalize_background("dall-e-3", "transparent") == ""


def test_normalize_background_allows_empty_for_gpt_models():
    assert normalize_background("gpt-image-1", "") == ""
    assert normalize_background("gpt-image-1", "   ") == ""


def test_normalize_background_normalizes_case_for_gpt_models():
    assert normalize_background("gpt-image-1", "TRANSPARENT") == "transparent"


def test_normalize_background_warns_when_model_does_not_support_flag(capsys):
    assert normalize_background("dall-e-3", "transparent") == ""
    captured = capsys.readouterr()
    assert "--background is only supported for gpt-image models" in captured.err


def test_normalize_background_rejects_invalid_values():
    with pytest.raises(ValueError, match="Invalid --background"):
        normalize_background("gpt-image-1", "checkerboard")


def test_normalize_style_allows_empty_for_non_dalle3_models():
    assert normalize_style("gpt-image-1", "vivid") == ""


def test_normalize_style_allows_empty_for_dalle3():
    assert normalize_style("dall-e-3", "") == ""
    assert normalize_style("dall-e-3", "   ") == ""


def test_normalize_style_normalizes_case_for_dalle3():
    assert normalize_style("dall-e-3", "NATURAL") == "natural"


def test_normalize_style_warns_when_model_does_not_support_flag(capsys):
    assert normalize_style("gpt-image-1", "vivid") == ""
    captured = capsys.readouterr()
    assert "--style is only supported for dall-e-3" in captured.err


def test_normalize_style_rejects_invalid_values():
    with pytest.raises(ValueError, match="Invalid --style"):
        normalize_style("dall-e-3", "cinematic")


def test_normalize_output_format_allows_empty_for_non_gpt_models():
    assert normalize_output_format("dall-e-3", "jpeg") == ""


def test_normalize_output_format_allows_empty_for_gpt_models():
    assert normalize_output_format("gpt-image-1", "") == ""
    assert normalize_output_format("gpt-image-1", "   ") == ""


def test_normalize_output_format_warns_when_model_does_not_support_flag(capsys):
    assert normalize_output_format("dall-e-3", "jpeg") == ""
    captured = capsys.readouterr()
    assert "--output-format is only supported for gpt-image models" in captured.err


def test_normalize_output_format_normalizes_case_for_supported_values():
    assert normalize_output_format("gpt-image-1", "PNG") == "png"
    assert normalize_output_format("gpt-image-1", "WEBP") == "webp"


def test_normalize_output_format_strips_whitespace_for_supported_values():
    assert normalize_output_format("gpt-image-1", " png ") == "png"
def test_normalize_output_format_keeps_supported_values():
    assert normalize_output_format("gpt-image-1", "png") == "png"
    assert normalize_output_format("gpt-image-1", "jpeg") == "jpeg"
    assert normalize_output_format("gpt-image-1", "webp") == "webp"


def test_normalize_output_format_normalizes_jpg_alias():
    assert normalize_output_format("gpt-image-1", "jpg") == "jpeg"


def test_normalize_output_format_rejects_invalid_values():
    with pytest.raises(ValueError, match="Invalid --output-format"):
        normalize_output_format("gpt-image-1", "svg")


def test_write_gallery_escapes_prompt_xss():
    with tempfile.TemporaryDirectory() as tmpdir:
        out = Path(tmpdir)
        items = [{"prompt": '<script>alert("xss")</script>', "file": "001-test.png"}]
        write_gallery(out, items)
        html = (out / "index.html").read_text()
        assert "<script>" not in html
        assert "&lt;script&gt;" in html


def test_write_gallery_escapes_filename():
    with tempfile.TemporaryDirectory() as tmpdir:
        out = Path(tmpdir)
        items = [{"prompt": "safe prompt", "file": '" onload="alert(1)'}]
        write_gallery(out, items)
        html = (out / "index.html").read_text()
        assert 'onload="alert(1)"' not in html
        assert "&quot;" in html


def test_write_gallery_escapes_ampersand():
    with tempfile.TemporaryDirectory() as tmpdir:
        out = Path(tmpdir)
        items = [{"prompt": "cats & dogs <3", "file": "001-test.png"}]
        write_gallery(out, items)
        html = (out / "index.html").read_text()
        assert "cats &amp; dogs &lt;3" in html


def test_write_gallery_normal_output():
    with tempfile.TemporaryDirectory() as tmpdir:
        out = Path(tmpdir)
        items = [
            {"prompt": "a lobster astronaut, golden hour", "file": "001-lobster.png"},
            {"prompt": "a cozy reading nook", "file": "002-nook.png"},
        ]
        write_gallery(out, items)
        html = (out / "index.html").read_text()
        assert "a lobster astronaut, golden hour" in html
        assert 'src="001-lobster.png"' in html
        assert "002-nook.png" in html


def test_atlas_size_converts_openai_form():
    assert atlas_size("1024x1024") == "1024*1024"
    assert atlas_size("1536x1024") == "1536*1024"


def test_atlas_size_leaves_native_form_untouched():
    assert atlas_size("1024*1024") == "1024*1024"


def _fake_urlopen(responses):
    """Return a urlopen stub that yields the given payloads in order."""
    calls = iter(responses)

    class _Resp:
        def __init__(self, payload):
            self._payload = json.dumps(payload).encode("utf-8")

        def read(self):
            return self._payload

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    def _urlopen(req, timeout=None):
        return _Resp(next(calls))

    return _urlopen


def test_request_images_atlas_polls_until_completed(monkeypatch):
    monkeypatch.setattr(gen.time, "sleep", lambda _s: None)
    monkeypatch.setattr(
        gen.urllib.request,
        "urlopen",
        _fake_urlopen(
            [
                {"data": {"id": "pred-1", "status": "processing"}},
                {"data": {"id": "pred-1", "status": "processing"}},
                {"data": {"id": "pred-1", "status": "completed", "outputs": ["https://example/img.png"]}},
            ]
        ),
    )
    res = request_images_atlas("key", "a prompt", "alibaba/wan-2.7/text-to-image", "1024x1024")
    assert res == {"data": [{"url": "https://example/img.png"}]}


def test_request_images_atlas_raises_on_failed_prediction(monkeypatch):
    monkeypatch.setattr(gen.time, "sleep", lambda _s: None)
    monkeypatch.setattr(
        gen.urllib.request,
        "urlopen",
        _fake_urlopen(
            [
                {"data": {"id": "pred-1", "status": "processing"}},
                {"data": {"id": "pred-1", "status": "failed", "error": "content policy"}},
            ]
        ),
    )
    with pytest.raises(RuntimeError, match="content policy"):
        request_images_atlas("key", "a prompt", "alibaba/wan-2.7/text-to-image", "1024x1024")


def test_request_images_atlas_raises_without_prediction_id(monkeypatch):
    monkeypatch.setattr(
        gen.urllib.request, "urlopen", _fake_urlopen([{"code": 200, "data": {}}])
    )
    with pytest.raises(RuntimeError, match="Unexpected Atlas submit response"):
        request_images_atlas("key", "a prompt", "alibaba/wan-2.7/text-to-image", "1024x1024")
