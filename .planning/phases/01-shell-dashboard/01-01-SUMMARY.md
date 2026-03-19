---
phase: 01-shell-dashboard
plan: 01
subsystem: ui
tags: [electron, react, typescript, tailwindcss, shadcn-ui, tanstack-query, zustand, electron-vite, ipc, contextbridge]

# Dependency graph
requires: []
provides:
  - "Electron + React + TypeScript app scaffolded with electron-vite"
  - "Tailwind v4 configured via @tailwindcss/vite plugin"
  - "shadcn/ui components: button, card, dialog, input, badge, sonner"
  - "contextBridge IPC architecture: preload exposes named API (no raw ipcRenderer)"
  - "Shared type contracts: SpriteInfo, AppConfig, SpriteAPI, SpritesListResponse"
  - "Main process: single instance lock, fix-path, sandboxed BrowserWindow"
  - "Config store: electron-store with dynamic ESM import + cs config auto-import"
  - "CLI wrapper: child_process.spawn for sprite binary"
  - "IPC channels: config:load, config:save, sprite:lifecycle, sprite:login"
affects:
  - "01-02"
  - "01-03"
  - "01-04"

# Tech tracking
tech-stack:
  added:
    - electron (34.x)
    - electron-vite (3.x)
    - react (19.x)
    - tailwindcss (4.x) via @tailwindcss/vite
    - shadcn/ui (button, card, dialog, input, badge, sonner)
    - @tanstack/react-query (5.x)
    - zustand (5.x)
    - electron-store (11.x, ESM dynamic import)
    - fix-path (4.x)
    - class-variance-authority
    - lucide-react
    - next-themes
    - sonner
    - react-router-dom (7.x)
    - date-fns (4.x)
    - zod (3.x)
  patterns:
    - "contextBridge IPC: preload exposes named async functions, main handles via ipcMain.handle"
    - "Dynamic ESM import for electron-store: await import('electron-store') inside async function"
    - "Dynamic ESM import for fix-path: await import('fix-path') at startup"
    - "Sprite API fetched directly from renderer via fetch() — no IPC proxy for read-only calls"
    - "sprite start implemented as exec -s <name> -o <org> echo waking (no sprite start command)"

key-files:
  created:
    - claude-sprite-desktop/src/renderer/src/lib/sprite-types.ts
    - claude-sprite-desktop/src/main/index.ts
    - claude-sprite-desktop/src/main/cli.ts
    - claude-sprite-desktop/src/main/config-store.ts
    - claude-sprite-desktop/src/main/ipc/sprites.ts
    - claude-sprite-desktop/src/main/ipc/setup.ts
    - claude-sprite-desktop/src/preload/index.ts
    - claude-sprite-desktop/src/renderer/src/App.tsx
    - claude-sprite-desktop/electron.vite.config.ts
    - claude-sprite-desktop/package.json
    - claude-sprite-desktop/components.json
    - claude-sprite-desktop/tsconfig.node.json
    - claude-sprite-desktop/tsconfig.web.json
  modified: []

key-decisions:
  - "sprite:login uses Path A (browser OAuth via spawn sprite login) — not Path B token paste"
  - "SpriteAPI interface has no listSprites — renderer fetches sprite list directly via fetch()"
  - "Tailwind v4 CSS variables defined in @theme block and :root, no @apply for variable-based utilities"
  - "tsconfig.node.json uses moduleResolution: bundler to resolve @tailwindcss/vite .mts types"

patterns-established:
  - "IPC channel naming: feature:action (e.g., config:load, sprite:lifecycle)"
  - "preload never exposes raw ipcRenderer — always wraps in named contextBridge functions"
  - "All spawn calls in main process use process.env for PATH inheritance"

requirements-completed:
  - SHELL-01
  - SHELL-04
  - SHELL-05

# Metrics
duration: 9min
completed: 2026-03-19
---

# Phase 1 Plan 01: Shell and IPC Foundation Summary

**Electron app scaffolded with React 19, Tailwind v4, shadcn/ui, and contextBridge IPC wired to sprite lifecycle and config handlers**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-19T15:22:02Z
- **Completed:** 2026-03-19T15:31:18Z
- **Tasks:** 2
- **Files modified:** 20

## Accomplishments

- Electron + React + TypeScript app with electron-vite scaffold, complete pnpm dependency tree installed
- Tailwind v4 configured via `@tailwindcss/vite` plugin (no PostCSS), shadcn/ui components added
- Full contextBridge IPC architecture: preload exposes `window.spriteAPI` with 5 named methods, main process handles 4 IPC channels
- Shared type contracts (`SpriteInfo` with verified `last_running_at`, `AppConfig`, `SpriteAPI`) ready for Plans 02 and 03
- Config store auto-imports from `~/.config/cs/config.toml` on first launch; `pnpm build` exits 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold Electron app, install all dependencies, configure Tailwind v4 + shadcn/ui** - `6805d63` (feat)
2. **Task 2: Create shared types, IPC architecture (preload + main handlers), config store, and CLI wrapper** - `72082c1` (feat)

## Files Created/Modified

