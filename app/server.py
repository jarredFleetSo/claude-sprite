#!/usr/bin/env python3
"""
Sprite workspace dashboard — Python stdlib HTTP server.
Zero dependencies beyond Python 3.

Serves static files from app/public/ and provides API endpoints
for workspace status information.
"""

import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from session import SessionStore
from tokens import TokenStore
from terminal_ws import ws_handshake, TerminalSession, get_terminal_info

PORT = int(os.environ.get("WEBAPP_PORT", 8888))
PUBLIC_DIR = Path(__file__).parent / "public"
DATA_DIR = Path(__file__).parent.parent / "data"

SPRITE_API_BASE = "https://api.sprites.dev/v1"

store = SessionStore(DATA_DIR / "state.json")
token_store = TokenStore(DATA_DIR / "tokens.json")


def get_token(name, env_var):
    """Return token from env var (priority) or file store."""
    return os.environ.get(env_var, "") or token_store.get(name)


def get_token_status(name, env_var):
    """Return status dict for a token: {set: bool, source: str}."""
    env_val = os.environ.get(env_var, "")
    if env_val:
        return {"set": True, "source": "env"}
    file_val = token_store.get(name)
    if file_val:
        return {"set": True, "source": "file"}
    return {"set": False, "source": "none"}


def get_tmux_sessions():
    """List active tmux sessions."""
    try:
        out = subprocess.check_output(
            ["tmux", "list-sessions", "-F", "#{session_name}:#{session_windows}:#{session_attached}"],
            stderr=subprocess.DEVNULL, text=True,
        )
        sessions = []
        for line in out.strip().splitlines():
            parts = line.split(":")
            if len(parts) >= 3:
                sessions.append({
                    "name": parts[0],
                    "windows": int(parts[1]),
                    "attached": int(parts[2]) > 0,
                })
        return sessions
    except (subprocess.CalledProcessError, FileNotFoundError):
        return []


def check_port(port):
    """Check if a port is listening."""
    try:
        out = subprocess.check_output(
            ["ss", "-tln"], stderr=subprocess.DEVNULL, text=True,
        )
        return f":{port} " in out
    except FileNotFoundError:
        # ss not available (macOS) — fall back to lsof
        try:
            subprocess.check_output(
                ["lsof", f"-iTCP:{port}", "-sTCP:LISTEN"],
                stderr=subprocess.DEVNULL, text=True,
            )
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            return False
    except subprocess.CalledProcessError:
        return False


def get_uptime():
    """Get system uptime string."""
    try:
        return subprocess.check_output(
            ["uptime", "-p"], stderr=subprocess.DEVNULL, text=True,
        ).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "unknown"


def get_status():
    """Build workspace status JSON."""
    tmux = get_tmux_sessions()
    store.sync(tmux)
    services = {
        "ttyd":        {"port": 7681, "running": check_port(7681)},
        "code-server": {"port": 8080, "running": check_port(8080)},
        "dashboard":   {"port": PORT, "running": True},
    }
    return {
        "uptime": get_uptime(),
        "tmux": tmux,
        "services": services,
        "hostname": os.uname().nodename,
        "sessions": store.list(),
    }


