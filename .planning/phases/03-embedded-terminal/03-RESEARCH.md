# Phase 3: Embedded Terminal - Research

**Researched:** 2026-03-19
**Domain:** node-pty + xterm.js + Electron IPC + side panel layout
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Terminal placement:**
- Side panel: terminal opens on the right side, dashboard cards shrink to left column
- 50/50 split between cards and terminal panel
- Closing the terminal panel returns to full-width dashboard
- No persistent panel state — click Terminal to open, X to close

**Connection method:**
- node-pty in main process spawns `sprite console` for the selected sprite
- Data piped through IPC to xterm.js in renderer
- Auto-connect immediately when user clicks Terminal button — show connecting spinner, then shell ready
- No manual connect button

**Terminal appearance:**
- Theme follows app dark/light mode (not always-dark)
- Dark mode: dark terminal. Light mode: light terminal
- Matches the Linear aesthetic of the rest of the app

**Multi-terminal:**
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TERM-01 | Embedded xterm.js terminal connected to sprite via node-pty + IPC | Full coverage: node-pty spawn pattern, bidirectional IPC channels, xterm.js renderer component, resize propagation, multi-tab session management, ASAR unpack config |
</phase_requirements>

---

## Summary

This phase adds an embedded terminal to the Claude Sprite desktop app. The technical core is well-understood: node-pty spawns a PTY session in the Electron main process, data flows bidirectionally over IPC channels, and xterm.js renders the terminal in the React renderer. This is the same architecture used by VS Code's integrated terminal.

The unique aspects of this project are: (1) the PTY session must spawn `sprite console -s <name> -o <org>` rather than a local shell, and (2) multiple sprites can have concurrent terminal tabs, each backed by its own PTY process. The IPC channel multiplexing pattern already established for dispatch logs (`dispatch:log:{sprite}`) extends naturally to terminal I/O (`terminal:output:{sprite}`).

The most critical prerequisite is configuring node-pty's ASAR unpack settings before any renderer work begins. node-pty ships a native `spawn-helper` binary that must be extracted from the ASAR archive or PTY creation silently fails in packaged builds. This is a non-negotiable first task.

**Primary recommendation:** Install node-pty 1.1.0 (latest stable) + @xterm/xterm 6.0.0 (released 2025-12-22) + FitAddon. Wire ASAR unpack and @electron/rebuild before writing any UI. Follow the established per-sprite IPC channel pattern from dispatch.ts.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node-pty | 1.1.0 | Spawn PTY processes in main process | Microsoft-maintained, used by VS Code, native Electron support. 1.2.0-beta available but unstable. |
| @xterm/xterm | 6.0.0 | Terminal renderer in React renderer | Stable release 2025-12-22. The `xterm` (unscoped) package is the old name, frozen at 5.3.0. Use @xterm/xterm. |
| @xterm/addon-fit | 0.11.0 | Fit terminal to container element | Required for responsive resize; auto-computes cols/rows from DOM dimensions. |
| @electron/rebuild | 4.0.3 | Rebuild native addons for Electron's Node ABI | Required for node-pty; replaces deprecated electron-rebuild package. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @xterm/addon-webgl | 0.19.0 | GPU-accelerated renderer | Use when terminal is visible; falls back to canvas if WebGL unavailable. Significant perf improvement for fast output. |
| @xterm/addon-unicode11 | 0.9.0 | Unicode 11 character width support | Enable for correct emoji/CJK rendering in terminal output. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| node-pty 1.1.0 | node-pty 1.2.0-beta.12 | Beta released 2026-03-12; too fresh, no production validation. Use 1.1.0. |
| @xterm/xterm 6.0.0 | xterm 5.3.0 (unscoped) | Old package, frozen. 6.0.0 uses new @xterm scope, released Dec 2025. Use scoped package. |
| @xterm/addon-webgl | Canvas renderer (default) | WebGL is faster but adds a dependency. Worth it for terminal-heavy use. |

