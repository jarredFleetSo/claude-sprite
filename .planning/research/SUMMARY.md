# Project Research Summary

**Project:** Claude Sprite Desktop (Electron + React)
**Domain:** Cross-platform desktop app wrapping a Rust CLI for remote AI development workspace management
**Researched:** 2026-03-19
**Confidence:** HIGH

## Executive Summary

Claude Sprite Desktop is a developer workspace management tool in the same category as Docker Desktop and GitHub Desktop — a native GUI front-end for an existing CLI that makes complex workflows accessible to non-terminal users. The product's core value proposition is a multi-sprite dashboard: see all remote workspaces at a glance, fire Claude tasks with one click, and watch live output without touching the terminal. Experts build this category of tool using Electron + React with electron-vite, a strict main/renderer process split, and a contextBridge-based IPC layer that wraps all privileged operations. The existing codebase (Rust CLI, Python web dashboard) provides the functional substrate — the desktop app's job is to surface it through a polished native interface.

The recommended stack is mature and internally consistent: Electron 35+, React 19, TypeScript 5, electron-vite 5, Tailwind CSS v4, and shadcn/ui for components. State is split between Zustand (renderer UI state) and TanStack Query (Sprite API polling). The terminal is xterm.js v6 backed by node-pty in the main process. Packaging uses electron-builder with GitHub Releases for auto-update. This combination is the 2025/2026 community consensus for Electron applications of this complexity, with high-confidence sources for every component.

The dominant risks are operational rather than architectural: macOS PATH inheritance breaks all CLI invocations in packaged builds, node-pty native module compilation must be explicitly configured or the terminal silently fails, and Apple notarization requires account setup and CI pipeline work before any installer ships. These pitfalls are well-documented and preventable if addressed in the right phases — specifically Phase 1 (IPC architecture and PATH resolution) and the packaging phase (code signing infrastructure). The architecture is straightforward; the danger is in deployment details.

---

## Key Findings

### Recommended Stack

The project should be bootstrapped with `pnpm create @quick-start/electron . --template react-ts`, which produces the electron-vite React TypeScript template with correct main/preload/renderer separation out of the box. No custom webpack or build config is needed. The dual-state approach — Zustand for renderer-local UI state, TanStack Query for remote API state — eliminates the need for Redux and cleanly handles both the sprite list polling and the per-dispatch log streaming use cases. Terminal embedding reuses xterm.js v6, already proven in the `cs share` web dashboard, backed by node-pty in the main process only.

See [STACK.md](./STACK.md) for full version table and installation commands.

**Core technologies:**
- Electron 35+ with electron-vite 5: Desktop shell + build tooling — de facto 2025 standard, hot reload for all three processes
- React 19 + TypeScript 5: Renderer UI — concurrent rendering suits live log streaming; TypeScript catches IPC contract mismatches
- Tailwind CSS v4 + shadcn/ui: Styling — no PostCSS config, native CSS variables, accessible components that ship into source tree
- Zustand 5 + TanStack Query 5: State — Zustand for UI state, TanStack Query for API caching and background polling
- @xterm/xterm v6 + node-pty 1.x: Terminal embedding — same tech as existing `cs share` dashboard; node-pty is Microsoft-maintained
- electron-builder 25 + electron-updater: Packaging + auto-update — DMG/NSIS output with GitHub Releases as update provider

### Expected Features

The feature dependency chain is: Auth → Sprite List → Dashboard → Dispatch → Terminal. This ordering is non-negotiable — every feature depends on the one before it.

See [FEATURES.md](./FEATURES.md) for full feature table and anti-feature list.

**Must have (table stakes):**
- First-run setup wizard (API token + Anthropic key) — users are blocked without this
- Sprite list with live status indicators (running / cold / stopped) — every analogous tool leads with this view
- Start / stop / destroy lifecycle actions — without these, the app adds no value over the CLI
- Dispatch panel: text field → sync + push + launch — the core differentiating workflow
- Live log streaming from dispatch — dead silence kills user trust
- Abort running dispatch — users always want a kill switch
- Embedded terminal (xterm.js via ttyd) — "click sprite, get shell" is an expected primitive
- Settings persistence (token, org) — re-entering credentials on every launch is a dealbreaker
- macOS .dmg installer with auto-update — primary distribution target

**Should have (competitive differentiators):**
- Multi-sprite dashboard with per-sprite dispatch state — the core insight that CLI cannot replicate
- Dispatch status indicator (running / done / idle) visible without opening logs
- Context push/pull from UI — one-click "sync Claude's brain" is non-obvious but powerful
- Resume last session (Claude Code `--resume` flag) — surfaces a hidden power feature
- OS notifications on dispatch completion — users leave the app; they need a callback

