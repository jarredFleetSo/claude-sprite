"""
WebSocket + PTY terminal session — Python stdlib only.

Provides a browser-accessible shell over WebSocket at /api/terminal.
No external dependencies: uses hashlib, base64, struct, socket for WS
and pty, subprocess for the PTY session.

Each connection attaches to a shared tmux session ("workspace") so
multiple devices see the same terminal and work survives disconnects.

When running ON a sprite VM, the PTY spawns tmux directly.
When running locally, it uses `sprite exec -tty` to reach the
specified sprite — same transport as `cs attach`.
"""

import base64
import fcntl
import hashlib
import json
import os
import pty
import select
import shutil
import signal
import struct
import subprocess
import termios
import threading

# RFC 6455 Section 4.2.2
_WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

TMUX_SESSION = os.environ.get("TMUX_SESSION_NAME", "workspace")


# ---------------------------------------------------------------------------
# WebSocket frame helpers
# ---------------------------------------------------------------------------

def ws_handshake(handler):
    """
    Perform the WebSocket opening handshake.

    Writes the 101 response directly to the socket because
    BaseHTTPRequestHandler.protocol_version defaults to HTTP/1.0,
    but browsers require HTTP/1.1 for WebSocket upgrades.
    """
    key = handler.headers.get("Sec-WebSocket-Key", "")
    if not key:
        handler.send_error(400, "Missing Sec-WebSocket-Key")
        return None

    accept = base64.b64encode(
        hashlib.sha1((key + _WS_GUID).encode()).digest()
    ).decode()

    sock = handler.request
    response = (
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Accept: {accept}\r\n"
        "\r\n"
    )
    sock.sendall(response.encode("ascii"))
    sock.setblocking(True)

    handler.close_connection = True
    return sock


def _recv_exact(sock, n):
    """Read exactly *n* bytes from *sock*."""
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("WebSocket closed")
        buf += chunk
    return buf


def ws_decode_frame(sock):
    """
    Read one WebSocket frame.  Returns (opcode, payload_bytes).
    Handles client masking as required by RFC 6455.
    """
    header = _recv_exact(sock, 2)
    opcode = header[0] & 0x0F
    masked = header[1] & 0x80
    length = header[1] & 0x7F

    if length == 126:
        length = struct.unpack("!H", _recv_exact(sock, 2))[0]
    elif length == 127:
        length = struct.unpack("!Q", _recv_exact(sock, 8))[0]

    mask_key = _recv_exact(sock, 4) if masked else None
    payload = _recv_exact(sock, length)

    if mask_key:
        payload = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload))

    return opcode, payload


def ws_encode_frame(data, opcode=0x02):
    """Build an unmasked server->client frame (binary default)."""
    frame = bytes([0x80 | opcode])
    length = len(data)
    if length < 126:
        frame += bytes([length])
    elif length < 65536:
        frame += bytes([126]) + struct.pack("!H", length)
    else:
        frame += bytes([127]) + struct.pack("!Q", length)
    frame += data
    return frame


# ---------------------------------------------------------------------------
# Environment detection
# ---------------------------------------------------------------------------

def is_on_sprite():
    """Return True if we're running inside a Sprite VM."""
    if os.path.isdir("/run/sprite"):
        return True
    if os.environ.get("SPRITE"):
        return True
    if shutil.which("sprite-env"):
        return True
    try:
        if os.uname().nodename == "sprite" or os.getlogin() == "sprite":
            return True
    except OSError:
        pass
    return False


def _load_cs_config():
    """Read ~/.config/cs/config and return dict of key=value pairs."""
    config = {}
    config_file = os.path.expanduser("~/.config/cs/config")
    if os.path.isfile(config_file):
        try:
            with open(config_file) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, _, v = line.partition("=")
                        config[k.strip()] = v.strip().strip('"').strip("'")
        except OSError:
            pass
    return config


def get_terminal_info():
    """Return info about terminal capabilities for the frontend."""
    on_sprite = is_on_sprite()
    has_sprite_cli = bool(shutil.which("sprite"))
    has_tmux = bool(shutil.which("tmux"))

    config = _load_cs_config()
    default_sprite = os.environ.get("CS_SPRITE_NAME", "") or config.get("CS_SPRITE_NAME", "")
    org = os.environ.get("CS_ORG", "") or config.get("CS_ORG", "")

    if on_sprite:
        return {
            "mode": "local",
            "ready": True,
            "has_tmux": has_tmux,
            "message": None,
        }

    if not has_sprite_cli:
        return {
            "mode": "remote",
            "ready": False,
            "has_tmux": False,
            "message": "sprite CLI not installed",
        }

    return {
        "mode": "remote",
        "ready": True,
        "has_tmux": True,
        "default_sprite": default_sprite,
        "org": org,
        "message": None,
    }


def _build_env():
    """Build environment with TERM and ~/.claude_env sourced."""
    env = os.environ.copy()
    env["TERM"] = "xterm-256color"
    env_file = os.path.expanduser("~/.claude_env")
    if os.path.isfile(env_file):
        try:
            with open(env_file) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, _, v = line.partition("=")
                        env[k.strip()] = v.strip().strip('"').strip("'")
        except OSError:
            pass
    return env


