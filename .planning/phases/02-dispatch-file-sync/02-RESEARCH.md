# Phase 2: Dispatch + File Sync - Research

**Researched:** 2026-03-19
**Domain:** Electron child_process streaming, IPC push channels, OS notifications, tar-based file sync
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DISP-01 | User can fire a Claude dispatch with a text prompt on a selected sprite | `cs dispatch` CLI wraps tmux launch; shell-out via `child_process.spawn('cs', ['dispatch', sprite, prompt])` |
| DISP-02 | User can see real-time streaming output from a running dispatch | `proc.stdout.on('data')` → `webContents.send('dispatch:log', line)` → `ipcRenderer.on('dispatch:log', cb)` |
| DISP-03 | User can abort a running dispatch from the UI | `cs abort --sprite <name>` or kill the spawned child process; two-phase: kill proc then abort remote tmux |
| DISP-04 | OS notification fires when dispatch completes or fails | `new Notification({ title, body })` from Electron main process — no permission request needed on macOS |
| SYNC-01 | User can push local files to sprite with progress indication | `cs sync --sprite <name>` streams tar; parse stderr for file count / byte progress |
| SYNC-02 | User can pull files from sprite to local machine | `cs context pull --sprite <name>` or `cs pull --sprite <name>` for file pull |
| SYNC-03 | Files auto-sync before dispatch (configurable) | Dispatch IPC handler runs sync step first if config flag set; opt-in toggle stored in electron-store |
</phase_requirements>

---

## Summary

Phase 2 extends the working Phase 1 IPC skeleton with three new capabilities: fire-and-monitor Claude dispatches, abort control, OS notifications, and bidirectional file sync with progress. All three patterns are variations on the same underlying mechanism: `child_process.spawn` in the main process with `proc.stdout.on('data')` chunks forwarded to the renderer via `webContents.send`.

The Phase 1 codebase has already established `cli.ts::runSpriteCommand()` (capture mode) and the `onLifecycleProgress` push channel for the sprite lifecycle actions. Phase 2 needs a streaming variant: instead of accumulating stdout and returning it, the handler pushes each chunk immediately to the renderer and keeps the child process reference alive so it can be killed on abort. The key design decision is **per-sprite channel namespacing** — multiple sprites could have active dispatches simultaneously, so IPC channels must include the sprite name as a prefix (e.g. `dispatch:log:<sprite>`) rather than a single global `dispatch:log` channel.

The `cs dispatch` CLI in `dispatch.rs` launches Claude in a remote tmux window and tees output to `~/.cs-dispatch/latest.log` on the sprite. Streaming in the Electron app works by spawning `cs dispatch` (which blocks until Claude exits) and piping its stdout/stderr live. Abort has two layers: kill the local `cs dispatch` child process, then run `cs abort --sprite <name>` to kill the remote tmux window. OS notifications use Electron's built-in `Notification` class — no permission prompts needed on macOS for packaged apps.

**Primary recommendation:** Extend the existing `cli.ts` with a `spawnStreaming()` function that returns both a `Promise<number>` and the live `ChildProcess` reference for kill support. Key both the IPC push channel and the active process map on `sprite-name` to support concurrent dispatches.

---

## Codebase Established Patterns (Phase 1)

These patterns are already in production code. Phase 2 MUST follow them exactly.

### IPC Registration Pattern

```typescript
// src/main/index.ts — already wires handlers this way
import { registerSpriteHandlers } from './ipc/sprites'
import { registerSetupHandlers } from './ipc/setup'
// Phase 2 adds:
import { registerDispatchHandlers } from './ipc/dispatch'
import { registerSyncHandlers } from './ipc/sync'

// Called as: registerDispatchHandlers(win) in app.whenReady()
```

### CLI Wrapper (capture mode — already implemented)

```typescript
// src/main/cli.ts — existing function; Phase 2 adds spawnStreaming() alongside this
export function runSpriteCommand(
  args: string[],
  onProgress?: (msg: string) => void
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const proc = spawn('sprite', args, { env: process.env })
    proc.stdout.on('data', (data: Buffer) => { onProgress?.(data.toString()) })
    proc.stderr.on('data', (data: Buffer) => { onProgress?.(data.toString()) })
    proc.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}
```

