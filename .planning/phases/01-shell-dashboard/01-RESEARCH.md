# Phase 1: Shell + Dashboard - Research

**Researched:** 2026-03-19
**Domain:** Electron 41 + React 19 + electron-vite 5 desktop app with Sprite API integration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Setup wizard flow:** Multi-step pages (Step 1: Sprite token via `sprite login` browser OAuth, Step 2: Org, Step 3: Anthropic API key). Auto-import existing `~/.config/cs/config.toml` and skip wizard entirely if present. Config stored in electron-store, persists across restarts.
- **Dashboard layout:** Card grid layout (like Docker Desktop containers). Full-width with header bar + "Create sprite" button. No sidebar in Phase 1.
- **Sprite card content:** Name + colored status badge, last active time, running task preview, quick action buttons (Start/Stop/Terminal/Dispatch).
- **Empty state:** Friendly illustration + "Create your first sprite" CTA.
- **Lifecycle UX:** Destroy requires modal with type-to-confirm. Start shows spinner + "Starting..." status. Stop is immediate with "Stopping..." status. Create is a modal dialog form over the dashboard.
- **Visual style:** Dark and light following OS preference with user override. Linear aesthetic (minimal, monochrome, whitespace, subtle borders). Traffic light status colors: running=green, cold=amber, stopped=red (non-negotiable). Component library: shadcn/ui (Radix + Tailwind).

### Claude's Discretion

- Exact Tailwind color tokens for the palette
- Typography scale and font choice
- Header bar layout and controls
- Card hover/interaction states
- Loading skeleton design
- Polling interval for status auto-refresh
- Error state handling (API unreachable, token expired)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SHELL-01 | Electron app launches with React renderer via electron-vite | electron-vite 5.0.0 scaffold command; see Standard Stack |
| SHELL-02 | Setup wizard collects sprite token, org, and Anthropic API key on first launch | `sprite login` OAuth flow + `sprite auth setup --token` non-interactive path; see Auth Flow section |
| SHELL-03 | Config persists to electron-store (reads existing cs config if present) | electron-store 11.0.2 (ESM-only; needs dynamic import); `~/.config/cs/config.toml` format confirmed from config.rs |
| SHELL-04 | IPC architecture uses contextBridge with sandboxed preload (contextIsolation: true) | Electron default since v12; see Architecture Patterns |
| SHELL-05 | PATH resolution works in packaged macOS app (shell env inheritance) | fix-path 5.0.0 (ESM-only; needs dynamic import); critical pitfall #1 |
| DASH-01 | List all sprites with visual status indicators (running/cold/stopped) | Sprite API `/v1/sprites` confirmed; actual response fields documented; TanStack Query polling |
| DASH-02 | Start a stopped/cold sprite from the dashboard | Start = `sprite exec echo .` to wake; no direct /start API endpoint exists |
| DASH-03 | Stop a running sprite from the dashboard | Stop = `sprite stop -s <name> -o <org>` CLI OR POST `/v1/sprites/<name>/suspend` REST API |
| DASH-04 | Destroy a sprite from the dashboard (with confirmation) | `sprite destroy <name> --force` CLI; type-to-confirm modal required |
| DASH-05 | Create a new sprite from the dashboard | `sprite create <name> --skip-console -o <org>` CLI |
| DASH-06 | Quick-action buttons per sprite (start/stop/attach/dispatch) | IPC invoke channels; see Architecture Patterns |
| DASH-07 | Auto-polling sprite status at regular intervals | TanStack Query `refetchInterval`; recommended 30s; see Polling section |
</phase_requirements>

---

## Summary

This phase establishes the Electron app skeleton and the primary user-facing surface: the sprite dashboard. The foundation work (electron-vite scaffold, IPC architecture, contextBridge preload) must be laid correctly from the start — changing the IPC security model mid-project requires rewriting all feature code. The architecture is well-understood and all technology choices from the pre-existing STACK.md research are confirmed as current.

The most important new finding is a discrepancy between the Sprite API's actual response shape and what `api.rs` assumes. The real API returns `last_running_at` and `last_warming_at`, not `last_active_at`. The `api.rs` code handles this via `serde` aliases but the Electron app must parse the response using the actual field names.

