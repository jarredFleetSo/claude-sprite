#!/usr/bin/env python3
"""
Sprite workspace dashboard — Python stdlib HTTP server.
Zero dependencies beyond Python 3.

Serves static files from app/public/ and provides API endpoints
for workspace status information.
"""

import json
import os
import subprocess
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from session import SessionStore

PORT = int(os.environ.get("WEBAPP_PORT", 8888))
PUBLIC_DIR = Path(__file__).parent / "public"
DATA_DIR = Path(__file__).parent.parent / "data"

store = SessionStore(DATA_DIR / "state.json")


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
    except (subprocess.CalledProcessError, FileNotFoundError):
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


class DashboardHandler(SimpleHTTPRequestHandler):
    """Serve static files from public/ and handle API routes."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def do_GET(self):
        if self.path == "/health":
            self._json_response({"status": "ok"})
        elif self.path == "/api/status":
            self._json_response(get_status())
        elif self.path == "/api/config":
            self._json_response(get_config())
        elif self.path == "/api/sessions":
            self._json_response(store.list())
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
        else:
            self.send_error(404, "Not Found")

    def _json_response(self, data):
        body = json.dumps(data).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

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