### Preload API Surface (already established)

```typescript
// src/preload/index.ts — add to existing contextBridge.exposeInMainWorld('spriteAPI', {...})
// The spriteAPI object already has: listSprites, loadConfig, saveConfig, lifecycle,
// runSpriteLogin, onLifecycleProgress
// Phase 2 extends it with: dispatch, abortDispatch, syncPush, syncPull,
// onDispatchLog, onDispatchDone, onSyncProgress
```

### Zustand UI Store (already established)

```typescript
// src/renderer/src/store/ui.ts — extend existing store
// Already has: selectedSprite, showCreateModal, showDestroyModal, destroyTarget
// Phase 2 adds: activeDispatches Map<string, DispatchState>, showDispatchPanel, etc.
```

---

## Architecture Patterns

### Pattern 1: Streaming IPC Push (per-sprite namespaced channels)

This is the core pattern for DISP-02 and SYNC-01/02.

**The problem with a single `dispatch:log` channel:** If two sprite dispatches run simultaneously, their log lines interleave in a single channel with no way to route them. All streaming channels MUST be keyed by sprite name.

```typescript
// src/main/ipc/dispatch.ts
import { ipcMain, BrowserWindow, Notification } from 'electron'
import { spawn, ChildProcess } from 'child_process'

// Track active processes so abort can kill them
const activeDispatches = new Map<string, ChildProcess>()

export function registerDispatchHandlers(win: BrowserWindow): void {
  ipcMain.handle('dispatch:launch', async (_e, { sprite, org, prompt, noSync }: {
    sprite: string; org: string; prompt: string; noSync?: boolean
  }) => {
    // Kill any existing dispatch for this sprite
    const existing = activeDispatches.get(sprite)
    if (existing) existing.kill('SIGTERM')

    const args = ['dispatch', '--sprite', sprite, '--org', org]
    if (noSync) args.push('--no-sync')
    args.push(prompt)

    const proc = spawn('cs', args, { env: process.env })
    activeDispatches.set(sprite, proc)

    proc.stdout.on('data', (d: Buffer) => {
      win.webContents.send(`dispatch:log:${sprite}`, d.toString())
    })
    proc.stderr.on('data', (d: Buffer) => {
      win.webContents.send(`dispatch:log:${sprite}`, d.toString())
    })
    proc.on('close', (code) => {
      activeDispatches.delete(sprite)
      const success = code === 0
      win.webContents.send(`dispatch:done:${sprite}`, { code, success })
      // OS notification
      new Notification({
        title: success ? 'Dispatch complete' : 'Dispatch failed',
        body: `${sprite}: ${prompt.slice(0, 60)}${prompt.length > 60 ? '…' : ''}`,
      }).show()
    })

    return { started: true }
  })

  ipcMain.handle('dispatch:abort', async (_e, { sprite, org }: { sprite: string; org: string }) => {
    // Layer 1: kill the local cs process
    const proc = activeDispatches.get(sprite)
    if (proc) {
      proc.kill('SIGTERM')
      activeDispatches.delete(sprite)
    }
    // Layer 2: kill the remote tmux dispatch window
    // cs abort --sprite <name> kills `tmux kill-window -t <session>:dispatch`
    const { spawn: sp } = await import('child_process')
    const abortProc = sp('cs', ['abort', '--sprite', sprite, '--org', org], { env: process.env })
    return new Promise((resolve) => abortProc.on('close', (code) => resolve({ code })))
  })
}
```

**Confidence:** HIGH — pattern is directly derived from Phase 1's `lifecycle:progress` push channel. Namespacing on sprite name is the standard approach for multi-session log multiplexing.

### Pattern 2: Preload Push Channel Registration

