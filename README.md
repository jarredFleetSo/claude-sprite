# Claude Sprite

A remote development workspace that runs [Claude Code](https://docs.anthropic.com/en/docs/claude-code) on a persistent cloud VM ([Sprite](https://sprites.dev)), accessible from desktop terminal, desktop browser, and mobile browser. Start a task on your desktop, check progress on your phone, continue from a browser — same tmux session, same running processes, same workspace state.

## Architecture

```
 Desktop Terminal        Desktop Browser        Mobile Browser
 (SSH / sprite console)  (code-server)          (ttyd / dashboard)
        |                      |                      |
        v                      v                      v
+----------------------------------------------------------+
|              Cloudflare Edge + Access (auth)              |
+----------------------------------------------------------+
|         Cloudflare Tunnel (outbound-only from VM)        |
+----------------------------------------------------------+
        |                      |                      |
        v                      v                      v
+----------------------------------------------------------+
|                     Sprite VM (Ubuntu)                    |
|                                                          |
|   code-server :8080   ttyd :7681   dashboard :8888       |
|                  tmux session "workspace"                 |
|              Claude Code CLI + Git + Node.js              |
+----------------------------------------------------------+
```

No inbound ports are exposed. The VM establishes an outbound-only tunnel to Cloudflare, and Cloudflare Access enforces authentication before traffic reaches any service.

## Quickstart

### 1. Clone and configure

```bash
git clone <this-repo-url> ~/claude-sprite
cd ~/claude-sprite
cp config/workspace.env.example config/workspace.env
chmod 600 config/workspace.env
```

Edit `config/workspace.env` and fill in the two required values:

- `CLOUDFLARE_TUNNEL_TOKEN` — from the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com)
- `CLOUDFLARE_DOMAIN` — your Cloudflare-managed domain

See [config/workspace.env.example](config/workspace.env.example) for all options.

### 2. Bootstrap

```bash
sudo bash scripts/bootstrap.sh
```

Installs all services and starts the workspace. Each module is idempotent and safe to re-run.

### 3. Access

| Service          | URL                              | Purpose                    |
|------------------|----------------------------------|----------------------------|
| Browser IDE      | `https://code.yourdomain.com`    | VS Code in browser         |
| Browser Terminal | `https://term.yourdomain.com`    | Terminal (mobile-friendly) |
| Dashboard        | `https://dash.yourdomain.com`    | Workspace management UI    |
| App Preview      | `https://preview.yourdomain.com` | Frontend dev server        |

Or from a desktop terminal:

```bash
sprite console           # SSH into the Sprite
tmux attach -t workspace # attach to the persistent session
claude                   # run Claude Code
```

## `cs` CLI

The `cs` CLI gives you one-command access to your remote workspace. Built in Rust — no python3 dependency, no shell quoting bugs, progress bars during sync.

### Install

