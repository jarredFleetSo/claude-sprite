# Claude Sprite Desktop

## What This Is

A desktop application (Electron + React) that provides a visual interface for managing remote Claude Code workspaces on Sprites. It replaces the `cs` CLI with a GUI — listing sprites, dispatching Claude tasks, streaming live logs, syncing files, and managing workspace lifecycle — packaged as a downloadable app that others can install.

## Core Value

See what's running on every sprite at a glance and interact with it without remembering CLI commands.

## Requirements

### Validated

- ✓ Sprite listing with status (running/cold/stopped) — existing CLI
- ✓ File sync (git-aware tar streaming) — existing CLI
- ✓ Claude dispatch (fire-and-forget with tmux) — existing CLI
- ✓ Context push/pull (sessions, history, settings) — existing CLI
- ✓ API key auth + onboarding bypass — existing CLI
- ✓ Web terminal via ttyd — existing CLI (cs share)
- ✓ Interactive sprite picker — existing CLI

### Active

- [ ] Electron app shell with React frontend
- [ ] Sprite dashboard — list all sprites with live status
- [ ] Dispatch panel — fire Claude tasks, view running dispatches
- [ ] Live log streaming — real-time output from running tasks
- [ ] File sync UI — push/pull with progress indication
- [ ] Sprite lifecycle — create, start, stop, destroy from UI
- [ ] Embedded terminal — xterm.js terminal connected to sprite
- [ ] Setup wizard — first-time config (sprite token, org, API key)
- [ ] Shippable installer — .dmg for Mac, .exe for Windows
- [ ] Auto-update mechanism

### Out of Scope

- Mobile app — web terminal via cs share covers mobile use case
- SaaS/hosted version — this is a local desktop app
- Custom sprite provisioning — uses existing sprite CLI under the hood
- Claude Code plugin/extension — separate product

## Context

The `cs` Rust CLI already implements all the core operations (sync, dispatch, attach, context, auth). The desktop app wraps these operations in a visual interface. It should shell out to the `cs` binary (or reimplement the sprite API calls directly) rather than reimplementing the Rust logic.

The existing codebase has:
- `cli/cs-rs/` — Rust CLI with SpriteClient abstraction (3 exec modes)
- `app/` — Python web dashboard (reference for UI patterns)
- Sprite API at `https://api.sprites.dev/v1/sprites`

Key integration points:
- `sprite` CLI for VM operations (exec, proxy, create, destroy)
- `cs` CLI for higher-level workflows (ready, dispatch, sync, context)
- Sprite API for listing/status (REST + bearer token auth)
- tmux on remote sprites for session management

## Constraints

- **Dependency:** Requires `sprite` CLI installed locally
- **Auth:** Sprite token obtained via `sprite login` (browser OAuth)
- **Platform:** Mac primary, Windows secondary (Electron handles cross-platform)
- **No server:** Purely local app — no hosted backend needed
- **Existing CLI:** Should leverage `cs` binary where possible, not rewrite Rust logic

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Electron + React | Cross-platform, mature ecosystem, large community | — Pending |
| Shell out to cs CLI | Avoid reimplementing sync/dispatch/context logic | — Pending |
| Sprite API direct calls | For listing/status — faster than shelling out | — Pending |
| xterm.js for terminal | Same tech as existing dashboard, proven for web terminals | — Pending |

---
*Last updated: 2026-03-19 after initialization*