**Installation:**
```bash
# In claude-sprite-desktop/
pnpm add node-pty @xterm/xterm @xterm/addon-fit @xterm/addon-webgl @xterm/addon-unicode11
pnpm add -D @electron/rebuild
```

**Version verification (confirmed 2026-03-19 against npm registry):**
- node-pty: 1.1.0 (stable), 1.2.0-beta.12 (beta, skip)
- @xterm/xterm: 6.0.0 (stable, released 2025-12-22)
- @xterm/addon-fit: 0.11.0
- @xterm/addon-webgl: 0.19.0
- @xterm/addon-unicode11: 0.9.0
- @electron/rebuild: 4.0.3

---

## Architecture Patterns

### Recommended Project Structure

New files for this phase (additions to existing structure):

```
src/
├── main/
│   ├── ipc/
│   │   └── terminal.ts          # PTY lifecycle handlers (new)
│   └── pty-manager.ts           # PTY session Map, spawn/kill helpers (new)
├── preload/
│   └── index.ts                 # Add terminal API methods (extend existing)
└── renderer/src/
    ├── components/
    │   └── TerminalPanel/       # New feature directory
    │       ├── TerminalPanel.tsx    # Side panel container + tab bar
    │       ├── TerminalTab.tsx      # Individual xterm.js instance
    │       └── useTerminal.ts      # Hook: lifecycle, IPC wiring
    ├── store/
    │   └── ui.ts                # Extend: add terminal panel state + tab list
    └── routes/
        └── Dashboard.tsx        # Modify: 50/50 split layout when panel open
```

### Pattern 1: node-pty Session Management (main process)

**What:** A Map<string, IPty> keyed by sprite name holds all active PTY sessions. Handlers in terminal.ts register ipcMain.handle for open/close/input/resize.

**When to use:** Always — this is the only correct location for node-pty (native addon, main process only).

```typescript
// Source: node-pty official Electron example (github.com/microsoft/node-pty/tree/main/examples/electron)
// src/main/pty-manager.ts
import * as pty from 'node-pty'

const sessions = new Map<string, pty.IPty>()

export function openSession(
  spriteName: string,
  spriteOrg: string,
  cols: number,
  rows: number,
  onData: (data: string) => void,
  onExit: (code: number) => void
): void {
  // Kill existing session for this sprite if any
  const existing = sessions.get(spriteName)
  if (existing) {
    existing.kill()
    sessions.delete(spriteName)
  }

  const ptyProcess = pty.spawn('sprite', ['console', '-s', spriteName, '-o', spriteOrg], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.env.HOME,
    env: process.env as Record<string, string>,
  })

  ptyProcess.onData(onData)
  ptyProcess.onExit(({ exitCode }) => {
    sessions.delete(spriteName)
    onExit(exitCode)
  })

  sessions.set(spriteName, ptyProcess)
}

export function writeToSession(spriteName: string, data: string): void {
  sessions.get(spriteName)?.write(data)
}

export function resizeSession(spriteName: string, cols: number, rows: number): void {
  sessions.get(spriteName)?.resize(cols, rows)
}

export function killSession(spriteName: string): void {
  const p = sessions.get(spriteName)
  if (p) {
    p.kill()
    sessions.delete(spriteName)
  }
}
```

### Pattern 2: IPC Handler Registration (follow dispatch.ts pattern)

**What:** `registerTerminalHandlers(win)` in `src/main/ipc/terminal.ts`, matching the dispatch.ts pattern exactly.

**Per-sprite channel naming** (matches established convention):
- `terminal:open` — invoke/handle, opens PTY, returns `{ ok: boolean }`
- `terminal:close` — invoke/handle, kills PTY
- `terminal:input:{sprite}` — send/on, renderer → main (keystrokes)
- `terminal:output:{sprite}` — main push → renderer (PTY data)
- `terminal:exit:{sprite}` — main push → renderer (PTY exited)
- `terminal:resize:{sprite}` — send/on, renderer → main (cols/rows change)

