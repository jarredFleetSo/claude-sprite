# Roadmap: Claude Sprite Desktop

## Overview

Four phases deliver a shippable Electron desktop app from nothing. Phase 1 builds the foundation that every other feature depends on: a working Electron shell with IPC architecture, authenticated sprite list, and full lifecycle controls. Phase 2 adds the core differentiating feature — firing Claude tasks and watching them run live. Phase 3 embeds a terminal so users can get a shell in one click. Phase 4 wraps everything in a signed, auto-updating macOS installer that users can download and run.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Shell + Dashboard** - Electron app with auth setup wizard, live sprite list, and lifecycle controls (start/stop/destroy/create)
- [ ] **Phase 2: Dispatch + File Sync** - Fire Claude tasks with live log streaming, abort control, and push/pull file sync
- [ ] **Phase 3: Embedded Terminal** - xterm.js terminal connected to a running sprite shell via node-pty
- [ ] **Phase 4: Packaging** - Signed macOS .dmg with notarization, system tray, and auto-update via GitHub Releases

## Phase Details

### Phase 1: Shell + Dashboard
**Goal**: Users can open the app, complete setup once, and see all their sprites with live status — then start, stop, destroy, or create any sprite without touching the terminal.
**Depends on**: Nothing (first phase)
**Requirements**: SHELL-01, SHELL-02, SHELL-03, SHELL-04, SHELL-05, DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07
**Success Criteria** (what must be TRUE):
  1. User opens the app for the first time and is guided through entering their sprite token, org, and Anthropic API key before reaching any other screen
  2. User can see all their sprites in a list with correct running/cold/stopped status that updates automatically without a manual refresh
  3. User can start a stopped sprite, stop a running sprite, and destroy a sprite (with confirmation prompt) entirely from the UI
  4. User can create a new sprite from the dashboard and see it appear in the sprite list
  5. Config entered during setup persists across app restarts and pre-fills from existing cs config if present
**Plans**: TBD

Plans:
- [ ] 01-01: Electron + electron-vite + React TypeScript scaffold with IPC skeleton (contextBridge, sandboxed preload, PATH resolution)
- [ ] 01-02: Setup wizard (token/org/API key collection, electron-store persistence, cs config migration)
- [ ] 01-03: Sprite dashboard (TanStack Query polling, status indicators, lifecycle actions)

### Phase 2: Dispatch + File Sync
**Goal**: Users can fire a Claude task at a sprite with a text prompt, watch the output stream live, abort if needed, get an OS notification when done, and push or pull files with visible progress.
**Depends on**: Phase 1
**Requirements**: DISP-01, DISP-02, DISP-03, DISP-04, SYNC-01, SYNC-02, SYNC-03
**Success Criteria** (what must be TRUE):
  1. User can type a prompt, select a sprite, and fire a Claude dispatch that launches on the remote sprite
  2. User can watch dispatch output stream line-by-line in real time while it runs, without polling or manual refresh
  3. User can abort a running dispatch from the UI and see the process stop on the sprite
  4. User receives an OS notification when a dispatch finishes or fails, even if the app is in the background
  5. User can push local files to a sprite and pull files from a sprite, with a visible progress indicator for both operations
**Plans**: TBD

Plans:
- [ ] 02-01: CLI Bridge (streaming child_process.spawn wrapper, IPC channel multiplexing by sprite, cleanup on unmount)
- [ ] 02-02: Dispatch panel (prompt field, launch, live log streaming, abort, status indicator, OS notification)
- [ ] 02-03: File sync UI (push/pull with progress, auto-sync before dispatch toggle)

### Phase 3: Embedded Terminal
**Goal**: Users can open a shell on any running sprite directly inside the app without switching to a separate terminal or browser tab.
**Depends on**: Phase 2
**Requirements**: TERM-01
**Success Criteria** (what must be TRUE):
  1. User can click a sprite and open a fully functional terminal in the app that connects to a live shell on that sprite
  2. Terminal resizes correctly when the user resizes the app window or panel, with no clipped output or frozen cursor
**Plans**: TBD

Plans:
- [ ] 03-01: Embedded terminal (node-pty main process setup, ASAR unpack config, xterm.js renderer component, resize propagation via IPC)

### Phase 4: Packaging
**Goal**: Users can download a .dmg, drag the app to Applications, and have it run without Gatekeeper warnings — and receive automatic update prompts when new versions ship.
**Depends on**: Phase 3
**Requirements**: PKG-01, PKG-02, PKG-03, SHELL-06, SHELL-07
**Success Criteria** (what must be TRUE):
  1. macOS .dmg installs to Applications via drag-and-drop and launches without any Gatekeeper or "damaged app" warning
  2. App is code-signed with Apple Developer ID and passes notarization — verified on a fresh macOS machine that never ran the app before
  3. App checks for updates at startup and prompts the user to install when a new GitHub Release is available
  4. System tray icon shows sprite status at a glance and provides quick access to the app without keeping it in the Dock
**Plans**: TBD

Plans:
- [ ] 04-01: System tray integration (menubar icon with quick status, show/hide window)
- [ ] 04-02: electron-builder DMG config + electron-updater wired to GitHub Releases
- [ ] 04-03: Code signing and notarization (Apple Developer ID, hardened runtime, CI pipeline)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Shell + Dashboard | 0/3 | Not started | - |
| 2. Dispatch + File Sync | 0/3 | Not started | - |
| 3. Embedded Terminal | 0/1 | Not started | - |
| 4. Packaging | 0/3 | Not started | - |