def build_command(sprite_name=None):
    """
    Build the command for the terminal session.

    On a sprite: tmux new-session -A -s workspace ...
    Locally:     sprite exec -tty -s <name> -- tmux new-session -A -s workspace ...

    Returns (cmd_list, error_string).  error_string is None on success.
    """
    # Set mouse/history BEFORE attaching so it applies whether the
    # session already exists or is freshly created.
    tmux_cmd = [
        "bash", "-c",
        # Start server if needed, then configure, then attach/create
        "tmux start-server 2>/dev/null; "
        "tmux set -g mouse on 2>/dev/null; "
        "tmux set -g history-limit 10000 2>/dev/null; "
        "exec tmux new-session -A -s " + TMUX_SESSION + " "
        "'exec zsh -l 2>/dev/null || exec bash -l'"
    ]

    if is_on_sprite():
        if shutil.which("tmux"):
            return tmux_cmd, None
        # No tmux on sprite — plain shell
        for sh in ("/bin/zsh", "/bin/bash", "/bin/sh"):
            if os.path.exists(sh):
                return [sh, "-l"], None
        return ["/bin/sh", "-l"], None

    # Running locally — need sprite CLI and a sprite name
    if not shutil.which("sprite"):
        return None, "sprite CLI not installed. Install from https://sprites.dev"

    if not sprite_name:
        return None, "No sprite selected"

    config = _load_cs_config()
    org = os.environ.get("CS_ORG", "") or config.get("CS_ORG", "")

    cmd = ["sprite", "exec", "-tty", "-s", sprite_name]
    if org:
        cmd += ["-o", org]
    cmd += ["--"] + tmux_cmd
    return cmd, None


# ---------------------------------------------------------------------------
# PTY Terminal Session
# ---------------------------------------------------------------------------

class TerminalSession:
    """
    Attach to the shared tmux session via PTY and bridge to a WebSocket.

    On a sprite VM: spawns tmux directly.
    Locally: uses `sprite exec -tty` to reach the named sprite.

    Every browser tab sees the same tmux session. Disconnecting a tab
    just detaches — the session and any running commands persist.
    """

    def __init__(self, sock, sprite_name=None):
        self.sock = sock
        self.sprite_name = sprite_name
        self.master_fd = None
        self.proc = None
        self._alive = True

    def run(self):
        """Spawn terminal command in a PTY, bridge to WebSocket."""
        cmd, error = build_command(self.sprite_name)
        if error:
            # Send error as text to the WebSocket so the user sees it
            msg = f"\r\n\x1b[1;31mError:\x1b[0m {error}\r\n"
            try:
                self.sock.sendall(ws_encode_frame(msg.encode(), opcode=0x02))
            except OSError:
                pass
            try:
                self.sock.close()
            except OSError:
                pass
            return

        self.master_fd, slave_fd = pty.openpty()
        env = _build_env()

        try:
            self.proc = subprocess.Popen(
                cmd,
                stdin=slave_fd,
                stdout=slave_fd,
                stderr=slave_fd,
                start_new_session=True,
                env=env,
                close_fds=True,
            )
        finally:
            os.close(slave_fd)

        try:
            self._bridge()
        finally:
            self._cleanup()

    def _bridge(self):
        """Two-thread bridge: PTY->WS and WS->PTY."""
        writer_thread = threading.Thread(
            target=self._ws_to_pty, daemon=True
        )
        writer_thread.start()
        self._pty_to_ws()
        writer_thread.join(timeout=2)

    def _pty_to_ws(self):
        """Forward PTY output to WebSocket."""
        try:
            while self._alive:
                r, _, _ = select.select([self.master_fd], [], [], 0.5)
                if not r:
                    if self.proc and self.proc.poll() is not None:
                        break
                    continue
                try:
                    data = os.read(self.master_fd, 16384)
                except OSError:
                    break
                if not data:
                    break
                try:
                    self.sock.sendall(ws_encode_frame(data, opcode=0x02))
                except (BrokenPipeError, ConnectionError, OSError):
                    break
        finally:
            self._alive = False

    def _ws_to_pty(self):
        """Forward WebSocket input to PTY, handle resize messages."""
        try:
            while self._alive:
                opcode, payload = ws_decode_frame(self.sock)

                if opcode == 0x08:  # close
                    break
                if opcode == 0x09:  # ping -> pong
                    try:
                        self.sock.sendall(ws_encode_frame(payload, opcode=0x0A))
                    except OSError:
                        pass
                    continue

                if opcode in (0x01, 0x02):
                    if opcode == 0x01:
                        try:
                            msg = json.loads(payload.decode("utf-8", errors="replace"))
                            if msg.get("type") == "resize":
                                self._resize(msg.get("cols", 80), msg.get("rows", 24))
                                continue
                        except (json.JSONDecodeError, UnicodeDecodeError):
                            pass

                    try:
                        os.write(self.master_fd, payload)
                    except OSError:
                        break
        except (ConnectionError, OSError):
            pass
        finally:
            self._alive = False

    def _resize(self, cols, rows):
        """Send TIOCSWINSZ to the PTY."""
        if self.master_fd is None:
            return
        try:
            winsize = struct.pack("HHHH", int(rows), int(cols), 0, 0)
            fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, winsize)
            if self.proc and self.proc.poll() is None:
                self.proc.send_signal(signal.SIGWINCH)
        except (OSError, ProcessLookupError):
            pass

    def _cleanup(self):
        """Clean up the client process and PTY.

        Only kills the local process (tmux client or sprite exec),
        not the remote tmux session — it keeps running for reconnect.
        """
        self._alive = False

        if self.proc:
            try:
                self.proc.terminate()
            except OSError:
                pass
            try:
                self.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                try:
                    self.proc.kill()
                    self.proc.wait(timeout=1)
                except OSError:
                    pass
            self.proc = None

        if self.master_fd is not None:
            try:
                os.close(self.master_fd)
            except OSError:
                pass
            self.master_fd = None

        try:
            self.sock.close()
        except OSError:
            pass