```typescript
// src/main/ipc/terminal.ts
import { ipcMain, BrowserWindow } from 'electron'
import { openSession, writeToSession, resizeSession, killSession } from '../pty-manager'

export function registerTerminalHandlers(win: BrowserWindow): void {
  ipcMain.handle('terminal:open', async (_e, { sprite, org, cols, rows }: {
    sprite: string; org: string; cols: number; rows: number
  }) => {
    openSession(
      sprite, org, cols, rows,
      (data) => win.webContents.send(`terminal:output:${sprite}`, data),
      (code) => win.webContents.send(`terminal:exit:${sprite}`, { code })
    )
    return { ok: true }
  })

  ipcMain.handle('terminal:close', async (_e, { sprite }: { sprite: string }) => {
    killSession(sprite)
    return { ok: true }
  })

  ipcMain.on(`terminal:input`, (_e, { sprite, data }: { sprite: string; data: string }) => {
    writeToSession(sprite, data)
  })

  ipcMain.on(`terminal:resize`, (_e, { sprite, cols, rows }: {
    sprite: string; cols: number; rows: number
  }) => {
    resizeSession(sprite, cols, rows)
  })
}
```

Note: `terminal:input` and `terminal:resize` use `ipcMain.on` (fire-and-forget, no response needed), not `ipcMain.handle`. This avoids Promise overhead on every keystroke.

### Pattern 3: Preload API Extension

**What:** Add terminal methods to `window.spriteAPI` in the existing `src/preload/index.ts`. Follow the per-sprite listener pattern established by `onDispatchLog`.

```typescript
// Additions to contextBridge.exposeInMainWorld('spriteAPI', { ... })
// Source: existing preload/index.ts pattern

terminalOpen: (sprite: string, org: string, cols: number, rows: number) =>
  ipcRenderer.invoke('terminal:open', { sprite, org, cols, rows }),
terminalClose: (sprite: string) =>
  ipcRenderer.invoke('terminal:close', { sprite }),
terminalInput: (sprite: string, data: string) =>
  ipcRenderer.send('terminal:input', { sprite, data }),
terminalResize: (sprite: string, cols: number, rows: number) =>
  ipcRenderer.send('terminal:resize', { sprite, cols, rows }),
onTerminalOutput: (sprite: string, cb: (data: string) => void) => {
  const handler = (_: unknown, data: string) => cb(data)
  ipcRenderer.on(`terminal:output:${sprite}`, handler)
  return () => ipcRenderer.removeListener(`terminal:output:${sprite}`, handler)
},
onTerminalExit: (sprite: string, cb: (result: { code: number }) => void) => {
  const handler = (_: unknown, result: { code: number }) => cb(result)
  ipcRenderer.on(`terminal:exit:${sprite}`, handler)
  return () => ipcRenderer.removeListener(`terminal:exit:${sprite}`, handler)
},
```

### Pattern 4: xterm.js React Component

**What:** A React component that mounts xterm.js into a div via `useRef`, wires PTY data via IPC listeners, and uses ResizeObserver → FitAddon → IPC for resize propagation.

