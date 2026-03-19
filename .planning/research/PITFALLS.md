# Domain Pitfalls

**Domain:** Electron + React desktop app wrapping a Rust CLI with embedded terminal
**Project:** Claude Sprite Desktop
**Researched:** 2026-03-19

---

## Critical Pitfalls

Mistakes that cause rewrites, blocked releases, or fundamentally broken apps.

---

### Pitfall 1: PATH Not Inherited in macOS Production Builds

**What goes wrong:** When a user launches the packaged `.app` from Finder or the Dock, `process.env.PATH` inside Electron is the system default (`/usr/bin:/bin:/usr/sbin:/sbin`) — not the user's shell PATH. Any `child_process.spawn('cs', ...)` or `spawn('sprite', ...)` that relies on tools installed in `/usr/local/bin`, `/opt/homebrew/bin`, or `~/.cargo/bin` will fail with "command not found". The app works fine when launched from the terminal during development, masking this until QA on a packaged build.

**Why it happens:** macOS does not propagate the user's shell environment to GUI apps launched outside the terminal session. Electron inherits whatever launchd provides, which is stripped down.

**Consequences:** Every `cs` CLI invocation fails silently or with an unhelpful error. The entire app is broken for non-developer users. This is among the top reported Electron issues on macOS.

**Prevention:**
- Use `fix-path` (npm) or manually source the user's shell profile before spawning: call `shell -l -c 'printenv PATH'` once at startup and cache the result.
- Alternatively, require the user to configure the `cs` binary path explicitly in app settings during first-run setup.
- Never use bare binary names in `spawn()` — always resolve to absolute paths.
- Test specifically on packaged `.app` opened from Finder, not just `npm run electron`.

**Warning signs:**
- Spawn errors only appear in production builds, not dev.
- "command not found" or ENOENT errors for `cs` or `sprite`.
- Works when launched via terminal (`open MyApp.app` from shell) but not from Dock.

**Phase:** Address in Phase 1 (Electron shell setup) before any CLI invocation is wired up.

---

### Pitfall 2: Native Module (node-pty) Breaking at Package Time

**What goes wrong:** `node-pty` is a native Node.js addon (compiled C++). It must be rebuilt against the exact Electron ABI version, not the system Node.js version. Without an explicit rebuild step, the packaged app loads the wrong binary and crashes with "invalid ELF header" or "was compiled against a different Node.js version". Additionally, `node-pty` ships a `spawn-helper` executable that Electron only auto-detects `.node` files for — `spawn-helper` must be explicitly unpacked from the ASAR archive or it silently breaks PTY creation.

**Why it happens:** ASAR packaging bundles everything into a virtual filesystem. Native binaries cannot execute from inside ASAR. Electron's auto-detection only covers `.node` extension files.

**Consequences:** Terminal embedding is completely non-functional in packaged builds. Debugging is difficult because errors surface as cryptic binary-load failures.

