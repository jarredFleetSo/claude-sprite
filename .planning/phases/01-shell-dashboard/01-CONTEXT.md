# Phase 1: Shell + Dashboard - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Electron app shell with setup wizard, sprite dashboard showing live status, and lifecycle controls (start/stop/destroy/create). Users can open the app, complete setup once, and manage sprites visually. Dispatch, file sync, terminal, and packaging are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Setup wizard flow
- Multi-step pages with back/next buttons (Step 1: Sprite token, Step 2: Org, Step 3: API key)
- Step 1 has a "Run sprite login" button that opens browser, waits for token, auto-fills when OAuth completes
- API key collected during setup (Step 3), not deferred
- If existing `~/.config/cs/config.toml` found, auto-import and skip wizard entirely — go straight to dashboard
- Config stored in electron-store, persists across restarts

### Dashboard layout
- Card grid layout — each sprite as a card (like Docker Desktop containers)
- Full-width dashboard with header bar containing app controls and "Create sprite" button
- No sidebar navigation in Phase 1

### Sprite card content
- Name + colored status badge (running/cold/stopped)
- Last active time ("Active 5m ago", "Idle 2h")
- Running task preview (if dispatching: truncated prompt or "Running: refactor auth...")
- Quick action buttons directly on card (Start/Stop/Terminal/Dispatch)

### Empty state
- Friendly illustration + "Create your first sprite" CTA button
- Suggest getting started message

### Lifecycle UX
- Destroy: Modal confirmation dialog with type-to-confirm ("Are you sure? This cannot be undone.")
- Start (cold sprite, ~30-60s): Spinner indicator on card, status shows "Starting..."
- Stop: Immediate status change to "Stopping...", no confirmation needed
- Create: Modal dialog form (name field + create button), pops up over dashboard

### Visual style
- Theme: Both dark and light, follows OS preference with user override
- Reference aesthetic: Linear — minimal, monochrome, lots of whitespace, subtle borders
- Status colors: Green/amber/red traffic light (running=green, cold=amber, stopped=red)
- Component library: shadcn/ui (Radix primitives + Tailwind)

### Claude's Discretion
- Exact Tailwind color tokens for the palette
- Typography scale and font choice
- Header bar layout and controls
- Card hover/interaction states
- Loading skeleton design
- Polling interval for status auto-refresh
- Error state handling (API unreachable, token expired)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing CLI (reference implementation)
- `cli/cs-rs/src/api.rs` — Sprite API integration, `list_sprites()` with fallback, relative time formatting
- `cli/cs-rs/src/config.rs` — TOML config format at `~/.config/cs/config.toml`, fields: sprite_token, org, sprite_name, tmux_session
- `cli/cs-rs/src/resolve.rs` — Sprite name resolution chain (arg → .cs.toml → global → picker)
- `cli/cs-rs/src/output.rs` — Status icons and formatting (ICON_RUNNING=●, ICON_SLEEPING=◐, ICON_STOPPED=○)

### Research
- `.planning/research/STACK.md` — Recommended Electron + React stack with versions
- `.planning/research/ARCHITECTURE.md` — Main/renderer split, IPC patterns, electron-vite setup
- `.planning/research/PITFALLS.md` — PATH resolution, IPC security, code signing timeline

### Codebase context
- `.planning/codebase/INTEGRATIONS.md` — Sprite API endpoints, auth flow, external dependencies

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `cli/cs-rs/src/api.rs`: `list_sprites()` shows the API call pattern — tries `sprite api /v1/sprites` first, falls back to direct curl with bearer token
- `cli/cs-rs/src/config.rs`: `GlobalConfig` struct shows the TOML format to migrate from
- `app/public/style.css`: Terminal aesthetic styles (reference for dark theme palette)

### Established Patterns
- Sprite API returns JSON array with fields: name, status, last_active_at
- Status values: "running", "cold", "stopped" (from `api.rs` formatting)
- Config lives at `~/.config/cs/config.toml` with fields: sprite_token, org, sprite_name, tmux_session

### Integration Points
- Sprite API: `https://api.sprites.dev/v1/sprites` with bearer token auth
- `sprite` CLI: `sprite create`, `sprite start`, `sprite stop`, `sprite destroy` for lifecycle
- `sprite login`: Opens browser for Fly.io OAuth, writes token on completion

</code_context>

<specifics>
## Specific Ideas

- Linear-like aesthetic: minimal, monochrome, whitespace, subtle borders
- Card grid like Docker Desktop's container view
- Traffic light status colors (green/amber/red) are non-negotiable
- Setup should feel instant for existing cs CLI users (auto-import config)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-shell-dashboard*
*Context gathered: 2026-03-19*