```typescript
// src/renderer/src/components/TerminalPanel/TerminalTab.tsx
import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import '@xterm/xterm/css/xterm.css'

interface TerminalTabProps {
  sprite: string
  org: string
  theme: 'dark' | 'light'
  active: boolean
}

export function TerminalTab({ sprite, org, theme, active }: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const fitAddon = new FitAddon()
    const unicode11 = new Unicode11Addon()
    const term = new Terminal({
      fontFamily: 'ui-monospace, "Cascadia Code", "Fira Code", monospace',
      fontSize: 13,
      theme: theme === 'dark' ? DARK_THEME : LIGHT_THEME,
      cursorStyle: 'bar',
      scrollback: 5000,
    })

    term.loadAddon(fitAddon)
    term.loadAddon(unicode11)
    term.unicode.activeVersion = '11'

    term.open(container)

    // WebGL renderer — load after open() so canvas exists
    try {
      const webgl = new WebglAddon()
      term.loadAddon(webgl)
    } catch {
      // WebGL unavailable; canvas renderer is the fallback
    }

    fitAddonRef.current = fitAddon
    termRef.current = term

    // CRITICAL: fit after DOM is laid out (non-zero dimensions)
    requestAnimationFrame(() => {
      fitAddon.fit()
      const { cols, rows } = term
      window.spriteAPI.terminalOpen(sprite, org, cols, rows)
    })

    // Keystroke → IPC → PTY
    const dataDispose = term.onData((data) => {
      window.spriteAPI.terminalInput(sprite, data)
    })

    // PTY output → xterm.js
    const cleanupOutput = window.spriteAPI.onTerminalOutput(sprite, (data) => {
      term.write(data)
    })

    // PTY exited
    const cleanupExit = window.spriteAPI.onTerminalExit(sprite, () => {
      term.write('\r\n[Connection closed]\r\n')
    })

    // Resize: ResizeObserver → FitAddon → IPC
    const observer = new ResizeObserver(() => {
      if (!containerRef.current) return
      fitAddon.fit()
      window.spriteAPI.terminalResize(sprite, term.cols, term.rows)
    })
    observer.observe(container)

    return () => {
      dataDispose.dispose()
      cleanupOutput()
      cleanupExit()
      observer.disconnect()
      window.spriteAPI.terminalClose(sprite)
      term.dispose()
    }
  }, [sprite, org])

  // Theme changes: update options without remounting
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = theme === 'dark' ? DARK_THEME : LIGHT_THEME
    }
  }, [theme])

  return (
    <div
      ref={containerRef}
      style={{ display: active ? 'block' : 'none', width: '100%', height: '100%' }}
    />
  )
}
```

### Pattern 5: Dashboard Layout with 50/50 Split

**What:** The `Dashboard.tsx` layout wraps sprite cards + terminal panel in a flex row when the panel is open. The terminal panel state lives in the existing `useUIStore`.

**Important:** DispatchPanel currently uses a Dialog/modal. The terminal panel is NOT a modal — it's a persistent side panel that changes the dashboard layout. This is a layout-level concern handled in Dashboard.tsx, not inside a Dialog component.

```typescript
// Zustand state additions to ui.ts
interface UIState {
  // ... existing fields ...
  showTerminalPanel: boolean
  setShowTerminalPanel: (show: boolean) => void
  terminalTabs: TerminalTab[]         // ordered list of open tabs
  addTerminalTab: (sprite: SpriteInfo) => void
  removeTerminalTab: (spriteName: string) => void
  activeTerminalSprite: string | null
  setActiveTerminalSprite: (name: string | null) => void
}

// TerminalTab type
interface TerminalTab {
  sprite: SpriteInfo
  status: 'connecting' | 'connected' | 'disconnected'
}
```

```typescript
// Dashboard.tsx layout change
<main className="flex-1 flex overflow-hidden">
  {/* Sprite cards — full width or left half */}
  <div className={showTerminalPanel ? 'w-1/2 overflow-y-auto p-6' : 'flex-1 p-6'}>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* ... sprite cards ... */}
    </div>
  </div>

  {/* Terminal panel — right half, shown conditionally */}
  {showTerminalPanel && (
    <div className="w-1/2 border-l flex flex-col">
      <TerminalPanel />
    </div>
  )}
</main>
```

### Pattern 6: xterm.js Theme Objects

**What:** xterm.js accepts an `ITheme` object. These values match the app's CSS variables already defined in `main.css`.

