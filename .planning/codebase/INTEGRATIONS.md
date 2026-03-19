# External Integrations

## Sprite API

**Provider:** sprites.dev (built on Fly.io)
**Auth:** Token-based (`SPRITE_TOKEN` in config)
**Used by:** `cli/cs-rs/src/api.rs`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/sprites` | GET | List all sprites with status |
| Sprite CLI commands | exec, proxy, url, create, destroy, start, stop | VM lifecycle |

**CLI dependency:** `sprite` binary must be on PATH. All remote operations route through `sprite exec`.

**Auth flow:**
1. `sprite login` → browser OAuth via Fly.io
2. Token stored by sprite CLI
3. `cs` reads token from `~/.config/cs/config.toml`
4. Fallback: direct curl with bearer token to API

## Anthropic API

**Provider:** Anthropic (Claude Code)
**Auth:** API key (`ANTHROPIC_API_KEY`)
**Used by:** `cli/cs-rs/src/auth.rs`, `cli/cs-rs/src/context.rs`

Not called directly — the CLI pushes the API key to the sprite where Claude Code uses it. Key management:
- Stored in `~/.claude_env` on sprite
- Sourced via `.bashrc` and `.profile`
- Pushed via `cs auth` command

## Cloudflare (Tunnel + Access)

**Provider:** Cloudflare Zero Trust
**Auth:** Tunnel token (`CLOUDFLARE_TUNNEL_TOKEN`)
**Used by:** `scripts/modules/04-cloudflared.sh`, `cli/cs-rs/src/main.rs` (cs share)

| Integration | Purpose |
|-------------|---------|
| Cloudflare Tunnel | Outbound-only tunnel from VM to edge |
| Cloudflare Access | Authentication at edge before traffic reaches services |
| Quick Tunnel | `cloudflared tunnel --url` for ad-hoc sharing (no account) |

Services exposed through tunnel:
- code-server (port 8080) → `code.domain.com`
- ttyd (port 7681) → `term.domain.com`
- Dashboard (port 8888) → `dash.domain.com`

## ttyd

**Provider:** github.com/tsl0922/ttyd
**Used by:** `scripts/modules/03-ttyd.sh`, `cli/cs-rs/src/main.rs` (cs share)
**Port:** 7681 (default), 8080 (for sprite URL sharing)

Web-based terminal. `cs share` auto-installs if missing, starts with Tokyo Night theme and mobile-optimized settings.

## tmux

**Used everywhere:** CLI attach, dispatch, run, share
**Session name:** `workspace` (configurable)

All entry points (SSH, code-server, ttyd, dashboard) attach to same tmux session. `cs dispatch` and `cs run` create named windows within this session.

## Git

**Used by:** `cli/cs-rs/src/sync.rs`, `cli/cs-rs/src/paths.rs`

- Sync uses `git ls-files` for file listing (respects .gitignore)
- Path detection uses `git rev-parse --show-toplevel`
- SSH keys synced via `cs ssh-keys` for remote git operations

## Claude Code

**Used by:** `cli/cs-rs/src/auth.rs`, `cli/cs-rs/src/context.rs`

Onboarding bypass writes to `~/.claude.json`:
- `hasCompletedOnboarding: true`
- `lastOnboardingVersion: "99.0.0"`
- `projects[*].hasTrustDialogAccepted: true`

Cascade: jq → node → python3 → sed

## External CLI Tools

| Tool | Required | Used by |
|------|----------|---------|
| `sprite` | Yes | All remote operations |
| `tar` | Yes | File sync (cs sync, cs pull) |
| `tmux` | On sprite | Session management |
| `cloudflared` | Optional | cs share (auto-installed) |
| `ttyd` | Optional | cs share (auto-installed) |
| `jq` | Optional | Onboarding bypass (preferred) |
| `node` | Optional | Onboarding bypass (fallback) |
| `python3` | Optional | Onboarding bypass (fallback) |