```typescript
// src/preload/index.ts — extend existing spriteAPI object
// These are added alongside the existing methods

onDispatchLog: (sprite: string, cb: (line: string) => void) => {
  const handler = (_: unknown, line: string) => cb(line)
  ipcRenderer.on(`dispatch:log:${sprite}`, handler)
  return () => ipcRenderer.removeListener(`dispatch:log:${sprite}`, handler)
},
onDispatchDone: (sprite: string, cb: (result: { code: number | null; success: boolean }) => void) => {
  const handler = (_: unknown, result: { code: number | null; success: boolean }) => cb(result)
  ipcRenderer.on(`dispatch:done:${sprite}`, handler)
  return () => ipcRenderer.removeListener(`dispatch:done:${sprite}`, handler)
},
```

**Confidence:** HIGH — mirrors the existing `onLifecycleProgress` listener pattern exactly.

### Pattern 3: Sync with Progress

The `cs sync` CLI outputs progress to stderr (via `indicatif` ProgressBar). In the Electron context, streaming stderr to the renderer gives the user "N/M files" progress.

```typescript
// src/main/ipc/sync.ts
export function registerSyncHandlers(win: BrowserWindow): void {
  ipcMain.handle('sync:push', async (_e, { sprite, org }: { sprite: string; org: string }) => {
    return new Promise((resolve) => {
      const proc = spawn('cs', ['sync', '--sprite', sprite, '--org', org], { env: process.env })
      proc.stdout.on('data', (d: Buffer) => {
        win.webContents.send(`sync:progress:${sprite}`, d.toString())
      })
      proc.stderr.on('data', (d: Buffer) => {
        // Progress bars and status lines come through stderr
        win.webContents.send(`sync:progress:${sprite}`, d.toString())
      })
      proc.on('close', (code) => {
        win.webContents.send(`sync:done:${sprite}`, { code, success: code === 0 })
        resolve({ success: code === 0 })
      })
      proc.on('error', (err) => resolve({ success: false, error: err.message }))
    })
  })

  ipcMain.handle('sync:pull', async (_e, { sprite, org, remotePath, localDest }: {
    sprite: string; org: string; remotePath: string; localDest: string
  }) => {
    return new Promise((resolve) => {
      const proc = spawn('cs', ['context', 'pull', '--sprite', sprite, '--org', org], { env: process.env })
      proc.stdout.on('data', (d: Buffer) => win.webContents.send(`sync:progress:${sprite}`, d.toString()))
      proc.stderr.on('data', (d: Buffer) => win.webContents.send(`sync:progress:${sprite}`, d.toString()))
      proc.on('close', (code) => resolve({ success: code === 0 }))
      proc.on('error', (err) => resolve({ success: false, error: err.message }))
    })
  })
}
```

### Pattern 4: OS Notifications

Electron's built-in `Notification` class from the `electron` module fires OS native notifications from the main process. No permission APIs or npm packages needed.

```typescript
// In main process only (src/main/ipc/dispatch.ts)
import { Notification } from 'electron'

new Notification({
  title: 'Dispatch complete',
  body: `${spriteName}: finished in 2m 31s`,
}).show()
```

**macOS behavior:** Works without requesting permission in development and in signed packaged apps. The app must have been launched by the user at least once (satisfied by day-1 usage). For unsigned dev builds, macOS sometimes suppresses notifications — test with signed build for DISP-04 validation.

**Confidence:** HIGH — Electron docs confirm `Notification` from `electron` module works this way. No third-party library needed.

### Pattern 5: Dispatch Panel UI Component

The Dispatch button on `SpriteCard.tsx` is already present but disabled with `title="Coming in Phase 3"` (the label says Phase 3 but the requirement is Phase 2 — fix this in implementation). Clicking Dispatch should:

1. Open a `DispatchPanel` modal/drawer (similar to `CreateSpriteModal` pattern)
2. Show a textarea for the prompt + "Dispatch" button
3. After firing: show a `LogViewer` component that receives `onDispatchLog` stream lines
4. Show an "Abort" button while running, replaced by "Close" when `onDispatchDone` fires

The log viewer should be a `<pre>` or scrollable `<div>` appending lines. Virtual scrolling is out of scope for Phase 2 (cap at last 2000 lines in Zustand).

### Recommended Project Structure (additions to Phase 1)