A second critical finding: `sprite start` does not exist as a CLI command. Waking a cold sprite is accomplished by running any `sprite exec` command against it (the first exec triggers warmup). The CLI `cs start` wraps this with `sprite exec echo "Sprite is awake."`. The Electron app should follow the same pattern. For stop, there is both a CLI path (`sprite stop`) and a direct REST API path (POST `/v1/sprites/{name}/suspend`).

**Primary recommendation:** Scaffold with `pnpm create @quick-start/electron . --template react-ts`, wire correct IPC from day one, then build the API integration layer before any UI. API and IPC correctness unlocks everything else.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Electron | 41.0.3 | Desktop shell, Node.js runtime | Ships Chromium 130+ and Node 22. v41 is current latest |
| React | 19.2.4 | UI rendering | Concurrent rendering; stable since late 2024 |
| TypeScript | 5.x | Type safety | Catches IPC contract mismatches at compile time |
| electron-vite | 5.0.0 | Build tooling | Purpose-built for Electron: separate Vite configs for main/preload/renderer |

### UI and Styling

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tailwind CSS | 4.2.2 | Utility-first styling | v4 native CSS variables; `@tailwindcss/vite` plugin (no PostCSS config needed) |
| shadcn/ui | 4.0.8 | Component library | Copy-paste Radix primitives; code lives in your source tree; dark mode via CSS variables |
| Lucide React | 0.577.0 | Icons | shadcn/ui default icon set; tree-shakeable SVGs |

### State

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TanStack Query | 5.91.2 | Sprite API polling + async state | Handles caching, stale-while-revalidate, refetch interval; works in renderer with native `fetch` |
| Zustand | 5.0.12 | UI and local state | Minimal boilerplate; no Provider wrap; renderer-only cache of sprite list and UI state |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-router-dom | 7.13.1 | Client-side routing | Navigate between dashboard / wizard / settings |
| date-fns | 4.1.0 | Date formatting | Relative timestamps ("5m ago") for `last_running_at` display |
| clsx | 2.1.1 | Conditional class names | shadcn/ui dependency for dynamic Tailwind classes |
| tailwind-merge | 3.5.0 | Merge Tailwind classes | Prevents conflicting utility collisions in shadcn components |
| zod | 4.3.6 | Schema validation | Validate IPC message shapes and Sprite API response parsing |
| electron-store | 11.0.2 | Persistent user settings | Sprite token, org, API key, theme preference |
| fix-path | 5.0.0 | PATH resolution in packaged apps | macOS GUI app PATH fix; run once at startup in main process |
| electron-builder | 26.8.1 | Packaging | DMG/NSIS output; used in later phases; configure now to avoid rework |

**Installation:**

```bash
# Scaffold
pnpm create @quick-start/electron claude-sprite-desktop --template react-ts
cd claude-sprite-desktop

# Core state
pnpm add react-router-dom zustand @tanstack/react-query

# Utility
pnpm add electron-store date-fns clsx tailwind-merge zod fix-path

# Dev
pnpm add -D tailwindcss @tailwindcss/vite electron-builder

# shadcn/ui (after Tailwind config is working)
pnpm dlx shadcn@latest init
```

**Version verification:** All versions confirmed against npm registry on 2026-03-19.

### ESM-Only Package Warning

Both `electron-store` (v11) and `fix-path` (v5) are ESM-only packages. The electron-vite main process build target uses CommonJS. To use these, call them via dynamic `import()` inside an async function:

