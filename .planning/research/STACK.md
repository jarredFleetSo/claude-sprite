# Technology Stack

**Project:** Claude Sprite Desktop (Electron + React)
**Researched:** 2026-03-19
**Domain:** Cross-platform desktop app wrapping a Rust CLI for remote dev workspace management

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Electron | 35+ (pin to latest stable) | Desktop shell, Node.js runtime, system access | Industry standard for cross-platform desktop with web UI. Versions 35+ ship Chromium 130+ and Node 22. Current latest is v39. |
| React | 19.x | UI rendering | Mature component model, concurrent rendering for live log streaming, huge ecosystem. React 19 stable as of late 2024. |
| TypeScript | 5.x | Type safety | Catches IPC contract mismatches at compile time — critical since main/renderer communicate through a narrow bridge. |
| electron-vite | 5.x | Build tooling | Purpose-built for Electron: separate Vite configs for main, preload, and renderer. Instant HMR for renderer. Hot reload for main process. Released v5.0 December 2025. Use over CRA/plain Vite. |

**Confidence:** HIGH — electron-vite is the de facto standard build tool for new Electron projects in 2025/2026. All major community templates use it. Official electron-vite docs at electron-vite.org confirm v5.0.

### Scaffold Command

```bash
pnpm create @quick-start/electron . --template react-ts
```

This produces the electron-vite React TypeScript template with sensible defaults for main/preload/renderer separation.

### UI / Styling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Tailwind CSS | 4.x | Utility-first styling | v4 rewrote the engine — no PostCSS config needed, faster builds, native CSS variables. Integrates cleanly with electron-vite + Vite. |
| shadcn/ui | latest | Component library | Copy-paste components built on Radix UI primitives. No runtime dependency lock-in. Accessible by default. Dark mode via CSS variables — suits a developer tool. Ships directly into your source tree, not as a black-box npm package. |
| Lucide React | latest | Icons | shadcn/ui's default icon set. Consistent, tree-shakeable SVG icons. |

**Confidence:** HIGH — A dedicated `shadcn-electron-app` repo exists from the shadcn author himself. Multiple 2025 guides confirm Tailwind v4 + shadcn + electron-vite as a working combination.

**Note on setup:** shadcn/ui requires a few extra steps beyond a standard Vite React project because of the dual-process nature of Electron. Follow the `path aliases in both tsconfig and vite.config` pattern from the 2025 guide at blog.mohitnagaraj.in.

### Terminal Embedding

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @xterm/xterm | 6.x | Terminal emulator UI | The canonical web terminal library. Used by VS Code, Hyper, and the existing `cs share` dashboard. v6 is the current scoped package (old `xterm` 5.x is deprecated). |
| @xterm/addon-fit | 6.x | Auto-resize terminal to container | Required for responsive layout. |
| @xterm/addon-web-links | 6.x | Clickable URLs in output | Quality-of-life for log output. |
| node-pty | 1.x | PTY spawn for local shells | Required to give xterm.js a real pseudoterminal. Lives in main process; communicates to renderer via IPC. Native module — requires electron-rebuild. |

**Confidence:** HIGH for xterm.js (v6 scoped package confirmed on npm, matches existing `cs share` tech). MEDIUM for node-pty (requires native compilation; well-documented Electron integration but adds packaging complexity — see PITFALLS.md).

**Package name change:** The old `xterm` npm package is deprecated. The new package is `@xterm/xterm`. All addons similarly moved to `@xterm/*` scope.

**Architecture for terminal:** node-pty runs in main process only. Renderer sends input via `ipcRenderer.send('pty:input', data)`, main process writes to PTY. Main process pipes PTY output back via `ipcMain` → `BrowserWindow.webContents.send('pty:output', data)`.

### State Management

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Zustand | 5.x | UI and application state | Minimal boilerplate. Single-file stores. No Provider wrapping. Perfect for sprite list, dispatch status, settings. ~8KB vs Redux's ~43KB. |
| TanStack Query | 5.x | Server/async state (Sprite API calls) | Handles caching, background refetch, and stale-while-revalidate for sprite listing and status polling. Eliminates manual loading/error state boilerplate. Works in Electron renderers without modification. |

**Confidence:** HIGH — Both are current 2025 consensus choices. TanStack Query v5 is stable. Zustand v5 is stable. The combination (Zustand for local UI state, TanStack Query for remote API state) is the recommended split.

**Do not use:** Redux Toolkit — excessive boilerplate for this project size. Context API alone — no caching or background refetch semantics.

### IPC / Process Architecture

| Pattern | Purpose | Why |
|---------|---------|-----|
| contextBridge + preload script | Expose safe API surface to renderer | Security requirement. `contextIsolation: true`, `nodeIntegration: false`. Only expose typed functions through bridge, not raw Node APIs. |
| `child_process.spawn` in main process | Shell out to `cs` CLI | The existing Rust CLI handles sync, dispatch, context push/pull. Spawn it from main process, stream stdout/stderr back to renderer via IPC. Never call CLI from renderer. |
| Direct HTTPS fetch from renderer | Sprite API polling | `https://api.sprites.dev/v1/sprites` — simple REST with bearer token. TanStack Query in renderer handles this directly. No need to proxy through main process for read-only API calls. |
| `utilityProcess` API | Long-running background work (optional) | Electron's modern alternative to `child_process.fork` for persistent workers. Consider for streaming log tail if plain spawn becomes unwieldy. |

**Confidence:** HIGH — Electron security docs confirm contextIsolation + preload is the required pattern since Electron 12. The split between "CLI via spawn in main" vs "API via fetch in renderer" matches the existing codebase's own architecture (see `api.rs` which falls back from `sprite api` CLI to direct curl).

