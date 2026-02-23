"""
Token persistence — stores API tokens in a JSON file with fcntl locking.

Same file-locking pattern as session.py. Tokens are stored at data/tokens.json
and can be overridden by environment variables at runtime.
"""

import fcntl
import json
from pathlib import Path


class TokenStore:
    def __init__(self, path):
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)

    def _read(self):
        if not self._path.exists():
            return {"sprite_token": "", "anthropic_key": ""}
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

    def get(self, key):
        return self._read().get(key, "")

    def set(self, key, value):
        data = self._read()
        data[key] = value
        self._write(data)

    def get_all(self):
        return self._read()

    def set_many(self, updates):
        data = self._read()
        data.update(updates)
        self._write(data)