```typescript
// main/index.ts — dynamic import for ESM-only packages
async function getFixPath() {
  const { default: fixPath } = await import('fix-path');
  fixPath();
}
async function getStore() {
  const { default: Store } = await import('electron-store');
  return new Store<AppConfig>({ schema });
}
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| electron-store (ESM) | conf (CJS) or manual JSON file | electron-store has richer API; ESM wrapping is a one-time pattern |
| TanStack Query in renderer | IPC proxy to main for all API calls | Direct fetch from renderer is faster; OK for read-only sprite list |
| fix-path | Manual `shell -l -c printenv PATH` | fix-path is well-tested; manual approach is an acceptable fallback |

---

## Architecture Patterns

### Recommended Project Structure

```
claude-sprite-desktop/
├── electron.vite.config.ts
├── src/
│   ├── main/
│   │   ├── index.ts          # BrowserWindow, app lifecycle, single instance lock
│   │   ├── ipc/
│   │   │   ├── sprites.ts    # sprite:list, sprite:lifecycle handlers
│   │   │   └── setup.ts      # config:load, config:save, sprite:login handlers
│   │   ├── cli.ts            # child_process.spawn wrapper for cs/sprite binaries
│   │   └── config-store.ts   # electron-store instance (dynamic import wrapper)
│   ├── preload/
│   │   └── index.ts          # contextBridge.exposeInMainWorld('spriteAPI', {...})
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── App.tsx
│           ├── routes/
│           │   ├── Dashboard.tsx     # Sprite card grid
│           │   └── SetupWizard.tsx   # Multi-step wizard
│           ├── components/
│           │   ├── SpriteCard/
│           │   ├── SetupWizard/
│           │   │   ├── StepToken.tsx
│           │   │   ├── StepOrg.tsx
│           │   │   └── StepApiKey.tsx
│           │   ├── modals/
│           │   │   ├── CreateSpriteModal.tsx
│           │   │   └── DestroyConfirmModal.tsx
│           │   └── ui/               # shadcn/ui components (generated)
│           ├── hooks/
│           │   ├── useSprites.ts     # TanStack Query + polling
│           │   └── useConfig.ts      # electron-store read/write via IPC
│           ├── store/
│           │   └── ui.ts             # Zustand: modal state, selected sprite
│           └── lib/
│               └── sprite-types.ts  # SpriteInfo, AppConfig types
```

### Pattern 1: Secure IPC with contextBridge

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('spriteAPI', {
  // Config
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (cfg: Partial<AppConfig>) => ipcRenderer.invoke('config:save', cfg),

  // Sprites
  listSprites: () => ipcRenderer.invoke('sprite:list'),
  lifecycle: (sprite: string, org: string, action: 'start' | 'stop' | 'destroy' | 'create') =>
    ipcRenderer.invoke('sprite:lifecycle', { sprite, org, action }),

  // Setup
  runSpriteLogin: () => ipcRenderer.invoke('sprite:login'),

  // Event listeners (return cleanup fn)
  onLifecycleProgress: (cb: (msg: string) => void) => {
    const handler = (_: unknown, msg: string) => cb(msg)
    ipcRenderer.on('lifecycle:progress', handler)
    return () => ipcRenderer.removeListener('lifecycle:progress', handler)
  },
})
```

### Pattern 2: Sprite API Direct Fetch from Renderer

The sprite list endpoint is a simple bearer-token GET. Call it directly from the renderer with TanStack Query — no IPC proxy needed for read-only calls.

```typescript
// src/renderer/src/hooks/useSprites.ts
// Source: .planning/research/STACK.md + verified against actual Sprite API
export function useSprites() {
  return useQuery({
    queryKey: ['sprites'],
    queryFn: async (): Promise<SpriteInfo[]> => {
      const config = await window.spriteAPI.loadConfig()
      const res = await fetch('https://api.sprites.dev/v1/sprites', {
        headers: { Authorization: `Bearer ${config.spriteToken}` },
      })
      const data = await res.json()
      // API wraps sprites in { sprites: [...] }
      return Array.isArray(data) ? data : (data.sprites ?? [])
    },
    refetchInterval: 30_000,  // 30s polling — Claude's discretion
    staleTime: 10_000,
  })
}
```

### Pattern 3: Lifecycle via CLI Spawn in Main Process

Start, stop, destroy, and create all shell out to the `sprite` CLI from the main process.