### Packaging and Distribution

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| electron-builder | 25.x | Package + installer | More mature than Electron Forge, higher download volume, better DMG/NSIS output customization. Supports GitHub Releases as update provider out of the box. |
| electron-updater | (bundled with electron-builder) | Auto-update | Ships with electron-builder. 2 lines of code to wire up auto-updates from GitHub Releases. Supports staged rollouts and download progress. |

**Confidence:** HIGH — electron-builder is the more popular choice (13K+ GitHub stars) with proven DMG + NSIS output. electron-updater from the same package is the standard auto-update path for GitHub-hosted releases.

**Packaging format targets:**
- macOS: `.dmg` (primary target per PROJECT.md)
- Windows: NSIS `.exe` installer (secondary)
- Code signing: Required for macOS notarization (Gatekeeper) and Windows SmartScreen. Use Apple Developer ID + Azure Trusted Signing for Windows (cheapest path as of 2025).

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-router-dom | 7.x | Client-side routing | For navigating between dashboard, dispatch panel, settings views |
| date-fns | 3.x | Date formatting | Relative timestamps ("2 min ago") for sprite last-active display |
| clsx + tailwind-merge | latest | Conditional class names | Standard shadcn/ui dependency for dynamic Tailwind classes |
| zod | 3.x | Schema validation | Validate IPC message shapes and API response parsing in renderer |
| electron-store | 9.x | Persistent user settings | Electron-native key/value store backed by JSON file. For sprite token, org, preferences. Replaces the TOML config from the CLI. |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Build tooling | electron-vite | Electron Forge | Forge is easier to start but less flexible; electron-vite has better HMR story and is the 2025 community standard for custom setups |
| Build tooling | electron-vite | plain Vite | Plain Vite doesn't handle Electron's multi-process build (main + preload + renderer) |
| UI components | shadcn/ui | Ant Design / MUI | AntD/MUI are heavy runtime dependencies; shadcn/ui stays in your source tree and is zero-overhead |
| Styling | Tailwind v4 | CSS Modules | CSS Modules are fine but Tailwind v4's speed and shadcn compatibility make it the obvious choice here |
| State | Zustand + TanStack Query | Redux Toolkit | RTK is 5x larger and requires more boilerplate for the same result in a single-developer project |
| Terminal | @xterm/xterm | React Terminal UI | xterm.js is battle-tested in VS Code and the existing dashboard; React Terminal UI abstractions are leaky |
| Packaging | electron-builder | Electron Forge | Forge is first-party but less configurable; electron-builder is the community preference for custom DMG/NSIS output |
| Desktop framework | Electron | Tauri | Tauri is Rust-native but the web ecosystem around terminal embedding and distribution is less mature; Electron's overhead is acceptable for a dev tool |
| Desktop framework | Electron | NW.js | NW.js is largely abandoned; Electron is the clear choice |

---

## Installation

```bash
# Create project from electron-vite React TypeScript template
pnpm create @quick-start/electron claude-sprite-desktop --template react-ts
cd claude-sprite-desktop

# Core UI
pnpm add react-router-dom zustand @tanstack/react-query

# Terminal
pnpm add @xterm/xterm @xterm/addon-fit @xterm/addon-web-links node-pty

# Utility
pnpm add electron-store date-fns clsx tailwind-merge zod

# Dev dependencies
pnpm add -D tailwindcss @tailwindcss/vite electron-builder

# shadcn/ui (run after Tailwind is configured)
pnpm dlx shadcn@latest init
```

**node-pty rebuild** — native module, must be rebuilt against Electron's Node version:
```bash
pnpm add -D @electron/rebuild
# Add to package.json scripts:
# "postinstall": "electron-rebuild -f -w node-pty"
```

---

## Key Architecture Constraints

These are not preferences — they are hard requirements given Electron's security model:

1. **node-pty and child_process.spawn live in main process only.** Never import them in the renderer. Expose their output via typed IPC channels through the preload script.

2. **contextIsolation: true, nodeIntegration: false** — mandatory for any app that ships to users. The preload script is the only surface where Node APIs touch renderer code.

3. **@xterm/xterm v6 only** — the old `xterm` package is deprecated and unmaintained. Do not use `xterm` (v5.3.0) — use `@xterm/xterm` (v6.x).

4. **electron-builder requires a signed app for macOS distribution.** An Apple Developer Program membership ($99/yr) is required to notarize the DMG. Without notarization, macOS Gatekeeper blocks the app on user machines.

---

## Sources

- electron-vite documentation and v5.0 release: https://electron-vite.org/blog/
- Electron 39 release notes: https://www.electronjs.org/blog/electron-38-0
- @xterm/xterm v6 npm package: https://www.npmjs.com/package/@xterm/xterm
- electron-builder auto-update docs: https://www.electron.build/auto-update.html
- shadcn/ui Electron boilerplate: https://github.com/shadcn/shadcn-electron-app
- Electron security / context isolation: https://www.electronjs.org/docs/latest/tutorial/context-isolation
- node-pty Microsoft repo: https://github.com/microsoft/node-pty
- TanStack Query overview: https://tanstack.com/query/latest/docs/framework/react/overview
- Zustand vs Redux Toolkit 2025: https://markaicode.com/react-19-zustand-vs-redux-toolkit-guide/
- electron-builder vs electron-forge: https://www.electronforge.io/core-concepts/why-electron-forge
- Tailwind v4 shadcn guide: https://ui.shadcn.com/docs/tailwind-v4
- 2025 Electron + Tailwind + shadcn setup: https://blog.mohitnagaraj.in/blog/202505/Electron_Shadcn_Guide
- Azure Trusted Signing for Windows: https://securityboulevard.com/2025/12/how-to-sign-a-windows-app-with-electron-builder/
