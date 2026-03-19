# Architecture

**Analysis Date:** 2026-03-19

## Pattern Overview

**Overall:** Three-tier distributed system with CLI dispatch → remote execution → web dashboard

**Key Characteristics:**
- **Synchronous execution model** — No async runtime in CLI (no tokio). All remote ops route through `sprite exec` system command.
- **SSH transport via Sprite API** — CLI relays all commands through the external `sprite` CLI (not built-in), which handles SSH tunneling.
- **Stateless CLI** — Configuration loaded from filesystem, no persistent state beyond TOML files and history.
- **Web dashboard as secondary interface** — Python stdlib HTTP server with WebSocket terminal, mirrors information from CLI.
- **Session-oriented workspace design** — Everything maps to tmux sessions on remote VM; state persists across CLI sessions.

## Layers

**Presentation (CLI):**
- Purpose: User-facing command interface with styled output and interactive selection
- Location: `cli/cs-rs/src/main.rs`, `cli.rs`, `output.rs`, `picker.rs`
- Contains: clap command definitions, formatted error messages, progress bars, styled terminal output
- Depends on: SpriteClient, configuration, resolution chain
- Used by: End users; dispatches all work to lower layers

**Transport (SpriteClient):**
- Purpose: Abstraction over `sprite exec` CLI with three execution modes
- Location: `cli/cs-rs/src/sprite.rs`
- Contains: ExecOutput struct, three exec modes (capture, stdin piping, TTY replacement)
- Depends on: System `sprite` CLI binary
- Used by: All command implementations; every remote operation goes through this

**Orchestration (Dispatch/Sync/Context):**
- Purpose: Coordinate multi-step workflows (sync files, push context, launch Claude, stream output)
- Location: `cli/cs-rs/src/dispatch.rs`, `sync.rs`, `context.rs`, `attach.rs`
- Contains: Workflow logic, progress reporting, state management (dispatch window status)
- Depends on: SpriteClient, file I/O, tar/git operations
- Used by: main.rs command handlers; implements the actual CLI features

**Configuration:**
- Purpose: Load and merge configuration from multiple sources with environment overrides
- Location: `cli/cs-rs/src/config.rs`, `resolve.rs`
- Contains: GlobalConfig (TOML), ProjectConfig (.cs.toml), sprite resolution chain
- Depends on: TOML parsing, filesystem
- Used by: main.rs during startup; provides SpriteClient parameters

**Web Dashboard (Python):**
- Purpose: Browser-accessible workspace status and terminal view
- Location: `app/server.py`, `session.py`, `terminal_ws.py`, `auth.py`
- Contains: HTTP endpoints, WebSocket terminal, session state store
- Depends on: Python stdlib (no external deps); tmux for session info; sprite exec for remote PTY
- Used by: Remote users accessing dashboard at port 8888

## Data Flow

**Attach to Sprite:**

1. User runs `cs attach [sprite-name]`
2. `resolve_sprite()` determines sprite name (arg → .cs.toml → config → picker)
3. `SpriteClient::new()` creates client with sprite name, org, tmux session
4. `attach::attach()` calls `shell_setup()`, then `client.exec_tty()` with tmux command
5. `exec_tty()` replaces current process with `sprite exec -tty` (Unix exec syscall)
6. User is now in remote tmux session; terminal is directly connected to remote pane

**Sync Project Files:**

1. User runs `cs sync [path] [sprite-name]`
2. Sprite client resolved as above
3. `sync::sync()` checks if path is git repo
4. If git: `git ls-files -z | tar -cf - | sprite exec -- tar -xf -` (streaming tar)
5. If not git: tar all files (with .gitignore filtering)
6. Progress bar shows file count
7. Files extracted at `~/[project-name]/` on sprite

**Push/Pull Claude Context:**

1. User runs `cs context push` or `cs context pull`
2. Identifies local Claude project path: `~/.claude/projects/[encoded-path]/`
3. Encodes remote path based on target sprite's `~/` root
4. Push: copies 5 most recent session JSONs + merges history.jsonl entries + syncs `.claude/` metadata
5. Pull: reverse operation — copies remote context back to local
6. Result: Claude state synchronized across local/remote, enabling session resume

**Dispatch (Fire-and-Forget Claude Task):**

1. User runs `cs dispatch "prompt" [sprite-name]`
2. Optional: sync files, push context, run setup
3. `dispatch::launch()` creates new tmux window called "dispatch" on sprite
4. Runs Claude with prompt in that window; captures dispatch.json metadata
5. Returns immediately; user can check status with `cs dispatch --status`
6. `window_status()` detects running Claude process via pgrep
7. Output streamed to `~/.cs-dispatch/latest.log` on sprite

**State Management:**

- **CLI state**: Configuration files only (~/.config/cs/config.toml, .cs.toml)
- **Remote state**: Tmux sessions, dispatch metadata in ~/.cs-dispatch/, Claude context in ~/.claude/
- **Dashboard state**: Session touches recorded in data/state.json with timestamps and client info
- **Persistence**: No daemon; all state implicit in tmux processes and filesystem

