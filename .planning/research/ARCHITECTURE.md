# Architecture Patterns

**Domain:** Electron + React desktop app wrapping a Rust CLI
**Project:** Claude Sprite Desktop
**Researched:** 2026-03-19

## Recommended Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Electron Main Process               │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │  CLI Bridge  │  │  PTY Manager │  │ App Menu │  │
│  │  (cs / sprite│  │  (node-pty)  │  │ Lifecycle│  │
│  │   shelling   │  │              │  │          │  │
│  │   out)       │  │              │  │          │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┘  │
│         │                 │                          │
│  ┌──────▼─────────────────▼──────────────────────┐  │
│  │              IPC Handler Layer                  │  │
│  │  ipcMain.handle() + ipcMain.on() channels      │  │
│  └─────────────────────┬──────────────────────────┘  │
└────────────────────────┼────────────────────────────┘
                         │  contextBridge (preload.ts)
┌────────────────────────▼────────────────────────────┐
│                  Renderer Process                     │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │              React Application                │   │
│  │                                               │   │
│  │  ┌────────────┐  ┌──────────┐  ┌──────────┐ │   │
│  │  │  Dashboard  │  │ Dispatch │  │ Terminal │ │   │
│  │  │  (sprite    │  │  Panel   │  │ (xterm.js│ │   │
│  │  │   list)     │  │          │  │ embedded)│ │   │
│  │  └────────────┘  └──────────┘  └──────────┘ │   │
│  │                                               │   │
│  │  ┌──────────────────────────────────────┐    │   │
│  │  │         Zustand Store (renderer)      │    │   │
│  │  └──────────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

### Component Boundaries

| Component | Process | Responsibility | Communicates With |
|-----------|---------|---------------|-------------------|
| CLI Bridge | Main | Spawns `cs` / `sprite` binaries, streams stdout | IPC Handler Layer |
| PTY Manager | Main | Manages node-pty processes for embedded terminal | IPC Handler Layer |
| IPC Handler Layer | Main | Routes ipcMain.handle/on calls, validates origin | CLI Bridge, PTY Manager, Renderer |
| Preload Script | Bridge | Exposes safe window.electronAPI via contextBridge | Main (IPC), Renderer (window) |
| Dashboard | Renderer | Sprite listing with live status, polling Sprite API | Zustand, IPC |
| Dispatch Panel | Renderer | Fire-and-forget Claude tasks, view dispatch log | Zustand, IPC |
| Terminal Component | Renderer | xterm.js UI, receives PTY output, sends keystrokes | IPC (via window.electronAPI) |
| Zustand Store | Renderer | Client-side UI state: sprites list, dispatch status | React components |

## Process Model

### Main Process

The main process is the Node.js entry point (single instance). It has full access to Node.js APIs including `child_process`, `fs`, and native modules. It manages:

- Window lifecycle (BrowserWindow creation, app menu)
- Spawning `cs` and `sprite` CLI processes via `child_process.spawn`
- PTY sessions via `node-pty` for the embedded terminal
- Stripe API HTTP calls (optional: faster than shelling out for list/status)
- All ipcMain.handle and ipcMain.on registrations

The renderer process cannot directly access Node.js APIs. All privileged operations route through IPC to the main process.

### Renderer Process

The renderer is a Chromium-based browser environment running React. With context isolation (mandatory default since Electron 12), renderer code has no direct access to Node.js or Electron internals. All backend access goes through the contextBridge-exposed `window.electronAPI`.

### Preload Script

The preload script runs in a privileged context with access to both Node.js and the DOM. Its only job is to expose a safe, scoped API surface via `contextBridge.exposeInMainWorld`. Never expose `ipcRenderer` directly — expose individual named methods only.

