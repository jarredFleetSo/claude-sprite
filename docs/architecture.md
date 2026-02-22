# Architecture

## System Overview

The Remote Claude Code Workspace is a persistent cloud development environment backed by a Sprite VM. Users interact with the workspace from any device -- desktop terminal, desktop browser, or mobile browser -- through a Cloudflare Tunnel that provides secure, outbound-only connectivity.

```
                         +---------------------------+
                         |     Cloudflare Edge       |
                         |  (Access Authentication)  |
                         +---------------------------+
                                    ^
         +--------------------------|---------------------------+
         |                          |                           |
  code.domain.com          term.domain.com           preview.domain.com
  (Browser IDE)            (Browser Terminal)         (App Preview)
         |                          |                           |
         v                          v                           v
+------------------------------------------------------------------------+
|                                                                        |
|  Desktop Terminal   Desktop Browser (code-server)   Mobile Browser     |
|  (SSH / sprite      (VS Code in browser)            (ttyd terminal     |
|   console)                                           + app preview)    |
|                                                                        |
+------------------------------------------------------------------------+
         |                          |                           |
         v                          v                           v
+------------------------------------------------------------------------+
|                                                                        |
|                      Cloudflare Tunnel (cloudflared)                   |
|                      Outbound-only connection from VM                  |
|                                                                        |
+------------------------------------------------------------------------+
         |                          |                           |
         v                          v                           v
+------------------------------------------------------------------------+
|                           Sprite VM (Ubuntu)                           |
|                                                                        |
|  +----------------+  +----------------+  +-------------------------+   |
|  | code-server    |  | ttyd           |  | Dev Server              |   |
|  | :8080          |  | :7681          |  | :3000 (Next.js)         |   |
|  |                |  |                |  | :5173 (Vite)            |   |
|  +----------------+  +----------------+  +-------------------------+   |
|                                                                        |
|  +------------------------------------------------------------------+  |
|  |                     tmux session "workspace"                     |  |
|  |  All terminals (SSH, code-server, ttyd) attach to the same      |  |
|  |  tmux session for cross-device continuity.                       |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  Claude Code CLI  |  Git + SSH  |  Node.js  |  Python  |  shell tools  |
+------------------------------------------------------------------------+
```

### Component Inventory

| Component     | Version / Source                                     | Purpose                          |
|---------------|------------------------------------------------------|----------------------------------|
| Sprite VM     | Ubuntu base                                          | Persistent cloud compute         |
| code-server   | Latest via install.sh (code-server.dev)              | Browser-based VS Code IDE        |
| ttyd          | 1.7.7 (pinned binary from GitHub releases)           | Browser-based terminal           |
| cloudflared   | Latest .deb from GitHub releases                     | Outbound tunnel to Cloudflare    |
| tmux          | OS package (apt)                                     | Session persistence / continuity |
| Claude Code   | CLI (pre-installed or installed during bootstrap)    | AI-assisted development          |
| Node.js       | OS package or nvm-managed                            | JavaScript runtime               |
| Git           | OS package (apt)                                     | Version control                  |

---

## Port Map

| Port | Service       | Tunnel Hostname        | Description                                 |
|------|---------------|------------------------|---------------------------------------------|
| 8080 | code-server  | code.yourdomain.com    | Browser IDE (VS Code)                       |
| 7681 | ttyd         | term.yourdomain.com    | Browser terminal (mobile-friendly)          |
| 3000 | Next.js      | preview.yourdomain.com | Application preview (Next.js default)       |
| 5173 | Vite         | preview.yourdomain.com | Application preview (Vite default)          |
| 8000 | Backend API  | (not exposed by default)| Backend dev server (optional)              |

All services bind to `0.0.0.0` so they are reachable through the Cloudflare Tunnel. No ports are exposed directly to the public internet.

---

## Security Model

### Outbound-Only Tunnel

The Cloudflare Tunnel (`cloudflared`) establishes an outbound-only connection from the Sprite VM to the Cloudflare edge. No inbound ports are opened on the VM. All traffic flows through Cloudflare's network.