```typescript
// Source: xterm.js ITheme interface (xtermjs.org/docs/api/interfaces/ITheme)
const DARK_THEME = {
  background: '#0d1117',    // close to hsl(222.2 84% 4.9%) = app dark background
  foreground: '#e6edf3',
  cursor: '#e6edf3',
  selectionBackground: '#3d444d',
  black: '#484f58',
  red: '#ff7b72',
  green: '#3fb950',
  yellow: '#d29922',
  blue: '#58a6ff',
  magenta: '#bc8cff',
  cyan: '#39c5cf',
  white: '#b1bac4',
  brightBlack: '#6e7681',
  brightRed: '#ffa198',
  brightGreen: '#56d364',
  brightYellow: '#e3b341',
  brightBlue: '#79c0ff',
  brightMagenta: '#d2a8ff',
  brightCyan: '#56d4dd',
  brightWhite: '#f0f6fc',
}

const LIGHT_THEME = {
  background: '#ffffff',    // app light background
  foreground: '#24292f',
  cursor: '#24292f',
  selectionBackground: '#d0d7de',
  black: '#24292f',
  red: '#cf222e',
  green: '#116329',
  yellow: '#4d2d00',
  blue: '#0969da',
  magenta: '#8250df',
  cyan: '#1b7c83',
  white: '#6e7781',
  brightBlack: '#57606a',
  brightRed: '#a40e26',
  brightGreen: '#1a7f37',
  brightYellow: '#633c01',
  brightBlue: '#218bff',
  brightMagenta: '#a475f9',
  brightCyan: '#3192aa',
  brightWhite: '#8c959f',
}
```

These are GitHub's Primer light/dark color palettes — the same design language as Linear's aesthetic. Claude's discretion applies to adjusting these values.

### Anti-Patterns to Avoid

- **Importing node-pty in renderer:** node-pty is a native addon. It must live in main process only. Never put it in `src/renderer/`.
- **Calling `fitAddon.fit()` before `term.open(container)`:** The terminal has no DOM attachment, fit will return undefined dimensions. Always call `open()` first, then `fit()` in `requestAnimationFrame`.
- **Using `window.resize` event for terminal resize:** Window resize events miss panel resize (the panel can change size without the window resizing). Use `ResizeObserver` on the container element.
- **Sharing a single IPC channel for all terminals:** Each sprite tab needs its own `terminal:output:{sprite}` channel. The per-sprite namespace pattern is already established in the codebase.
- **Using `ipcMain.on` for terminal:open/close:** Use `ipcMain.handle` for operations that need confirmation back. Use `ipcMain.on` (fire-and-forget) for high-frequency keystrokes and resize events.
- **Not CSS-importing xterm.css:** xterm.js requires `@xterm/xterm/css/xterm.css` to be imported in the renderer. Without it the terminal renders invisibly.
- **Leaving PTY processes alive when tabs close:** Always call `killSession(sprite)` on tab close and `term.dispose()` on component unmount. Orphaned PTY processes accumulate and drain SSH connections.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Terminal rendering | Custom canvas terminal | @xterm/xterm 6.0.0 | Full VT100/xterm escape code support, GPU renderer, accessibility, selection, search |
| PTY process | child_process.spawn with manual pty | node-pty | PTY requires OS-level pseudo-terminal allocation (openpty/forkpty), not just process spawning |
| Terminal resize | Manual cols/rows calculation | FitAddon.fit() | Handles font metrics, DPI scaling, container padding, border-box sizing |
| WebGL renderer | Custom WebGL shader | WebglAddon | 10+ years of rendering optimization, fallback to canvas on WebGL failure |
| IPC channel cleanup | Global listener registry | Per-component removeListener pattern | Already established in codebase (dispatch.ts); apply same pattern |

**Key insight:** The node-pty + xterm.js combination is a complete terminal stack. Every piece has cross-platform edge cases (Windows ConPTY, macOS TIOCSWINSZ signals, Linux PTY allocation) that took years to solve. Don't touch this plumbing.

---

## Common Pitfalls

### Pitfall 1: ASAR Unpack Not Configured — Terminal Silently Broken in Packaged Builds

**What goes wrong:** node-pty ships `spawn-helper` (a native executable, not a .node file). Electron's auto-detection only unpacks `.node` files from ASAR. `spawn-helper` stays archived and PTY creation fails at runtime — but only in packaged builds, not in `pnpm dev`. This is a packaging-time bug invisible during development.

**Why it happens:** electron-builder bundles everything into an ASAR virtual filesystem. Executables cannot run from inside ASAR.

**How to avoid:** Add `asarUnpack` to electron-builder config before any other terminal work.

```json
// In package.json "build" section (electron-builder config)
{
  "build": {
    "asar": true,
    "asarUnpack": ["**/node_modules/node-pty/**"]
  }
}
```

