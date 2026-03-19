---
phase: 02-dispatch-file-sync
plan: 01
subsystem: ipc
tags: [electron, ipc, child_process, dispatch, sync, notifications, vitest]

# Dependency graph
requires:
  - phase: 01-shell-dashboard
    provides: SpriteAPI interface, IPC registration pattern (registerXxxHandlers), preload push channel pattern (onLifecycleProgress), cli.ts runSpriteCommand

provides:
  - dispatch:launch IPC handler — spawns cs dispatch, polls cs logs, detects DISPATCH_DONE, fires OS Notification
  - dispatch:abort IPC handler — stops local polling + kills remote tmux window via cs abort
  - sync:push IPC handler — spawns cs sync . <sprite>, streams progress via per-sprite channel
  - sync:pull IPC handler — spawns cs context pull <sprite>, streams progress via per-sprite channel
  - 8 preload bridge methods (dispatch, abortDispatch, onDispatchLog, onDispatchDone, syncPush, syncPull, onSyncProgress, onSyncDone)
  - Extended SpriteAPI type (DispatchResult, AbortResult, SyncResult interfaces)
  - AppConfig.autoSyncBeforeDispatch flag
  - stripAnsi utility for cleaning CLI progress output
  - 11 passing unit tests covering all 7 requirements (DISP-01–04, SYNC-01–03)

affects: [02-02-dispatch-ui, 02-03-sync-ui, all Phase 2 plans]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Per-sprite namespaced IPC channels (dispatch:log:{sprite}, sync:progress:{sprite}) for concurrent multi-sprite support
    - Two-phase dispatch flow: cs dispatch (fire-and-forget setup) then 1s polling loop on cs logs for live Claude output
    - DISPATCH_DONE sentinel detection in log polling to trigger completion event and OS notification
    - vitest with vi.resetModules() + dynamic import in beforeEach for isolated IPC handler mocking

key-files:
  created:
    - claude-sprite-desktop/src/main/ipc/dispatch.ts
    - claude-sprite-desktop/src/main/ipc/sync.ts
    - claude-sprite-desktop/src/renderer/src/lib/ansi.ts
    - claude-sprite-desktop/src/main/ipc/dispatch.test.ts
    - claude-sprite-desktop/src/main/ipc/sync.test.ts
  modified:
    - claude-sprite-desktop/src/renderer/src/lib/sprite-types.ts
    - claude-sprite-desktop/src/main/cli.ts
    - claude-sprite-desktop/src/main/index.ts
    - claude-sprite-desktop/src/preload/index.ts
    - claude-sprite-desktop/src/main/config-store.ts

key-decisions:
  - "Per-sprite namespaced channels (dispatch:log:{sprite}) used for all push channels to support concurrent dispatches"
  - "Two-phase dispatch: cs dispatch streams setup output then exits; 1s polling loop on cs logs reads Claude output"
  - "DISPATCH_DONE sentinel detection in polled logs rather than cs dispatch --status polling"
  - "spawnCsStreaming returns ChildProcess reference (not wrapped Promise) for abort kill support"

patterns-established:
  - "Pattern: IPC handler files export registerXxxHandlers(win: BrowserWindow): void — wired in main/index.ts"
  - "Pattern: Preload listener methods return cleanup function: () => ipcRenderer.removeListener(...)"
  - "Pattern: Per-sprite channels keyed as channel:sprite-name for multi-sprite concurrency"
  - "Pattern: TDD with vi.resetModules() + dynamic import in beforeEach for isolated Electron IPC mock"

requirements-completed: [DISP-01, DISP-02, DISP-03, DISP-04, SYNC-01, SYNC-02, SYNC-03]

# Metrics
duration: 3min
completed: 2026-03-19
---

# Phase 2 Plan 01: Dispatch and Sync IPC Backend Summary