```
src/
├── main/
│   └── ipc/
│       ├── sprites.ts           # existing
│       ├── setup.ts             # existing
│       ├── dispatch.ts          # NEW: dispatch:launch, dispatch:abort
│       └── sync.ts              # NEW: sync:push, sync:pull
├── preload/
│   └── index.ts                 # extend spriteAPI with dispatch/sync methods
└── renderer/src/
    ├── components/
    │   ├── DispatchPanel/
    │   │   ├── DispatchPanel.tsx      # modal/drawer: prompt input + LogViewer
    │   │   └── LogViewer.tsx          # auto-scrolling log display
    │   └── SyncProgress/
    │       └── SyncProgress.tsx       # progress bar for push/pull
    ├── hooks/
    │   ├── useDispatch.ts             # useDispatch(sprite) hook
    │   └── useSync.ts                 # useSync(sprite) hook
    └── store/
        └── ui.ts                      # extend: add dispatch/sync state
```

---

## How `cs dispatch` Works Under the Hood

Understanding this is critical for correctly wiring the Electron IPC.

From `cli/cs-rs/src/dispatch.rs`:

1. **Wake sprite** — calls `client.ensure_awake()` (equivalent to `sprite exec echo waking`)
2. **Sync files** — calls `sync::sync(client, local_path)` unless `--no-sync` (Phase 2: SYNC-03)
3. **Push context** — calls `context::push(client)` unless `--no-context`
4. **Build Claude command** — base64-encodes the prompt to safely embed in tmux/bash:
   ```bash
   cd <remote_project> && claude --dangerously-skip-permissions -p "$(echo '<b64>' | base64 -d)"
   ```
5. **Launch tmux window** — creates/reuses the `dispatch` tmux window in the configured session:
   ```bash
   tmux new-window -t <session> -n dispatch "bash -c '{ <claude_cmd> } 2>&1 | tee -a ~/.cs-dispatch/latest.log; echo DISPATCH_DONE >> ~/.cs-dispatch/latest.log; exec bash'"
   ```
6. **Returns immediately** — `cs dispatch` exits after launching; it does NOT block waiting for Claude

**Key implication for streaming:** `cs dispatch` is fire-and-forget. Its process exits once the tmux window is created. Streaming the `cs dispatch` process's stdout gives the user the setup steps (waking, syncing, launching) but NOT the Claude output. To stream Claude's output, use `cs logs --follow --sprite <name>` (or `cs tail --sprite <name>`) which tails `~/.cs-dispatch/latest.log` on the remote sprite.

**Revised dispatch flow for Electron:**

```
1. Invoke 'dispatch:launch' IPC handler
2. Run cs dispatch <sprite> <prompt> (capture: wake + sync + launch steps)
   → Stream these setup lines to renderer as "setup progress"
3. cs dispatch exits (tmux window now running Claude remotely)
4. Immediately start cs logs --follow --sprite <name>
   → Stream these lines to renderer as "live Claude output"
5. Poll cs status --sprite <name> every 5s to detect completion
   OR monitor the tailed log for "DISPATCH_DONE" sentinel
6. When "DISPATCH_DONE" detected → fire OS notification + emit dispatch:done IPC event
```

**Alternatively** (simpler): Use `cs dispatch` with `--attach`-style: if `cs` has a flag that combines launch + follow, use that. Check `cs dispatch --help` output at runtime.

**Checking cs dispatch flags:**

```bash
cs dispatch --help
```

From the Rust source in `dispatch.rs`, the CLI signature is:
```
cs dispatch [OPTIONS] [PROMPT]
Options:
  --resume      resume last session
  --no-sync     skip file sync
  --no-context  skip context push
  --force       kill existing dispatch
```

There is no `--follow` flag on dispatch. Tailing is a separate `cs logs` subcommand:
```bash
cs logs --sprite <name>   # tails ~/.cs-dispatch/latest.log (last 100 lines, non-streaming)
```

The CLI `logs` command reads the last 100 lines — it is not a live tail. The Electron app must implement live polling itself.

**Recommended implementation for live log streaming:**

