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

The `cs` CLI gives you one-command access to your remote workspace from your Mac.

### Install

```bash
cd cli && sudo bash install.sh
cs setup  # first-time: pick your Sprite and org
```

### Usage

```bash
cs                       # attach to your workspace (picker if no default)
cs list                  # list all sprites with status
cs status                # check health, tmux sessions, services
cs start                 # wake a sleeping sprite
cs stop                  # checkpoint and idle
cs attach <name>         # wake + attach to a specific sprite
```

**File operations:**

```bash
cs sync . <name>         # push local directory to sprite (git-aware)
cs pull <path> <dest>    # pull files from sprite to local
cs clone <url> <name>    # git clone directly on the sprite
cs cp <src> <dest>       # copy files (prefix remote paths with :)
cs exec <cmd...>         # run a command on the sprite
```

**Setup and config:**

```bash
cs auth <name>           # set Claude Code API key on the sprite
cs ssh-keys <name>       # sync SSH keys for git
cs shell-setup <name>    # install starship, fzf, eza, bat, zsh plugins
cs create <name>         # create a new sprite
cs destroy <name>        # destroy a sprite
cs proxy [ports]         # proxy remote ports to localhost
cs url <name>            # print access URLs
cs web                   # open the dashboard in your browser
```

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
│   ├── cs                         # CLI tool for remote workspace access
│   └── install.sh                 # CLI installer
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
