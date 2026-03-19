# Technology Stack

**Analysis Date:** 2026-03-19

## Languages

**Primary:**
- Rust 2021 edition - CLI tool (`cli/cs-rs/`)
- Python 3 - Dashboard and utilities (`app/`)
- Bash - VM provisioning and bootstrap scripts (`scripts/`)

**Secondary:**
- HTML/CSS/JavaScript - Web dashboard frontend (`app/public/`)

## Runtime

**Environment:**
- Rust 2021 edition (no MSRV specified in `cli/cs-rs/Cargo.toml`)
- Python 3 (stdlib only, no version constraint)
- Bash 4+ (used in bootstrap and provisioning)

**Package Manager:**
- Cargo (Rust) - manages Rust dependencies
- No Python package manager (stdlib only, zero pip dependencies)
- No npm/node involved

## Frameworks

**Core:**
- clap 4 - CLI argument parsing and dispatch (`cli/cs-rs/Cargo.toml`)
- serde 1 + serde_json 1 - JSON serialization/deserialization
- toml 0.8 - TOML config file parsing

**HTTP/Networking:**
- Python stdlib `http.server.ThreadingHTTPServer` - Dashboard web server (`app/server.py`)
- Python stdlib `urllib` - HTTP requests for API calls (`app/server.py`)
- Custom WebSocket implementation using stdlib `socket`, `hashlib`, `base64` (RFC 6455) - Terminal WebSocket (`app/terminal_ws.py`)

**Terminal/CLI:**
- indicatif 0.17 - Progress bars and spinners
- console 0.15 - Styled output and styling
- dialoguer 0.11 - Interactive prompts and pickers
- ttyd - Browser-based terminal multiplexer (external binary, not a Rust dependency)
- tmux - Terminal session management (external binary)

**Testing:**
- No testing framework found in dependencies. CI only runs syntax checks and dry-run tests.

**Build/Dev:**
- cargo build with release profile (strip and LTO enabled)
- GitHub Actions (`.github/workflows/ci.yml`) for CI/CD

## Key Dependencies

**Critical:**
- clap 4 - Essential for CLI dispatch and command parsing
- serde/serde_json 1 - Required for API JSON responses and config serialization
- toml 0.8 - Parses `.cs.toml` project config and `~/.config/cs/config.toml`
- thiserror 2 - Error type derivation and custom error handling
- base64 0.22 - Encodes variables for safe remote script transport (`src/sprite.rs`)
- chrono 0.4 - Relative time formatting for API responses (`src/api.rs`)

**Infrastructure:**
- dialoguer 0.11 - Interactive sprite picker (`src/picker.rs`)
- indicatif 0.17 - Progress bars for git sync (`src/sync.rs`)
- console 0.15 - Terminal styling and box-drawing output
- dirs 6 - Cross-platform home directory resolution
- which 7 - Checks for installed CLI tools (sprite, curl, etc.)
- anyhow 1 - Additional error handling context
- unicode-width 0.2 - Proper terminal width calculation for output

## Configuration

**Environment:**
- Configured via environment variables (override chain):
  - `CS_SPRITE_NAME` - Active sprite name
  - `CS_ORG` - Organization identifier
  - `CS_TMUX_SESSION` - tmux session name (default: "workspace")
  - `SPRITE_TOKEN` or `CS_SPRITE_TOKEN` - API authentication token
  - `CF_POLICY_AUD` - Cloudflare Access audience for dashboard auth
  - `DASHBOARD_TOKEN` - Bearer token fallback for dashboard auth
  - `CLOUDFLARE_TUNNEL_TOKEN` - Tunnel authentication for Cloudflare integration
  - `WEBAPP_PORT` - Dashboard port (default: 8888)
  - `CODE_SERVER_PORT` - VS Code Server port (default: 8080)
  - `TTYD_PORT` - Terminal port (default: 7681)
  - `WORKSPACE_NAME` - Workspace identifier
  - `TMUX_SESSION_NAME` - Explicit tmux session name
  - `TERM_HOSTNAME`, `CODE_HOSTNAME`, `DASH_HOSTNAME` - Public hostnames

**Config Files:**
- `~/.config/cs/config.toml` - Global CLI config (TOML format, chmod 600)
- `.cs.toml` - Per-project sprite configuration (walked up from cwd to git root)
- `config/workspace.env.example` - VM provisioning environment template
- `/etc/default/workspace` - VM workspace configuration (read by dashboard)

**Build:**
- `cli/cs-rs/Cargo.toml` - Rust build manifest with dependencies and release profile
- No `Cargo.lock` constraints applied to CLI

## Platform Requirements

**Development:**
- Rust toolchain (cargo)
- Python 3.x
- Bash 4+
- Git

**Production:**
- Linux VMs (Ubuntu assumed based on `apt-get` in scripts)
- tmux
- ttyd (downloaded at runtime from GitHub releases)
- code-server (installed via bootstrap)
- cloudflared (installed via bootstrap)
- SSH access to Sprites API

## External Binaries

**Downloaded/Installed:**
- `ttyd` - Downloaded from GitHub releases, run as service
- `code-server` - Installed via package manager, run as service
- `cloudflared` - Installed via package manager, run as service
- `sprite` CLI - Expected to be installed by user (fallback: curl to API)

---

*Stack analysis: 2026-03-19*