```typescript
// After cs dispatch exits successfully, start a polling loop:
async function pollDispatchLog(sprite: string, win: BrowserWindow): Promise<void> {
  let offset = 0
  const interval = setInterval(async () => {
    const result = await runCsCommand(['logs', '--sprite', sprite])
    const lines = result.stdout.split('\n')
    const newLines = lines.slice(offset)
    offset = lines.length
    for (const line of newLines) {
      win.webContents.send(`dispatch:log:${sprite}`, line)
      if (line.includes('DISPATCH_DONE')) {
        clearInterval(interval)
        win.webContents.send(`dispatch:done:${sprite}`, { success: true })
        // fire OS notification
      }
    }
  }, 1000) // 1s poll interval
}
```

**Confidence:** MEDIUM — The `cs logs` non-streaming behavior is verified from `dispatch.rs` source. The 1s poll interval is a judgment call; adjust based on UX testing.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OS notifications | Custom WebSocket or HTTP callback | `new Notification()` from `electron` module | Built-in, no deps, native OS integration |
| Streaming subprocess output | readline parser, custom buffer splitter | `proc.stdout.on('data')` directly | Node.js built-in; data events fire per-chunk, not per-line |
| IPC channel cleanup | Manual listener registry | Return cleanup function from preload, call it in `useEffect` cleanup | Phase 1 already established this pattern (see `onLifecycleProgress`) |
| Log buffer state | Custom class | Zustand slice with simple `string[]` array, capped at 2000 lines | Already have Zustand; no new dependencies |
| Sync progress display | Custom progress protocol | Parse `cs sync` stderr output as text lines | CLI already produces human-readable progress; display as text |
| Child process kill | SIGKILL immediately | `proc.kill('SIGTERM')` then `proc.kill('SIGKILL')` after 3s timeout | SIGTERM lets the process clean up; SIGKILL as fallback |

---

## Common Pitfalls

### Pitfall 1: Single global log channel
**What goes wrong:** `ipcRenderer.on('dispatch:log', cb)` — two sprite dispatches' log lines interleave with no routing key.
**Why it happens:** Easy to forget multi-sprite concurrency during initial implementation.
**How to avoid:** Always namespace channels: `dispatch:log:${spriteName}`. Use sprite name, not sprite ID (name is what `cs` CLI commands accept).
**Warning signs:** Log panel showing mixed output from two sprites.

### Pitfall 2: Log listener accumulation
**What goes wrong:** React component registers `ipcRenderer.on(channel, handler)` in `useEffect` but doesn't return cleanup. Every re-render adds another listener. Eventually hundreds of handlers fire for each log line.
**Why it happens:** IPC listeners are persistent unlike React event handlers.
**How to avoid:** ALWAYS return cleanup function from preload listener methods. Call it in `useEffect` return. Phase 1's `onLifecycleProgress` already does this correctly — follow the same pattern.
**Warning signs:** Log panel displaying duplicated lines that multiply over time.

### Pitfall 3: cs dispatch is fire-and-forget
**What goes wrong:** Streaming `cs dispatch`'s stdout expecting to see Claude output. Getting only the setup lines (waking, syncing, launching) then silence as the process exits.
**Why it happens:** Misunderstanding `cs dispatch` semantics — it launches tmux and exits; Claude runs asynchronously on the remote.
**How to avoid:** Use `cs dispatch` for setup steps, then poll `cs logs` for Claude output. See Architecture Pattern section above for the two-phase flow.
**Warning signs:** Log stream shows "Dispatch launched!" then stops; user sees no Claude output.

### Pitfall 4: Abort doesn't kill remote Claude
**What goes wrong:** Killing the local `cs dispatch` child process (already exited anyway) does nothing to stop Claude running on the sprite.
**Why it happens:** Dispatch is remote; `proc.kill()` only affects the local CLI process.
**How to avoid:** Two-phase abort: (1) kill local polling process, (2) run `cs abort --sprite <name>` which executes `tmux kill-window -t <session>:dispatch` on the remote.
**Warning signs:** User clicks Abort; UI shows "aborted"; Claude keeps running on sprite.