**Defer (v2+):**
- Dispatch history per sprite — needs schema work on sprite side
- Sprite creation wizard — multi-step, high error-state complexity
- System tray icon — polish feature, not core workflow
- Windows .exe installer — secondary platform; validate Mac first
- Per-sprite project binding UI — power users already use `.cs.toml`

**Anti-features (do not build):**
Code editor, file browser, git UI, custom provisioning UI, team/multi-user features, SaaS web version, mobile app, custom Claude configuration UI, log search/analytics. Each of these is either an existing product category or a scope explosion with no leverage from the current codebase.

### Architecture Approach

The architecture is a strict two-process Electron model: main process owns all Node.js work (CLI spawning via `child_process.spawn`, PTY management via node-pty, IPC handler registration), renderer process is a plain Chromium environment running React (no Node.js access). The contextBridge in the preload script exposes a typed `window.electronAPI` surface — the only channel between the two worlds. IPC handlers are organized by domain (sprites, dispatch, sync, terminal) rather than as a single global handler. Sprite API polling is done directly from the renderer via fetch + TanStack Query (no IPC proxy needed for read-only calls). The `cs` CLI is wrapped in a streaming `runCsCommand()` utility in the main process that pipes stdout/stderr to the renderer via `webContents.send`.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full component diagram, data flow patterns, and suggested project file structure.

**Major components:**
1. CLI Bridge (main process) — spawns `cs` / `sprite` binaries, streams stdout/stderr via IPC
2. PTY Manager (main process) — manages node-pty sessions for the embedded terminal
3. IPC Handler Layer (main process) — domain-scoped `ipcMain.handle()` and `ipcMain.on()` registrations
4. Preload Script (bridge) — exposes typed `window.electronAPI` via contextBridge; nothing else
5. Dashboard (renderer) — sprite list with live status, polling Sprite API via TanStack Query
6. Dispatch Panel (renderer) — fire Claude tasks, stream logs, abort, show status indicator
7. Terminal Component (renderer) — xterm.js UI connected to PTY via IPC
8. Zustand Store (renderer) — UI state cache: sprite list, dispatch status, log buffers

**Critical path for build order:** Electron shell → IPC skeleton → Sprite API → Dashboard → CLI Bridge → Dispatch → Terminal → Packaging.

### Critical Pitfalls

See [PITFALLS.md](./PITFALLS.md) for full prevention strategies, warning signs, and phase assignments.

1. **PATH not inherited in macOS production builds** — `spawn('cs', ...)` fails with ENOENT for every user who launches from Finder. Fix: resolve PATH from `shell -l -c 'printenv PATH'` at startup and cache it; use absolute binary paths. Must be addressed in Phase 1 before any CLI invocation is wired.

2. **node-pty native module breaks at package time** — terminal silently fails in packaged builds due to ASAR bundling. Fix: `electron-rebuild` in postinstall + explicit `asarUnpack: ["**/node_modules/node-pty/**"]` in electron-builder config. Must be addressed at the start of the terminal phase.

3. **Code signing and notarization blocking release** — without Apple notarization, macOS Gatekeeper blocks the app with "App is damaged." Fix: acquire Apple Developer account before packaging work begins; configure `hardened-runtime: true`; wire `@electron/notarize` in CI. Account setup should happen in Phase 1.

4. **IPC architecture that doesn't scale** — starting with `nodeIntegration: true` for development speed creates a refactor-or-ship-insecure dilemma. Fix: start with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` from day one. These are Electron defaults in v35+ and should never be relaxed.

5. **IPC listener accumulation causing memory leaks** — log streaming subscriptions registered without cleanup grow memory to 1.5GB+ over a day of use. Fix: always return cleanup functions from `useEffect` that remove `ipcRenderer` listeners; use `ipcMain.handle` over `ipcMain.on` for request/response patterns. Establish this pattern in Phase 1; enforce in log streaming phase.

---

## Implications for Roadmap

Based on the combined research, 4 phases are suggested. The dependency chain from FEATURES.md and the build order from ARCHITECTURE.md are in strong agreement.

### Phase 1: Electron Shell + Auth + Sprite Dashboard

**Rationale:** Every feature downstream depends on a working Electron app with a valid IPC architecture and an authenticated sprite list. This phase also establishes all the foundational patterns that are expensive to change later: IPC security model, PATH resolution, single-instance lock, and `app.whenReady()` usage. Architecture research identifies this as the critical path entry point.

