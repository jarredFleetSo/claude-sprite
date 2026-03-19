# Feature Landscape

**Domain:** Developer desktop workspace management app (Electron + React)
**Researched:** 2026-03-19
**Analogues studied:** Docker Desktop, GitHub Desktop, VS Code Remote SSH, Warp, Coder, Gitpod

---

## Table Stakes

Features users expect from any developer workspace management tool. Missing these = product feels broken or unfinished.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Sprite list with live status | Users need to know what's running before touching anything. Docker Desktop, Coder — all lead with this. | Low | Sprites.dev API already has list+status. Poll every ~5s. |
| Running/cold/stopped indicators | Three states already in the CLI. Desktop must surface them visually with color-coded dots. | Low | Analogous to Docker's container status dots. |
| Start / stop / wake actions | One-click lifecycle management. If users have to use CLI for this, the app adds no value. | Low | Already implemented in `server.py` via Sprite API. |
| Create sprite | Needs a form + name validation. Table stakes once you're managing multiple sprites. | Low | Already in web dashboard (`create_sprite`). |
| Destroy sprite | Irreversible — needs confirmation dialog. | Low | Already in web dashboard (`destroy_sprite`). |
| First-run setup wizard | Auth token + Anthropic key. Users must be unblocked before they can do anything. Docker Desktop shows this on first launch. | Medium | `cs auth` + `sprite login` flow. Must detect missing config and guide user. |
| Embedded terminal | xterm.js connected to sprite via WebSocket (ttyd). VS Code Remote and the web dashboard both do this. Users expect "click sprite → get shell". | Medium | xterm.js v6 already used in `app/public/index.html`. |
| Dispatch panel — fire a Claude task | The core differentiating workflow. But if it's hidden or hard to find, users won't use it. | Medium | Already in CLI (`dispatch::launch`). Wrap in UI form. |
| Live log streaming | Users need to see if Claude is working. Dead silence kills trust. Docker Desktop streams container logs. | Medium | `~/.cs-dispatch/latest.log` on sprite; tail via exec. |
| Dispatch status indicator | Running / done / idle — must be visible at a glance without opening logs. | Low | `dispatch::window_status` already returns this. |
| Abort running dispatch | Stop button. Users always want a kill switch. | Low | `dispatch::abort` already exists. |
| File sync (push) | Without sync, Claude is working on stale code. Sync is required before dispatch makes sense. | Medium | `sync::sync` already in CLI. Wrap in progress UI. |
| Settings persistence | API key and sprite token must survive restarts. Entering these every launch is a dealbreaker. | Low | Already in `TokenStore` in web app. Use Electron's `app.getPath('userData')`. |
| Auto-update | Developer tools that require manual updates get abandoned. GitHub Desktop, VS Code — all auto-update. | Medium | Electron provides `autoUpdater`. Requires a releases server (GitHub Releases sufficient). |
| macOS .dmg installer | Primary platform. If install is not drag-to-Applications, users bounce. | Low | `electron-builder` handles this. |

---

## Differentiators

Features that set this product apart. Not expected from day one, but they create real competitive advantage when present.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Multi-sprite dashboard — see all sprites at once | The core insight of the product: "see what's running on every sprite at a glance." No CLI tool gives you this view. | Medium | Grid/list of sprite cards, each with status + dispatch state + last activity. |
| Dispatch history per sprite | Know what Claude was told to do and when. Docker Desktop shows container logs history. Warp shows command history. | Medium | `~/.cs-dispatch/latest.meta` stores metadata. Extend to a rolling log of N dispatches. |
| Context push/pull from UI | `cs context push` and `cs context pull` are the "sync Claude's brain" operations. Making this one-click is non-obvious but powerful. | Medium | `context::push` + `context::pull` in CLI. Expose as buttons on each sprite card. |
| Resume last session | Claude Code's `--resume` flag re-enters a prior conversation. Surfacing this in the UI (vs hiding it behind a flag) is a genuine UX win. | Low | `dispatch::launch` with `resume: true`. Just needs a checkbox or button in the form. |
| Dispatch with auto-sync + auto-context | Default behavior should be: sync files, push context, then dispatch. One button that does all three reduces errors. | Low | This is already the default in `dispatch::launch`. Just need the UI to reflect it. |
| Per-sprite project binding | `cs` uses `.cs.toml` to bind a sprite to a project directory. Making this visible and editable in the app removes a pain point. | Medium | Show bound project path, let user change it via folder picker. |
| Sprite creation wizard | More than a name field: guide user through picking a name, associating a project, and running `cs ready` in one flow. | High | Multi-step wizard. Dependency: `cs ready` which runs sync + context push + wake. |
| Windows .exe installer | Expands total addressable market significantly. Electron handles cross-platform with minor adjustments. | Medium | `electron-builder` supports it. Needs Windows code signing and testing. |
| System tray icon with status | Background app that shows active sprite count or dispatch status from the menu bar. Docker Desktop does this. | Medium | Electron tray API. Show running count or alert on dispatch completion. |
| Native OS notifications | "Claude finished your task" push notification. Developers leave the app and come back. | Low | Electron `Notification` API. Trigger on dispatch status change to "done". |