- `claude-sprite-desktop/src/renderer/src/lib/sprite-types.ts` - SpriteInfo, AppConfig, SpriteAPI, SpritesListResponse type contracts
- `claude-sprite-desktop/src/main/index.ts` - App entry: single instance lock, fix-path, sandboxed BrowserWindow
- `claude-sprite-desktop/src/main/cli.ts` - child_process.spawn wrapper for sprite binary with progress callbacks
- `claude-sprite-desktop/src/main/config-store.ts` - electron-store wrapper with ESM dynamic import and cs config auto-import
- `claude-sprite-desktop/src/main/ipc/sprites.ts` - sprite:lifecycle IPC handler (start/stop/destroy/create)
- `claude-sprite-desktop/src/main/ipc/setup.ts` - config:load/save + sprite:login (Path A browser OAuth) handlers
- `claude-sprite-desktop/src/preload/index.ts` - contextBridge.exposeInMainWorld('spriteAPI', {...})
- `claude-sprite-desktop/src/renderer/src/App.tsx` - QueryClientProvider shell
- `claude-sprite-desktop/electron.vite.config.ts` - Tailwind v4 plugin, @ alias, externalizeDepsPlugin
- `claude-sprite-desktop/tsconfig.node.json` - moduleResolution: bundler for @tailwindcss/vite types
- `claude-sprite-desktop/components.json` - shadcn/ui config pointing to src/renderer/src

## Decisions Made

- Path A (browser OAuth via `spawn('sprite', ['login'])`) locked per user decision in CONTEXT.md
- `SpriteAPI` interface deliberately excludes `listSprites` — renderer fetches sprite list directly via `fetch()` with TanStack Query
- Tailwind v4 requires `@theme` block for CSS custom properties, not `@apply` with CSS variable-based utility classes
- `moduleResolution: bundler` required in `tsconfig.node.json` to resolve `@tailwindcss/vite` `.mts` type declarations

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Scaffold CLI hung on interactive prompts**
- **Found during:** Task 1 (scaffolding)
- **Issue:** `pnpm create @quick-start/electron` hung on "Add Electron updater plugin?" prompt — could not be answered non-interactively
- **Fix:** Created all scaffold files manually (package.json, tsconfig.*, electron.vite.config.ts) with exact required content
- **Files modified:** claude-sprite-desktop/package.json, claude-sprite-desktop/tsconfig.json, claude-sprite-desktop/tsconfig.node.json, claude-sprite-desktop/tsconfig.web.json, claude-sprite-desktop/electron.vite.config.ts
- **Verification:** pnpm build exits 0
- **Committed in:** 6805d63

**2. [Rule 1 - Bug] Fixed tsconfig.node.json moduleResolution**
- **Found during:** Task 1 (typecheck)
- **Issue:** `@tailwindcss/vite` exports `.mts` types not resolvable under `moduleResolution: node`
- **Fix:** Added `"moduleResolution": "bundler"` to tsconfig.node.json
- **Files modified:** claude-sprite-desktop/tsconfig.node.json
- **Verification:** `pnpm run typecheck` exits 0
- **Committed in:** 6805d63

**3. [Rule 1 - Bug] Fixed shadcn components.json path and moved misplaced files**
- **Found during:** Task 1 (shadcn init)
- **Issue:** `shadcn init -d` failed framework detection for electron-vite; `shadcn add` wrote components to literal `@/components/ui/` path instead of resolving the alias
- **Fix:** Created components.json manually; moved files from `claude-sprite-desktop/@/components/ui/` to `src/renderer/src/components/ui/`
- **Files modified:** claude-sprite-desktop/components.json, claude-sprite-desktop/src/renderer/src/components/ui/*.tsx
- **Verification:** pnpm build exits 0
- **Committed in:** 6805d63

**4. [Rule 1 - Bug] Fixed sonner.tsx circular self-import**
- **Found during:** Task 1 (typecheck after shadcn add)
- **Issue:** shadcn generated `import { Toaster as Sonner } from "@/components/ui/sonner"` — imports itself, causing TS2456 circular type error
- **Fix:** Changed to `import { Toaster as Sonner } from "sonner"` (npm package)
- **Files modified:** claude-sprite-desktop/src/renderer/src/components/ui/sonner.tsx
- **Verification:** TypeScript error TS2456 resolved, pnpm build exits 0
- **Committed in:** 6805d63

**5. [Rule 1 - Bug] Fixed Tailwind v4 CSS — @apply with CSS variables unsupported**
- **Found during:** Task 1 (build after CSS variables added)
- **Issue:** Tailwind v4 does not support `@apply border-border` when `border-border` is a CSS variable-based utility; build error: "Cannot apply unknown utility class `border-border`"
- **Fix:** Replaced `@apply` directives with direct `border-color: hsl(var(--border))` and `background-color: hsl(var(--background))` CSS; added `@theme` block for Tailwind color tokens
- **Files modified:** claude-sprite-desktop/src/renderer/src/assets/main.css
- **Verification:** vite build exits 0 with 24KB CSS output
- **Committed in:** 6805d63

---

**Total deviations:** 5 auto-fixed (1 blocking, 4 bugs)
**Impact on plan:** All auto-fixes were necessary blockers or correctness issues. No scope creep. The shadcn ecosystem (framework detection, path alias resolution, circular imports, Tailwind v4 `@apply` limitations) required multiple small fixes not anticipated in the plan.

## Issues Encountered

- shadcn CLI does not support electron-vite framework detection — manual `components.json` was more reliable and gave full control
- Tailwind v4's `@theme` block approach for CSS variables is fundamentally different from v3 shadcn docs; components use `hsl(var(--color))` pattern which works but requires explicit `@theme` declarations for Tailwind utilities to recognize the CSS custom properties

## Next Phase Readiness

- App foundation complete: pnpm build exits 0, all IPC channels registered, shared types exported
- Plans 02 and 03 can import from `sprite-types.ts` for type safety
- `window.spriteAPI` available in renderer for all subsequent UI plans
- Pre-existing test files (from plan preparation) are in place for Plans 02 and 03 to implement

## Self-Check: PASSED

All key files verified on disk. Both task commits found in git log.

---
*Phase: 01-shell-dashboard*
*Completed: 2026-03-19*
