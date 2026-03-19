---
phase: 01-shell-dashboard
plan: "00"
subsystem: testing
tags: [vitest, electron, react, typescript, test-stubs]

# Dependency graph
requires: []
provides:
  - Vitest configuration for main process (node) and renderer test execution
  - Test stubs for all testable Phase 1 requirements (SHELL-02/03/04, DASH-01/02/03/04/05/06/07)
  - Behavioral contract test files for implementation plans 01-01 through 01-03
affects:
  - 01-shell-dashboard (plans 01-01, 01-02, 01-03 use these test files in verify steps)

# Tech tracking
tech-stack:
  added: [vitest]
  patterns: [test-stub-first (test.todo before implementation), TDD contract files]

key-files:
  created:
    - claude-sprite-desktop/vitest.config.ts
    - claude-sprite-desktop/src/main/ipc/sprites.test.ts
    - claude-sprite-desktop/src/main/config-store.test.ts
    - claude-sprite-desktop/src/preload/index.test.ts
    - claude-sprite-desktop/src/renderer/src/routes/SetupWizard.test.tsx
    - claude-sprite-desktop/src/renderer/src/components/SpriteCard.test.tsx
    - claude-sprite-desktop/src/renderer/src/components/modals/DestroyConfirmModal.test.tsx
    - claude-sprite-desktop/src/renderer/src/hooks/useSprites.test.ts
  modified: []

key-decisions:
  - "vitest.config.ts uses node environment (not jsdom) to cover both main process and renderer stubs without needing a DOM"
  - "All stubs use test.todo() so pnpm test --run reports todo/skipped not errors — allows tests to be run before implementation files exist"

patterns-established:
  - "Test stubs before scaffold: Wave 0 creates behavioral contracts that implementation plans verify against"
  - "test.todo() pattern: describes expected behavior without import dependencies, safe to run before source files exist"

requirements-completed: [SHELL-02, SHELL-03, SHELL-04, DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07]

# Metrics
duration: 1min
completed: 2026-03-19
---

# Phase 1 Plan 00: Test Stubs Summary

**Vitest config + 7 behavioral contract test files covering all 10 testable Phase 1 requirements using test.todo() stubs**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-19T15:21:54Z
- **Completed:** 2026-03-19T15:23:01Z
- **Tasks:** 1
- **Files modified:** 8

## Accomplishments
- Created `vitest.config.ts` with node environment and `@`-alias for renderer src
- Created 7 test stub files with `test.todo()` entries covering all 10 Phase 1 testable requirements
- Directory structure for `claude-sprite-desktop/src/` established (scaffold pre-dates Plan 01-01)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Vitest config and all 7 test stub files** - `e48ced8` (test)

**Plan metadata:** (committed below)

## Files Created/Modified
- `claude-sprite-desktop/vitest.config.ts` - Vitest config: globals, node environment, @ alias
- `claude-sprite-desktop/src/main/ipc/sprites.test.ts` - DASH-02/03/04/05 lifecycle IPC CLI arg stubs
- `claude-sprite-desktop/src/main/config-store.test.ts` - SHELL-03 config persistence + auto-import stubs
- `claude-sprite-desktop/src/preload/index.test.ts` - SHELL-04 contextBridge API shape stubs
- `claude-sprite-desktop/src/renderer/src/routes/SetupWizard.test.tsx` - SHELL-02 wizard step flow stubs
- `claude-sprite-desktop/src/renderer/src/components/SpriteCard.test.tsx` - DASH-01/06 card rendering and action button stubs
- `claude-sprite-desktop/src/renderer/src/components/modals/DestroyConfirmModal.test.tsx` - DASH-04 type-to-confirm guard stubs
- `claude-sprite-desktop/src/renderer/src/hooks/useSprites.test.ts` - DASH-07 polling interval stubs

## Decisions Made
- Used `test.todo()` (not `test.skip()`) so test runner reports them as "todo" not "skipped" — clearer signal that these are intentional stubs awaiting implementation
- Chose node environment in vitest.config.ts since stubs have no DOM imports; jsdom can be added per-file when renderer tests need it

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 7 test files ready as verify targets for plans 01-01, 01-02, 01-03
- Plans 01-01 through 01-03 can reference these paths in their `<verify>` blocks
- vitest.config.ts will need `@vitejs/plugin-react` added when renderer component tests require JSX compilation (plan 01-02)

---
*Phase: 01-shell-dashboard*
*Completed: 2026-03-19*
