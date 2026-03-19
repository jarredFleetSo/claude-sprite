# Coding Conventions

**Analysis Date:** 2026-03-19

## Naming Patterns

**Files:**
- Rust: `snake_case.rs` (e.g., `sprite.rs`, `config.rs`, `shell_setup.rs`)
- Python: `snake_case.py` (e.g., `server.py`, `session.py`, `auth.py`)
- Exception: binary names use kebab-case in config (e.g., `cs2` in Cargo.toml)

**Functions:**
- Rust: `snake_case` (e.g., `exec_with_stdin`, `require_cli`, `resolve_sprite`, `window_status`)
- Python: `snake_case` (e.g., `get_token_status`, `check_port`, `get_uptime`, `get_tmux_sessions`)
- Prefix functions that are utility/helper with clear scope: `window_status()` returns dispatch window state, `check_port()` checks listening ports
- Private/internal prefixes: Rust uses `fn` without pub; Python uses `_leading_underscore` for internal functions (e.g., `_get_client_ip`, `_is_localhost`, `_check_cf_jwt`)

**Variables:**
- Rust: `snake_case` for locals (e.g., `sprite_args`, `window_status`, `child_stdin`, `exec_output`)
- Python: `snake_case` for all vars (e.g., `client_ip`, `auth_header`, `payload_b64`, `latest_session_id`)
- Struct/Type fields: `snake_case` (e.g., `last_active_at`, `project_path`, `session_id`)
- Constants: `SCREAMING_SNAKE_CASE` (e.g., `ICON_RUNNING`, `BOX_TL`, `SPRITE_API_BASE`)

**Types:**
- Rust: `PascalCase` for structs/enums (e.g., `SpriteClient`, `CsError`, `GlobalConfig`, `ExecOutput`)
- Rust: Enum variants match case (e.g., `CsError::User()`, `CsError::ExecFailed{}`)
- Type aliases: `snake_case` for alias target (e.g., `pub type Result<T> = std::result::Result<T, CsError>`)
- Python: Class names `PascalCase` (e.g., `SessionStore`, `TokenStore`, `TerminalSession`)

## Code Style

**Formatting:**
- Rust: Standard `rustfmt` style (no explicit config committed)
- Python: No specific formatter enforced, but follows stdlib conventions
  - Indentation: 4 spaces
  - Max line length: implicit ~100-120 chars based on existing code
  - Comments use `#` prefix with space

**Linting:**
- Rust: Compiler warnings respected; code uses `#[allow(dead_code)]` and `#[allow(...)]` for intentional suppressions (see `api.rs`, `output.rs`)
- Python: No linter configured; stdlib only codebase minimizes style variance

**Attributes:**
- Rust: Use `#[allow(...)]` sparingly, only with justification. Examples:
  - `#[allow(dead_code)]` in `main.rs` for module stubs (`api`, `output`)
  - `#[allow(dead_code)]` in `sprite.rs` for unused helper methods (`stdout_or_err`)
  - `#[allow(dead_code)]` in `resolve.rs` for alternative resolution path (`resolve_sprite_or_err`)

## Import Organization

**Rust Order:**
1. `use crate::*` (local module imports)
2. `use std::*` (stdlib)
3. Third-party crates (serde, console, thiserror, etc.)

**Examples from codebase:**
```rust
// config.rs
use crate::error::{CsError, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

// sprite.rs
use crate::error::{CsError, Result};
use base64::Engine;
use std::io::Read;
use std::process::{Command, ExitStatus, Stdio};
```

**Python Order:**
1. Future imports (not present in codebase)
2. `import <stdlib>` (builtin modules)
3. `from <stdlib> import` (specific imports)
4. Local imports (`from session import`, etc.)

**Examples from codebase:**
```python
# server.py
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from session import SessionStore
from tokens import TokenStore
from auth import check_auth
```

**Path Aliases:**
- Rust: No path aliases used. Uses fully qualified `crate::module::function` paths
- Python: Uses relative imports and `sys.path` insertion for local modules (see `server.py` line 21)

## Error Handling

**Rust Patterns:**
- Use `thiserror` crate for error enums with `#[derive(Error, Debug)]`
- Define custom error variants with clear messages:
  ```rust
  #[error("{0}")]
  User(String),

  #[error("sprite name required. Usage: cs <command> <sprite-name>")]
  NoSpriteName,

  #[error("command failed: {cmd}\n{stderr}")]
  ExecFailed { cmd: String, stderr: String },
  ```
- Use `CsError::user()` factory for user-facing error messages (see `error.rs` line 37)
- Propagate errors with `?` operator
- Return `Result<T>` type alias: `pub type Result<T> = std::result::Result<T, CsError>`
- Transparent variants for external crates: `#[error(transparent)]` with `#[from]`

**Python Patterns:**
- Return tuples of `(bool, str)` for auth checks (success flag + reason/identity string):
  ```python
  # auth.py
  return (True, identity), or (False, reason_string)
  ```