The project currently has no `"build"` key in `package.json` — this must be added.

**Warning signs:** Terminal works in `pnpm dev` but crashes or shows no output in `pnpm build:unpack`.

### Pitfall 2: @electron/rebuild Not Running After npm install

**What goes wrong:** node-pty is compiled against the system Node.js, not Electron's embedded Node.js. The two have different ABIs. Without rebuilding, `require('node-pty')` throws "was compiled against a different Node.js version".

**How to avoid:** The project already has `"postinstall": "electron-builder install-app-deps"` in package.json, which triggers native module rebuild. Verify this actually runs by checking `out/` for the rebuilt `.node` file after install.

**Warning signs:** Error message containing "NODE_MODULE_VERSION" or "Invalid ELF header" on `require('node-pty')`.

### Pitfall 3: Terminal Resize Not Wired — Vim/Tmux Break

**What goes wrong:** The user opens vim or tmux inside the sprite shell. The terminal panel renders at the correct visible size, but the PTY's col/row count is stale (set at connect time). Line wrapping is wrong, vim status bars appear in the middle of the screen.

**How to avoid:** Wire `ResizeObserver` on the xterm container → `fitAddon.fit()` → `window.spriteAPI.terminalResize()` → `ipcMain.on('terminal:resize')` → `ptyProcess.resize(cols, rows)`. This chain must be complete from day one.

**Warning signs:** `vim` displays "E348: No string under cursor" or status bar in wrong position after window resize.

### Pitfall 4: xterm.css Not Imported — Terminal Invisible

**What goes wrong:** xterm.js renders a canvas element but applies its styling via a CSS file. Without `import '@xterm/xterm/css/xterm.css'` in the TerminalTab component (or global CSS), the terminal container has zero height and nothing is visible.

**How to avoid:** Import the CSS in `TerminalTab.tsx` or in the renderer's `main.css`.

**Warning signs:** xterm container div exists in DOM but has height:0, terminal content invisible.

### Pitfall 5: Terminal Panel Uses Dialog Component (Wrong Pattern)

**What goes wrong:** DispatchPanel uses Radix `<Dialog>` (a modal overlay). Copying that pattern for the terminal panel would render the terminal in a modal, not a side panel. The 50/50 layout split requires a DOM-level layout change in `Dashboard.tsx`, not a portal/overlay.

**How to avoid:** The terminal panel is a sibling `<div>` inside the main flex container in `Dashboard.tsx` — conditionally rendered based on `showTerminalPanel` state. It is NOT a Dialog, Sheet, or drawer component.

### Pitfall 6: Tab Switching Remounts xterm.js

**What goes wrong:** If each tab's `<TerminalTab>` is unmounted when not active and remounted on switch, xterm.js and its PTY connection are torn down and re-established on every tab switch. Users lose their scrollback and the connection.

**How to avoid:** Use CSS `display: none` / `display: block` to hide/show inactive tabs, not React conditional rendering. The PTY session and terminal instance must persist across tab switches. See the `active` prop in the TerminalTab pattern above.

### Pitfall 7: IPC Listener Leak on Repeated Panel Open/Close

**What goes wrong:** `onTerminalOutput` and `onTerminalExit` register `ipcRenderer.on` listeners. If the component mounts/unmounts multiple times (user opens and closes the terminal panel), listeners accumulate. Each listener receives and processes the same PTY data, causing duplicate rendering and memory growth.

**How to avoid:** The `useEffect` cleanup function must call the unsubscribe function returned by `onTerminalOutput` / `onTerminalExit`. This is already the established pattern in dispatch hooks — follow it exactly.

---

## Code Examples

### Verified: `sprite console` command syntax

From `cli/cs-rs/src/attach.rs`, the `cs attach` command connects to a sprite via `sprite console`. The `sprite console` command accepts:

```bash
# From attach.rs pattern (exec_tty_with_env approach):
sprite console -s <sprite-name> -o <org-name>
```

