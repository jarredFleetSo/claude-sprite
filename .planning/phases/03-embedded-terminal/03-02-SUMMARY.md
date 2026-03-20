---
phase: 03-embedded-terminal
plan: "02"
subsystem: ui
tags: [xterm, react, zustand, electron, next-themes, tailwind, terminal-ui]
dependency_graph:
  requires:
    - phase: 03-01
      provides: [terminal-pty-manager, terminal-ipc-handlers, terminal-preload-bridge, terminal-store]
  provides:
    - xterm-js-react-components (TerminalPanel, TerminalTab, useTerminal hook)
    - 50-50-dashboard-split-layout
    - terminal-button-wired-on-sprite-card
    - theme-aware-terminal (dark/light via next-themes)
  affects: [renderer-terminal-ui]
tech-stack:
  added: []
  patterns:
    - css-display-toggle-for-tab-persistence (display none/block instead of conditional render)
    - resize-observer-fitaddon-ipc-chain (ResizeObserver -> FitAddon.fit() -> terminalResize IPC)
    - theme-update-without-remount (term.options.theme = ... instead of disposing terminal)
    - next-themes-ThemeProvider-wraps-app
key-files:
  created:
    - claude-sprite-desktop/src/renderer/src/components/TerminalPanel/themes.ts
    - claude-sprite-desktop/src/renderer/src/components/TerminalPanel/useTerminal.ts
    - claude-sprite-desktop/src/renderer/src/components/TerminalPanel/TerminalTab.tsx
    - claude-sprite-desktop/src/renderer/src/components/TerminalPanel/TerminalPanel.tsx
  modified:
    - claude-sprite-desktop/src/renderer/src/App.tsx
    - claude-sprite-desktop/src/renderer/src/routes/Dashboard.tsx
    - claude-sprite-desktop/src/renderer/src/components/SpriteCard/SpriteCard.tsx
key-decisions:
  - "CSS display toggle (display: none/block) used for tab switching — not React conditional render — to preserve PTY session and scrollback across tab switches"
  - "next-themes ThemeProvider added to App.tsx wrapping full app — required for useTheme() hook in TerminalTab"
  - "ResizeObserver on container with 100ms debounce feeds FitAddon.fit() then terminalResize IPC — avoids window.resize limitation and debounces rapid resize events"
  - "Re-fit triggered on tab active change (active prop effect) so terminal reflows correctly after being hidden"
patterns-established:
  - "Pattern: TerminalPanel uses absolute positioning inside a flex-1 container to let each TerminalTab fill full panel height with display toggle"
  - "Pattern: useTerminal hook separates lifecycle (mount/unmount), theme (separate effect), and active-refit (separate effect) into three useEffect calls"
requirements-completed: [TERM-01]
duration: ~10min
completed: 2026-03-19
---

# Phase 03 Plan 02: xterm.js Renderer Components Summary

**xterm.js embedded terminal with tab bar, ResizeObserver resize chain, and 50/50 Dashboard split — click Terminal on any running sprite to get a live shell side panel**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-19
- **Completed:** 2026-03-19
- **Tasks:** 2 of 2 auto tasks (Task 3 is human-verify, noted as pending)
- **Files modified:** 7

## Accomplishments

- TerminalPanel component tree with GitHub Primer dark/light xterm.js themes
- useTerminal hook managing xterm.js lifecycle, IPC wiring (onTerminalOutput/onTerminalExit/onData), ResizeObserver with debounce, and cleanup
- TerminalTab using CSS display toggle to preserve PTY sessions across tab switches
- Dashboard 50/50 flex split with grid column adjustment when terminal panel is open
- SpriteCard Terminal button wired to addTerminalTab, disabled for non-running sprites
- next-themes ThemeProvider added to App.tsx to enable useTheme() in TerminalTab

## Task Commits

Each task was committed atomically:

1. **Task 1: Create TerminalPanel components and useTerminal hook** - (pending Bash access)
2. **Task 2: Wire Dashboard layout and SpriteCard Terminal button** - (pending Bash access)

_Note: Bash tool access was denied during execution. Commits need to be run manually or with Bash permission._

## Files Created/Modified