- Use try/except for specific exception handling (e.g., `subprocess.CalledProcessError`, `FileNotFoundError`)
- Fallback patterns: try method A, if fails try method B (see `server.py` check_port function)
- Return `None` for missing optional values (e.g., `get_latest_session_id()` returns `Option<String>` in type semantics)

## Logging

**Framework:**
- Rust: `eprintln!` macro for all user-facing output (not `println!`)
- Python: No logging framework; uses `print()` with implicit stderr routing via handler

**Patterns:**
- All output to stderr via `eprintln!` in Rust (see `main.rs` throughout)
- Machine-readable output uses stdout only (e.g., `cmd_list()` outputs to stderr, but JSON responses would go to stdout)
- Structured output functions in `output.rs`:
  - `info()` - informational message with `▸` icon
  - `success()` - success message with `✓` icon
  - `warn()` - warning with `▸` icon
  - `err()` - error with `✗` icon
  - `step()` - progress with `[N/total]` counter
  - `header()` - banner with box drawing
  - `footer()` - closing box
  - `dim()`, `hint()`, `kv()` - styled helpers

**When to log:**
- Log at operation boundaries (start/end of major steps)
- Log errors with context for debugging
- Use `info()` for actionable feedback
- Use `dim()` for contextual but secondary information

## Comments

**When to Comment:**
- Document non-obvious algorithmic choices
- Explain why something is done (not what — code shows what)
- Note workarounds or platform-specific behavior
- Document file-level purpose (see docstrings at top of Python files)

**Examples:**
```rust
// sprite.rs line 111
// Writer thread to avoid deadlock.

// dispatch.rs line 31
// DISPATCH_DONE marker in log indicates completion

// config.rs lines 57-84
// Comment on migration strategy explains legacy format handling
```

**JSDoc/Docstrings:**
- Rust: Use `///` doc comments for public items (not consistently applied in this codebase)
- Python: Use triple-quoted docstrings at module and function level
  ```python
  # server.py top
  """
  Sprite workspace dashboard — Python stdlib HTTP server.
  Zero dependencies beyond Python 3.
  """

  # auth.py
  def check_auth(handler):
      """
      Check if the request is authorized.

      Returns (True, identity_string) or (False, reason_string).
      """
  ```

## Function Design

**Size:**
- Target: Functions 30-60 lines (see `cmd_ready()` in main.rs ~50 lines)
- Larger functions are top-level command handlers that combine steps (e.g., `cmd_setup()` ~90 lines)
- Extract sub-operations into private helpers (e.g., `window_status()` in dispatch.rs)

**Parameters:**
- Use references for non-owned types: `&str`, `&GlobalConfig`, `&SpriteClient`
- Builder pattern for optional parameters (not used; instead pass `Option<&str>`)
- Avoid boolean flag parameters when possible; use specific enums (e.g., `ContextAction::Push` vs boolean)

**Return Values:**
- Rust: Return `Result<T>` for fallible operations (propagate with `?`)
- Return `Option<T>` for optional results (use `.ok()` to convert Result)
- Python: Return tuples for multiple values (e.g., `(bool, str)` for auth), or simple values
- Use type aliases for readability: `pub type Result<T> = std::result::Result<T, CsError>`

## Module Design

**Exports:**
- Rust: Public functions declared with `pub fn`, structs with `pub struct`
- Private functions/stubs use `fn` without pub
- Python: Module-level functions and classes are implicitly public; use `_prefix` for internal helpers

**Barrel Files:**
- Not used in this codebase
- Modules declared explicitly at top of `main.rs` with `mod` statements
- Each file is a distinct module with explicit imports in consuming code

**Serde Defaults:**
- Use `#[serde(default)]` for optional struct fields (e.g., in `api.rs` SpriteInfo)
- Use `#[serde(alias = "...")]` for alternate field names (e.g., `last_active_at` with alias `lastActiveAt`)
- Applied for API response compatibility and legacy config migration

## Strings and Raw Literals

**Rust Raw Strings:**
- Use raw strings `r##"..."##` for shell scripts and complex formatting
- Double `#` needed for tmux format strings containing `#{...}` (e.g., dispatch.rs line 31)
- Example:
  ```rust
  let script = r##"
  session="$TMUX_SESSION"
  if ! tmux list-windows -t "$session" -F "#{window_name}" 2>/dev/null...
  "##;
  ```

**Base64 Encoding:**
- Used for safe variable transport across remote exec layers (see CLAUDE.md)
- Applied in `build_remote_script()` pattern (not visible in sample files, noted in CLAUDE.md)

## Testing-Related Patterns

**No Unit Tests in Codebase:**
- No `#[test]` attributes found in Rust modules
- No test modules in Python
- Testing is manual/integration only (see `/docs/test-checklist.md`)

**Verification Pattern:**
- Use manual commands: `cs2 list`, `cs2 ready <sprite>`, `cs2 --help` (see CLAUDE.md)
- No automated test framework configured

---

*Convention analysis: 2026-03-19*