node-pty spawns this as:
```typescript
pty.spawn('sprite', ['console', '-s', spriteName, '-o', spriteOrg], {
  name: 'xterm-256color',
  cols,
  rows,
  cwd: process.env.HOME,
  env: process.env as Record<string, string>,
})
```

The `name: 'xterm-256color'` TERM value is important — attach.rs explicitly handles TERM override (`fixed_term = term.replace("ghostty", "256color")`). Setting `xterm-256color` directly avoids this issue.

### Verified: electron-builder asarUnpack format

```json
{
  "build": {
    "appId": "com.claudesprite.desktop",
    "asar": true,
    "asarUnpack": ["**/node_modules/node-pty/**"],
    "mac": {
      "target": "dmg"
    }
  }
}
```

This is the only format that reliably extracts node-pty's `spawn-helper`. The `"**/node_modules/node-pty/**"` glob covers both the `.node` file and the `spawn-helper` executable.

### Verified: Theme switching without remount

```typescript
// Update theme without destroying the terminal instance
useEffect(() => {
  if (termRef.current) {
    termRef.current.options.theme = theme === 'dark' ? DARK_THEME : LIGHT_THEME
  }
}, [theme])
```

`Terminal.options` is a mutable property in xterm.js 6.x that triggers a re-render without disposal.

### Verified: How to detect current theme

The app uses `next-themes` (already installed, `"next-themes": "^0.4.6"`). The renderer can read the current theme via:

```typescript
import { useTheme } from 'next-themes'

const { resolvedTheme } = useTheme()
const termTheme = resolvedTheme === 'dark' ? 'dark' : 'light'
```

However, `next-themes` `ThemeProvider` must wrap the app. Check if it's currently in App.tsx (it is not yet). Adding `ThemeProvider` is a Wave 0 prerequisite if theme-aware terminal is required from the start.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `xterm` (unscoped npm) | `@xterm/xterm` (scoped) | ~2023 | Old package frozen at 5.3.0. Use scoped package for 6.x. |
| `electron-rebuild` CLI | `@electron/rebuild` | 2022 | Old package deprecated; `@electron/rebuild` is the official successor. |
| `ipcRenderer.on` directly in components | preload contextBridge with typed methods | Electron 12+ (2021) | contextIsolation default changed; direct ipcRenderer access in renderer is deprecated |
| Polling for terminal output | `ptyProcess.onData` + IPC push | Always correct | Already established in dispatch streaming pattern |
| xterm.js FitAddon resize via `window.resize` | ResizeObserver on container element | Best practice | `window.resize` misses panel-level layout changes |

**Deprecated/outdated:**
- `xterm` npm package: frozen at 5.3.0, replaced by `@xterm/xterm`
- `electron-rebuild` npm package: replaced by `@electron/rebuild`
- `nodeIntegration: true` / `contextIsolation: false`: security anti-pattern, Electron 20+ sandboxes preload by default

---

## Open Questions

1. **`next-themes` ThemeProvider not yet in App.tsx**
   - What we know: `next-themes` is installed (`^0.4.6`). The CSS defines `.dark` class. But `App.tsx` does not currently use `ThemeProvider`.
   - What's unclear: Does the dark mode toggle currently work? Or is it not yet implemented?
   - Recommendation: Wave 0 should add `ThemeProvider` to `App.tsx` if not present, then `useTheme()` works in terminal component.

2. **`sprite console` exact flag syntax**
   - What we know: `attach.rs` uses `sprite console` implicitly via `exec_tty`. The flags `-s` and `-o` are inferred from CLI patterns.
   - What's unclear: Exact `sprite console` subcommand and flag names should be verified against `sprite --help` on a live machine before coding.
   - Recommendation: Implementer should run `sprite console --help` and confirm flag names before the terminal:open handler.

