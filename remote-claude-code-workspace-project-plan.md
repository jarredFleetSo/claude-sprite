# Remote Claude Code Workspace Project Plan (Sprite-Backed)

## 1) Product Goal

Create a **remote workspace system** that behaves like Claude Code today, but runs on a cloud-hosted Sprite and is accessible from:

- **Desktop terminal** (SSH / Sprite console / CLI)
- **Desktop browser** (web terminal + code editor)
- **Mobile browser** (terminal + app preview)
- optionally **Claude Code web/mobile monitoring workflows** alongside your own remote workspace flow

### Core Promise

Users interact with Claude Code the same way they already do:

- same repo workflows
- same terminal-first behavior
- same file edits / command execution / test runs
- same app preview loop

…but execution happens on a **persistent remote machine**.

---

## 2) Scope Definition

### In Scope (MVP)

- Provision a Sprite per workspace/project
- Install and run Claude Code CLI in Sprite
- Persistent shell sessions (`tmux`)
- Web terminal access (mobile-friendly)
- Web code editor access (desktop/tablet-friendly)
- Frontend preview URLs (view app from phone)
- Secure authentication for web access
- Git repo access (SSH keys / deploy keys / GitHub App)
- Shared “same workspace” from desktop terminal + browser

### Out of Scope (Phase 1)

- Multi-user collaborative editing
- Enterprise SSO/SCIM deep integration
- Billing/quota enforcement dashboard
- Snapshot diff UX / time-travel UI
- Full control plane for many teams (can come later)

---

## 3) Success Criteria

### UX Parity Criteria

A user can:

1. Open a remote workspace and run Claude Code in terminal
2. Ask Claude to edit code, run tests, and inspect files
3. Start a frontend dev server in the workspace
4. View the frontend on their phone
5. Reconnect later from laptop or browser and continue in same workspace state

### Technical Acceptance Criteria

- Workspace persists code + dependencies across sessions
- Startup-to-usable time under 2 minutes for warm path
- Browser terminal works on mobile
- Frontend preview URL is reachable securely
- Repo auth is scoped and revocable
- No inbound public ports required on the VM (tunnel-based exposure)

---

## 4) Architecture

### 4.1 Runtime Layer (Sprite)

Each project gets a Sprite workspace containing:

- Ubuntu base
- Claude Code CLI
- `tmux`
- `git`, `gh`, `node`, `python`, etc.
- `code-server` (browser IDE)
- `ttyd` or equivalent (browser terminal)
- `cloudflared` (secure tunnel)
- optional: Docker/Podman if needed for app services

### 4.2 Access Layer

#### Desktop Terminal
- `sprite console` or SSH path into Sprite
- attach to `tmux` session
- run Claude Code CLI normally

#### Browser Editor
- `code-server` exposed behind Cloudflare Tunnel + Access
- best for desktop/tablet

#### Browser Terminal (Mobile-Friendly)
- `ttyd` exposed behind Cloudflare Tunnel + Access
- best for phone quick checks + commands

#### App Previews
- Frontend dev server (Vite/Next/etc.) runs in Sprite on port `3000/5173/8080`
- exposed via:
  - Sprite public URL (fast path), or
  - Cloudflare Tunnel hostname (secure preferred)

### 4.3 Security Layer

- Cloudflare Tunnel (`cloudflared`) from Sprite to Cloudflare
- Cloudflare Access policies for auth (email/IdP)
- Separate policies per app:
  - `code.example.com`
  - `term.example.com`
  - `preview-*.example.com`

---

## 5) User Experience Design

### 5.1 “Exactly Like Claude Code, Just Remote”

The UX should preserve Claude Code’s normal interaction loop:

- user opens terminal
- runs Claude Code
- Claude edits files and runs commands in that terminal environment
- user sees progress and can intervene

### What Changes (and Should Be Mostly Invisible)

- Filesystem is remote (Sprite)
- Compute is remote
- App preview is a URL instead of localhost
- Reconnect is via browser/terminal to same `tmux` session

### 5.2 Mobile Workflow

- Open `term.example.com` on phone
- Attach to `tmux`
- Check Claude output / run commands
- Open `preview.example.com` to view frontend
- Optional: use Claude Code web/mobile separately for task monitoring

---

## 6) Git / Repo Access Plan

### 6.1 Human Coding Access (Default)

Use a **Sprite-specific SSH key** for GitHub:

- generate key inside Sprite
- add public key to GitHub user account (or org-approved path)
- keep private key only on Sprite
- use `~/.ssh/config` for host aliases if multiple identities are needed

### 6.2 Automation Access (Recommended)

For org/team automation use:

- **GitHub App** (preferred for multi-repo/team access)
- fallback: repo-specific deploy keys for narrow read-only/pull use

### 6.3 Secret Handling

- No secrets baked into base image
- Use runtime secret injection (env file with strict perms or secret manager)
- Rotate keys regularly
- Separate human creds from automation creds

---

## 7) Frontend Preview Strategy (Phone-Friendly)

### 7.1 Dev Server Requirements

Frontend dev server must bind to:

- `0.0.0.0` (not localhost only)

Examples:

- Vite: `--host 0.0.0.0`
- Next.js: `-H 0.0.0.0`
- React dev server: host override as needed

### 7.2 Exposure Modes

#### Mode A: Quick Preview (MVP)
- Sprite public URL / direct Sprite exposure
- fastest to validate

