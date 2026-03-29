---
name: browser-cdp
description: "Control a browser via Chrome DevTools Protocol (CDP) proxy. Use when: (1) navigating to URLs and reading page content, (2) taking screenshots, (3) executing JavaScript in the browser, (4) clicking elements or filling forms, (5) searching and installing Chrome Web Store extensions, (6) interacting with web APIs that require a real browser. NOT for: simple HTTP requests (use curl), local file operations, or when no CDP proxy is available."
metadata:
  {
    "openclaw": {
      "emoji": "🌐",
      "requires": { "bins": ["curl"] }
    }
  }
---

# Browser CDP

Control a real browser through a Chrome DevTools Protocol proxy.

## Overview

This skill provides browser automation via a lightweight HTTP proxy that wraps CDP. The proxy exposes REST endpoints for navigation, screenshots, JS evaluation, clicking, and more — no Playwright/Puppeteer dependency needed.

## Prerequisites

Install the required Python dependency:

```bash
pip install psutil
```

A CDP proxy must be running on `http://localhost:3456`. Start it from the repository root with:

```bash
python3 skills/browser-cdp/scripts/cdp_proxy.py
```

This launches Chrome/Edge with remote debugging enabled and proxies CDP commands over HTTP.

## When to Use

✅ **USE this skill when:**

- "Open this URL and tell me what's on the page"
- "Take a screenshot of the current page"
- "Run this JavaScript on the page"
- "Click the button that says..."
- "Search for and install a Chrome extension"
- "Log into this site and do something"
- Any task requiring a real browser context

❌ **DON'T use this skill when:**

- Simple HTTP API calls → use `curl` directly
- Downloading files → use `curl -O`
- Parsing HTML from a saved file → use `python3` with BeautifulSoup
- No CDP proxy running → ask the user to start it first

## API Reference

All endpoints are relative to `http://localhost:3456`.

### GET /targets

List all open browser tabs.

```bash
curl -s http://localhost:3456/targets | python3 -m json.tool
```

Response:
```json
[
  { "id": "ABC123", "title": "Google", "url": "https://google.com" }
]
```

### GET /navigate?url=<URL>

Navigate a tab to a URL. Uses the most recently created tab, or specify `?target=<targetId>`.

```bash
curl -s "http://localhost:3456/navigate?url=https://example.com"
```

### GET /screenshot

Take a PNG screenshot of the current page.

```bash
# Save to file
curl -s -o screenshot.png http://localhost:3456/screenshot
```

### POST /eval

Execute JavaScript in the page. The request body is **plain text** (not JSON), sent as `Content-Type: text/plain`.

```bash
curl -s -X POST http://localhost:3456/eval \
  -H "Content-Type: text/plain" \
  -d "document.title"
```

For multi-line scripts, pipe from stdin or use a heredoc:

```bash
curl -s -X POST http://localhost:3456/eval \
  -H "Content-Type: text/plain" \
  -d "JSON.stringify(Array.from(document.querySelectorAll('a')).map(a => ({text: a.innerText, href: a.href})))"
```

### GET /click?selector=<CSS>

Click an element matching a CSS selector.

```bash
curl -s "http://localhost:3456/click?selector=%23submit-btn"
```

### GET /new

Open a new browser tab and return its target ID.

```bash
curl -s http://localhost:3456/new
```

Response:
```json
{ "id": "NEW_TAB_ID", "title": "about:blank", "url": "about:blank" }
```

## Common Workflows

### Navigate and extract page content

```bash
# Open a page
curl -s "http://localhost:3456/navigate?url=https://example.com"

# Extract all text content
curl -s -X POST http://localhost:3456/eval \
  -H "Content-Type: text/plain" \
  -d "document.body.innerText"

# Extract all links
curl -s -X POST http://localhost:3456/eval \
  -H "Content-Type: text/plain" \
  -d "JSON.stringify([...document.querySelectorAll('a')].map(a => ({text: a.textContent.trim(), href: a.href})))"
```

### Take a screenshot

```bash
curl -s "http://localhost:3456/navigate?url=https://example.com"
curl -s -o page.png http://localhost:3456/screenshot
```

### Search and install a Chrome extension

```bash
# Search the Chrome Web Store (no login required for search)
curl -s "http://localhost:3456/navigate?url=https://chromewebstore.google.com/search/example%20extension"

# Extract extension IDs from search results
curl -s -X POST http://localhost:3456/eval \
  -H "Content-Type: text/plain" \
  -d "JSON.stringify([...document.querySelectorAll('a[data-id]')].map(a => ({id: a.dataset.id, title: a.textContent.trim()})))"

# Install an extension (requires the extension ID)
curl -s "http://localhost:3456/navigate?url=https://chromewebstore.google.com/detail/<extension-id>"
# Then click the "Add to Chrome" button
curl -s "http://localhost:3456/click?selector=%5Bdata-id%3Dinstall-button%5D"
```

### Fill a form and submit

```bash
# Navigate to the form
curl -s "http://localhost:3456/navigate?url=https://example.com/login"

# Fill in fields
curl -s -X POST http://localhost:3456/eval \
  -H "Content-Type: text/plain" \
  -d "document.querySelector('#username').value = 'myuser'"
curl -s -X POST http://localhost:3456/eval \
  -H "Content-Type: text/plain" \
  -d "document.querySelector('#password').value = 'mypass'"

# Submit
curl -s "http://localhost:3456/click?selector=%23login-form+%3E+button"
```

## Notes

- The CDP proxy must be running before using any commands
- If the proxy is not running, ask the user to start it: `python3 skills/browser-cdp/scripts/cdp_proxy.py`
- Use URL encoding for query parameters with special characters
- The `/eval` endpoint returns the result of the last expression (like a REPL)
- Screenshots are returned as PNG binary data
- For complex multi-step interactions, chain `/eval` and `/click` calls
- The proxy supports a `?target=<targetId>` parameter on most endpoints to target a specific tab
