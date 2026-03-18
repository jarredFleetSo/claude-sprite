# CLAUDE.md

## Project overview

Claude Sprite is a remote development workspace for running Claude Code on persistent cloud VMs (Sprites). Three main components:

1. **`cli/cs-rs/`** — The `cs` CLI (Rust). One-command access to remote workspaces.
2. **`app/`** — Web dashboard (Python stdlib, no deps). Mobile-friendly workspace management.
3. **`scripts/`** — Bootstrap scripts for Sprite VM provisioning.

## CLI (`cli/cs-rs/`)

### Build

```bash
cd cli/cs-rs && cargo build --release
# Binary: target/release/cs2
```

### Architecture

- **Synchronous** — no tokio. All remote ops go through `sprite exec`.
- **`SpriteClient`** (`src/sprite.rs`) — core abstraction with 3 exec modes:
  - `exec()` — capture stdout/stderr
  - `exec_with_stdin()` — pipe streaming (writer thread avoids deadlock)
  - `exec_tty()` — Unix `exec()` process replacement
- **Base64 encoding** for safe variable transport across remote exec layers (`build_remote_script`)
- **Sprite resolution chain**: explicit arg → `.cs.toml` → global config → interactive picker

### Key modules

| Module | Purpose |
|--------|---------|
| `main.rs` | clap dispatch, command implementations |
| `cli.rs` | clap derive structs |
| `sprite.rs` | SpriteClient (3 exec modes) |
| `resolve.rs` | Sprite name resolution chain |
| `config.rs` | TOML config + `.cs.toml` + legacy migration |
| `sync.rs` | Git-aware tar streaming with progress |
| `context.rs` | Session/history/settings push/pull |
| `dispatch.rs` | Dispatch + run: tmux window management |
| `attach.rs` | TERM fix, shell setup, tmux exec |
| `picker.rs` | Interactive arrow-key sprite picker |
| `auth.rs` | API key push + onboarding bypass |
| `output.rs` | Box-drawing UI, icons, styled output |
| `history.rs` | JSONL parse, filter, merge (no python3) |
| `api.rs` | Sprite API + relative time formatting |
| `paths.rs` | Path encoding, git root detection |

### Conventions

- All output goes to stderr (`eprintln!`). Only machine-readable output uses stdout.
- Remote scripts use `r##"..."##` raw strings (double `#` needed for tmux `#{...}` format strings).
- Onboarding bypass cascades: jq → node → python3 → sed.
- Error handling: `thiserror` for `CsError` variants, `?` propagation, user-facing messages via `CsError::user()`.

## Dashboard (`app/`)

Python stdlib only — no pip dependencies. WebSocket terminal via custom implementation.

## Testing

```bash
cs2 list              # verify API connectivity
cs2 ready <sprite>    # full flow test
cs2 --help            # check all commands
```