```typescript
// preload.ts — correct pattern
contextBridge.exposeInMainWorld('electronAPI', {
  listSprites: () => ipcRenderer.invoke('sprite:list'),
  dispatch: (sprite: string, prompt: string) =>
    ipcRenderer.invoke('sprite:dispatch', { sprite, prompt }),
  syncFiles: (sprite: string) =>
    ipcRenderer.invoke('sprite:sync', { sprite }),
  onLogLine: (cb: (line: string) => void) => {
    ipcRenderer.on('log:line', (_e, line) => cb(line));
    return () => ipcRenderer.removeAllListeners('log:line');
  },
  writeTerminal: (data: string) =>
    ipcRenderer.send('pty:input', data),
  onTerminalData: (cb: (data: string) => void) => {
    ipcRenderer.on('pty:output', (_e, data) => cb(data));
    return () => ipcRenderer.removeAllListeners('pty:output');
  },
});
```

## Data Flow

### Pattern 1: Request-Response (invoke/handle)

Used for: sprite listing, dispatch fire, sync start, lifecycle ops (start/stop/destroy).

```
Renderer component
  → window.electronAPI.listSprites()
  → ipcRenderer.invoke('sprite:list')
  → [crosses bridge]
  → ipcMain.handle('sprite:list', handler)
  → spawn `cs list` OR fetch Sprite API
  → returns result Promise
  → Renderer receives resolved value
  → Zustand store updated
  → React re-renders
```

Confidence: HIGH (official Electron IPC docs pattern).

### Pattern 2: Streaming (ipcMain → ipcRenderer push)

Used for: real-time log output from `cs dispatch`, file sync progress.

```
Main process
  → child_process.spawn('cs', ['dispatch', ...])
  → proc.stdout.on('data', chunk => {
      mainWindow.webContents.send('log:line', chunk.toString())
    })
  → [crosses bridge]
  → ipcRenderer.on('log:line', cb) [registered in preload]
  → window.electronAPI.onLogLine(line => appendToLog(line))
  → React log panel re-renders
```

Confidence: HIGH (documented push pattern + real-world usage confirmed).

### Pattern 3: Bidirectional PTY (terminal embedding)

Used for: embedded terminal connected to a remote sprite shell.

```
User types in xterm.js
  → term.onData(data => window.electronAPI.writeTerminal(data))
  → ipcRenderer.send('pty:input', data)
  → ipcMain.on('pty:input', (e, data) => ptyProcess.write(data))

PTY produces output
  → ptyProcess.onData(data => mainWindow.webContents.send('pty:output', data))
  → ipcRenderer.on('pty:output', (e, data) => term.write(data))
```

node-pty runs in the main process (native addon, not safe in renderer). xterm.js renders in the renderer. IPC is the bridge. No socket layer needed in Electron (unlike web-based terminals).

Confidence: HIGH (node-pty official Electron example + multiple production apps).

### Pattern 4: Sprite API Direct Calls

Used for: sprite list/status polling (faster than CLI roundtrip).

```
Main process
  → fetch('https://api.sprites.dev/v1/sprites', { headers: { Authorization: `Bearer ${token}` } })
  → ipcMain.handle('sprite:list', ...)
  → returns parsed sprite array
```

Token stored via Electron's `safeStorage` or read from `~/.sprite/config` (where `sprite login` writes it).

## Patterns to Follow

### Pattern: electron-vite Project Structure

