# Workspace Usage Guide

How to use your Remote Claude Code Workspace day-to-day.

---

## Getting Started

### 1. Configure workspace.env

```bash
cp config/workspace.env.example config/workspace.env
```

Edit `config/workspace.env` and fill in the required values:

- `CLOUDFLARE_TUNNEL_TOKEN` -- your tunnel token from the Cloudflare dashboard
- `CLOUDFLARE_DOMAIN` -- your Cloudflare-managed domain (e.g., `example.com`)
- `PROJECT_REPO_URL` -- (optional) Git clone URL for your project

See [config/workspace.env.example](../config/workspace.env.example) for all available options and their defaults.

### 2. Run bootstrap.sh

```bash
sudo bash scripts/bootstrap.sh
```

This installs and configures all workspace services: tmux, code-server, ttyd, cloudflared, and shell utilities.

### 3. Access Your Workspace

Once bootstrap completes, your workspace is accessible from three entry points:

| Entry Point       | URL / Command                      | Best For            |
|-------------------|------------------------------------|---------------------|
| Desktop terminal  | `sprite console` or SSH            | Full CLI experience |
| Desktop browser   | `https://code.yourdomain.com`      | VS Code in browser  |
| Mobile browser    | `https://term.yourdomain.com`      | Quick checks, mobile|

---

## Desktop Terminal Workflow

The desktop terminal provides the most familiar Claude Code experience.

### Connect

```bash
# Option A: Sprite console
sprite console

# Option B: SSH (if configured)
ssh coder@<sprite-ip>
```

### Attach to the Workspace Session

```bash
tmux attach -t workspace
```

All workspace activity happens inside this tmux session. If you were running Claude Code before disconnecting, it will still be running.

### Run Claude Code

```bash
claude
```

All standard Claude Code workflows work normally: file edits, command execution, test runs, code review, and so on. The only difference is that everything runs on the remote Sprite VM instead of your local machine.

### tmux Basics

The workspace uses a custom tmux configuration with `Ctrl+a` as the prefix key (instead of the default `Ctrl+b`).

| Action                | Shortcut              |
|-----------------------|-----------------------|
| New window            | `Ctrl+a c`            |
| Next window           | `Ctrl+a n`            |
| Previous window       | `Ctrl+a p`            |
| Split horizontal      | `Ctrl+a \|`           |
| Split vertical        | `Ctrl+a -`            |
| Switch pane           | `Alt + Arrow keys`    |
| Detach (leave running)| `Ctrl+a d`            |
| Reload tmux config    | `Ctrl+a r`            |

### Start a Dev Server

```bash
# Next.js
npx next dev -H 0.0.0.0

# Vite
npx vite --host 0.0.0.0

# Generic
<your-dev-command> --host 0.0.0.0
```

The `0.0.0.0` binding is required so the dev server is reachable through the Cloudflare Tunnel.

---

## Desktop Browser Workflow

The browser IDE provides a full VS Code experience without installing anything locally.

### Access

Open `https://code.yourdomain.com` in your browser. Cloudflare Access will prompt you to authenticate on first visit.

### Features

- Full VS Code editor with syntax highlighting, IntelliSense, and extensions
- Integrated terminal panel (runs in the same environment as SSH)
- File explorer, search, source control panel
- Extension marketplace (install extensions as needed)

### Terminal in code-server

The integrated terminal in code-server runs inside the same Sprite VM. You can:

- Run Claude Code from the terminal panel
- Attach to the tmux session for full continuity
- Run dev servers, tests, and build commands

### Tips

- Use `Ctrl+\`` (backtick) to toggle the terminal panel
- Install your preferred VS Code extensions from the sidebar
- code-server settings persist across sessions (stored on the Sprite filesystem)

---

## Mobile Browser Workflow

The mobile terminal provides quick access from your phone for monitoring, checking output, or running short commands.

### Access

Open `https://term.yourdomain.com` on your phone's browser. Authenticate via Cloudflare Access.

### What You Get

- Full terminal access to the Sprite VM
- Touch-friendly interface with scrollback support
- Same tmux session as desktop -- see exactly what is running

### Typical Mobile Use Cases

- Check Claude Code progress on a long-running task
- Review command output or build logs
- Run quick Git commands (`git status`, `git log`)
- Restart a dev server
- Approve or reject Claude Code tool-use requests

### Mobile Tips

