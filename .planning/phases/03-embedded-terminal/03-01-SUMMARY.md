---
phase: 03-embedded-terminal
plan: "01"
subsystem: terminal-backend
tags: [node-pty, xterm, ipc, electron, zustand, typescript]
dependency_graph:
  requires: []
  provides: [terminal-pty-manager, terminal-ipc-handlers, terminal-preload-bridge, terminal-store]
  affects: [renderer-terminal-ui]
tech_stack:
  added: [node-pty@1.1.0, "@xterm/xterm@6.0.0", "@xterm/addon-fit@0.11.0", "@xterm/addon-webgl@0.19.0", "@xterm/addon-unicode11@0.9.0", "@electron/rebuild@4.0.3"]
  patterns: [ipc-handle-on-split, namespaced-push-channels, zustand-tab-management]
key_files:
  created:
    - claude-sprite-desktop/src/main/pty-manager.ts
    - claude-sprite-desktop/src/main/ipc/terminal.ts
  modified:
    - claude-sprite-desktop/package.json
    - claude-sprite-desktop/pnpm-workspace.yaml
    - claude-sprite-desktop/src/main/index.ts
    - claude-sprite-desktop/src/preload/index.ts
    - claude-sprite-desktop/src/renderer/src/lib/sprite-types.ts
    - claude-sprite-desktop/src/renderer/src/store/ui.ts
decisions:
  - "node-pty added to onlyBuiltDependencies in pnpm-workspace.yaml (pnpm v10 requires explicit approval of build scripts)"
  - "ipcMain.handle used for terminal:open/close (awaitable); ipcMain.on used for terminal:input/resize (fire-and-forget to avoid Promise overhead per keystroke)"
  - "before-quit hook kills all PTY sessions to prevent orphaned sprite console processes"
metrics:
  duration: "2 min"
  completed: "2026-03-19"
  tasks_completed: 2
  files_created: 2
  files_modified: 6
---

# Phase 03 Plan 01: Terminal Backend Infrastructure Summary

node-pty PTY manager, Electron IPC handlers, preload bridge, TypeScript types, and Zustand tab store for embedded sprite console terminals.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Install dependencies and configure ASAR unpack | 2ec08c8 | package.json, pnpm-workspace.yaml, pnpm-lock.yaml |
| 2 | Create PTY manager, IPC handlers, preload bridge, types, and store | 2e25c86 | pty-manager.ts, ipc/terminal.ts, index.ts, preload/index.ts, sprite-types.ts, store/ui.ts |

## What Was Built

**PTY Manager (`pty-manager.ts`):** A `Map<string, IPty>` keyed by sprite name. `openSession` kills any existing session for the same sprite before spawning `sprite console -s <name> -o <org>` with `xterm-256color`. Data and exit callbacks push to the caller. Four additional exports cover write, resize, kill (single), kill (all).

**IPC Handlers (`ipc/terminal.ts`):** Follows `registerDispatchHandlers` pattern exactly. `terminal:open` and `terminal:close` use `ipcMain.handle` (invoke/await pattern). `terminal:input` and `terminal:resize` use `ipcMain.on` (fire-and-forget) to eliminate Promise overhead on every keystroke. Output and exit events are pushed to renderer via namespaced channels (`terminal:output:{sprite}`, `terminal:exit:{sprite}`).

**Main Process (`index.ts`):** Added `registerTerminalHandlers(win)` after existing handlers. Added `app.on('before-quit')` hook calling `killAllSessions()` to prevent orphaned PTY processes when app closes.

**Preload Bridge (`preload/index.ts`):** Six terminal methods added to `window.spriteAPI`: `terminalOpen`, `terminalClose`, `terminalInput`, `terminalResize`, `onTerminalOutput`, `onTerminalExit`. Event listener methods return cleanup functions following the `onDispatchLog` pattern.

**Types (`sprite-types.ts`):** `TerminalTabInfo` interface (`sprite: SpriteInfo`, `status: 'connecting' | 'connected' | 'disconnected'`) added. Six terminal methods added to `SpriteAPI` interface with correct return types (Promise vs void).

**Store (`store/ui.ts`):** `showTerminalPanel`, `terminalTabs`, `activeTerminalSprite` state added. `addTerminalTab` deduplicates (switches to existing tab if present, otherwise pushes new tab with status 'connecting' and shows panel). `removeTerminalTab` handles active-tab switching and auto-hides panel when no tabs remain. `updateTerminalTabStatus` updates by sprite name.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Config] node-pty build scripts blocked by pnpm v10**
- **Found during:** Task 1
- **Issue:** pnpm v10 requires explicit opt-in for dependency build scripts. node-pty was silently skipped without native compilation.
- **Fix:** Added `onlyBuiltDependencies: [node-pty]` to `pnpm-workspace.yaml`. Re-ran `pnpm install` to trigger build. electron-builder's `postinstall` then rebuilt against Electron ABI.
- **Files modified:** `pnpm-workspace.yaml`
- **Commit:** 2ec08c8

## Verification

- `node -e "require('node-pty')"` exits 0
- `npx tsc --noEmit -p tsconfig.node.json --composite false` exits 0
- `npx tsc --noEmit -p tsconfig.web.json --composite false` exits 0
- package.json contains `build.asarUnpack` with `**/node_modules/node-pty/**`

## Self-Check: PASSED
