"""
Session state persistence — tracks workspace sessions across sleep/wake.

Backed by a single JSON file with fcntl file locking for thread safety.
"""

import fcntl
import json
from datetime import datetime, timezone
from pathlib import Path


class SessionStore:
    def __init__(self, path):
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)

    def _read(self):
        if not self._path.exists():
            return {"version": 1, "sessions": {}}
        with open(self._path) as f:
            fcntl.flock(f, fcntl.LOCK_SH)
            try:
                return json.load(f)
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)

    def _write(self, data):
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with open(self._path, "w") as f:
            fcntl.flock(f, fcntl.LOCK_EX)
            try:
                json.dump(data, f, indent=2)
                f.write("\n")
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)

    def list(self):
        return self._read()["sessions"]

    def get(self, name):
        return self._read()["sessions"].get(name)

    def touch(self, name, client="dashboard"):
        data = self._read()
        now = datetime.now(timezone.utc).isoformat()
        session = data["sessions"].get(name)
        if session is None:
            session = {
                "name": name,
                "created_at": now,
                "last_accessed_at": now,
                "last_client": client,
                "state": "active",
            }
        else:
            session["last_accessed_at"] = now
            session["last_client"] = client
            session["state"] = "active"
        data["sessions"][name] = session
        self._write(data)
        return session

    def delete(self, name):
        data = self._read()
        data["sessions"].pop(name, None)
        self._write(data)

    def sync(self, tmux_sessions):
        live_names = {s["name"] for s in tmux_sessions}
        data = self._read()
        now = datetime.now(timezone.utc).isoformat()

        # Create entries for tmux sessions not yet tracked
        for s in tmux_sessions:
            if s["name"] not in data["sessions"]:
                data["sessions"][s["name"]] = {
                    "name": s["name"],
                    "created_at": now,
                    "last_accessed_at": now,
                    "last_client": "terminal",
                    "state": "active",
                }
            else:
                data["sessions"][s["name"]]["state"] = "active"

        # Mark tracked sessions idle if their tmux session is gone
        for name, session in data["sessions"].items():
            if name not in live_names:
                session["state"] = "idle"

        self._write(data)