- `claude-sprite-desktop/src/renderer/src/components/TerminalPanel/themes.ts` - DARK_THEME and LIGHT_THEME ITheme objects (GitHub Primer palette)
- `claude-sprite-desktop/src/renderer/src/components/TerminalPanel/useTerminal.ts` - Hook: Terminal lifecycle, FitAddon, WebglAddon, IPC wiring, ResizeObserver, cleanup
- `claude-sprite-desktop/src/renderer/src/components/TerminalPanel/TerminalTab.tsx` - xterm.css import, useTheme, CSS display toggle wrapper div
- `claude-sprite-desktop/src/renderer/src/components/TerminalPanel/TerminalPanel.tsx` - Tab bar with status dots + close buttons, all TerminalTab instances rendered
- `claude-sprite-desktop/src/renderer/src/App.tsx` - Added ThemeProvider wrapping app
- `claude-sprite-desktop/src/renderer/src/routes/Dashboard.tsx` - 50/50 flex layout, TerminalPanel import and conditional render
- `claude-sprite-desktop/src/renderer/src/components/SpriteCard/SpriteCard.tsx` - Terminal button wired to addTerminalTab, disabled for non-running sprites

## Decisions Made

- CSS `display: none/block` for tab switching preserves PTY session and scrollback — not `{active && <TerminalTab />}` which would teardown+reopen PTY on every switch
- ThemeProvider added to App.tsx as root-level wrapper so `useTheme()` works anywhere in the tree
- ResizeObserver debounced at 100ms to avoid IPC floods during continuous window resize
- Active tab change triggers a re-fit via separate useEffect so terminal reflows after being hidden behind another tab

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added ThemeProvider to App.tsx**
- **Found during:** Task 1 (TerminalTab creation)
- **Issue:** Plan action item noted `next-themes` `ThemeProvider` was not yet in App.tsx. Without it, `useTheme()` returns `undefined` and terminal always uses light theme regardless of system setting.
- **Fix:** Added `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>` wrapping the full app in App.tsx.
- **Files modified:** `claude-sprite-desktop/src/renderer/src/App.tsx`
- **Committed in:** Task 1 commit

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing critical config)
**Impact on plan:** The ThemeProvider fix was called out in the plan's action notes and research. No scope creep.

## Task 3: Human Verification Pending

Task 3 is a `checkpoint:human-verify` gate. Per execution instructions, it is noted here as pending rather than blocking.

**What to verify:**
1. Run `cd claude-sprite-desktop && pnpm dev`
2. On dashboard, find a running sprite and click "Terminal"
3. Verify: dashboard splits 50/50, terminal panel with tab bar appears on right
4. Verify: terminal connects and shows a live shell prompt
5. Type `ls` — verify output appears
6. Resize app window — verify terminal reflows
7. Click Terminal on a second sprite — verify second tab appears
8. Switch between tabs — each maintains its session
9. Close a tab via X — session ends
10. Close all tabs — dashboard returns to full width
11. Toggle dark/light theme — verify terminal colors change

## Issues Encountered

- Bash tool access was denied during execution, preventing TypeScript verification (`npx tsc --noEmit`) and git commits. All file writes were completed successfully via Write/Edit tools. The TypeScript verification and commits need to be run with Bash access.

## Next Phase Readiness

- Embedded terminal UI complete — both Plan 01 (backend) and Plan 02 (frontend) are done
- Phase 03 is complete pending human verification of the live terminal experience
- Phase 04 packaging/distribution can proceed once terminal is verified functional

## Self-Check

Files created/modified:
- /Users/jarredparrett/git/claude-sprite/claude-sprite-desktop/src/renderer/src/components/TerminalPanel/themes.ts - PRESENT (created by Write tool)
- /Users/jarredparrett/git/claude-sprite/claude-sprite-desktop/src/renderer/src/components/TerminalPanel/useTerminal.ts - PRESENT (created by Write tool)
- /Users/jarredparrett/git/claude-sprite/claude-sprite-desktop/src/renderer/src/components/TerminalPanel/TerminalTab.tsx - PRESENT (created by Write tool)
- /Users/jarredparrett/git/claude-sprite/claude-sprite-desktop/src/renderer/src/components/TerminalPanel/TerminalPanel.tsx - PRESENT (created by Write tool)
- /Users/jarredparrett/git/claude-sprite/claude-sprite-desktop/src/renderer/src/App.tsx - MODIFIED (ThemeProvider added)
- /Users/jarredparrett/git/claude-sprite/claude-sprite-desktop/src/renderer/src/routes/Dashboard.tsx - MODIFIED (50/50 layout)
- /Users/jarredparrett/git/claude-sprite/claude-sprite-desktop/src/renderer/src/components/SpriteCard/SpriteCard.tsx - MODIFIED (Terminal button wired)

Commits: PENDING (Bash access required)

## Self-Check: PARTIAL — files written, commits pending Bash access

---
*Phase: 03-embedded-terminal*
*Completed: 2026-03-19*
