# Remote Claude Code Workspace (Sprite-Backed)

A remote development workspace that runs Claude Code on a persistent cloud VM (Sprite), accessible from desktop terminal, desktop browser, and mobile browser. You get the same Claude Code experience -- terminal-first, AI-assisted development -- but execution happens on a remote machine. Start a task on your desktop, check progress on your phone, continue from a browser. Same tmux session, same running processes, same workspace state.

## Architecture

```
 Desktop Terminal        Desktop Browser        Mobile Browser
 (SSH / sprite console)  (code-server)          (ttyd + preview)
        |                      |                      |
        v                      v                      v
+----------------------------------------------------------+
|              Cloudflare Edge + Access (auth)              |
+----------------------------------------------------------+
        |                      |                      |
        v                      v                      v
+----------------------------------------------------------+
|         Cloudflare Tunnel (outbound-only from VM)        |
+----------------------------------------------------------+
        |                      |                      |
        v                      v                      v
+----------------------------------------------------------+
|                     Sprite VM (Ubuntu)                    |
|                                                          |
|   code-server :8080   ttyd :7681   dev-server :3000      |
|                  tmux session "workspace"                 |
|              Claude Code CLI + Git + Node.js              |
+----------------------------------------------------------+
```

## Quickstart

### 1. Clone this repo into your Sprite

```bash
git clone <this-repo-url> ~/claude-sprite
cd ~/claude-sprite
```

### 2. Configure

```bash
cp config/workspace.env.example config/workspace.env
chmod 600 config/workspace.env
```

Edit `config/workspace.env` and fill in:
- `CLOUDFLARE_TUNNEL_TOKEN` -- from the Cloudflare Zero Trust dashboard
- `CLOUDFLARE_DOMAIN` -- your Cloudflare-managed domain

See [config/workspace.env.example](config/workspace.env.example) for all options.

### 3. Bootstrap

```bash
sudo bash scripts/bootstrap.sh
```

### 4. Access

| Service          | URL                                | Purpose               |
|------------------|------------------------------------|-----------------------|
| Browser IDE      | `https://code.yourdomain.com`      | VS Code in browser    |
| Browser Terminal | `https://term.yourdomain.com`      | Terminal (mobile-friendly) |
| App Preview      | `https://preview.yourdomain.com`   | Frontend dev server   |

Or from desktop terminal:

```bash
sprite console                  # or SSH in
tmux attach -t workspace        # attach to the persistent session
claude                          # run Claude Code
```

## What Gets Installed

- **code-server** -- VS Code in the browser, bound to port 8080
- **ttyd** -- Browser-based terminal (v1.7.7), bound to port 7681
- **cloudflared** -- Cloudflare Tunnel connector for secure access
- **tmux** -- Terminal multiplexer for session persistence
- **System packages** -- jq, curl, wget, ripgrep, build-essential, htop

## Project Structure

```
claude-sprite/
  config/
    workspace.env.example          # Configuration template
    workspace.env                  # Your config (git-ignored)
    cloudflared/
      config.yml.template          # Tunnel config template
    tmux/
      tmux.conf                    # tmux configuration
  scripts/
    bootstrap.sh                   # Main bootstrap entrypoint
    lib/
      common.sh                    # Shared utilities (logging, checks)
      detect-environment.sh        # Sprite vs bare VM detection
    modules/
      01-system-packages.sh        # System package installation
      02-code-server.sh            # code-server setup
      03-ttyd.sh                   # ttyd setup
      04-cloudflared.sh            # Cloudflare Tunnel setup
  systemd/                         # systemd unit files
  docs/
    architecture.md                # System architecture and design
    workspace-usage.md             # How to use the workspace
    cloudflare-access-policy.md    # Cloudflare Access setup guide
    test-checklist.md              # Verification checklist
  README.md                        # This file
```

## Documentation

- **[Architecture](docs/architecture.md)** -- System design, port map, security model, persistence model
- **[Workspace Usage](docs/workspace-usage.md)** -- Day-to-day usage guide for all access methods
- **[Cloudflare Access Setup](docs/cloudflare-access-policy.md)** -- Step-by-step Cloudflare Tunnel and Access policy configuration
- **[Test Checklist](docs/test-checklist.md)** -- Verification checklist for desktop, mobile, security, and resilience

## Configuration

All workspace configuration is driven by a single file: `config/workspace.env`. This file is git-ignored and should never be committed.

Copy the example and fill in your values:

```bash
cp config/workspace.env.example config/workspace.env
```

Key settings:
- **CLOUDFLARE_TUNNEL_TOKEN** -- Tunnel connector token (required)
- **CLOUDFLARE_DOMAIN** -- Your domain for service hostnames (required)
- **WORKSPACE_USER** -- Non-root user that owns the workspace (default: `coder`)
- **CODE_SERVER_PORT** -- code-server port (default: `8080`)
- **TTYD_PORT** -- ttyd port (default: `7681`)
- **PREVIEW_PORT** -- Dev server preview port (default: `3000`)

See [config/workspace.env.example](config/workspace.env.example) for the full list with descriptions.

## License

MIT