def get_config():
    """Build workspace config JSON from environment."""
    env = {}
    env_file = "/etc/default/workspace"
    if os.path.isfile(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, val = line.partition("=")
                    env[key.strip()] = val.strip().strip('"').strip("'")

    return {
        "workspace_name": env.get("WORKSPACE_NAME", "workspace"),
        "tmux_session": env.get("TMUX_SESSION_NAME", "workspace"),
        "ports": {
            "ttyd": int(env.get("TTYD_PORT", 7681)),
            "code_server": int(env.get("CODE_SERVER_PORT", 8080)),
            "dashboard": PORT,
        },
        "hostnames": {
            "term": env.get("TERM_HOSTNAME", ""),
            "code": env.get("CODE_HOSTNAME", ""),
            "dash": env.get("DASH_HOSTNAME", ""),
        },
    }


def create_sprite(name):
    """Create a sprite via the Sprites.dev API. Returns (dict, status_code)."""
    sprite_token = get_token("sprite_token", "SPRITE_TOKEN")
    payload = json.dumps({"name": name}).encode()
    req = urllib.request.Request(
        f"{SPRITE_API_BASE}/sprites",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {sprite_token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            body = json.loads(resp.read().decode())
            return body, resp.status
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {"error": e.reason}
        return body, e.code
    except urllib.error.URLError as e:
        return {"error": str(e.reason)}, 502


def list_sprites():
    """List sprites via the Sprites.dev API. Returns (dict, status_code)."""
    token = get_token("sprite_token", "SPRITE_TOKEN")
    if not token:
        return {"sprites": []}, 200
    req = urllib.request.Request(
        f"{SPRITE_API_BASE}/sprites",
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            body = json.loads(resp.read().decode())
            return body, resp.status
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {"error": e.reason}
        return body, e.code
    except urllib.error.URLError as e:
        return {"error": str(e.reason)}, 502


def start_sprite(name):
    """Wake a sprite by exec'ing a trivial command. Sprites wake on first request."""
    token = get_token("sprite_token", "SPRITE_TOKEN")
    if not token:
        return {"error": "SPRITE_TOKEN not configured"}, 503
    # POST /v1/sprites/{name}/exec?cmd=echo&cmd=awake  (HTTP exec endpoint)
    url = f"{SPRITE_API_BASE}/sprites/{name}/exec?cmd=echo&cmd=awake"
    req = urllib.request.Request(
        url,
        data=b"",
        headers={"Authorization": f"Bearer {token}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode()
            return {"status": "waking", "output": body.strip()}, 200
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {"error": e.reason}
        return body, e.code
    except urllib.error.URLError as e:
        return {"error": str(e.reason)}, 502


def destroy_sprite(name):
    """Destroy a sprite via the Sprites.dev API. Returns (dict, status_code)."""
    token = get_token("sprite_token", "SPRITE_TOKEN")
    if not token:
        return {"error": "SPRITE_TOKEN not configured"}, 503
    req = urllib.request.Request(
        f"{SPRITE_API_BASE}/sprites/{name}",
        headers={"Authorization": f"Bearer {token}"},
        method="DELETE",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return {}, 204
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {"error": e.reason}
        return body, e.code
    except urllib.error.URLError as e:
        return {"error": str(e.reason)}, 502


class DashboardHandler(SimpleHTTPRequestHandler):
    """Serve static files from public/ and handle API routes."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def do_GET(self):
        # Parse path and query string
        path = self.path.split("?")[0]
        query = {}
        if "?" in self.path:
            for pair in self.path.split("?", 1)[1].split("&"):
                if "=" in pair:
                    k, _, v = pair.partition("=")
                    query[k] = urllib.parse.unquote(v)

        if path == "/api/terminal":
            upgrade = (self.headers.get("Upgrade", "")).lower()
            if upgrade == "websocket":
                sprite_name = query.get("sprite", "")
                sock = ws_handshake(self)
                if sock:
                    try:
                        TerminalSession(sock, sprite_name=sprite_name or None).run()
                    except Exception:
                        import traceback
                        traceback.print_exc()
                return
            self.send_error(400, "WebSocket upgrade required")
            return
        elif path == "/api/terminal/status":
            self._json_response(get_terminal_info())
        elif self.path == "/health":
            self._json_response({"status": "ok"})
        elif self.path == "/api/status":
            self._json_response(get_status())
        elif self.path == "/api/config":
            self._json_response(get_config())
        elif self.path == "/api/sessions":
            self._json_response(store.list())
        elif self.path == "/api/sprites/token-status":
            self._json_response({"configured": bool(get_token("sprite_token", "SPRITE_TOKEN"))})
        elif self.path == "/api/sprites":
            result, status_code = list_sprites()
            self._json_response(result, status=status_code)
        elif self.path == "/api/settings/tokens":
            self._json_response({
                "sprite_token": get_token_status("sprite_token", "SPRITE_TOKEN"),
                "anthropic_key": get_token_status("anthropic_key", "ANTHROPIC_API_KEY"),
            })
        else:
            super().do_GET()

    def do_POST(self):
        # POST /api/sessions/<name>/touch
        parts = self.path.strip("/").split("/")
        if len(parts) == 4 and parts[:2] == ["api", "sessions"] and parts[3] == "touch":
            name = parts[2]
            # Read body for client param
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode() if length else ""
            client = "dashboard"
            for pair in body.split("&"):
                if "=" in pair:
                    k, _, v = pair.partition("=")
                    if k.strip() == "client":
                        client = v.strip()
            session = store.touch(name, client)
            self._json_response(session)
        elif len(parts) == 4 and parts[:2] == ["api", "sprites"] and parts[3] == "start":
            sprite_name = parts[2]
            if not re.match(r'^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$', sprite_name):
                self._json_error(400, "Invalid sprite name")
                return
            result, status_code = start_sprite(sprite_name)
            self._json_response(result, status=status_code)
        elif self.path == "/api/sprites/create":
            if not get_token("sprite_token", "SPRITE_TOKEN"):
                self._json_error(503, "SPRITE_TOKEN not configured")
                return
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length).decode() if length else "{}"
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                self._json_error(400, "Invalid JSON")
                return
            name = data.get("name", "").strip()
            if not name:
                self._json_error(400, "Name is required")
                return
            if not re.match(r'^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$', name):
                self._json_error(400, "Name must be lowercase alphanumeric/hyphens, 1-63 chars")
                return
            result, status_code = create_sprite(name)
            self._json_response(result, status=status_code)
        else:
            self.send_error(404, "Not Found")

    def do_PUT(self):
        if self.path == "/api/settings/tokens":
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length).decode() if length else "{}"
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                self._json_error(400, "Invalid JSON")
                return
            valid_keys = {"sprite_token", "anthropic_key"}
            updates = {}
            for key in valid_keys:
                if key in data:
                    updates[key] = data[key]
            if updates:
                token_store.set_many(updates)
            self._json_response({
                "sprite_token": get_token_status("sprite_token", "SPRITE_TOKEN"),
                "anthropic_key": get_token_status("anthropic_key", "ANTHROPIC_API_KEY"),
            })
        else:
            self.send_error(404, "Not Found")

    def do_DELETE(self):
        # DELETE /api/sprites/<name>
        parts = self.path.strip("/").split("/")
        if len(parts) == 3 and parts[:2] == ["api", "sprites"]:
            name = parts[2]
            if not re.match(r'^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$', name):
                self._json_error(400, "Invalid sprite name")
                return
            result, status_code = destroy_sprite(name)
            self._json_response(result, status=status_code)
        else:
            self.send_error(404, "Not Found")

    def _json_response(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def _json_error(self, code, message):
        self._json_response({"error": message}, status=code)

    def log_message(self, format, *args):
        """Suppress per-request logs for cleaner output."""
        pass


def main():
    server = ThreadingHTTPServer(("0.0.0.0", PORT), DashboardHandler)
    print(f"Dashboard listening on http://0.0.0.0:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.shutdown()


if __name__ == "__main__":
    main()