---

## Anti-Features

Features to explicitly NOT build. Each one has a clear reason and a better alternative.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Code editor / IDE features | VS Code Remote SSH already owns this. Any in-app editing will be worse and will bloat scope 10x. | Open VS Code remotely with one click, or use the embedded terminal. |
| File browser / tree view | Same trap as editor. Complexity is enormous; value is marginal when a terminal is already embedded. | Use embedded terminal for file navigation. |
| Built-in git UI | GitHub Desktop already exists. Adding branches, diffs, and commits to this app is scope explosion. | Sync is the only git operation needed; it's already implemented in `sync::sync`. |
| Custom provisioning UI | Sprites.dev handles VM provisioning. Adding config for CPU/RAM/region requires deep API work with no leverage from existing code. | Use `sprite create` defaults; the focus is on managing workspaces, not creating VMs. |
| Team / multi-user features | Collaboration tooling (sharing, permissions, audit logs) is an enterprise product layer. This is a personal tool. | Ship a local single-user app first. Org features are a future paid tier. |
| Plugin/extension system | Extension marketplaces require enormous ecosystem investment to be useful. Docker Desktop has one; it's mediocre. | Build good first-party features instead. |
| SaaS dashboard / web version | The web dashboard (`app/`) already exists and runs on the sprite itself. Duplicating it as a hosted SaaS adds a backend, auth, and billing — entirely different product. | Keep the desktop app local; the web dashboard covers the remote-access use case. |
| Mobile app | The `cs share` command + ttyd already covers mobile terminal access. | Keep mobile as a browser-based experience. |
| Custom Claude configuration UI | Editing Claude's system prompt, temperature, model config — that's an IDE or Claude.ai feature, not a workspace manager feature. | Let Claude Code's own config files control this. |
| Log search / analytics | Log analysis tooling is a whole product category. Adding search, filters, and aggregations to dispatch logs explodes scope. | Show last 100 lines in the log view. That's enough. |

---

## Feature Dependencies

```
Auth / Token Setup
  └── Sprite List (requires API token)
       └── Sprite Start/Stop/Destroy (requires list)
       └── Multi-sprite Dashboard (requires list)
            └── Dispatch Panel
                  └── File Sync (required before dispatch)
                  └── Context Push (optional but default)
                  └── Live Log Streaming (after dispatch launches)
                       └── Dispatch Status Indicator (from logs + exec)
                       └── OS Notifications (triggered by status change)
                  └── Abort Dispatch
            └── Embedded Terminal (requires sprite to be running/waking)
            └── Context Pull (after Claude task completes)

Setup Wizard
  └── Auth / Token Setup
  └── Sprite Creation Wizard (after first auth)

Auto-update
  └── Installer (.dmg / .exe) (update mechanism builds on install mechanism)
```

---

## MVP Recommendation

Build in this order to get to something shippable quickly:

**Phase 1 — Functional shell**
1. Electron app with React + setup wizard (API token + Anthropic key)
2. Sprite list with status polling (running / cold / stopped)
3. Start / stop / destroy actions

**Phase 2 — Core workflow**
4. Dispatch panel: text field → sync + push + launch
5. Live log streaming (tail `latest.log`)
6. Abort running dispatch
7. Dispatch status indicator

**Phase 3 — Power features**
8. Embedded terminal (xterm.js via ttyd WebSocket)
9. Context pull after task completion
10. Resume session

**Defer post-MVP:**
- Dispatch history (needs schema work on sprite side)
- Sprite creation wizard (multiple steps, error states)
- System tray icon + OS notifications (polish, not core)
- Windows installer (secondary platform; test Mac first)
- Per-sprite project binding UI (advanced; power users already use `.cs.toml`)

---

## Sources

- Docker Desktop feature list: https://docs.docker.com/desktop/ (HIGH confidence — official docs)
- GitHub Desktop overview: https://www.geeksforgeeks.org/git/github-desktop/ (MEDIUM confidence — summary, not official docs)
- Warp SSH and workspace features: https://docs.warp.dev/terminal/warpify/ssh (HIGH confidence — official docs)
- xterm.js documentation: https://xtermjs.org/ (HIGH confidence — official)
- react-xtermjs library: https://www.qovery.com/blog/react-xtermjs-a-react-library-to-build-terminals (MEDIUM confidence — vendor blog)
- Existing web dashboard (`app/server.py`, `app/public/index.html`): reviewed directly (HIGH confidence — first-party source)
- Existing CLI dispatch (`cli/cs-rs/src/dispatch.rs`): reviewed directly (HIGH confidence — first-party source)
- Gitpod workspace lifecycle patterns: https://www.gitpod.io/docs/configure/workspaces (MEDIUM confidence — official but Gitpod is now rebranding)
- Platform engineering anti-patterns: https://jellyfish.co/library/platform-engineering/anti-patterns/ (MEDIUM confidence — industry blog)
- VS Code Remote SSH: https://code.visualstudio.com/docs/remote/ssh (HIGH confidence — official docs)