```
Sprite VM ----(outbound TCP)----> Cloudflare Edge <---- User Browser
```

### Authentication

**Cloudflare Access** enforces authentication at the tunnel level, before any request reaches the VM:

- Each hostname (code, term, preview) has its own Access Application
- Access policies control who can reach each service (email allowlist, IdP group, etc.)
- Session tokens are issued after authentication and cached for the configured duration (e.g., 24 hours)

**code-server** runs with `auth: none` because Cloudflare Access has already authenticated the user before the request arrives at code-server. This avoids double-authentication friction.

### SSH Keys

- Each workspace generates its own SSH key pair during bootstrap
- The private key stays on the Sprite VM
- The public key is added to GitHub (user account or deploy key)
- Keys are workspace-scoped and revocable

### Secrets

- No secrets are baked into VM images or committed to Git
- All secrets are loaded at runtime from `config/workspace.env`
- The `workspace.env` file has `600` permissions (owner-read-only)
- The `.gitignore` excludes `workspace.env`, `.cloudflared/`, and `.ssh/`

---

## Persistence Model

### Sprite VM Filesystem

The Sprite VM persists its entire filesystem across sleep/wake cycles. This means:

- Git repositories remain cloned and intact
- `node_modules` and other dependency directories persist
- Editor state (code-server extensions, settings) persists
- Shell history persists

### tmux Session Persistence

The `tmux` session named `workspace` survives:

- SSH disconnections
- Browser tab closures
- Network interruptions
- Device switches (start on desktop, continue on phone)

All running processes inside `tmux` (Claude Code, dev servers, build watchers) continue running regardless of how the user is connected.

### Service Restart

Services are managed by either `systemd` units or Sprite-native service management (`sprite-env`):

- `code-server` restarts automatically if it crashes
- `ttyd` restarts automatically if it crashes
- `cloudflared` reconnects automatically after network interruptions
- The `tmux` session is independent of service restarts

---

## Service Architecture

### Dual-Path Service Management

The workspace supports two service management approaches, selected at bootstrap based on environment detection:

1. **Sprite-native** (`sprite-env`): Used when running inside a Sprite VM. Services are registered with the Sprite service manager for automatic lifecycle management.

2. **systemd**: Used as a fallback on bare VMs or when Sprite-native management is not available. Standard `systemd` unit files are installed for each service.

The `scripts/lib/detect-environment.sh` module determines which path to use by checking for Sprite-specific indicators (`/run/sprite`, `SPRITE` env var, `sprite-env` in PATH).

### Process Model

```
+-- Sprite VM -------------------------------------------------+
|                                                               |
|  systemd / sprite-env                                         |
|    |-- code-server (port 8080)                                |
|    |-- ttyd (port 7681) --> attaches to tmux                  |
|    |-- cloudflared (tunnel connector)                         |
|                                                               |
|  tmux session "workspace"                                     |
|    |-- window 1: Claude Code CLI (interactive)                |
|    |-- window 2: dev server (next dev / vite dev)             |
|    |-- window 3: general shell                                |
|                                                               |
|  All entry points attach to the same tmux session:            |
|    - SSH / sprite console  --> tmux attach -t workspace       |
|    - code-server terminal  --> runs inside the same env       |
|    - ttyd                  --> tmux attach -t workspace        |
+---------------------------------------------------------------+
```

The key architectural insight is that `tmux` is the unifying layer. Whether the user connects via SSH, code-server's integrated terminal, or ttyd in a mobile browser, they see the same session state, the same running processes, and the same scroll history.

### Bootstrap Module Pipeline

The bootstrap process runs modules in sequence:

1. **01-system-packages.sh** -- Installs core system packages (tmux, jq, curl, build-essential, etc.)
2. **02-code-server.sh** -- Installs code-server and writes its config (bind to 0.0.0.0, auth=none)
3. **03-ttyd.sh** -- Downloads and installs a pinned ttyd binary
4. **04-cloudflared.sh** -- Installs cloudflared and renders the tunnel configuration

Each module is idempotent and can be re-run safely.
