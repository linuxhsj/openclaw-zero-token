#!/usr/bin/env python3
"""
CDP Proxy - A lightweight HTTP proxy for Chrome DevTools Protocol.

Starts Chrome/Edge with remote debugging enabled, then proxies
CDP commands over a simple HTTP API.

Usage:
    python3 cdp_proxy.py [--port 3456] [--chrome-path PATH]

Requires:
    - Chrome or Edge browser installed
    - psutil (pip install psutil)
"""

import argparse
import json
import subprocess
import sys
import time
import urllib.request
import urllib.parse
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Optional

try:
    import psutil
except ImportError:
    print("[ERROR] psutil is required. Install with: pip install psutil")
    sys.exit(1)

DEFAULT_PORT = 3456
DEFAULT_HOST = "127.0.0.1"


def find_chrome_path() -> Optional[str]:
    """Find Chrome or Edge executable on the system."""
    candidates = []

    if sys.platform == "win32":
        candidates = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        ]
    elif sys.platform == "darwin":
        candidates = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        ]
    else:
        candidates = [
            "google-chrome",
            "google-chrome-stable",
            "chromium-browser",
            "chromium",
            "microsoft-edge",
            "microsoft-edge-stable",
        ]

    for path in candidates:
        try:
            proc = subprocess.run(
                ["which", path] if not sys.platform == "win32" else ["where", path],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if proc.returncode == 0:
                return proc.stdout.strip()
        except (subprocess.TimeoutExpired, FileNotFoundError):
            continue

    # Direct path check
    for path in candidates:
        try:
            with open(path, "rb"):
                return path
        except (FileNotFoundError, PermissionError):
            continue

    return None


def find_free_port(start: int = 9222) -> int:
    """Find a free port starting from the given number."""
    import socket
    for port in range(start, start + 100):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("127.0.0.1", port))
                return port
        except OSError:
            continue
    raise RuntimeError(f"No free port found in range {start}-{start + 100}")