#### Mode B: Secure Preview (Recommended)
- Cloudflare Tunnel hostname per preview
- Cloudflare Access policy enforced

### 7.3 HMR / Websockets

- Ensure proxy/tunnel supports websockets
- Configure frontend dev server allowed hosts if required
- Prefer stable preview hostname to avoid host mismatch issues

---

## 8) Implementation Phases

### Phase 0 — Design and Proof (2–4 days)

#### Deliverables
- Final architecture doc
- Security model
- Credential model
- Port map / hostnames plan

#### Tasks
- Decide on one stack:
  - `code-server` + `ttyd` + `cloudflared`
- Define DNS names
- Define Cloudflare Access policy rules
- Define repo auth approach (SSH vs GitHub App)

---

### Phase 1 — Single-Workspace MVP (1–2 weeks)

#### Goal
One Sprite, one user, one workspace, full remote Claude Code flow.

#### Tasks
1. **Bootstrap script**
   - install `tmux`, `code-server`, `ttyd`, `cloudflared`
   - verify Claude CLI present / install if needed
2. **Session management**
   - create persistent `tmux` session
   - auto-attach on login
3. **Web services**
   - run `code-server` on 8080
   - run `ttyd` on 7681
4. **Tunnel + Access**
   - configure Cloudflare Tunnel
   - add hostnames and Access policies
5. **Repo auth**
   - SSH key generation and GitHub hookup
6. **App preview**
   - test Vite/Next app and phone access
7. **Smoke tests**
   - desktop terminal, desktop browser, mobile browser

#### Acceptance Test
- Clone repo
- Run Claude Code task
- Start frontend dev server
- Open frontend on phone
- Reconnect and continue later

---

### Phase 2 — Product Polish (1–2 weeks)

#### Goal
Make it feel truly “Claude Code but remote.”

#### Tasks
- Add `workspace init` script
- Add standard shell profile + aliases
- Add logs + health checks
- Add restart policies (`systemd` services)
- Add “open preview URL” helper
- Add `gh` login helper
- Add backup/checkpoint workflow

---

### Phase 3 — Multi-Workspace and Templates (2–4 weeks)

#### Goal
Scale to multiple projects and repeatable setups.

#### Tasks
- Workspace templates:
  - Node frontend
  - Next.js fullstack
  - Python API
- Per-workspace domains and Access rules
- Workspace metadata store (JSON/SQLite)
- “Create new workspace” CLI
- Optional repo auto-clone + branch bootstrap

---

### Phase 4 — Team/Org Hardening (Later)

#### Goal
Operational reliability and governance.

#### Tasks
- GitHub App integration for org repos
- SSO/IdP integration in Cloudflare Access
- Audit logs
- Secret manager integration
- Cost controls / idle policies
- Fleet management (many Sprites)

---

## 9) Operational Design

### 9.1 Services on the Sprite

Use `systemd` units for:

- `code-server.service`
- `ttyd.service`
- `cloudflared.service`
- optional `workspace-preview.service` wrapper

### 9.2 Process Model

- Claude Code runs inside `tmux` (interactive)
- Web terminal attaches to same `tmux`
- Desktop terminal attaches to same `tmux`
- This guarantees continuity across devices

### 9.3 Port Map (Example)

- 8080 → code-server
- 7681 → ttyd
- 3000 → frontend preview (Next)
- 5173 → frontend preview (Vite)
- 8000/5000 → backend API preview

---

## 10) Security and Risk Plan

### 10.1 Security Controls

- Cloudflare Tunnel (outbound-only)
- Cloudflare Access auth on every web endpoint
- No direct public SSH
- Separate SSH keys per workspace or per user
- Least-privilege repo credentials
- Secret rotation policy

### 10.2 Main Risks and Mitigations

#### Risk: Accidental Credential Overexposure
**Mitigation:** separate human/automation identities, use scoped creds, never bake secrets into images.

#### Risk: Mobile UX Is Clunky
**Mitigation:** keep mobile scope to terminal + preview; use code-server mainly on desktop/tablet.

#### Risk: Dev Server Host/HMR Issues
**Mitigation:** enforce `0.0.0.0`, stable preview hostnames, websocket-capable proxy.

#### Risk: Workspace Drift
**Mitigation:** workspace bootstrap script + template versions + dotfiles repo.

---

## 11) Deliverables Checklist

### MVP Deliverables
- [ ] Architecture doc
- [ ] Bootstrap install script
- [ ] `systemd` service files
- [ ] Cloudflare Tunnel config
- [ ] Cloudflare Access policy template
- [ ] SSH/Git setup script
- [ ] Workspace README (“how to use”)
- [ ] Test checklist (desktop + mobile)

### Nice-to-Have
- [ ] “New workspace” CLI
- [ ] GitHub App integration
- [ ] Template catalog
- [ ] Automatic preview URL registration

---

## 12) Messaging for Stakeholders

Use this framing internally/externally:

> **This is not a new coding interface. It is Claude Code running in a remote, persistent cloud workspace.**  
> The user experience stays terminal-first and Claude-native, but the compute, filesystem, and app previews live in the cloud, so the same workspace is accessible from desktop and mobile.

---

## 13) Next Step

Convert this into a build-ready implementation spec with:

- exact `systemd` unit files
- a Sprite bootstrap shell script
- `cloudflared` config
- Vite/Next preview config templates