Use `electron-vite` (https://electron-vite.org/) as the build tool. It provides separate Vite configs for main, preload, and renderer with hot reload for all three.

```
claude-sprite-desktop/
├── electron.vite.config.ts
├── src/
│   ├── main/           # Main process
│   │   ├── index.ts    # Entry, BrowserWindow setup
│   │   ├── ipc/        # ipcMain handlers (one file per domain)
│   │   │   ├── sprites.ts
│   │   │   ├── dispatch.ts
│   │   │   ├── sync.ts
│   │   │   └── terminal.ts
│   │   ├── cli.ts      # child_process spawn wrapper for cs/sprite
│   │   └── pty.ts      # node-pty management
│   ├── preload/
│   │   └── index.ts    # contextBridge API surface
│   └── renderer/       # React app
│       ├── index.html
│       ├── src/
│       │   ├── App.tsx
│       │   ├── store/  # Zustand slices
│       │   ├── components/
│       │   │   ├── SpriteList/
│       │   │   ├── DispatchPanel/
│       │   │   ├── LogViewer/
│       │   │   ├── Terminal/   # xterm.js wrapper
│       │   │   └── SetupWizard/
│       │   └── hooks/  # useSprites, useDispatch, useLogs, useTerminal
│       └── package.json
└── package.json
```

### Pattern: IPC Handler Files Per Domain

Register ipcMain handlers in domain-specific files, not one giant index.ts. Each file exports a `registerHandlers(mainWindow)` function called from main/index.ts.

```typescript
// src/main/ipc/sprites.ts
export function registerSpriteHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('sprite:list', async () => { ... });
  ipcMain.handle('sprite:lifecycle', async (e, { sprite, action }) => { ... });
}
```

### Pattern: CLI Wrapper with Streaming

Wrap `child_process.spawn` in a reusable function that handles streaming output to the renderer:

```typescript
// src/main/cli.ts
export function runCsCommand(
  args: string[],
  onData: (line: string) => void
): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn('cs', args, { env: process.env });
    proc.stdout.on('data', d => onData(d.toString()));
    proc.stderr.on('data', d => onData(d.toString()));
    proc.on('close', code => resolve(code ?? 0));
    proc.on('error', reject);
  });
}
```

### Pattern: Zustand for Renderer State

Zustand is appropriate for renderer-only state (UI state, cached sprite list, log buffer). The main process is the authoritative source; renderer Zustand store is a synchronized cache populated via IPC.

```typescript
// Renderer-only: display state, not persisted cross-process
const useSpritesStore = create<SpritesState>(set => ({
  sprites: [],
  loading: false,
  fetchSprites: async () => {
    set({ loading: true });
    const sprites = await window.electronAPI.listSprites();
    set({ sprites, loading: false });
  },
}));
```

No need for zubridge or cross-process Zustand sync — main process state does not need to sync to renderer store automatically; components pull on demand.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Exposing ipcRenderer Directly

**What:** `contextBridge.exposeInMainWorld('ipc', ipcRenderer)`
**Why bad:** Any renderer code can send any IPC message, bypassing all security. The exposed object will also be empty in practice (Electron serializes it to `{}`).
**Instead:** Expose individual named functions per operation.

### Anti-Pattern 2: Node.js in Renderer

**What:** Importing `child_process`, `fs`, or `node-pty` directly in React components (requires `nodeIntegration: true`).
**Why bad:** Disables context isolation. Opens XSS → RCE attack vector. Deprecated default since Electron 12.
**Instead:** All Node.js work in main process, accessed via `window.electronAPI`.

### Anti-Pattern 3: Synchronous IPC

**What:** Using `ipcRenderer.sendSync()`.
**Why bad:** Blocks the renderer process (UI freeze) until main responds. Deprecated pattern.
**Instead:** `ipcRenderer.invoke()` returns a Promise, non-blocking.

### Anti-Pattern 4: Bundling node-pty as Regular Dependency

**What:** Adding node-pty to renderer dependencies or not rebuilding native addons for Electron's Node.js version.
**Why bad:** node-pty is a native addon; it must be rebuilt against Electron's Node version (using `electron-rebuild` or `@electron/rebuild`), and must only run in main process.
**Instead:** node-pty in main process only; use `electron-rebuild` in postinstall.

### Anti-Pattern 5: Polling CLI for Live Logs

**What:** Repeatedly running `cs dispatch status` to check output.
**Why bad:** High latency, missed lines, wasteful process spawning.
**Instead:** Stream stdout/stderr via `proc.on('data')` pushed immediately to renderer via `webContents.send`.

### Anti-Pattern 6: Hardcoding cs Binary Path

**What:** `spawn('/usr/local/bin/cs', ...)`.
**Why bad:** Path differs across machines, breaks on Windows, breaks when installed via Homebrew vs manual.
**Instead:** Resolve from PATH at runtime: `which('cs')` or use `cross-spawn` which handles PATH resolution and Windows `.exe` extension automatically.

## Suggested Build Order

Components have hard dependencies that dictate phase ordering:

```
1. Electron shell + Vite setup
   (no deps — establish main/preload/renderer structure, hot reload working)

2. Preload API surface + IPC skeleton
   (depends on 1 — define window.electronAPI shape before renderer uses it)

3. Sprite API integration (list/status)
   (depends on 2 — first real IPC call; validates the full round-trip)

4. Dashboard React UI
   (depends on 3 — needs data before rendering sprite list)

5. CLI Bridge (spawn cs, stream output)
   (depends on 2 — IPC streaming channel needed first)

6. Dispatch Panel + Log Viewer
   (depends on 5 — needs CLI Bridge for dispatch + streaming logs)

7. File Sync UI
   (depends on 5 — uses same CLI Bridge pattern as dispatch)

8. Terminal Component (node-pty + xterm.js)
   (depends on 2 — separate IPC channel; node-pty native rebuild needed)

9. Setup Wizard
   (depends on 3,5 — needs API + CLI working to validate config during setup)

10. Lifecycle ops (create/start/stop/destroy)
    (depends on 5 — CLI Bridge + Dashboard already working)

11. Packaging (.dmg, .exe) + auto-update
    (depends on all features — last phase, no feature deps)
```

**Critical path:** Shell → IPC → Sprite API → Dashboard → CLI Bridge → everything else in parallel.

## Scalability Considerations

| Concern | Approach |
|---------|----------|
| Multiple sprites with simultaneous logs | Map of log buffers keyed by sprite name; separate IPC channels or channel multiplexing with sprite prefix |
| Terminal sessions | One node-pty process per active terminal tab; teardown on tab close |
| Sprite API polling rate | 30s interval for status; invalidate immediately on user action |
| Log buffer memory | Cap in-memory log buffer per sprite (e.g. last 10k lines); virtual scroll in xterm.js/LogViewer |
| cs binary missing | Detect at startup; route to Setup Wizard if not found on PATH |

## Technology Decisions

| Technology | Purpose | Why |
|------------|---------|-----|
| electron-vite | Build tooling | Hot reload for main+preload+renderer, modern Vite DX, widely adopted |
| React | Renderer UI | Required per PROJECT.md decision |
| Zustand | Renderer state | Lightweight, no boilerplate, appropriate for renderer-only cache |
| node-pty | PTY for terminal | Microsoft-maintained, used by VS Code, native Electron support |
| xterm.js | Terminal UI | Same tech as existing cs share dashboard, battle-tested |
| child_process.spawn | CLI bridge | Built-in Node.js, streaming stdout, no extra deps |
| Electron safeStorage | Token storage | OS-level encrypted storage for sprite token, better than plaintext |
| @electron/rebuild | Native addon rebuild | Required for node-pty compatibility with Electron's Node version |

## Sources

- Electron Process Model: https://www.electronjs.org/docs/latest/tutorial/process-model (HIGH confidence)
- Electron IPC: https://www.electronjs.org/docs/latest/tutorial/ipc (HIGH confidence)
- Electron contextBridge: https://www.electronjs.org/docs/latest/api/context-bridge (HIGH confidence)
- electron-vite: https://electron-vite.org/ (HIGH confidence)
- node-pty Electron example: https://github.com/microsoft/node-pty/tree/main/examples/electron (HIGH confidence)
- xterm.js: https://xtermjs.org/ (HIGH confidence)
- Zubridge for Electron: https://www.npmjs.com/package/@zubridge/electron (MEDIUM confidence — smaller library)
- opcito xterm+Electron tutorial: https://www.opcito.com/blogs/browser-based-terminals-with-xtermjs-and-electronjs (MEDIUM confidence)
- electron-vite-react boilerplate: https://github.com/electron-vite/electron-vite-react (MEDIUM confidence)