```typescript
// src/main/ipc/sprites.ts
ipcMain.handle('sprite:lifecycle', async (e, { sprite, org, action }) => {
  const args: string[] = []
  const sendProgress = (msg: string) =>
    mainWindow.webContents.send('lifecycle:progress', msg)

  switch (action) {
    case 'start':
      // No 'sprite start' command exists. Waking = first exec call.
      args.push('exec', '-s', sprite, '-o', org, 'echo', 'waking')
      break
    case 'stop':
      args.push('stop', '-s', sprite, '-o', org)
      break
    case 'destroy':
      args.push('destroy', sprite, '--force', '-o', org)
      break
    case 'create':
      args.push('create', sprite, '--skip-console', '-o', org)
      break
  }

  return runSpriteCommand(args, sendProgress)
})
```

### Pattern 4: Setup Wizard Config Auto-Import

On first launch, check for existing `~/.config/cs/config.toml` before showing the wizard.

```typescript
// src/main/ipc/setup.ts
ipcMain.handle('config:load', async () => {
  const store = await getStore()
  const stored = store.get('config') as AppConfig | undefined

  if (stored?.spriteToken) return stored  // Already set up

  // Try auto-import from cs CLI config
  const csConfigPath = path.join(os.homedir(), '.config', 'cs', 'config.toml')
  try {
    const raw = await fs.readFile(csConfigPath, 'utf-8')
    const parsed = parseToml(raw)  // Use 'toml' npm package or manual parse
    if (parsed.sprite_token) {
      const imported: AppConfig = {
        spriteToken: parsed.sprite_token,
        org: parsed.org ?? '',
        anthropicApiKey: '',   // Not in cs config — still need Step 3
      }
      store.set('config', imported)
      return { ...imported, autoImported: true }
    }
  } catch { /* no cs config — show full wizard */ }

  return null
})
```

### Pattern 5: PATH Fix for Packaged App

```typescript
// src/main/index.ts — call immediately after app.whenReady()
app.whenReady().then(async () => {
  const { default: fixPath } = await import('fix-path')
  fixPath()  // Reads shell profile; sets process.env.PATH correctly
  // Now spawn('sprite', ...) will find the sprite binary on Homebrew/cargo paths
  createWindow()
})
```

### Sprite API Response Shape (VERIFIED against live API)

```typescript
// src/renderer/src/lib/sprite-types.ts
export interface SpriteInfo {
  id: string
  name: string
  status: 'running' | 'warm' | 'cold' | 'suspended' | string
  url: string
  organization: string
  last_running_at: string | null    // NOTE: API uses last_running_at, NOT last_active_at
  last_warming_at: string | null
  updated_at: string
  created_at: string
}

export interface SpritesListResponse {
  name: string          // org name
  sprites: SpriteInfo[]
  running: number
  warm: number
  cold: number
  has_more: boolean
  next_continuation_token: string | null
  running_limit: number
  warm_limit: number
}
```

### Status Mapping (derived from output.rs and live API)

| API `status` value | Badge color | Badge label | Icon |
|-------------------|-------------|-------------|------|
| `"running"` | green | Running | ● |
| `"warm"` | green | Running | ● |
| `"active"` | green | Running | ● |
| `"cold"` | amber | Cold | ◐ |
| `"sleeping"` | amber | Sleeping | ◐ |
| `"suspended"` | amber | Sleeping | ◐ |
| anything else | gray/red | (raw value) | ○ |

### Anti-Patterns to Avoid

- **Exposing raw ipcRenderer:** `contextBridge.exposeInMainWorld('ipc', ipcRenderer)` — exposes arbitrary message sending. Use named functions only.
- **nodeIntegration: true:** Opens XSS-to-RCE; deprecated since Electron 12. Use contextIsolation defaults.
- **Polling Sprite API from main process:** Read-only list calls should go directly from renderer; only lifecycle mutations need IPC.
- **Hardcoding cs or sprite binary paths:** Always resolve from PATH (fixed by fix-path) or use an absolute path stored in config.
- **Using ipcRenderer.sendSync:** Blocks renderer thread. Use `invoke()` everywhere.
- **Missing useEffect cleanup for IPC listeners:** Every `ipcRenderer.on()` registered in a React component MUST return a cleanup function removing the listener. Leaks accumulate memory over hours.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token persistence | Custom JSON file with manual read/write | electron-store | Handles schema migration, encryption option, cross-process safety |
| Relative timestamps | Custom date diff function | date-fns `formatDistanceToNow` | Edge cases: DST, negative durations, locale; api.rs already showed the complexity |
| Dialog/modal accessibility | Custom `<div role="dialog">` | shadcn/ui Dialog (Radix) | Focus trapping, ARIA, keyboard navigation, scroll lock |
| Form validation | Manual event handlers | shadcn/ui Form + zod | Type-safe form state, display errors, async validation |
| Toast notifications | Custom notification div | shadcn/ui Sonner | Stacking, dismiss, accessible, no z-index fights |
| Sprite API caching | Manual loading/error state booleans | TanStack Query | Background refetch, stale data, retry logic, devtools |
| macOS PATH | Manual shell invocation | fix-path | Handles bash/zsh/fish profiles; battle-tested |