3. **electron-builder config location**
   - What we know: Current `package.json` has no `"build"` key. electron-builder can read from `package.json["build"]`, `electron-builder.yml`, or `electron-builder.json`.
   - What's unclear: The project uses `electron-builder install-app-deps` in postinstall but hasn't configured the builder for packaging yet (that's Phase 4).
   - Recommendation: Add `"build"` key to `package.json` now (at minimum `asarUnpack`) so node-pty works in packaged builds even before full packaging work.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 3.1.1 |
| Config file | `claude-sprite-desktop/vitest.config.ts` |
| Quick run command | `cd claude-sprite-desktop && pnpm test --run` |
| Full suite command | `cd claude-sprite-desktop && pnpm test --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TERM-01 | PTY session opens and is tracked in sessions Map | unit | `pnpm test --run src/main/ipc/terminal.test.ts` | Wave 0 |
| TERM-01 | PTY session closes on killSession | unit | `pnpm test --run src/main/ipc/terminal.test.ts` | Wave 0 |
| TERM-01 | IPC terminal:open handler opens session and returns ok | unit | `pnpm test --run src/main/ipc/terminal.test.ts` | Wave 0 |
| TERM-01 | IPC terminal:close kills session | unit | `pnpm test --run src/main/ipc/terminal.test.ts` | Wave 0 |
| TERM-01 | Resize propagates cols/rows to pty-manager | unit | `pnpm test --run src/main/ipc/terminal.test.ts` | Wave 0 |
| TERM-01 | Terminal panel shows/hides in ui store | unit | `pnpm test --run src/renderer/src/store/ui.test.ts` | Wave 0 |
| TERM-01 | Tab add/remove/switch in ui store | unit | `pnpm test --run src/renderer/src/store/ui.test.ts` | Wave 0 |
| TERM-01 | Terminal renders visible in DOM | integration | `pnpm test --run src/renderer/src/components/TerminalPanel/TerminalPanel.test.tsx` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd claude-sprite-desktop && pnpm test --run`
- **Per wave merge:** `cd claude-sprite-desktop && pnpm test --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/main/ipc/terminal.test.ts` — covers PTY lifecycle (open/close/resize/write) with node-pty mocked
- [ ] `src/renderer/src/store/ui.test.ts` — extend existing store tests for terminal panel + tab state
- [ ] `src/renderer/src/components/TerminalPanel/TerminalPanel.test.tsx` — smoke test for panel rendering (xterm.js needs jsdom + canvas mock)
- [ ] Canvas mock for xterm.js in jsdom: `npm add -D jest-canvas-mock` or vitest equivalent — xterm.js uses HTMLCanvasElement which is not in jsdom by default

---

## Sources

### Primary (HIGH confidence)
- node-pty GitHub (microsoft/node-pty) — spawn API, Electron example, ASAR requirements
- Electron IPC docs (electronjs.org/docs/latest/tutorial/ipc) — ipcMain.handle vs ipcMain.on patterns
- npm registry (2026-03-19) — verified versions: node-pty 1.1.0, @xterm/xterm 6.0.0, @xterm/addon-fit 0.11.0, @xterm/addon-webgl 0.19.0, @electron/rebuild 4.0.3
- Project source: `dispatch.ts`, `preload/index.ts`, `sprite-types.ts` — established IPC channel conventions
- Project source: `attach.rs` — `sprite console` command usage pattern
- Project source: `main.css` — dark/light CSS variable values for xterm.js theme objects

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` — bidirectional PTY IPC pattern (pre-existing research)
- `.planning/research/PITFALLS.md` — node-pty ASAR unpack, resize pitfalls (pre-existing research)
- electron-builder docs — asarUnpack glob pattern for native modules

### Tertiary (LOW confidence)
- xterm.js ITheme color values — GitHub Primer palette mapped to ITheme fields; exact hex values should be verified against live app dark/light mode rendering

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified against npm registry 2026-03-19
- Architecture: HIGH — follows established patterns already in codebase (dispatch.ts, preload/index.ts)
- Pitfalls: HIGH — sourced from pre-existing PITFALLS.md research + direct codebase inspection
- Theme values: MEDIUM — reasonable defaults, Claude has discretion to adjust

**Research date:** 2026-03-19
**Valid until:** 2026-06-19 (stable stack; node-pty 1.1.0 is production-ready, @xterm/xterm 6.0.0 just released)
