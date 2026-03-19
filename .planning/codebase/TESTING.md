# Testing Patterns

**Analysis Date:** 2026-03-19

## Test Framework

**Status:**
- No automated test framework configured
- No unit tests found in Rust codebase
- No pytest/unittest setup in Python codebase
- Testing is manual/integration only

**Run Commands:**
```bash
# Manual verification (as noted in CLAUDE.md)
cs2 list              # verify API connectivity
cs2 ready <sprite>    # full flow test
cs2 --help            # check all commands
```

**Cargo Configuration:**
- `Cargo.toml` has no `[dev-dependencies]` section
- Edition: 2021, but no test harness configured

**Python:**
- No test requirements or test runner configured
- App uses only Python stdlib (zero external dependencies)

## Test File Organization

**Current State:**
- No test files exist (no `*_test.rs`, `*_spec.rs`, `test/` directory, or `tests/` directory)
- No Python test files (no `test_*.py`, `*_test.py`, or `tests/` directory)
- Test checklist exists at `/docs/test-checklist.md` (manual test procedures)

**If Tests Were to Be Added:**
- Rust: Conventional pattern would be `mod tests { #[cfg(test)] ... }` at end of each module, or `tests/` directory for integration tests
- Python: Conventional pattern would be `test_` prefix with pytest or unittest in `tests/` directory

## Mocking & Test Utilities

**Current Patterns:**
- No mocking framework used
- No fixtures or test helpers
- No fake/stub implementations visible in code

**Real Integration:**
- Code directly uses `Command::new()` for subprocess execution (not mockable without framework)
- `SpriteClient` methods (`exec`, `exec_with_stdin`, `exec_tty`) interact directly with external `sprite` CLI
- No dependency injection or trait abstraction for testability

**Python:**
- Direct `subprocess.check_output()` calls for system checks
- No abstraction layer for file I/O, HTTP requests, or subprocess execution
- `SessionStore` and `TokenStore` use actual file I/O with fcntl locking

## Verification Approach

**Manual Testing (Per `/docs/test-checklist.md`):**
- Sprite connectivity tests via CLI commands
- File sync verification
- Terminal attachment workflows
- Context push/pull operations

**Integration Pattern:**
- CLI commands invoke real external tools (`sprite` CLI, `tmux`, `ssh`, etc.)
- Success/failure determined by exit codes and output parsing
- Error handling relies on user-facing error messages from `CsError` enum

**Testing Data:**
- No fixtures used
- Tests operate against real cloud sprites (per CLAUDE.md)
- State stored in `~/.config/cs/config.toml` and `.cs.toml` files

## Error Scenarios in Code

**How Errors Are Tested (Implicitly):**
- `SpriteClient::require_cli()` checks for `sprite` binary on PATH
- `is_reachable()` checks SSH connectivity
- Config migration tests legacy format parsing via actual file read
- JSONL parsing handles malformed entries gracefully (see `history.rs` line 31-33)

**Example from Code:**
```rust
// sprite.rs
pub fn require_cli() -> Result<()> {
    which::which("sprite").map_err(|_| CsError::SpriteCliNotFound)?;
    Ok(())
}
```

```rust
// history.rs
for line in contents.lines() {
    let line = line.trim();
    if line.is_empty() {
        continue;
    }
    let entry: HistoryEntry = match serde_json::from_str(line) {
        Ok(e) => e,
        Err(_) => continue,  // Gracefully skip malformed JSON
    };
}
```

**Python Auth Testing:**
```python
# auth.py
def check_auth(handler):
    # Tested paths:
    # 1. Localhost bypass always returns True
    # 2. Missing JWT returns (False, "missing...")
    # 3. Expired JWT returns (False, "token expired")
    # 4. Invalid bearer token returns (False, "invalid token")
    # 5. No auth configured returns (True, "no-auth-configured")
```

## Edge Cases Handled

**Rust:**

1. **Binary Availability:**
   - `which::which("sprite")` checks before attempting spawn

2. **Process Deadlock Prevention:**
   - Writer thread in `exec_with_stdin()` (line 112) avoids pipe deadlock during tar streaming

3. **UTF-8 Decoding:**
   - All command output decoded with `String::from_utf8_lossy()` (handles invalid UTF-8 gracefully)

4. **Environment Variable Fallbacks:**
   - Config uses environment variable overrides with checks for empty values (config.rs lines 86-100)

5. **API Response Flexibility:**
   - `parse_sprites()` handles both array and object response formats (api.rs lines 71-80)
   - Alternative field names via `#[serde(alias = "...")]`

6. **Config Format Migration:**
   - Attempts TOML first, then falls back to legacy shell format (config.rs lines 42-54)

**Python:**

1. **Port Detection Cross-Platform:**
   - Tries `ss` (Linux), falls back to `lsof` (macOS), handles `FileNotFoundError` (server.py lines 74-92)

2. **Session Parsing Robustness:**
   - Validates split result has >= 3 parts before accessing (server.py line 63)

3. **JWT Decoding Tolerant:**
   - Handles base64 padding, missing keys, expired tokens separately (auth.py lines 45-67)

4. **Subprocess Failures:**
   - Catches `CalledProcessError` and `FileNotFoundError` separately (server.py throughout)

## Coverage & Missing Areas

**Untested Functionality:**
- No unit tests for any business logic
- `SpriteClient` exec modes cannot be unit tested without mocking
- Config TOML/migration logic has no automated verification
- History JSONL parsing has no test cases for edge inputs
- Output formatting functions (`output.rs`) not tested
- Picker interactive selection (`picker.rs`) not tested

**High-Risk Untested Areas:**
- Dispatch window status detection (bash script parsing)
- Terminal session attachment with TERM variable fixups
- SSH key synchronization logic
- Context push/pull operations (serialization/deserialization)
- File sync with progress reporting

**Why No Tests:**
- Architecture is inherently integration-heavy (remote execution via `sprite exec`)
- Dependencies on external CLIs (`sprite`, `tmux`, `ssh`) are hard to mock
- State is persistent across operations (config files, sessions)
- UI output formatting is interactive/visual

## Recommended Testing Strategy (Future)

**Unit Tests Could Cover:**
- Config parsing/migration logic → use `tempfile` to create test configs
- History JSONL parsing → isolate `parse_history()`, `rewrite_paths()` functions
- Output formatting → assert box-drawing and status formatting
- API response parsing → mock JSON responses
- Error enum message formatting

**Integration Tests Could Use:**
- Test sprites provisioned in CI/CD
- Mock `sprite` CLI via shell wrapper script
- Fixture state files for config/session testing
- Subprocess mocking for `tmux`, `ssh` commands

**Python Testing:**
- Mock `subprocess.check_output()` for system commands
- Use `tempfile` for `SessionStore` and `TokenStore` tests
- Mock HTTP handler for auth tests
- Use `unittest.mock.patch` for file operations

---

*Testing analysis: 2026-03-19*