**Key insight:** The Sprite API interaction pattern (poll, cache, invalidate on mutation) is exactly the problem TanStack Query solves. Custom loading state management here leads to stale UI bugs.

---

## Common Pitfalls

### Pitfall 1: Wrong Sprite API Field Names

**What goes wrong:** Building the renderer assuming `last_active_at` matches what the CLI `api.rs` uses — but the live Sprite API returns `last_running_at` and `last_warming_at`. The `api.rs` serde alias works for the CLI but the Electron app will parse different fields.

**Why it happens:** `api.rs` uses `#[serde(alias = "lastActiveAt")]` which doesn't match what the live API actually returns. The API returns `last_running_at` (snake_case).

**How to avoid:** Use the verified `SpriteInfo` type from the Code Examples section above. The live API response (confirmed 2026-03-19) uses `last_running_at` and `last_warming_at`.

**Warning signs:** All timestamps show "—" or undefined in the dashboard UI.

### Pitfall 2: No `sprite start` Command

**What goes wrong:** Planning a `sprite start <name>` CLI invocation that doesn't exist. The `sprite` CLI has no standalone `start` subcommand (verified 2026-03-19 against live sprite binary).

**Why it happens:** The mental model of start/stop lifecycle maps to CLI commands, but `sprite` wakes a cold machine implicitly on any `exec`.

**How to avoid:** Start = `sprite exec -s <name> -o <org> echo waking`. The first exec warms the machine. Show a spinner until polling confirms status = "running" or "warm".

**Warning signs:** ENOENT or "unknown command: start" error when invoking lifecycle.

### Pitfall 3: PATH Not Inherited in macOS Production Builds

**What goes wrong:** `spawn('sprite', ...)` throws ENOENT when the packaged `.app` is launched from Finder/Dock. The system PATH doesn't include `/opt/homebrew/bin` or `~/.local/bin` where `sprite` is installed.

**How to avoid:** Call `fixPath()` from `fix-path` immediately after `app.whenReady()`, before any `spawn` call. `fix-path` is ESM-only — use dynamic `await import('fix-path')`.

**Warning signs:** Everything works in `npm run dev` but fails in a packaged build opened from Finder.

### Pitfall 4: electron-store and fix-path ESM Import Errors

**What goes wrong:** `require('electron-store')` throws "ERR_REQUIRE_ESM" because both packages are ESM-only since their v8/v5 respectively.

**How to avoid:** Use dynamic `await import(...)` in an async function. Never `require()` these packages. electron-vite's main process build handles dynamic imports correctly.

**Warning signs:** Main process crashes at startup with `ERR_REQUIRE_ESM`.

### Pitfall 5: IPC Listener Leaks

**What goes wrong:** Each time the dashboard remounts (navigation, hot reload), a new `ipcRenderer.on('lifecycle:progress', ...)` listener is added without removing the old one. After 10 mounts, 10 handlers fire for every progress event.

**How to avoid:** Always return a cleanup function from the preload's event registration methods. In React: call the cleanup in `useEffect`'s return value.

```typescript
useEffect(() => {
  const cleanup = window.spriteAPI.onLifecycleProgress((msg) => setProgress(msg))
  return cleanup
}, [])
```

**Warning signs:** Progress messages appear multiple times per event; memory grows steadily.