def start_browser(chrome_path: str, debug_port: int) -> subprocess.Popen:
    """Start Chrome/Edge with remote debugging enabled."""
    args = [
        chrome_path,
        f"--remote-debugging-port={debug_port}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-client-side-phishing-detection",
        "--disable-default-apps",
        "--disable-hang-monitor",
        "--disable-popup-blocking",
        "--disable-prompt-on-repost",
        "--disable-sync",
        "--metrics-recording-only",
        "--new-window",
    ]

    if sys.platform == "win32":
        # On Windows, start detached
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        proc = subprocess.Popen(
            args,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            startupinfo=startupinfo,
        )
    else:
        proc = subprocess.Popen(
            args,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    return proc


class CDPProxyHandler(BaseHTTPRequestHandler):
    """HTTP request handler that proxies CDP commands."""

    def log_message(self, format, *args):
        sys.stderr.write(f"[CDP] {args[0]}\n")

    def _send_json(self, data: dict, status: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_binary(self, data: bytes, content_type: str = "image/png", status: int = 200):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _cdp_send(self, target_id: str, method: str, params: dict = None) -> dict:
        """Send a CDP command and return the result."""
        url = f"http://127.0.0.1:{self.server.debug_port}/json"
        payload = {
            "id": int(time.time() * 1000) % 1000000,
            "method": method,
            "params": params or {},
        }

        req_data = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )

        try:
            with urllib.request.urlopen(req_data, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            return {"error": str(e)}

    def _cdp_send_to_target(self, target_id: str, method: str, params: dict = None) -> dict:
        """Send a CDP command to a specific target via HTTP."""
        url = f"http://127.0.0.1:{self.server.debug_port}/json"
        payload = {
            "id": int(time.time() * 1000) % 1000000,
            "method": "Target.sendMessageToTarget",
            "params": {
                "targetId": target_id,
                "message": json.dumps({"id": 1, "method": method, "params": params or {}}),
            },
        }

        req_data = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )

        try:
            with urllib.request.urlopen(req_data, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            return {"error": str(e)}

    def _get_target(self, target_id: Optional[str] = None) -> Optional[str]:
        """Get a target ID, preferring the provided one or falling back to the first tab."""
        if target_id:
            return target_id

        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{self.server.debug_port}/json", timeout=5) as resp:
                targets = json.loads(resp.read().decode("utf-8"))
            # Prefer page targets (tabs), not the browser itself
            for t in targets:
                if t.get("type") == "page":
                    return t["id"]
            return targets[0]["id"] if targets else None
        except Exception:
            return None

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path == "/targets":
            self._handle_targets()
        elif path == "/navigate":
            self._handle_navigate(query)
        elif path == "/screenshot":
            self._handle_screenshot(query)
        elif path == "/click":
            self._handle_click(query)
        elif path == "/new":
            self._handle_new_tab()
        elif path == "/eval":
            self._send_json({"error": "Use POST for /eval"})
        else:
            self._send_json({"error": f"Unknown endpoint: {path}"}, 404)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/eval":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            query = urllib.parse.parse_qs(parsed.query)
            self._handle_eval(body, query)
        else:
            self._send_json({"error": f"Unknown endpoint: {path}"}, 404)

    def _handle_targets(self):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{self.server.debug_port}/json", timeout=5) as resp:
                targets = json.loads(resp.read().decode("utf-8"))
            result = [{"id": t["id"], "title": t.get("title", ""), "url": t.get("url", ""), "type": t.get("type", "")} for t in targets]
            self._send_json(result)
        except Exception as e:
            self._send_json({"error": str(e)}, 500)

    def _handle_navigate(self, query):
        url = query.get("url", [""])[0]
        target_id = query.get("target", [None])[0]

        if not url:
            self._send_json({"error": "Missing url parameter"}, 400)
            return

        target = self._get_target(target_id)
        if not target:
            self._send_json({"error": "No browser target available"}, 400)
            return

        result = self._cdp_send_to_target(target, "Page.navigate", {"url": url})
        self._send_json(result)

    def _handle_screenshot(self, query):
        target_id = query.get("target", [None])[0]

        target = self._get_target(target_id)
        if not target:
            self._send_json({"error": "No browser target available"}, 400)
            return

        result = self._cdp_send_to_target(target, "Page.captureScreenshot", {"format": "png"})

        if "error" in result:
            self._send_json(result, 500)
            return

        try:
            resp = result.get("result", {})
            inner = json.loads(resp.get("result", "{}"))
            img_data = inner.get("result", {}).get("data", "")

            if img_data:
                import base64
                self._send_binary(base64.b64decode(img_data), "image/png")
            else:
                self._send_json({"error": "No screenshot data returned"}, 500)
        except Exception as e:
            self._send_json({"error": str(e)}, 500)

    def _handle_eval(self, expression: str, query):
        target_id = query.get("target", [None])[0]

        target = self._get_target(target_id)
        if not target:
            self._send_json({"error": "No browser target available"}, 400)
            return

        result = self._cdp_send_to_target(target, "Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": True,
        })

        if "error" in result:
            self._send_json(result, 500)
            return

        try:
            resp = result.get("result", {})
            inner = resp.get("result", {})
            value = inner.get("value")
            # If value is a JSON string (e.g. from JSON.stringify), parse it
            if isinstance(value, str):
                try:
                    value = json.loads(value)
                except json.JSONDecodeError:
                    pass  # Return as plain string
            self._send_json({"result": value})
        except Exception as e:
            self._send_json({"error": str(e)}, 500)

    def _handle_click(self, query):
        selector = query.get("selector", [""])[0]
        target_id = query.get("target", [None])[0]

        if not selector:
            self._send_json({"error": "Missing selector parameter"}, 400)
            return

        target = self._get_target(target_id)
        if not target:
            self._send_json({"error": "No browser target available"}, 400)
            return

        # Use JS to find and click the element
        js = f"""
        (function() {{
            const el = document.querySelector({json.dumps(selector)});
            if (!el) return {{error: 'Element not found: {selector}'}};
            el.click();
            return {{success: true}};
        }})()
        """.replace("\n", " ")

        result = self._cdp_send_to_target(target, "Runtime.evaluate", {
            "expression": js,
            "returnByValue": True,
        })

        if "error" in result:
            self._send_json(result, 500)
            return

        try:
            resp = result.get("result", {})
            inner = resp.get("result", {})
            value = inner.get("value")
            if isinstance(value, str):
                try:
                    value = json.loads(value)
                except json.JSONDecodeError:
                    pass
            self._send_json(value)
        except Exception as e:
            self._send_json({"error": str(e)}, 500)

    def _handle_new_tab(self):
        url = f"http://127.0.0.1:{self.server.debug_port}/json/new?url=about:blank"
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                target = json.loads(resp.read().decode("utf-8"))
            self._send_json({"id": target["id"], "title": target.get("title", ""), "url": target.get("url", "")})
        except Exception as e:
            self._send_json({"error": str(e)}, 500)


def main():
    parser = argparse.ArgumentParser(description="CDP Proxy - HTTP API for Chrome DevTools Protocol")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"Proxy listen port (default: {DEFAULT_PORT})")
    parser.add_argument("--host", default=DEFAULT_HOST, help=f"Proxy listen host (default: {DEFAULT_HOST})")
    parser.add_argument("--chrome-path", help="Path to Chrome/Edge executable (auto-detect if not specified)")
    parser.add_argument("--debug-port", type=int, default=0, help="Chrome debug port (auto-select if not specified)")
    args = parser.parse_args()

    chrome_path = args.chrome_path or find_chrome_path()
    if not chrome_path:
        print("[ERROR] Could not find Chrome or Edge. Specify --chrome-path")
        sys.exit(1)

    print(f"[CDP] Using browser: {chrome_path}")

    debug_port = args.debug_port or find_free_port()
    print(f"[CDP] Starting browser with debug port: {debug_port}")

    proc = start_browser(chrome_path, debug_port)
    print(f"[CDP] Browser PID: {proc.pid}")

    # Wait for the debug port to be ready
    for i in range(20):
        time.sleep(0.5)
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{debug_port}/json", timeout=2):
                print("[CDP] Browser debug port is ready")
                break
        except Exception:
            if i == 19:
                print("[ERROR] Browser debug port did not become ready")
                proc.terminate()
                sys.exit(1)

    # Start the HTTP proxy
    class ProxyServer(HTTPServer):
        debug_port = debug_port

    server = ProxyServer((args.host, args.port), CDPProxyHandler)
    print(f"[CDP] Proxy listening on http://{args.host}:{args.port}")
    print(f"[CDP] Endpoints: /targets /navigate /screenshot /eval /click /new")
    print("[CDP] Press Ctrl+C to stop")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[CDP] Shutting down...")
        server.shutdown()
        proc.terminate()
        print("[CDP] Done")


if __name__ == "__main__":
    main()