**Prevention:**
- Run `electron-rebuild` (or Electron Forge's `@electron-forge/plugin-auto-unpack-natives`) after every `npm install`.
- Set `asarUnpack: ["**/node_modules/node-pty/**"]` in electron-builder config explicitly — do not rely on auto-detection.
- Pin Electron and node-pty versions together; validate the combination in CI.
- Add a post-package smoke test that actually opens a PTY session.

**Warning signs:**
- Terminal component throws on first render in packaged app only.
- Error messages referencing ABI version mismatch or binary module load failure.
- `spawn-helper` not found error in logs.

**Phase:** Address at start of terminal embedding phase, before any xterm.js UI work begins.

---

### Pitfall 3: Code Signing and Notarization Blocking Release

**What goes wrong:** macOS requires both code signing AND Apple notarization for apps distributed outside the Mac App Store as of macOS 10.15+. Without notarization, users see "App is damaged and can't be opened" or Gatekeeper blocks the app entirely. The notarization process requires an Apple Developer account ($99/year), specific entitlements for hardened runtime, and correct `electron-builder` configuration. Windows code signing via Azure Trusted Signing now requires 3+ years of verifiable business history for organizations.

**Why it happens:** Apple and Microsoft have tightened distribution requirements progressively. Electron builder's defaults have changed across versions (DMGs are now unsigned by default since v20.43.0), making old tutorials misleading.

**Consequences:** Installer ships but is blocked by the OS on end-user machines. This is discovered post-release, requiring a full re-sign and re-release cycle.

**Prevention:**
- Acquire Apple Developer account and certificates before starting installer work — do not defer this.
- Configure `hardened-runtime: true` and add necessary entitlements (e.g., `com.apple.security.cs.allow-jit` if needed for V8).
- Use `@electron/notarize` with Apple ID + app-specific password or API key (not interactive credentials).
- Test the full sign+notarize pipeline in CI (GitHub Actions) on a real macOS runner, not just locally.
- For Windows: evaluate whether Azure Trusted Signing eligibility applies; if not, plan for EV certificate procurement.

**Warning signs:**
- Skipping "installer" work until the end of the project.
- No Apple Developer account set up yet when installer phase begins.
- Assuming "code signed" and "notarized" are the same thing.

**Phase:** Research and account setup in Phase 1. Full implementation in installer/distribution phase.

---

### Pitfall 4: IPC Architecture That Doesn't Scale

**What goes wrong:** Starting with `nodeIntegration: true` and no preload script because it's "faster to develop" creates an architecture that must be ripped out before shipping. Alternatively, building a generic IPC bridge that exposes `ipcRenderer.invoke` broadly to the renderer allows arbitrary main-process access from any renderer code — a security anti-pattern. The refactor to proper channel-scoped IPC mid-project is painful and breaks existing UI code.

**Why it happens:** Context isolation and preload-based IPC feels like overhead when prototyping. The security model is non-obvious to developers coming from web backgrounds.

**Consequences:** Either a security hole ships in production, or a major refactor is required. From Electron 20+, preload scripts are sandboxed by default — apps built assuming Node.js access in preload scripts break silently on upgrade.

**Prevention:**
- Start with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` from day one — these are now Electron defaults.
- Define a typed IPC API surface in the preload script with explicit, named channels (e.g., `window.spriteAPI.listSprites()`), not a raw `invoke` passthrough.
- Keep the preload script minimal — only expose what the renderer actually needs.
- Validate IPC message senders in `ipcMain.handle` handlers.

**Warning signs:**
- Any tutorial or boilerplate using `nodeIntegration: true` — do not copy this.
- A preload script that does `contextBridge.exposeInMainWorld('ipc', ipcRenderer)`.
- Renderer code doing `require('electron')` directly.

**Phase:** Establish correct IPC architecture in Phase 1 before any feature work. Changing it later breaks everything.

---

## Moderate Pitfalls

Mistakes that cause significant rework or poor user experience.

---

### Pitfall 5: Terminal Resize Not Propagated to PTY

**What goes wrong:** xterm.js renders at one size but the underlying PTY (node-pty) retains a different column/row count. When the user resizes the window, vim, tmux, and interactive programs display garbled output, wrong line wrapping, or fail to repaint. This is especially problematic for this project because the remote sprite shells use tmux — tmux has its own size negotiation separate from the PTY.

**Why it happens:** Resize is a multi-step roundtrip: xterm.js `FitAddon` computes new dimensions → IPC to main process → `pty.resize(cols, rows)` → PTY signals the shell. Any broken link in this chain produces the symptom. Additionally, xterm.js `FitAddon.fit()` must be called after the DOM container has layout (not before first render).

**Prevention:**
- Wire up `terminal.onResize` → IPC → `pty.resize()` from the start.
- Use a `ResizeObserver` on the xterm container element, not just `window.resize` events.
- Call `fitAddon.fit()` only after the xterm container has non-zero dimensions.
- For tmux-connected sessions: additionally send `resize-window -t <session>` or rely on tmux's own resize detection.

**Warning signs:**
- vim or tmux look correct at initial size but break after any window resize.
- `FitAddon.fit()` called in component constructor before DOM mount.
- Missing `terminal.onResize` handler after setting up xterm.

**Phase:** Terminal embedding phase. Must be tested with actual vim/tmux, not just shell echo output.

---

### Pitfall 6: IPC Listener Accumulation Causing Memory Leaks

**What goes wrong:** Electron apps that register `ipcMain.on()` or `ipcRenderer.on()` listeners inside React component lifecycle (or in response to window creation) without removing them on unmount/window-close accumulate listeners over time. With live log streaming (this project's use case), a stream subscription per dispatch view that's never cleaned up can drive memory from ~350MB to 1.5GB+ over a day of use.

**Why it happens:** Unlike browser `addEventListener`, Electron IPC listeners don't auto-clean on component unmount. `ipcMain.on` is global and persists. Developers familiar with React's effect cleanup patterns sometimes forget the IPC side needs the same treatment.

**Prevention:**
- Use `ipcMain.handle` (one handler per channel, automatically replaced) over `ipcMain.on` for request/response patterns.
- For event streams (log tailing), use a subscription pattern with explicit unsubscribe IPC message.
- In React: always return a cleanup function from `useEffect` that calls `ipcRenderer.removeListener`.
- Use `ipcRenderer.removeAllListeners(channel)` defensively on component unmount.
- Track memory usage (`process.memoryUsage().rss`) during extended use in testing.

**Warning signs:**
- `ipcMain.on()` inside BrowserWindow creation callback.
- No cleanup in React `useEffect` hooks that set up IPC listeners.
- Memory grows steadily when opening/closing dispatch views.

**Phase:** Establish cleanup patterns in Phase 1 IPC layer. Enforce in log streaming phase.

---

### Pitfall 7: Spawning cs Binary With Wrong Working Directory

**What goes wrong:** `child_process.spawn('cs', args)` inherits the Electron main process's `cwd`, which is the app bundle directory — not the user's project directory or any meaningful workspace. `cs` commands like `cs sync` that are git-aware will fail to find the git root or operate on the wrong directory entirely.

**Why it happens:** Unlike terminal use where cwd comes from the shell, Electron's cwd is set at process launch and points into the app installation path.

**Prevention:**
- Always pass an explicit `cwd` option to every `spawn()` call.
- For per-project commands, resolve the project directory from app state (sprite config) rather than inheriting process cwd.
- For `cs sync` specifically, verify the source path is passed as an explicit argument, not inferred from cwd.

**Warning signs:**
- `cs sync` errors about "not a git repository".
- Commands working in dev (where cwd is the repo root) but failing when packaged.

**Phase:** CLI integration phase, first time cs binary is invoked.

---

### Pitfall 8: App Translocation Breaking Relative Paths on macOS

**What goes wrong:** When a user downloads the `.dmg`, mounts it, and runs the app directly from the mounted volume without dragging it to Applications, macOS App Translocation executes the app from a randomized temporary path (`/private/var/folders/...`). Any path constructed relative to `process.execPath` (e.g., to find a bundled `cs` binary) breaks immediately.

**Why it happens:** macOS App Translocation was introduced in macOS 10.12 to prevent path-relative code injection. It applies to apps with the quarantine attribute that haven't been moved from their download location.

**Prevention:**
- Use a DMG installer with a drag-to-Applications prompt — moving the app to Applications removes translocation.
- Never construct paths relative to `process.execPath` without an absolute fallback.
- Test the exact "downloaded and run from DMG without installing" flow.

**Warning signs:**
- App works after dragging to Applications but not when run from mounted DMG.
- Path-construction code using `path.dirname(process.execPath)`.

**Phase:** Installer/distribution phase. DMG design should enforce the drag-to-Applications pattern.

---

### Pitfall 9: Auto-Update Requiring Code Signing to Be Complete First

**What goes wrong:** `electron-updater`'s auto-update is tightly coupled to code signing — on macOS it won't apply updates to unsigned apps, and on Windows, `Squirrel.Windows` does not validate signatures at all (a separate security concern). Teams often plan "add auto-update later" without realizing that the update infrastructure (S3 bucket or GitHub Releases, signed installer artifacts, `latest.yml` manifest) must be set up before users receive v1 or there's no upgrade path.

**Why it happens:** Auto-update feels like a post-launch concern. In practice, it must be wired during the same phase as packaging because it requires signed artifacts.

**Prevention:**
- Design the update server and release pipeline alongside (not after) the installer.
- Only call `autoUpdater.checkForUpdatesAndNotify()` when `app.isPackaged` is true.
- Test the full update cycle (v0.0.1 → v0.0.2) in CI before shipping v1.
- Be aware that `electron-updater`'s Windows signature check is string-comparison only (publisher name) — not cryptographic.

**Warning signs:**
- Auto-update skipped in "MVP" scope without a plan for how existing installs upgrade.
- Update check code running in development builds causing spurious network calls.

**Phase:** Installer phase. Not deferrable past first public release.

---

## Minor Pitfalls

Gotchas that cause confusion but are fixable without major rework.

---

### Pitfall 10: Multiple App Instances Opening Simultaneously

**What goes wrong:** On Windows and Linux, clicking the app icon when it's already running opens a second instance instead of focusing the existing window. Both instances try to bind to the same resources (IPC ports, lock files) and behave erratically.

**Prevention:** Call `app.requestSingleInstanceLock()` at startup. If it returns false, quit immediately. Handle the `second-instance` event to focus and restore the existing window.

**Warning signs:** Not present in most boilerplates; easy to miss.

**Phase:** Phase 1, app shell setup.

---

### Pitfall 11: `app.on('ready')` vs `app.whenReady()`

**What goes wrong:** The `app.on('ready', ...)` pattern has a race condition: if `ready` already fired before the listener is registered, the callback never runs. This causes the app to launch with no windows on some machines.

**Prevention:** Use `app.whenReady().then(...)` — it handles already-fired ready correctly.

**Warning signs:** App sometimes launches with no window; inconsistent behavior across machines.

**Phase:** Phase 1. Use correct pattern from the start.

---

### Pitfall 12: Slow Startup From Unbundled require() Calls

**What goes wrong:** Electron apps that don't bundle their renderer (or bundle with Webpack's slower configuration) pay a synchronous `require()` cost for every module at startup. A complex React app with many dependencies can add 2-5 seconds to cold start time.

**Prevention:**
- Use Vite (via `electron-vite` or Electron Forge Vite template) rather than Webpack — significantly faster builds and smaller output.
- Bundle the main process too, not just the renderer.
- Lazy-load heavy modules (terminal, logs view) behind route-based code splitting.

**Warning signs:** Startup time over 2 seconds on a modern machine in dev mode.

**Phase:** Phase 1 tooling setup. Changing bundlers mid-project is painful.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Electron shell setup | Wrong IPC defaults (nodeIntegration, contextIsolation) | Use secure defaults from day one |
| Electron shell setup | `app.on('ready')` race | Use `app.whenReady()` |
| Electron shell setup | Multiple instances | `requestSingleInstanceLock()` immediately |
| CS CLI integration | PATH not found in production | Resolve PATH from shell at startup; use absolute paths |
| CS CLI integration | Wrong cwd for git operations | Always pass explicit `cwd` to spawn |
| Terminal embedding | node-pty not rebuilt for Electron ABI | Rebuild step in postinstall + ASAR unpack config |
| Terminal embedding | Resize not propagated to PTY | Wire ResizeObserver → IPC → pty.resize from day one |
| Live log streaming | IPC listener accumulation | cleanup patterns enforced in Phase 1 IPC layer |
| Installer/packaging | Notarization account not ready | Acquire Apple Developer account before packaging work |
| Installer/packaging | App translocation from DMG | DMG drag-to-Applications enforced |
| Auto-update | No update path for v1 users | Design update pipeline before first release |

---

## Sources

- [Electron Security Documentation](https://www.electronjs.org/docs/latest/tutorial/security) — HIGH confidence
- [Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) — HIGH confidence
- [Electron Code Signing](https://www.electronjs.org/docs/latest/tutorial/code-signing) — HIGH confidence
- [Electron Performance](https://www.electronjs.org/docs/latest/tutorial/performance) — HIGH confidence
- [Electron Native Node Modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules) — HIGH confidence
- [node-pty GitHub (microsoft)](https://github.com/microsoft/node-pty) — HIGH confidence
- [electron-builder Auto Unpack Native Modules](https://www.electronforge.io/config/plugins/auto-unpack-natives) — HIGH confidence
- [electron-builder ASAR unpack issue](https://github.com/electron-userland/electron-builder/issues/1285) — MEDIUM confidence
- [Electron PATH issue #5626](https://github.com/electron/electron/issues/5626) — HIGH confidence (long-standing known issue)
- [xterm.js resize issues](https://github.com/xtermjs/xterm.js/issues/3873) — MEDIUM confidence
- [electron-updater signature bypass (Doyensec)](https://blog.doyensec.com/2020/02/24/electron-updater-update-signature-bypass.html) — MEDIUM confidence
- [macOS App Translocation (Eclectic Light)](https://eclecticlight.co/2024/05/14/lost-in-translocation/) — MEDIUM confidence
- [Memory leaks in Electron (Mindful Chase)](https://www.mindfulchase.com/explore/troubleshooting-tips/frameworks-and-libraries/diagnosing-and-fixing-memory-leaks-in-electron-applications.html) — MEDIUM confidence
- [IPC memory leak issue #27039](https://github.com/electron/electron/issues/27039) — MEDIUM confidence
- [child_process spawn locks renderer macOS](https://github.com/electron/electron/issues/26143) — MEDIUM confidence