**Electron IPC backend for cs dispatch (fire-and-forget + log polling) and cs sync/context-pull with per-sprite namespaced streaming channels, OS notifications, and 11 unit tests**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-19T13:02:14Z
- **Completed:** 2026-03-19T13:05:34Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- dispatch.ts implements two-phase dispatch: spawns cs dispatch for setup output, then starts 1s polling loop on cs logs to stream Claude's live output; detects DISPATCH_DONE sentinel to fire OS Notification and emit dispatch:done event
- sync.ts implements sync:push (cs sync . <sprite>) and sync:pull (cs context pull <sprite>) with streaming progress via per-sprite namespaced channels
- 8 preload bridge methods added following existing cleanup-return pattern; SpriteAPI interface fully extended
- 11 unit tests covering all 7 requirement IDs pass; pnpm build exits 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend types, create dispatch/sync IPC handlers, wire preload** - `3775649` (feat)
2. **Task 2: Unit tests for dispatch and sync IPC handlers** - `d83fc92` (test)

## Files Created/Modified

- `claude-sprite-desktop/src/main/ipc/dispatch.ts` — dispatch:launch and dispatch:abort IPC handlers
- `claude-sprite-desktop/src/main/ipc/sync.ts` — sync:push and sync:pull IPC handlers
- `claude-sprite-desktop/src/renderer/src/lib/ansi.ts` — stripAnsi utility
- `claude-sprite-desktop/src/main/ipc/dispatch.test.ts` — 6 tests covering DISP-01–04 and SYNC-03
- `claude-sprite-desktop/src/main/ipc/sync.test.ts` — 5 tests covering SYNC-01 and SYNC-02
- `claude-sprite-desktop/src/renderer/src/lib/sprite-types.ts` — DispatchResult, AbortResult, SyncResult types; SpriteAPI extended; AppConfig.autoSyncBeforeDispatch added
- `claude-sprite-desktop/src/main/cli.ts` — spawnCsCommand and spawnCsStreaming added
- `claude-sprite-desktop/src/main/index.ts` — registerDispatchHandlers and registerSyncHandlers wired
- `claude-sprite-desktop/src/preload/index.ts` — 8 new bridge methods added
- `claude-sprite-desktop/src/main/config-store.ts` — autoSyncBeforeDispatch field added to local AppConfig interface

## Decisions Made

- Per-sprite namespaced channels (`dispatch:log:${sprite}`) used throughout — enables concurrent multi-sprite dispatches without routing ambiguity
- Two-phase dispatch flow: cs dispatch is fire-and-forget (exits after tmux launch), so streaming setup output then switching to 1s polling on `cs logs <sprite>` is the only way to show live Claude output
- DISPATCH_DONE sentinel detection chosen over cs dispatch --status polling — simpler, already supported by existing cs CLI
- `spawnCsStreaming` returns bare `ChildProcess` (not a Promise wrapper) so dispatch handler can track the reference for abort kill support

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] config-store.ts local AppConfig missing autoSyncBeforeDispatch field**
- **Found during:** Task 2 (unit tests) — pnpm build failed with TS2339: Property 'autoSyncBeforeDispatch' does not exist on type
- **Issue:** config-store.ts defines its own local `AppConfig` interface that didn't include the new `autoSyncBeforeDispatch` field added to the shared type in sprite-types.ts; TypeScript treats these as separate types
- **Fix:** Added `autoSyncBeforeDispatch?: boolean` to config-store.ts local AppConfig interface
- **Files modified:** claude-sprite-desktop/src/main/config-store.ts
- **Verification:** pnpm build exits 0, tsc --noEmit passes
- **Committed in:** d83fc92 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Required for build to succeed. No scope creep.

## Issues Encountered

- SYNC-03 test initially failed because `vi.resetModules()` in `beforeEach` caused the `loadConfig` mock reference to become stale — fixed by importing config-store module after reset and using the fresh `vi.mocked()` reference

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 7 Phase 2 IPC requirements satisfied (DISP-01–04, SYNC-01–03)
- Stable IPC contract for Plan 02 (dispatch UI) and Plan 03 (sync UI) to build against
- Per-sprite channel namespacing supports concurrent dispatches — UI can open multiple DispatchPanels simultaneously without IPC changes
- window.spriteAPI type is fully extended — React components can call dispatch/sync methods with TypeScript type safety

---
*Phase: 02-dispatch-file-sync*
*Completed: 2026-03-19*