**Delivers:** Runnable Electron app with auth setup wizard, live sprite list (running/cold/stopped), and start/stop/destroy lifecycle actions.

**Addresses (from FEATURES.md):** First-run setup wizard, sprite list with status indicators, start/stop/destroy actions, settings persistence.

**Avoids (from PITFALLS.md):** Pitfall 1 (PATH), Pitfall 4 (IPC architecture), Pitfall 6 (listener cleanup patterns), Pitfall 10 (single instance lock), Pitfall 11 (`app.whenReady()`), Pitfall 12 (Vite bundling for startup speed).

**Research flag:** Standard patterns — well-documented Electron setup. Skip research-phase.

---

### Phase 2: CLI Bridge + Dispatch Workflow

**Rationale:** The dispatch panel is the core differentiating feature, but it requires the CLI Bridge (streaming `child_process.spawn` wrapper) as infrastructure. Both the dispatch panel and file sync use the same CLI Bridge pattern, making them natural phase partners. Live log streaming and dispatch status indicators are inseparable from dispatch launch.

**Delivers:** Dispatch panel (text field → sync + context push + launch), live log streaming, dispatch status indicator (running/done/idle), abort running dispatch.

**Addresses (from FEATURES.md):** Dispatch panel, live log streaming, abort dispatch, dispatch status indicator, dispatch with auto-sync + auto-context.

**Avoids (from PITFALLS.md):** Pitfall 5 (anti-pattern: polling CLI for live logs — use streaming), Pitfall 6 (listener cleanup for log streams), Pitfall 7 (wrong cwd for git operations — always pass explicit cwd to spawn).

**Research flag:** Standard patterns — CLI spawning and IPC streaming are well-documented. Skip research-phase.

---

### Phase 3: Embedded Terminal

**Rationale:** Terminal embedding has unique infrastructure requirements (node-pty native rebuild, ASAR unpack config) that are distinct from the CLI Bridge used in Phase 2. Separating it prevents native module complexity from blocking dispatch work. It is also lower priority than dispatch — users who need a shell can use the `cs share` web terminal in the meantime.

**Delivers:** Embedded xterm.js terminal connected to a running sprite shell, with correct resize propagation.

**Addresses (from FEATURES.md):** Embedded terminal, context pull after task completion, resume session (via terminal).

**Avoids (from PITFALLS.md):** Pitfall 2 (node-pty ASAR unpack + rebuild), Pitfall 5 (terminal resize not propagated to PTY — ResizeObserver → IPC → pty.resize from day one, tested with actual tmux).

**Research flag:** Terminal embedding with node-pty is well-documented (official node-pty Electron example exists). Skip research-phase, but add a dedicated smoke test for packaged builds.

---

### Phase 4: Packaging, Code Signing, and Auto-Update

**Rationale:** Packaging is last because it depends on all features being complete. However, the Apple Developer account and CI pipeline research must begin in Phase 1 — the infrastructure takes time to set up and cannot be started on the day packaging work begins. Auto-update must be designed alongside packaging because it requires signed artifacts and a release pipeline to function.

**Delivers:** macOS .dmg with drag-to-Applications, code-signed and notarized, auto-update via GitHub Releases.

**Addresses (from FEATURES.md):** macOS .dmg installer, auto-update.

**Avoids (from PITFALLS.md):** Pitfall 3 (code signing/notarization — account setup in Phase 1, implementation here), Pitfall 8 (App Translocation — DMG enforces drag-to-Applications), Pitfall 9 (auto-update requires signed artifacts — design alongside packaging, not after).

**Research flag:** Needs attention during planning — macOS notarization entitlements for V8 JIT (Electron), Windows code signing eligibility, and GitHub Actions macOS runner setup for signing in CI. Recommend a focused research-phase before this phase.

---

### Phase Ordering Rationale

- **Auth before everything:** TanStack Query sprite list calls require a token; no other feature works without it.
- **IPC skeleton before features:** All features route through `window.electronAPI`; the typed surface must exist before any feature code is written.
- **CLI Bridge before Dispatch and Terminal (but separate from Terminal):** Dispatch uses `child_process.spawn`; Terminal uses node-pty. Same IPC layer, different main-process modules. Separating them keeps native module complexity isolated.
- **Packaging last but infrastructure early:** Installer work is the final phase, but Apple Developer account acquisition is Phase 1 work (takes 1-5 business days to process).
- **Terminal before packaging:** node-pty rebuild configuration must be validated in a packaged build before the final packaging phase.

