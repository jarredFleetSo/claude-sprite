# Codebase Structure

## Organization Strategy

**By deliverable type at top level, by domain within each:**

```
claude-sprite/
├── cli/cs-rs/          Rust CLI (primary user interface)
│   ├── Cargo.toml      Crate config, deps, release profile
│   └── src/            17 modules organized by domain
├── app/                Python web dashboard (stdlib only)
│   ├── server.py       HTTP server entry point
│   ├── auth.py         Authentication
│   ├── session.py      Session state
│   ├── terminal_ws.py  WebSocket terminal
│   ├── tokens.py       Token utilities
│   └── public/         Static HTML/CSS/JS
├── scripts/            Sprite VM provisioning
│   ├── bootstrap.sh    Main orchestrator
│   ├── lib/            Shared utilities
│   └── modules/        Numbered setup modules (01-09)
├── config/             Configuration templates
│   ├── cloudflared/    Tunnel config
│   ├── tmux/           Tmux config
│   ├── shell/          Shell aliases
│   └── workspace.env.example
├── docs/               Documentation
├── systemd/            Systemd unit files
├── .github/workflows/  CI/CD
├── CLAUDE.md           Developer guidelines
└── README.md           Project overview
```

## CLI Modules (`cli/cs-rs/src/`)

| Module | Domain | Purpose |
|--------|--------|---------|
| `main.rs` | Entry | Clap dispatch, command implementations |
| `cli.rs` | Entry | Clap derive structs (argument definitions) |
| `sprite.rs` | Core | `SpriteClient` — 3 exec modes (capture, pipe, tty) |
| `resolve.rs` | Core | Sprite name resolution chain |
| `config.rs` | Core | TOML config, `.cs.toml`, legacy migration |
| `error.rs` | Core | `CsError` variants via thiserror |
| `output.rs` | UI | Box-drawing, icons, styled output |
| `picker.rs` | UI | Interactive arrow-key sprite selection |
| `sync.rs` | Ops | Git-aware tar streaming with progress |
| `context.rs` | Ops | Session/history/settings push/pull |
| `dispatch.rs` | Ops | Dispatch + run: tmux window management |
| `attach.rs` | Ops | TERM fix, shell setup, tmux exec |
| `auth.rs` | Ops | API key push + onboarding bypass |
| `history.rs` | Ops | JSONL parse, filter, merge |
| `ssh.rs` | Ops | SSH key sync |
| `paths.rs` | Util | Path encoding, git root detection |
| `shell_setup.rs` | Util | Remote shell provisioning |
| `api.rs` | Util | Sprite API + relative time formatting |

## Dashboard Modules (`app/`)

| File | Purpose |
|------|---------|
| `server.py` | HTTP server (Python stdlib `http.server`) |
| `auth.py` | Cloudflare Access auth |
| `session.py` | Session state persistence |
| `terminal_ws.py` | WebSocket PTY terminal (custom impl) |
| `tokens.py` | API token storage |
| `public/index.html` | Dashboard UI |
| `public/style.css` | Terminal aesthetic styles |
| `public/app.js` | xterm.js + polling client |

## Scripts (`scripts/`)

Numbered modules enforce execution order during bootstrap:

| Module | Purpose |
|--------|---------|
| `01-system-packages.sh` | apt packages: jq, curl, ripgrep, etc. |
| `02-code-server.sh` | VS Code in browser (port 8080) |
| `03-ttyd.sh` | Browser terminal (port 7681) |
| `04-cloudflared.sh` | Cloudflare Tunnel connector |
| `05-ssh-git.sh` | SSH key generation |
| `06-tmux-session.sh` | Persistent tmux session |
| `07-shell-profile.sh` | Shell initialization |
| `08-services.sh` | Service registration |
| `09-webapp.sh` | Dashboard service (port 8888) |

Shared utilities:
- `lib/common.sh` — logging, error handling
- `lib/detect-environment.sh` — Sprite vs bare VM detection

## Naming Conventions

**Rust:** snake_case modules/functions, PascalCase types, UPPER_SNAKE for constants
**Python:** snake_case modules/functions, PascalCase classes
**Bash:** NN-description.sh for modules, UPPER_SNAKE for env vars
**Config:** kebab-case for directories, dot-separated for config files

## Key Entry Points

| What | File | How |
|------|------|-----|
| CLI | `cli/cs-rs/src/main.rs` | `cargo build --release` |
| Dashboard | `app/server.py` | `python3 app/server.py` |
| Bootstrap | `scripts/bootstrap.sh` | `sudo bash scripts/bootstrap.sh` |
| Install | `cli/install.sh` | `sudo bash cli/install.sh` |

## Config Files

| File | Format | Purpose |
|------|--------|---------|
| `~/.config/cs/config.toml` | TOML | Global CLI config (token, org, sprite) |
| `.cs.toml` | TOML | Per-project sprite mapping |
| `config/workspace.env` | Shell | Sprite VM environment (git-ignored) |
| `cli/cs-rs/Cargo.toml` | TOML | Rust crate definition |