### Pitfall 5: Sync progress output is ANSI/control characters
**What goes wrong:** The `cs sync` CLI uses `indicatif` ProgressBar with ANSI escape codes for the animated bar. Displaying raw stderr in a React `<pre>` shows garbage like `\x1b[2K\r  ━━━━━━━━...`.
**Why it happens:** Terminal progress bars use carriage returns and ANSI sequences designed for TTY rendering.
**How to avoid:** Strip ANSI escape codes before displaying in the log viewer. Use a simple regex: `/\x1b\[[0-9;]*m/g` or a library. Alternatively, display only lines that contain recognizable text patterns (lines with "Synced", "files", error messages).
**Warning signs:** Log panel showing escape code characters or garbled text during sync.

### Pitfall 6: window.spriteAPI TypeScript types out of sync
**What goes wrong:** Adding new methods to the contextBridge `spriteAPI` object in `preload/index.ts` without updating the `SpriteAPI` interface in `src/renderer/src/lib/sprite-types.ts`. TypeScript doesn't type-check across the IPC boundary by default.
**Why it happens:** The preload and renderer are in separate TypeScript compilation contexts.
**How to avoid:** The project uses `window.d.ts` in the renderer for the `window.spriteAPI` type. Update `SpriteAPI` interface in `sprite-types.ts` AND the `declare global` block in `window.d.ts` when adding methods.
**Warning signs:** TypeScript compiles but runtime throws "window.spriteAPI.dispatch is not a function".

---

## Code Examples

### Dispatch Hook (renderer)

```typescript
// src/renderer/src/hooks/useDispatch.ts
import { useState, useEffect, useCallback } from 'react'

interface DispatchState {
  status: 'idle' | 'launching' | 'running' | 'done' | 'failed' | 'aborted'
  logs: string[]
  exitCode: number | null
}

export function useDispatch(spriteName: string) {
  const [state, setState] = useState<DispatchState>({
    status: 'idle', logs: [], exitCode: null,
  })

  useEffect(() => {
    const cleanLog = window.spriteAPI.onDispatchLog(spriteName, (line) => {
      setState(prev => ({
        ...prev,
        // Cap at 2000 lines to prevent unbounded memory growth
        logs: [...prev.logs.slice(-1999), line],
      }))
    })
    const cleanDone = window.spriteAPI.onDispatchDone(spriteName, ({ code, success }) => {
      setState(prev => ({
        ...prev,
        status: success ? 'done' : 'failed',
        exitCode: code,
      }))
    })
    return () => { cleanLog(); cleanDone() }
  }, [spriteName])

  const launch = useCallback(async (prompt: string, noSync = false) => {
    setState({ status: 'launching', logs: [], exitCode: null })
    const config = await window.spriteAPI.loadConfig()
    await window.spriteAPI.dispatch(spriteName, config?.org ?? '', prompt, noSync)
    setState(prev => ({ ...prev, status: 'running' }))
  }, [spriteName])

  const abort = useCallback(async () => {
    const config = await window.spriteAPI.loadConfig()
    await window.spriteAPI.abortDispatch(spriteName, config?.org ?? '')
    setState(prev => ({ ...prev, status: 'aborted' }))
  }, [spriteName])

  return { ...state, launch, abort }
}
```

### LogViewer Component (renderer)

```typescript
// src/renderer/src/components/DispatchPanel/LogViewer.tsx
import { useEffect, useRef } from 'react'

interface LogViewerProps {
  lines: string[]
  className?: string
}

export function LogViewer({ lines, className }: LogViewerProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Auto-scroll to bottom when new lines arrive
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines.length])

  return (
    <div className={`font-mono text-xs overflow-y-auto bg-muted/50 rounded p-3 ${className}`}>
      <pre className="whitespace-pre-wrap break-all">
        {lines.join('\n')}
      </pre>
      <div ref={bottomRef} />
    </div>
  )
}
```

### ANSI Strip Utility

```typescript
// src/renderer/src/lib/ansi.ts
const ANSI_RE = /\x1b\[[0-9;]*[mGKHF]|\r/g

export function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, '')
}
```

### Config Flag for Auto-Sync