### Pitfall 6: Sprite Destroy API — CLI Required (No REST Endpoint)

**What goes wrong:** Attempting `DELETE /v1/sprites/<name>` via direct fetch — this endpoint returns 404 (verified 2026-03-19).

**How to avoid:** Destroy must go through the `sprite destroy <name> --force -o <org>` CLI command spawned from the main process via IPC.

### Pitfall 7: app.on('ready') Race Condition

**What goes wrong:** Using `app.on('ready', cb)` — if `ready` has already fired, the callback never runs. App launches with no window.

**How to avoid:** Always use `app.whenReady().then(createWindow)`.

### Pitfall 8: Multiple App Instances

**What goes wrong:** Clicking the app icon when already running opens a second instance; both instances fight over the same resources.

**How to avoid:** Call `app.requestSingleInstanceLock()` at the top of main process; if it returns `false`, quit immediately. Handle `second-instance` event to focus the existing window.

---

## Code Examples

### Scaffold Command

```bash
# Source: electron-vite.org scaffold docs
pnpm create @quick-start/electron claude-sprite-desktop --template react-ts
```

### Tailwind v4 in electron-vite

```typescript
// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    plugins: [tailwindcss(), react()],
  }
})
```

```css
/* src/renderer/src/assets/main.css */
@import "tailwindcss";
```

### shadcn/ui Init for electron-vite

```bash
# Run from project root after Tailwind is configured
pnpm dlx shadcn@latest init
# Select: TypeScript, Default style, CSS variables for colors
# When asked for src/app directory: point to src/renderer/src
```

Path alias must exist in both `tsconfig.json` and `vite.config` (electron-vite handles this in `electron.vite.config.ts`):

```typescript
// renderer config section
resolve: {
  alias: { '@': resolve('src/renderer/src') }
}
```

### Main Process Startup Pattern

```typescript
// src/main/index.ts
import { app, BrowserWindow } from 'electron'

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

app.whenReady().then(async () => {
  // Fix PATH before any spawn calls
  const { default: fixPath } = await import('fix-path')
  fixPath()

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  registerSpriteHandlers(win)
  registerSetupHandlers(win)

  if (is.dev) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL!)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
})
```

### Sprite Login OAuth Flow (Setup Wizard Step 1)

Two paths available — the setup wizard uses whichever fits the UX:

**Path A — Browser OAuth (non-blocking spawn):**
```typescript
// src/main/ipc/setup.ts
ipcMain.handle('sprite:login', async () => {
  return new Promise((resolve) => {
    const proc = spawn('sprite', ['login'], {
      env: process.env,
      stdio: 'inherit',   // Opens browser automatically
    })
    proc.on('close', async (code) => {
      if (code === 0) {
        // sprite login writes token to ~/.sprites/ keyring
        // Read back by calling 'sprite org list' or checking token
        resolve({ success: true })
      } else {
        resolve({ success: false, error: `sprite login exited ${code}` })
      }
    })
  })
})
```

**Path B — Token paste (non-interactive):**
The user copies their token from the Sprite dashboard and pastes it. The app calls:
```typescript
spawn('sprite', ['auth', 'setup', '--token', token], { env: process.env })
```
Token format: `org-slug/org-id/token-id/token-value`

