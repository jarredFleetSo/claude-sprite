# Requirements: Claude Sprite Desktop

**Defined:** 2026-03-19
**Core Value:** See what's running on every sprite at a glance and interact with it without remembering CLI commands.

## v1 Requirements

### Shell & Setup

- [ ] **SHELL-01**: Electron app launches with React renderer via electron-vite
- [ ] **SHELL-02**: Setup wizard collects sprite token, org, and Anthropic API key on first launch
- [ ] **SHELL-03**: Config persists to electron-store (reads existing cs config if present)
- [ ] **SHELL-04**: IPC architecture uses contextBridge with sandboxed preload (contextIsolation: true)
- [ ] **SHELL-05**: PATH resolution works in packaged macOS app (shell env inheritance)
- [ ] **SHELL-06**: System tray / menubar mode with quick status indicator
- [ ] **SHELL-07**: Auto-update checks GitHub Releases and prompts user to install

### Sprite Dashboard

- [ ] **DASH-01**: List all sprites with visual status indicators (running/cold/stopped)
- [ ] **DASH-02**: Start a stopped/cold sprite from the dashboard
- [ ] **DASH-03**: Stop a running sprite from the dashboard
- [ ] **DASH-04**: Destroy a sprite from the dashboard (with confirmation)
- [ ] **DASH-05**: Create a new sprite from the dashboard
- [ ] **DASH-06**: Quick-action buttons per sprite (start/stop/attach/dispatch)
- [ ] **DASH-07**: Auto-polling sprite status at regular intervals

### Dispatch & Monitoring

- [ ] **DISP-01**: User can fire a Claude dispatch with a text prompt on a selected sprite
- [ ] **DISP-02**: User can see real-time streaming output from a running dispatch
- [ ] **DISP-03**: User can abort a running dispatch from the UI
- [ ] **DISP-04**: OS notification fires when dispatch completes or fails

### File Sync

- [ ] **SYNC-01**: User can push local files to sprite with progress indication
- [ ] **SYNC-02**: User can pull files from sprite to local machine
- [ ] **SYNC-03**: Files auto-sync before dispatch (configurable)

### Terminal

- [ ] **TERM-01**: Embedded xterm.js terminal connected to sprite via node-pty + IPC

### Packaging

- [ ] **PKG-01**: macOS .dmg installer built with electron-builder
- [ ] **PKG-02**: macOS app is code-signed and notarized (Apple Developer ID)
- [ ] **PKG-03**: Auto-update via electron-updater checking GitHub Releases

## v2 Requirements

### Dispatch History

- **HIST-01**: User can view past dispatch prompts and outcomes
- **HIST-02**: User can re-run a previous dispatch

### Multi-Terminal

- **MTERM-01**: Multiple terminal tabs per sprite
- **MTERM-02**: Split pane terminal view

### Windows

- **WIN-01**: Windows .exe installer via NSIS
- **WIN-02**: Windows code signing

### One-Button Workflows

- **FLOW-01**: "Ready" button that runs sync + context + attach in one click
- **FLOW-02**: Dispatch history with one-click re-dispatch

## Out of Scope

| Feature | Reason |
|---------|--------|
| Code editor / file browser | Use cs sync + local editor; not a code editing tool |
| Git UI | Git operations belong in terminal or dedicated git tools |
| Plugin/extension system | Scope trap — see Docker Desktop extensions cautionary tale |
| Team collaboration | Single-user desktop app; team features are a different product |
| Mobile app | cs share already covers mobile terminal access |
| Custom VM provisioning | Uses sprite CLI under the hood; not our abstraction layer |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SHELL-01 | TBD | Pending |
| SHELL-02 | TBD | Pending |
| SHELL-03 | TBD | Pending |
| SHELL-04 | TBD | Pending |
| SHELL-05 | TBD | Pending |
| SHELL-06 | TBD | Pending |
| SHELL-07 | TBD | Pending |
| DASH-01 | TBD | Pending |
| DASH-02 | TBD | Pending |
| DASH-03 | TBD | Pending |
| DASH-04 | TBD | Pending |
| DASH-05 | TBD | Pending |
| DASH-06 | TBD | Pending |
| DASH-07 | TBD | Pending |
| DISP-01 | TBD | Pending |
| DISP-02 | TBD | Pending |
| DISP-03 | TBD | Pending |
| DISP-04 | TBD | Pending |
| SYNC-01 | TBD | Pending |
| SYNC-02 | TBD | Pending |
| SYNC-03 | TBD | Pending |
| TERM-01 | TBD | Pending |
| PKG-01 | TBD | Pending |
| PKG-02 | TBD | Pending |
| PKG-03 | TBD | Pending |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 0
- Unmapped: 25 ⚠️

---
*Requirements defined: 2026-03-19*
*Last updated: 2026-03-19 after initial definition*