Requires [Rust](https://rustup.rs) and the [sprite CLI](https://sprites.dev).

```bash
cd cli && sudo bash install.sh   # builds from source, installs to /usr/local/bin/cs
cs setup                         # first-time: pick your Sprite and org
```

### Core workflows

**1. Remote Claude (interactive)** — the primary use case:

```bash
cd ~/git/axiom
cs ready              # auto-maps to sprite, syncs, auth, context, attaches
# type 'c' → Claude is ready, no onboarding, API key configured

cs ready              # next time: re-syncs, re-attaches (remembers sprite via .cs.toml)
```

**2. Fire-and-forget dispatch:**

```bash
cs dispatch "refactor the auth module to use JWT"
cs status             # running, 23 min elapsed
cs logs               # tail output
cs attach             # watch live
cs abort              # kill it

cs dispatch --resume  # resume last Claude session headless
cs run "make train"   # run any command (not Claude-wrapped), same monitoring
```

**3. Sprite management:**

```bash
cs                    # attach (picker if no project mapping)
cs list               # all sprites with status
cs create <name>      # create sprite
cs destroy <name>     # destroy sprite
cs start / stop       # wake / checkpoint
```

### All commands

```
cs                        attach to workspace (default, picker if no mapping)
cs ready [sprite]         THE command: create → auth → sync → context → attach
cs sync [path] [sprite]   push local directory to sprite (git-aware, progress bar)
cs pull <remote> [local]  pull files/artifacts from sprite

cs dispatch "<prompt>"    fire-and-forget Claude task
cs dispatch --resume      resume last session headless
cs run "<cmd>"            run any command in tmux on sprite
cs status                 what's running? (dispatch, run, or nothing)
cs logs                   tail output of whatever's running
cs attach                 connect to sprite terminal
cs abort                  kill the running dispatch/run

cs list                   all sprites with status
cs create [name]          create a new sprite
cs destroy [name]         destroy a sprite
cs start / stop [name]    wake / checkpoint

cs auth [sprite]          push API key + bypass onboarding
cs ssh-keys [sprite]      sync SSH keys for git
cs context push/pull      push/pull Claude sessions, history, settings
cs shell-setup [sprite]   install starship, fzf, eza, bat, zsh plugins
cs setup                  first-time config wizard
cs exec <cmd...>          run a command on the sprite
cs clone <url> [sprite]   git clone on sprite
cs proxy [ports]          proxy remote ports to localhost
cs url [sprite]           print access URLs
cs web                    open the dashboard
```

### Project auto-mapping

When you run `cs ready axiom` from `~/git/axiom`, it stores the mapping in `.cs.toml` at the project root. After that, all commands auto-resolve — no need to specify the sprite name.

Context sync includes session transcripts, project memory, history entries, `.claude/` settings, and `CLAUDE.md` with automatic path remapping. After a push, you get a ready-to-copy `claude --resume <id>` command.

## Dashboard

The web dashboard provides a mobile-friendly workspace management UI with:

- **Status monitoring** — real-time service health, tmux sessions, uptime, last access
- **Embedded terminal** — full xterm.js terminal via WebSocket, no separate app needed
- **Sprite management** — create, wake, and destroy sprites from the browser
- **Token settings** — configure Anthropic API key and Sprite token from the UI

Run it locally:

```bash
./claude-sprite          # starts the dashboard and opens your browser
```

Or access it via the tunnel at `https://dash.yourdomain.com`.

## What gets installed

The bootstrap script sets up the following on the Sprite VM:

- **code-server** — VS Code in the browser (port 8080)
- **ttyd** — browser-based terminal, v1.7.7 (port 7681)
- **cloudflared** — Cloudflare Tunnel connector
- **tmux** — terminal multiplexer for session persistence
- **Dashboard** — Python web server for workspace management (port 8888)
- **System packages** — jq, curl, wget, ripgrep, build-essential, htop

## Configuration

All configuration lives in a single file: `config/workspace.env` (git-ignored).

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `CLOUDFLARE_TUNNEL_TOKEN` | Yes | — | Tunnel connector token |
| `CLOUDFLARE_DOMAIN` | Yes | — | Base domain for service hostnames |
| `WORKSPACE_USER` | No | `coder` | Non-root user that owns the workspace |
| `WORKSPACE_DIR` | No | `/home/coder/workspace` | Project root directory |
| `CODE_SERVER_PORT` | No | `8080` | code-server port |
| `TTYD_PORT` | No | `7681` | ttyd port |
| `PREVIEW_PORT` | No | `3000` | Dev server preview port |
| `WEBAPP_PORT` | No | `8888` | Dashboard port |
| `SPRITE_TOKEN` | No | — | Sprites.dev API token (enables dashboard sprite management) |
| `ANTHROPIC_API_KEY` | No | — | Claude Code API key (can also be set via dashboard) |
| `ENABLE_DOCKER` | No | `false` | Install Docker during bootstrap |
| `PROJECT_REPO_URL` | No | — | Git repo to clone at bootstrap |

## Project structure

```
claude-sprite/
├── claude-sprite                  # Launch dashboard locally
├── cli/
│   ├── cs-rs/                     # CLI tool (Rust)
│   │   ├── Cargo.toml
│   │   └── src/                   # 17 modules: sprite, sync, dispatch, context, etc.
│   └── install.sh                 # Build + install Rust binary
├── app/
│   ├── server.py                  # Dashboard HTTP server (Python stdlib)
│   ├── session.py                 # Session state persistence
│   ├── tokens.py                  # API token storage
│   ├── terminal_ws.py             # WebSocket PTY terminal
│   └── public/
│       ├── index.html             # Dashboard UI
│       ├── style.css              # Terminal aesthetic styles
│       └── app.js                 # Client-side app (xterm.js + polling)
├── config/
│   ├── workspace.env.example      # Configuration template
│   ├── cloudflared/
│   │   └── config.yml.template    # Tunnel config template
│   ├── tmux/
│   │   └── tmux.conf              # tmux configuration
│   └── shell/
│       └── workspace-aliases.sh   # Shell aliases
├── scripts/
│   ├── bootstrap.sh               # Main bootstrap entrypoint
│   ├── workspace-init.sh          # Interactive workspace setup
│   ├── ssh-git-setup.sh           # SSH key generation for git
│   ├── lib/
│   │   ├── common.sh              # Shared utilities
│   │   └── detect-environment.sh  # Sprite vs bare VM detection
│   └── modules/
│       ├── 01-system-packages.sh  # System packages
│       ├── 02-code-server.sh      # code-server setup
│       ├── 03-ttyd.sh             # ttyd setup
│       ├── 04-cloudflared.sh      # Cloudflare Tunnel setup
│       ├── 05-ssh-git.sh          # SSH key setup
│       ├── 06-tmux-session.sh     # Persistent tmux session
│       ├── 07-shell-profile.sh    # Shell initialization
│       ├── 08-services.sh         # Service registration
│       └── 09-webapp.sh           # Dashboard service
├── systemd/                       # systemd unit files
└── docs/
    ├── architecture.md            # System design deep-dive
    ├── workspace-usage.md         # Day-to-day usage guide
    ├── cloudflare-access-policy.md # Cloudflare setup steps
    ├── token-settings.md          # API token configuration
    └── test-checklist.md          # Verification checklist
```

## How it works

**Persistence** — tmux is the unifying layer. All entry points (SSH, code-server terminal, ttyd, dashboard terminal) attach to the same tmux session. Close your browser, disconnect SSH, switch devices — running processes continue uninterrupted.

**Environment detection** — the bootstrap script auto-detects whether it's running on a Sprites.dev VM or a bare VM and uses the appropriate service manager (sprite-env or systemd).

**Security** — Cloudflare Access handles authentication at the edge. Services bind to `0.0.0.0` but are only reachable through the tunnel. No secrets are stored in images; everything loads at runtime from `config/workspace.env`. API tokens can be set via environment variables or the dashboard UI (env vars take priority).

**Zero external Python dependencies** — the dashboard server uses only the Python standard library (`http.server`, `json`, `subprocess`, `fcntl`), including a custom WebSocket implementation for the embedded terminal.

## Documentation

- **[Architecture](docs/architecture.md)** — system design, port map, security model, persistence
- **[Workspace Usage](docs/workspace-usage.md)** — day-to-day usage for all access methods
- **[Cloudflare Access Setup](docs/cloudflare-access-policy.md)** — Cloudflare Tunnel and Access policy configuration
- **[Token Settings](docs/token-settings.md)** — API token configuration guide
- **[Test Checklist](docs/test-checklist.md)** — verification checklist for desktop, mobile, security, and resilience

## License

MIT