```typescript
// src/renderer/src/lib/sprite-types.ts — extend AppConfig
export interface AppConfig {
  spriteToken: string
  org: string
  anthropicApiKey: string
  theme?: 'light' | 'dark' | 'system'
  autoSyncBeforeDispatch?: boolean  // NEW: SYNC-03
}
```

---

## Standard Stack

No new libraries are required for Phase 2. All capabilities use Electron built-ins and existing project dependencies.

### Already Installed (from package.json)
| Library | Version | Purpose |
|---------|---------|---------|
| electron | ^34.3.0 | `Notification` class, `BrowserWindow.webContents.send` |
| child_process | Node.js built-in | `spawn()` for cs/sprite CLI |
| zustand | ^5.0.3 | Log buffer state, dispatch status |
| lucide-react | ^0.577.0 | Icons for Dispatch panel, progress indicators |
| sonner | ^2.0.7 | Toast notifications for sync completion (optional; OS notification is the primary) |

### No New Dependencies Needed
All Phase 2 features use:
- `electron.Notification` — OS notifications
- `child_process.spawn` — CLI streaming (already used in `cli.ts`)
- `ipcMain.handle` / `webContents.send` — push channels (already established)
- Zustand — log buffer state (already installed)

**If ANSI stripping is needed:** Consider `strip-ansi` (npm). But the simple regex in the Code Examples section above covers the `indicatif` output patterns without adding a dependency.

---

## cs CLI Command Reference

Commands used in Phase 2 (verified against dispatch.rs and sync.rs source):

| Operation | cs CLI command | Behavior |
|-----------|---------------|---------|
| Fire dispatch | `cs dispatch --sprite <name> --org <org> "<prompt>"` | Wakes, syncs, pushes context, launches tmux window, exits immediately |
| Fire without sync | `cs dispatch --no-sync --sprite <name> --org <org> "<prompt>"` | Skips sync step |
| Get dispatch logs | `cs logs --sprite <name>` | Tails last 100 lines of `~/.cs-dispatch/latest.log`, non-streaming |
| Abort dispatch | `cs abort --sprite <name>` | Runs `tmux kill-window -t <session>:dispatch` on remote |
| Push sync | `cs sync --sprite <name>` | git ls-files → tar → pipe to remote extract |
| Pull context | `cs context pull --sprite <name>` | Pulls Claude context/history files from remote |

