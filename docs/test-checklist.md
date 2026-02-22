# Test Checklist

Verification checklist for the Remote Claude Code Workspace. Work through each section after running bootstrap to confirm the workspace is fully functional.

---

## Prerequisites

- [ ] `config/workspace.env` configured with all required values (`CLOUDFLARE_TUNNEL_TOKEN`, `CLOUDFLARE_DOMAIN`)
- [ ] `bootstrap.sh` ran successfully (exit code 0, no errors in output)
- [ ] All services showing as running (`systemctl status code-server ttyd cloudflared`)
- [ ] Cloudflare Tunnel showing as "Healthy" in the Zero Trust dashboard
- [ ] Cloudflare Access applications created for code, term, and preview hostnames

---

## Desktop Terminal

- [ ] Can SSH or `sprite console` into the Sprite VM
- [ ] tmux session "workspace" exists (`tmux list-sessions`)
- [ ] Can attach to tmux session (`tmux attach -t workspace`)
- [ ] Claude Code CLI runs correctly (`claude --version`, then `claude`)
- [ ] Git clone works with SSH key (`git clone git@github.com:<your-repo>`)
- [ ] Git push works with SSH key
- [ ] Can start a dev server (`npx next dev -H 0.0.0.0` or `npx vite --host 0.0.0.0`)
- [ ] Dev server output is visible in tmux

---

## Desktop Browser (code-server)

- [ ] `https://code.yourdomain.com` loads in browser
- [ ] Cloudflare Access authentication prompt appears on first visit
- [ ] Authentication completes successfully
- [ ] code-server UI loads after authentication
- [ ] Can open files and edit code in the editor
- [ ] Terminal panel works (`Ctrl+backtick` to toggle)
- [ ] Terminal is in the same Sprite environment (same filesystem, same user)
- [ ] Can run commands in the terminal panel
- [ ] Extensions can be installed from the sidebar

---

## Mobile Browser (ttyd)

- [ ] `https://term.yourdomain.com` loads on phone browser
- [ ] Cloudflare Access authentication prompt appears on first visit
- [ ] Authentication completes successfully
- [ ] Terminal is usable on mobile screen (text is readable, input works)
- [ ] Can scroll back through output (swipe up)
- [ ] Can type and run commands
- [ ] Can attach to tmux session (`tmux attach -t workspace`)
- [ ] Landscape orientation provides a usable terminal width

---

## App Preview

- [ ] Dev server starts with `0.0.0.0` binding (not localhost-only)
- [ ] `https://preview.yourdomain.com` loads in browser
- [ ] Cloudflare Access authentication works (if policy is set for preview)
- [ ] Page renders correctly (same as localhost would on the VM)
- [ ] HMR / hot reload works -- edit a file, change appears in browser without manual refresh
- [ ] Preview works on mobile browser (phone)
- [ ] WebSocket connections succeed (no "WebSocket connection failed" errors in console)

---

## Cross-Device Continuity

- [ ] Start a task on desktop terminal (e.g., run Claude Code or start a build)
- [ ] Open mobile browser (term.yourdomain.com) and attach to tmux
- [ ] Verify the same output is visible on mobile as on desktop
- [ ] Open desktop browser (code.yourdomain.com) and check terminal panel
- [ ] All three entry points show the same tmux session state
- [ ] Running processes (Claude Code, dev servers) persist across device switches
- [ ] Detach from one device, reattach from another -- no data loss

---

## Security

- [ ] No services are accessible without Cloudflare Access authentication
  - Try opening `https://code.yourdomain.com` in an incognito window -- Access login should appear
  - Try opening `https://term.yourdomain.com` in an incognito window -- Access login should appear
- [ ] Direct IP access to ports is blocked (services are not reachable via Sprite IP:port)
- [ ] SSH key is workspace-scoped (generated on the Sprite, not shared with other machines)
- [ ] No secrets in git history (`git log --all -p -- '*.env' config/workspace.env` returns nothing)
- [ ] `config/workspace.env` has correct permissions: `600` (owner read/write only)
  - Verify: `stat -c '%a' config/workspace.env` should show `600`
- [ ] `.gitignore` excludes `workspace.env`, `.cloudflared/`, and `.ssh/`

---

## Service Resilience

- [ ] code-server restarts after crash
  - Kill it: `sudo kill -9 $(pgrep -f code-server)`
  - Wait 10 seconds, then verify: `systemctl status code-server` shows active
- [ ] ttyd restarts after crash
  - Kill it: `sudo kill -9 $(pgrep -f ttyd)`
  - Wait 10 seconds, then verify: `systemctl status ttyd` shows active
- [ ] cloudflared reconnects after network interruption
  - Kill it: `sudo kill -9 $(pgrep -f cloudflared)`
  - Wait 30 seconds, then verify: `systemctl status cloudflared` shows active
  - Verify tunnel shows "Healthy" in Cloudflare dashboard
- [ ] tmux session survives service restarts
  - Restart all services: `sudo systemctl restart code-server ttyd cloudflared`
  - Verify: `tmux list-sessions` still shows "workspace"
  - Reattach: `tmux attach -t workspace` -- all windows and processes intact
- [ ] Sprite sleep/wake preserves workspace state
  - Sleep the Sprite, then wake it
  - Verify tmux session still exists
  - Verify services are running
  - Verify tunnel reconnects and hostnames are reachable

---

## Final Validation

Complete this end-to-end workflow to confirm everything works together:

1. [ ] SSH into Sprite and attach to tmux
2. [ ] Clone a repo (or open an existing one)
3. [ ] Run Claude Code and ask it to make a change
4. [ ] Start a dev server with `0.0.0.0` binding
5. [ ] Open the preview URL on your phone -- app renders correctly
6. [ ] Switch to code-server in desktop browser -- edit a file, see HMR update on phone
7. [ ] Close all browsers and terminal
8. [ ] Wait 5 minutes
9. [ ] Reopen term.yourdomain.com on phone -- tmux session is intact, processes still running
10. [ ] Reopen code.yourdomain.com on desktop -- editor state preserved