**Recommendation (Claude's discretion):** Use Path B in the UI — show a text field for pasting the token. Path A (browser OAuth) is interactive and blocks the spawned process; it's harder to show progress in the wizard UI. Path B is instant and testable.

### Config TOML Parser

The auto-import reads `~/.config/cs/config.toml`. Use the `smol-toml` package (CJS-compatible) or implement a minimal parser:

```typescript
// Minimal TOML key=value parser for cs config format
function parseCsConfig(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, '')
    result[key] = val
  }
  return result
}
// Fields: sprite_token, org, sprite_name, tmux_session
```

---

## Sprite Lifecycle Reference

| User Action | Implementation | CLI Command | Notes |
|-------------|---------------|-------------|-------|
| Start (cold) | Spawn in main, show spinner | `sprite exec -s <name> -o <org> echo waking` | No `/start` API endpoint exists |
| Stop (running) | Spawn in main | `sprite stop -s <name> -o <org>` | CLI may print "stop not available" — non-fatal |
| Destroy | Spawn in main, type-confirm modal first | `sprite destroy <name> --force -o <org>` | No REST DELETE endpoint |
| Create | Spawn in main, name input modal | `sprite create <name> --skip-console -o <org>` | `--skip-console` prevents interactive attach |
| List | Direct fetch in renderer | `GET /v1/sprites` with Bearer token | Returns `{ sprites: [...], running, warm, cold }` |

**Start polling strategy:** After triggering start, set `refetchInterval` to 5s temporarily. Revert to 30s once status = "running" or "warm". Use TanStack Query's `refetchIntervalInBackground: true` so polling continues when window is unfocused.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (bundled with electron-vite template) |
| Config file | None yet — Wave 0 task to create |
| Quick run command | `pnpm test --run` |
| Full suite command | `pnpm test` |

Note: electron-vite's React TypeScript template includes Vitest by default. Main process code and React components can both be tested with Vitest. No separate Jest setup needed.

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SHELL-01 | Electron app launches | smoke | manual: `pnpm dev` and observe window | N/A |
| SHELL-02 | Setup wizard collects credentials | unit | `pnpm test --run src/renderer/src/routes/SetupWizard.test.tsx` | Wave 0 |
| SHELL-03 | Config persists + auto-imports cs config | unit | `pnpm test --run src/main/config-store.test.ts` | Wave 0 |
| SHELL-04 | contextBridge API shape | unit | `pnpm test --run src/preload/index.test.ts` | Wave 0 |
| SHELL-05 | PATH resolution | manual | Launch packaged .app from Finder, verify sprite exec works | N/A (packaging phase) |
| DASH-01 | Sprite list renders with status badges | unit | `pnpm test --run src/renderer/src/components/SpriteCard.test.tsx` | Wave 0 |
| DASH-02 | Start action triggers correct CLI args | unit | `pnpm test --run src/main/ipc/sprites.test.ts` | Wave 0 |
| DASH-03 | Stop action triggers correct CLI args | unit | `pnpm test --run src/main/ipc/sprites.test.ts` | Wave 0 |
| DASH-04 | Destroy requires type-to-confirm | unit | `pnpm test --run src/renderer/src/components/modals/DestroyConfirmModal.test.tsx` | Wave 0 |
| DASH-05 | Create triggers sprite create --skip-console | unit | `pnpm test --run src/main/ipc/sprites.test.ts` | Wave 0 |
| DASH-06 | Quick-action buttons render per card | unit | `pnpm test --run src/renderer/src/components/SpriteCard.test.tsx` | Wave 0 |
| DASH-07 | Polling refetches at interval | unit | `pnpm test --run src/renderer/src/hooks/useSprites.test.ts` | Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm test --run` (single-pass, no watch)
- **Per wave merge:** `pnpm test` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/main/ipc/sprites.test.ts` — covers DASH-02, DASH-03, DASH-04 lifecycle CLI args
- [ ] `src/main/config-store.test.ts` — covers SHELL-03 auto-import and persistence
- [ ] `src/preload/index.test.ts` — covers SHELL-04 contextBridge surface shape
- [ ] `src/renderer/src/routes/SetupWizard.test.tsx` — covers SHELL-02 wizard flow
- [ ] `src/renderer/src/components/SpriteCard.test.tsx` — covers DASH-01, DASH-06
- [ ] `src/renderer/src/components/modals/DestroyConfirmModal.test.tsx` — covers DASH-04
- [ ] `src/renderer/src/hooks/useSprites.test.ts` — covers DASH-07 polling

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `xterm` npm package | `@xterm/xterm` (scoped) | 2023 | Old package deprecated; only relevant in later terminal phase |
| electron-store v8 CJS | electron-store v11 ESM-only | 2023 | Requires dynamic import() in main process |
| `keytar` for secure storage | `electron.safeStorage` (built-in) | Electron 15 | keytar is deprecated; safeStorage is built into Electron |
| `app.on('ready', cb)` | `app.whenReady().then(cb)` | Electron 4 | Race condition fix; use the Promise API |
| `nodeIntegration: true` | `contextIsolation: true` + preload | Electron 12 default | Security; never use nodeIntegration in new projects |

**Deprecated/outdated:**

- `keytar`: Microsoft deprecated it. Use `electron.safeStorage.encryptString()` for any tokens that need OS-level encryption.
- `xterm` (v5.x on npm): Deprecated. Use `@xterm/xterm` v6.x (relevant in Phase 3, not Phase 1).

---

## Open Questions

1. **Sprite token storage after setup wizard**
   - What we know: `sprite auth setup --token <value>` writes to `~/.sprites/users/<id>.json` and the system keyring. The `cs` CLI reads from `~/.config/cs/config.toml`.
   - What's unclear: Should the Electron app write both `~/.sprites/` (via `sprite auth setup`) AND `~/.config/cs/config.toml` so the cs CLI stays in sync? Or only one?
   - Recommendation: Always call `sprite auth setup --token <value>` so the `sprite` binary has credentials for lifecycle operations. Separately store the same token in electron-store for fast access in the renderer.

2. **Org value in setup wizard Step 2**
   - What we know: The `sprite org` command manages orgs. The API requires `-o <org>` for most calls.
   - What's unclear: Does `sprite list` without `-o` work? Does the API infer org from the token?
   - Recommendation: After sprite auth setup, call `sprite org list` and parse the default org from output. Pre-fill Step 2.

3. **`sprite stop` non-fatal warning**
   - What we know: `sprite.rs` marks `sprite stop not available` as non-fatal and continues.
   - What's unclear: When does stop actually fail? Is "Stop" UX misleading if the sprite only idles?
   - Recommendation: Show "Stopping..." optimistically; refresh status in 30s via polling; if status doesn't change, show "Sprite will idle automatically" as a tooltip.

---

## Sources

### Primary (HIGH confidence)

- Live Sprite API response — confirmed by `sprite api /v1/sprites -o jarred-fleet-so` (2026-03-19): actual fields are `last_running_at`, `last_warming_at`; status values include `running`, `warm`, `cold`, `suspended`
- `cli/cs-rs/src/api.rs` — SpriteInfo struct, parse_sprites(), list_sprites() fallback chain
- `cli/cs-rs/src/config.rs` — GlobalConfig struct, config path `~/.config/cs/config.toml`, field names
- `cli/cs-rs/src/output.rs` — Status icons (●/◐/○) and color mapping
- `cli/cs-rs/src/sprite.rs` — `stop()` implementation using `sprite stop -s <name>`
- `.planning/research/STACK.md` — Electron stack selection (HIGH confidence)
- `.planning/research/ARCHITECTURE.md` — IPC patterns and process model (HIGH confidence)
- `.planning/research/PITFALLS.md` — Common Electron pitfalls (HIGH confidence)
- npm registry: all package versions verified 2026-03-19

### Secondary (MEDIUM confidence)

- Live sprite binary strings inspection: `~/.sprites/` keyring storage path, `sprite auth setup --token` for non-interactive auth
- Live API probe: POST `/v1/sprites/<name>/suspend` = stop; no `/start` REST endpoint exists
- `~/.sprites/users/<id>.json` structure: confirmed org/token storage format

### Tertiary (LOW confidence)

- Wave 0 test file paths: inferred from standard Vitest + electron-vite conventions; adjust to actual scaffold output

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — versions confirmed against npm registry 2026-03-19
- Architecture: HIGH — IPC patterns from official Electron docs, patterns from pre-existing ARCHITECTURE.md
- Sprite API fields: HIGH — verified against live API on 2026-03-19
- Sprite lifecycle commands: HIGH — verified against live sprite binary 2026-03-19
- Pitfalls: HIGH — sourced from PITFALLS.md (pre-researched) + new ESM findings
- Test infrastructure: MEDIUM — electron-vite Vitest integration inferred; verify on scaffold

**Research date:** 2026-03-19
**Valid until:** 2026-04-18 (stable ecosystem; Sprite API field names most likely to drift)