## Key Abstractions

**SpriteClient:**
- Purpose: Unified interface to remote sprite execution
- Examples: `cli/cs-rs/src/sprite.rs`
- Pattern: Wrapper around `sprite exec` command with three modes:
  - `exec(&[&str])` — capture stdout/stderr, return ExecOutput
  - `exec_with_stdin(reader)` — stream stdin (uses writer thread to avoid deadlock)
  - `exec_tty()` — replace process with remote command (no capture)

**Resolution Chain:**
- Purpose: Determine which sprite to target without requiring explicit arguments
- Examples: `cli/cs-rs/src/resolve.rs`
- Pattern: Four-level fallback:
  1. Explicit `--sprite NAME` argument
  2. Project-level `.cs.toml` config
  3. Global `~/.config/cs/config.toml` default
  4. Interactive picker (prompts user with arrow-key selector)

**Workflow Orchestrators:**
- Purpose: Multi-step coordination with progress reporting
- Examples: `dispatch.rs`, `sync.rs`, `context.rs`
- Pattern: Each is a module with `pub fn main_action(client: &SpriteClient) -> Result<()>` that:
  - Validates preconditions
  - Executes steps with visual feedback
  - Returns user-facing success message

**Base64 Encoding for Script Transport:**
- Purpose: Safely pass variables through remote shell layers
- Examples: `build_remote_script()` functions
- Pattern: Encode environment values as base64 in script header, decode on remote before use

## Entry Points

**CLI Entry (`cli/cs-rs/src/main.rs`):**
- Location: `cli/cs-rs/src/main.rs:main()`
- Triggers: `cs` command with any subcommand or no args
- Responsibilities: Parse CLI args via clap, load config, dispatch to command handlers, exit with status

**Default Command (Attach):**
- Location: `main.rs:cmd_attach()`
- Triggers: `cs` with no arguments
- Responsibilities: Resolve sprite, call `attach::attach()` to connect to tmux

**Command Handlers:**
- Location: `main.rs` — individual `cmd_*` functions for each subcommand
- Examples: `cmd_dispatch()`, `cmd_sync()`, `cmd_ready()`, `cmd_list()`
- Responsibilities: Parse arguments, resolve sprite, call orchestrator, handle errors

**Web Dashboard Entry (`app/server.py`):**
- Location: `app/server.py:main()`
- Triggers: `python3 app/server.py` (runs on port 8888)
- Responsibilities: Start HTTP server, handle routes (/health, /api/..., WebSocket /api/terminal), serve static files

## Error Handling

**Strategy:** Three-tier error representation

**Patterns:**

1. **CsError enum** (`error.rs`):
   - Variants for each failure type (SpriteCliNotFound, ExecFailed, Io, Json, Toml, Other)
   - `thiserror` derives Display, allowing `?` operator
   - `CsError::user(msg)` wraps user-facing messages (not implementation details)
   - Result<T> = std::result::Result<T, CsError>

2. **Error propagation**:
   - All functions return `Result<T>` and use `?` to bubble errors up
   - `main()` catches top-level error, prints via `output::err()`, exits with code 1

3. **User-facing error output**:
   - All text printed to stderr via `eprintln!()` or `output::err()`
   - Stdout reserved for machine-readable output only
   - Errors styled with color and icons for visibility

## Cross-Cutting Concerns

**Logging:**
- No logger library; uses `eprintln!()` directly
- Structured output via `output` module with semantic functions:
  - `info()` — informational messages (dim text)
  - `success()` — operation complete (green checkmark)
  - `err()` — errors (red X)
  - `header()` — section titles (bold)
  - `kv()` — key-value pairs (formatted)
  - `dim()` — subtle text
- All logging goes to stderr, allowing stdout for data piping

**Validation:**
- Precondition checks at start of operations (e.g., `SpriteClient::require_cli()`)
- Path validation before file operations (canonicalize + check exists)
- SSH key availability checks before git operations
- No blanket validation layer; checks inline where needed

**Authentication:**
- Sprite API token stored in: env var `SPRITE_TOKEN` or `CS_SPRITE_TOKEN`, or `config.toml`
- `auth::push_api_key()` deploys token to sprite's `~/.cs-sprite-api-key` for future `sprite exec` calls
- Dashboard auth (`app/auth.py`): three layers (localhost bypass → Cloudflare JWT → bearer token → no-auth fallback)
- No session tokens; auth is stateless (token in each request or assumed via transport)

**Configuration:**
- Hierarchical override model: env vars > file configs > defaults
- `GlobalConfig::with_env_overrides()` applies env var precedence after file load
- Environment variables checked: CS_SPRITE_NAME, CS_ORG, CS_TMUX_SESSION, SPRITE_TOKEN
- Legacy migration: old shell-sourced config auto-converts to TOML on first load

---

*Architecture analysis: 2026-03-19*
