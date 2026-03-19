# Phase 3: Embedded Terminal - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Embed an xterm.js terminal inside the desktop app connected to a running sprite shell via node-pty. Users can open a terminal for any sprite directly from the dashboard. Creating/managing tmux sessions, terminal multiplexing, or shell customization are not in scope.

</domain>

<decisions>
## Implementation Decisions

### Terminal placement
- Side panel: terminal opens on the right side, dashboard cards shrink to left column
- 50/50 split between cards and terminal panel
- Closing the terminal panel returns to full-width dashboard
- No persistent panel state — click Terminal to open, X to close

### Connection method
- node-pty in main process spawns `sprite console` for the selected sprite
- Data piped through IPC to xterm.js in renderer
- Auto-connect immediately when user clicks Terminal button — show connecting spinner, then shell ready
- No manual connect button

### Terminal appearance
- Theme follows app dark/light mode (not always-dark)
- Dark mode: dark terminal. Light mode: light terminal
- Matches the Linear aesthetic of the rest of the app

### Multi-terminal
- Tab bar at top of terminal panel
- Clicking Terminal on different sprites adds tabs
- User can switch between connected sprite terminals
- Each tab maintains its own pty session

### Claude's Discretion
- Font size and family (reasonable dev defaults)
- Scrollback buffer size
- Cursor style (bar/block/underline)
- Tab close behavior (kill pty immediately or confirm)
- Resize debounce timing
- Terminal light mode color palette

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing CLI (reference for sprite console)
- `cli/cs-rs/src/attach.rs` — How `cs attach` connects to sprite via `sprite console` + tmux
- `cli/cs-rs/src/sprite.rs` — SpriteClient `exec_tty()` mode for process replacement

### Research (Electron + terminal architecture)
- `.planning/research/ARCHITECTURE.md` — node-pty + xterm.js IPC pattern, ASAR unpack requirements
- `.planning/research/PITFALLS.md` — node-pty rebuild issues, terminal resize propagation

### Prior phase patterns
- `.planning/phases/01-shell-dashboard/01-CONTEXT.md` — Linear aesthetic, shadcn/ui, dark+light themes
- `claude-sprite-desktop/src/main/ipc/dispatch.ts` — Per-sprite IPC channel pattern to follow
- `claude-sprite-desktop/src/preload/index.ts` — Existing preload bridge pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/main/cli.ts`: `spawnCsCommand()` and `spawnCsStreaming()` — can extend for pty spawning
- `src/preload/index.ts`: Per-sprite event channel pattern (`dispatch:log:${sprite}`) — same pattern for terminal I/O
- `src/renderer/src/store/ui.ts`: Zustand store for UI state — extend for terminal panel + tabs

### Established Patterns
- IPC: `ipcMain.handle` for request-response, `webContents.send` for push streams
- Per-sprite namespacing: `${channel}:${sprite}` for multiplexed streams
- Component structure: feature directories (`DispatchPanel/`, `SpriteCard/`)

### Integration Points
- `SpriteCard.tsx`: Terminal button already exists in quick actions — wire to open terminal panel
- `Dashboard.tsx` or `App.tsx`: Add terminal side panel layout
- `sprite-types.ts`: Add terminal-related types to SpriteAPI interface

</code_context>

<specifics>
## Specific Ideas

- Side panel like VS Code's panel or Slack's thread view — slides in from right
- Tabs should show sprite name and a colored dot for connection status
- When all tabs are closed, panel closes and dashboard goes full-width

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-embedded-terminal*
*Context gathered: 2026-03-19*