### Research Flags

Phases needing deeper research during planning:
- **Phase 4 (Packaging):** macOS notarization entitlements for Electron V8 JIT runtime, GitHub Actions macOS runner code signing setup, Windows Trusted Signing eligibility requirements. Sparse or outdated tutorials are common — verify against current Electron docs.

Phases with standard patterns (skip research-phase):
- **Phase 1:** Electron + electron-vite + React TypeScript scaffold is a one-command setup with official documentation.
- **Phase 2:** CLI spawning and IPC streaming are core Electron patterns with official examples.
- **Phase 3:** node-pty Electron integration has an official example in the node-pty repository.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All major components verified against official docs and npm packages. electron-vite v5, @xterm/xterm v6, Tailwind v4 + shadcn/ui combination confirmed working in 2025/2026 guides. |
| Features | HIGH | Core features derived from first-party codebase review (dispatch.rs, server.py, index.html). Analogues from Docker Desktop, VS Code Remote SSH, Warp via official docs. |
| Architecture | HIGH | All architecture patterns sourced from official Electron documentation (process model, IPC, contextBridge). node-pty pattern from Microsoft's own Electron example. |
| Pitfalls | HIGH | Critical pitfalls sourced from official Electron issue tracker, Electron security docs, and node-pty repo. macOS PATH issue is a documented Electron bug (#5626). |

**Overall confidence:** HIGH

### Gaps to Address

- **Windows code signing eligibility:** Azure Trusted Signing requires 3+ years of verifiable business history. If Windows distribution is in scope, verify eligibility before committing to that path. Alternative: EV certificate from DigiCert (more expensive but no history requirement).

- **Sprite API token storage location:** ARCHITECTURE.md notes token stored via `Electron safeStorage` or read from `~/.sprite/config`. The exact file path written by `sprite login` should be verified from the CLI source (`config.rs`) before building the setup wizard — reading an existing token vs. writing a new one via the CLI are different flows.

- **cs binary distribution:** The desktop app depends on `cs` being installed on the user's PATH. Research did not resolve whether the app should bundle `cs` as a sidecar binary or require users to install it separately. This is a significant UX decision: bundling adds packaging complexity and version management, but requiring separate installation adds friction for new users.

- **Multi-sprite log channel multiplexing:** ARCHITECTURE.md suggests keying log buffers by sprite name with IPC channel prefixes. The exact multiplexing strategy (separate named channels vs. a single `log:line` channel with sprite metadata) needs a decision before the dispatch phase. The wrong choice requires a refactor when multiple simultaneous dispatches are supported.

---

## Sources

### Primary (HIGH confidence)
- Electron official docs (process model, IPC, contextBridge, security, code signing) — https://www.electronjs.org/docs/latest/
- electron-vite documentation and v5.0 release — https://electron-vite.org/
- @xterm/xterm v6 npm package — https://www.npmjs.com/package/@xterm/xterm
- node-pty Microsoft repo + Electron example — https://github.com/microsoft/node-pty
- electron-builder auto-update docs — https://www.electron.build/auto-update.html
- Electron PATH issue #5626 — https://github.com/electron/electron/issues/5626
- TanStack Query v5 — https://tanstack.com/query/latest/docs/framework/react/overview
- First-party codebase: `cli/cs-rs/src/dispatch.rs`, `app/server.py`, `app/public/index.html`

### Secondary (MEDIUM confidence)
- shadcn/ui Electron boilerplate — https://github.com/shadcn/shadcn-electron-app
- electron-builder ASAR unpack for node-pty — https://github.com/electron-userland/electron-builder/issues/1285
- macOS App Translocation — https://eclecticlight.co/2024/05/14/lost-in-translocation/
- 2025 Electron + Tailwind + shadcn setup guide — https://blog.mohitnagaraj.in/blog/202505/Electron_Shadcn_Guide
- Azure Trusted Signing for Windows — https://securityboulevard.com/2025/12/how-to-sign-a-windows-app-with-electron-builder/
- IPC memory leak issue #27039 — https://github.com/electron/electron/issues/27039
- xterm.js resize issues — https://github.com/xtermjs/xterm.js/issues/3873

### Tertiary (LOW confidence)
- electron-updater signature bypass (Doyensec research) — https://blog.doyensec.com/2020/02/24/electron-updater-update-signature-bypass.html (2020, verify current behavior)

---
*Research completed: 2026-03-19*
*Ready for roadmap: yes*