**Note:** The actual cs2 binary (from `cli/cs-rs/`) flag names depend on the Clap definitions in `cli/cs-rs/src/cli.rs`. Verify exact flag names before implementing — the `dispatch.rs` source shows the Rust API but the CLI flags may differ. The installed `cs` binary at `/usr/local/bin/cs` is available on this machine for testing.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^3.1.1 |
| Config file | `claude-sprite-desktop/vitest.config.ts` (inherits from electron-vite) |
| Quick run command | `cd claude-sprite-desktop && npm test -- --run` |
| Full suite command | `cd claude-sprite-desktop && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DISP-01 | dispatch IPC handler fires cs dispatch CLI | unit | `npm test -- --run dispatch` | ❌ Wave 0 |
| DISP-02 | streaming log lines forwarded to renderer | unit | `npm test -- --run dispatch` | ❌ Wave 0 |
| DISP-03 | abort kills process and calls cs abort | unit | `npm test -- --run dispatch` | ❌ Wave 0 |
| DISP-04 | Notification.show() called on proc close | unit | `npm test -- --run dispatch` | ❌ Wave 0 |
| SYNC-01 | sync:push IPC handler fires cs sync | unit | `npm test -- --run sync` | ❌ Wave 0 |
| SYNC-02 | sync:pull IPC handler fires cs context pull | unit | `npm test -- --run sync` | ❌ Wave 0 |
| SYNC-03 | auto-sync flag respected in dispatch handler | unit | `npm test -- --run dispatch` | ❌ Wave 0 |

**Note:** Electron IPC handlers running in main process are tested by mocking `child_process.spawn` and `BrowserWindow.webContents.send`. The existing `sprites.test.ts` provides the model.

### Sampling Rate
- **Per task commit:** `cd claude-sprite-desktop && npm test -- --run`
- **Per wave merge:** `cd claude-sprite-desktop && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/main/ipc/dispatch.test.ts` — covers DISP-01, DISP-02, DISP-03, DISP-04
- [ ] `src/main/ipc/sync.test.ts` — covers SYNC-01, SYNC-02, SYNC-03
- [ ] `src/renderer/src/hooks/useDispatch.test.ts` — renderer hook tests (jsdom environment per-file)

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| `ipcRenderer.sendSync` for blocking calls | `ipcRenderer.invoke` → `ipcMain.handle` | Phase 1 already uses invoke/handle; never use sendSync |
| Polling CLI for live logs | `proc.stdout.on('data')` push | Only possible for processes that stay alive; `cs dispatch` exits immediately — requires log polling |
| Single global `log` channel | Per-sprite namespaced channel `log:${sprite}` | Required for concurrent dispatches |
| Shell `&` backgrounding | `child_process.spawn` with event listeners | Explicit process reference needed for kill |

---

## Open Questions

1. **Does `cs` CLI accept `--sprite` and `--org` flags for all subcommands?**
   - What we know: `dispatch.rs` calls `SpriteClient` which is initialized from config, not inline flags
   - What's unclear: Whether the installed `cs` binary has global `--sprite`/`--org` flags or uses `.cs.toml` project file for resolution
   - Recommendation: Run `cs --help` and `cs dispatch --help` against the installed binary before implementing; adjust flag names accordingly. The Rust source in `cli.rs` is the ground truth.

2. **Is there a `cs logs --follow` / live tail mode?**
   - What we know: `dispatch.rs::logs()` calls `tail -100` — static, not streaming
   - What's unclear: Whether a `--follow` flag exists (not visible in dispatch.rs)
   - Recommendation: Run `cs logs --help`; if no follow mode exists, implement 1s polling loop as documented in the Architecture Patterns section.

3. **Multi-sprite log channel multiplexing strategy (noted blocker in STATE.md)**
   - What we know: Per-sprite channel namespacing (`dispatch:log:${sprite}`) is the correct approach
   - What's unclear: Whether the UI should show all active dispatches simultaneously or only the selected sprite's logs
   - Recommendation: Start with selected-sprite-only UI (one DispatchPanel at a time); the per-sprite channel namespacing still enables future concurrent panel support without IPC changes.

---

## Sources

### Primary (HIGH confidence)
- `cli/cs-rs/src/dispatch.rs` — Direct source code inspection of dispatch launch, abort, logs, status functions
- `cli/cs-rs/src/sync.rs` — Direct source code inspection of sync push (tar streaming) and pull
- `claude-sprite-desktop/src/main/cli.ts` — Phase 1 established `runSpriteCommand` pattern (spawn + streaming)
- `claude-sprite-desktop/src/preload/index.ts` — Phase 1 established push channel pattern (`onLifecycleProgress`)
- `claude-sprite-desktop/src/main/ipc/sprites.ts` — Phase 1 IPC handler registration pattern
- `.planning/research/ARCHITECTURE.md` — Streaming IPC push pattern (Pattern 2), OS notification note
- Electron `Notification` docs: https://www.electronjs.org/docs/latest/api/notification

### Secondary (MEDIUM confidence)
- `.planning/phases/01-shell-dashboard/01-VERIFICATION.md` — Confirmed Phase 1 complete; all SHELL/DASH requirements satisfied
- `.planning/STATE.md` — Noted blocker: "Multi-sprite log channel multiplexing strategy needs decision"

### Tertiary (LOW confidence)
- Exact `cs` CLI flag names for `--sprite`/`--org` global args — not verified against installed binary; must check at implementation time

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all existing packages confirmed in package.json
- Architecture: HIGH — streaming IPC pattern directly derived from Phase 1's working implementation
- Dispatch mechanics: HIGH for launch/abort/notification; MEDIUM for live streaming (cs dispatch exits immediately; log polling strategy confirmed from source but 1s interval is a judgment call)
- Pitfalls: HIGH — all derived from direct code inspection, not web search

**Research date:** 2026-03-19
**Valid until:** 2026-06-19 (stable Electron APIs; 90 days)