- Landscape orientation gives more terminal width
- Scroll up to review past output
- The ttyd interface supports pinch-to-zoom on some browsers
- Keep commands short -- full coding sessions are better on desktop

---

## App Preview (Phone)

Preview your application on any device through the Cloudflare Tunnel.

### Start a Preview Server

Start your dev server with `0.0.0.0` binding so it is reachable through the tunnel:

```bash
# Next.js (port 3000)
npx next dev -H 0.0.0.0

# Vite (port 5173 -- update PREVIEW_PORT in workspace.env or tunnel config)
npx vite --host 0.0.0.0
```

### View the Preview

Open `https://preview.yourdomain.com` on your phone (or any device). The page renders as if you were accessing `localhost` on the VM.

### Hot Module Replacement (HMR)

HMR and live reload work through the Cloudflare Tunnel:

- Vite's WebSocket-based HMR works through the tunnel proxy
- Next.js Fast Refresh works as expected
- Changes made via Claude Code or the editor appear in real time on your phone

### Notes

- The preview hostname routes to the port configured in `workspace.env` (`PREVIEW_PORT`, default `3000`)
- If your framework uses a different port, update `PREVIEW_PORT` in `workspace.env` and reconfigure the tunnel
- Some frameworks may need `--allowed-hosts` configuration to accept requests from the tunnel hostname

---

## Reconnecting

The workspace is designed for seamless reconnection. Close your browser or terminal at any time -- everything keeps running.

### From Desktop Terminal

```bash
sprite console    # or SSH in
tmux attach -t workspace
```

You will see exactly what you left: same windows, same running processes, same scroll position.

### From Desktop Browser

Open `https://code.yourdomain.com`. Your editor state, open files, and terminal history are all preserved.

### From Mobile Browser

Open `https://term.yourdomain.com`. The tmux session shows the same state as on desktop.

### Cross-Device Continuity

The tmux session is the single source of truth. All entry points (SSH, code-server terminal, ttyd) can attach to the same session. This means:

1. Start a Claude Code task on your desktop terminal
2. Check progress on your phone (term.yourdomain.com)
3. Continue editing on your laptop browser (code.yourdomain.com)
4. All three see the same session state

---

## Troubleshooting

### "Can't connect to code-server"

1. Check that code-server is running:
   ```bash
   systemctl status code-server
   # or, if using sprite-env:
   sprite-env status
   ```
2. Check that the Cloudflare Tunnel is connected:
   ```bash
   systemctl status cloudflared
   ```
3. Verify the hostname is configured in the tunnel dashboard
4. Check `https://one.dash.cloudflare.com` > Networks > Tunnels for tunnel health

### "Preview not loading"

1. Make sure the dev server is running and bound to `0.0.0.0`:
   ```bash
   # Correct
   npx next dev -H 0.0.0.0

   # Wrong -- localhost only, not reachable through tunnel
   npx next dev
   ```
2. Check that the dev server port matches `PREVIEW_PORT` in `workspace.env`
3. If the framework requires allowed hosts, add the preview hostname:
   ```javascript
   // vite.config.js
   server: {
     host: '0.0.0.0',
     allowedHosts: ['preview.yourdomain.com']
   }
   ```

### "tmux session not found"

The session may not have been created yet, or it was killed. Create a new one:

```bash
tmux new-session -s workspace
```

To verify existing sessions:

```bash
tmux list-sessions
```

### "Permission denied on git push"

1. Check that the SSH key exists on the Sprite:
   ```bash
   ls -la ~/.ssh/id_ed25519.pub
   ```
2. Verify the public key is added to your GitHub account
3. Test SSH connectivity:
   ```bash
   ssh -T git@github.com
   ```
4. Check the remote URL uses SSH (not HTTPS):
   ```bash
   git remote -v
   ```

### "Cloudflare Access login loop"

1. Clear browser cookies for your domain
2. Try an incognito/private browser window
3. Verify your email matches the Access policy in the Cloudflare dashboard

### Service Management Commands

```bash
# Check status of all workspace services
systemctl status code-server
systemctl status ttyd
systemctl status cloudflared

# Restart a service
sudo systemctl restart code-server
sudo systemctl restart ttyd
sudo systemctl restart cloudflared

# View service logs
journalctl -u code-server -f
journalctl -u ttyd -f
journalctl -u cloudflared -f
```

If running in a Sprite environment with `sprite-env`:

```bash
sprite-env status
sprite-env restart code-server
```
