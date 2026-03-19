# Codebase Concerns

**Analysis Date:** 2026-03-19

## Tech Debt

**Pipeline Deadlock Risk (Pipe Stream Handling):**
- Issue: Multiple `unwrap()` calls on `stdout` from spawned processes without proper error handling. If a process fails to set up pipes correctly, the `unwrap()` will panic.
- Files: `cli/cs-rs/src/sprite.rs:109`, `cli/cs-rs/src/sync.rs:62,78,82,118`, `cli/cs-rs/src/context.rs:156,294,429,571`
- Impact: Unexpected CLI crashes when interacting with git, tar, or sprite commands under certain system conditions (high load, resource constraints, permission issues).
- Fix approach: Replace all `unwrap()` on spawned command pipes with proper `?` error propagation. The writer thread pattern in `sprite.rs:111-114` is correct; extend it consistently across all spawn calls. Test on systems with limited file descriptors.

**Incomplete Windows Support:**
- Issue: CLI declares Unix-specific features with `#[cfg(unix)]` but silently fails on Windows. Methods like `exec_tty()` return user-facing errors, but many shell commands assume Unix paths and tools (git, tar, bash).
- Files: `cli/cs-rs/src/sprite.rs:134-171`, `cli/cs-rs/src/main.rs:700-708,781-792`, `cli/cs-rs/src/sync.rs:36` (stty)
- Impact: Windows users cannot use cs CLI effectively. No graceful degradation or clear error messages at startup.
- Fix approach: Add early platform check in `main()` or `run()` that requires Unix and exits with helpful message. Document platform requirements in CLI help text. Alternatively, implement tar+git-ls abstraction layer to support Windows paths.

**Terminal State Corruption Recovery:**
- Issue: `stty sane` is called after `sprite exec` to clean up terminal state, but it's wrapped in `let _ = ...` which silently discards errors. On some systems (SSH, tmux), stty may not exist or fail.
- Files: `cli/cs-rs/src/sync.rs:36`, `cli/cs-rs/src/context.rs:40,85`, `app/terminal_ws.py:183`
- Impact: After file sync, dispatch, or context operations, user's terminal may be left in a broken state (no echo, garbled input) if stty fails silently.
- Fix approach: Check if stty exists before calling it. Use `which::which("stty")` pattern. Log warnings if it fails. Consider platform-specific cleanup (e.g., bash reset fallback).

**API Key Transport via Base64:**
- Issue: Anthropic API keys and user input are Base64-encoded for remote script execution but remain in plaintext in bash command strings and process listings.
- Files: `cli/cs-rs/src/auth.rs:55,67,160,169`, `cli/cs-rs/src/dispatch.rs:235-237`, `cli/cs-rs/src/sprite.rs:182-193`
- Impact: Process inspection tools (ps, htop) on the sprite could leak API keys. Shell history may contain encoded keys. Base64 encoding is obfuscation, not encryption.
- Fix approach: Document this limitation in security guidelines. Consider passing secrets via stdin/environment instead of command-line args where possible. Use `ANTHROPIC_API_KEY` environment variable exclusively rather than shell expansion. Add warnings to setup flow about shell history exposure.

**Onboarding Script Cascading Fallbacks:**
- Issue: Complex fallback chain (jq → node → python3 → sed) for modifying Claude config without error context. If all methods fail silently, user has no way to debug why onboarding failed.
- Files: `cli/cs-rs/src/auth.rs:69-120`
- Impact: Silent failures when Claude config modification is incomplete. Users may get permission dialogs on every run if `hasTrustDialogAccepted` isn't set.
- Fix approach: Log which tool succeeded/failed. Return a warning if sed fallback is used (incomplete feature support). Test that at least one method succeeds before returning success.

## Security Considerations

**Unauthenticated Terminal Access via WebSocket:**
- Risk: Dashboard can fall back to "no-auth-configured" mode if neither CF_POLICY_AUD nor DASHBOARD_TOKEN is set. Frontend then accepts WebSocket connections without validation.
- Files: `app/auth.py:101-103`, `app/terminal_ws.py`
- Current mitigation: Localhost bypass (127.0.0.1 / ::1) is enforced. Requires sprite CLI on same machine to reach dashboard.
- Recommendations: (1) Require explicit auth mode configuration on startup — fail fast if no auth is set. (2) Log all WebSocket connections with identity. (3) Add DASHBOARD_TOKEN to default setup flow. (4) Document that running `app/server.py` on 0.0.0.0 without auth is a security risk.

**API Key Prompt in Interactive Mode:**
- Risk: `auth.rs:push_api_key()` reads API key via `Term::read_secure_line()` which suppresses echoing but does not encrypt the string in memory.
- Files: `cli/cs-rs/src/auth.rs:40-43`
- Current mitigation: Input is passed to remote script via Base64 encoding, reducing plaintext lifetime. Standard secure input handling for CLI tools.
- Recommendations: Document that API key should be rotated after use if compromised. Clear recommendation to set ANTHROPIC_API_KEY env var instead of interactive input in CI/automation contexts.

**Shell History Exposure:**
- Risk: Remote shell setup script (`shell_setup.rs:6-128`) sources `~/.claude_env` which contains ANTHROPIC_API_KEY in plaintext. Bash history will contain `echo "export ANTHROPIC_API_KEY=..."` commands.
- Files: `cli/cs-rs/src/shell_setup.rs:45-98`, `cli/cs-rs/src/auth.rs:54-65`
- Impact: Any compromise of sprite VM shell history exposes user's API key.
- Recommendations: (1) Add `HISTCONTROL=ignorespace` to shell setup to skip history for commands prefixed with space. (2) Document in CLAUDE.md: "Rotate API key after major shell access". (3) Consider separate credential file with stricter permissions (mode 400).

**Tmux Window Creation Without Validation:**
- Risk: Dispatch launch creates tmux windows with user-provided prompt/command passed through Base64. While encoded, extremely long inputs could cause issues.
- Files: `cli/cs-rs/src/dispatch.rs:261-277`
- Current mitigation: Input is Base64-encoded before tmux execution, preventing shell injection.
- Recommendations: Add length validation for prompts (e.g., max 8KB). Test with edge cases (null bytes, unicode surrogates).

## Performance Bottlenecks

**File Counting for Progress Bar (Sync Operation):**
- Problem: `sync.rs:47-56` runs `git ls-files` twice: once to count files, once to generate tar. This is sequential and slow for large repos (100k+ files).
- Files: `cli/cs-rs/src/sync.rs:45-93`
- Cause: Progress bar needs file count upfront, but generator pattern would be better.
- Improvement path: (1) Combine counting and generation in single `git ls-files` pass. (2) Use byte count approximation instead of file count for progress (see `CountingReader` at line 189 — it's already doing this but generator approach would be cleaner).

**History Parsing with AWK in Dispatch Resume:**
- Problem: `dispatch.rs:362-388` parses `~/.claude/history.jsonl` with inline AWK script to find latest session. For large history files (10k+ entries), this is slow and fragile.
- Files: `cli/cs-rs/src/dispatch.rs:362-388`
- Cause: AWK parsing is synchronous and occurs on each `--resume`. No caching of session lookup.
- Improvement path: (1) Build proper JSONL parser in Rust instead of AWK. (2) Cache recent session IDs locally (e.g., `.cs/last-session.txt`). (3) Add `--session-id` flag to bypass lookup.

**Progress Bar Thread Overhead (CountingReader):**
- Problem: `sync.rs:205-212` updates progress bar on every `read()` call, which happens frequently for large files. Progress bar updates have overhead.
- Files: `cli/cs-rs/src/sync.rs:188-212`
- Cause: Position updates on every read instead of batched updates.
- Improvement path: Update progress every N bytes (e.g., 100KB) instead of every read. Batch updates to reduce contention.

**WebSocket PTY Read Loop Polling:**
- Problem: `terminal_ws.py:330-335` uses `select()` with 0.5s timeout for polling PTY output. This causes latency for terminal updates (up to 500ms delay).
- Files: `app/terminal_ws.py:330-335`
- Cause: Polling instead of event-driven I/O.
- Improvement path: Remove timeout or reduce to 50ms. Better approach: use `selectors` module with edge-triggered events if available.

## Fragile Areas

**Dispatch Window Status Detection:**
- Files: `cli/cs-rs/src/dispatch.rs:10-33`
- Why fragile: Status detection relies on specific shell behaviors: checking pane PID, grepping log file for "DISPATCH_DONE" marker, and inferring state. If tmux structure changes or logs are deleted, status is incorrect.
- Safe modification: Add explicit status file (e.g., `~/.cs-dispatch/status`) with JSON state {started, completed, exit_code}. Update on launch and completion.
- Test coverage: Add tests for status detection with missing log files, missing panes, orphaned windows.

**Path Encoding for Claude Projects:**
- Files: `cli/cs-rs/src/context.rs:14,24`, `cli/cs-rs/src/paths.rs`
- Why fragile: Claude stores project context under `~/.claude/projects/<encoded_path>`. Encoding/decoding logic is opaque and not tested. If encoding changes, users lose context.
- Safe modification: Document encoding scheme clearly. Add round-trip tests: `encode(path) -> decode(result) == path` for various paths (symlinks, special chars, long paths).
- Test coverage: No visible test coverage for path encoding. Add unit tests in `paths.rs`.

**Remote Project Path Resolution:**
- Files: `cli/cs-rs/src/sprite.rs:214-227`
- Why fragile: Script searches for `.git` directory in `~/*/` and takes first match or falls back to `$HOME/$BASENAME`. Behavior changes if user has multiple clones of same project.
- Safe modification: (1) Accept explicit `--project` flag. (2) Fall back to current working directory if available. (3) Search by repo name + git remote instead of basename.
- Test coverage: Add test cases for: single clone, multiple clones, no `.git`.

**Shell Setup Idempotency:**
- Files: `cli/cs-rs/src/shell_setup.rs:6-128`
- Why fragile: Setup script relies on marker file `~/.cs_shell_ready` to detect if already run. If marker is deleted, script re-runs installations. Marker logic is basic and doesn't track version.
- Safe modification: Add version to marker file (e.g., `~/.cs_shell_setup_v2`). Track which tools were installed. Allow partial re-runs with `--force`.
- Test coverage: No test for idempotency or partial state.

**Context Push/Pull Symlink Handling:**
- Files: `cli/cs-rs/src/context.rs` (tar operations), `cli/cs-rs/src/sync.rs:145`
- Why fragile: Tar extracts `--exclude=.git` but does not handle symlink loops. User's project could have symlinks to parent directories, causing tar to hang or extract infinite files.
- Safe modification: Add tar flag `--dereference` with depth limit or use `--exclude-from` with cwd check. Test with symlink-heavy projects.
- Test coverage: No test for symlinks or circular references.

## Scaling Limits

**TTY Session Multiplexing via Tmux:**
- Current capacity: Single shared tmux session (`workspace` or custom) multiplexed across all browser tabs/connections.
- Limit: If many users connect, pane list could become unwieldy. Resize messages from one client affect all connected clients. No per-session isolation.
- Scaling path: (1) Use separate tmux sessions per connection (e.g., `ws-<uuid>`). (2) Implement pane pooling for long-lived sessions. (3) Add WebSocket protocol versioning for future changes.

**Dispatch Log File Size:**
- Current capacity: Single `~/.cs-dispatch/latest.log` appended on each dispatch. No rotation or compression.
- Limit: Log file grows unbounded; exceeds 100MB after many long-running dispatches.
- Scaling path: (1) Implement log rotation (e.g., compress after 50MB). (2) Store dispatch metadata in SQLite instead of plaintext files. (3) Add `--log-retention` flag.

**API Rate Limiting:**
- Current capacity: List sprites API calls are cached in memory (GlobalConfig), but no expiration. Concurrent `cs list` calls from multiple clients hit Sprite API.
- Limit: Sprite API has rate limits (typically 100 req/min). Rapid cli invocations can exhaust quota.
- Scaling path: (1) Add local file-based cache with TTL (e.g., `~/.cs/sprites.cache` valid for 5 min). (2) Implement exponential backoff on 429 responses. (3) Add `--no-cache` flag for force-refresh.

## Dependencies at Risk

**Indicator Progress Bar (indicatif 0.17):**
- Risk: Used for sync progress display. Crate is moderately maintained but not widely used. Minimal failure risk but consider maintenance.
- Impact: If unmaintained, progress bar will still work but won't receive bug fixes for new terminal types.
- Migration plan: Fallback is simple ANSI progress using `eprintln!`. Could write minimal progress printer if needed.

**Dialoguer for Interactive Picker (0.11):**
- Risk: Used for sprite selection UI. Small but stable crate.
- Impact: If unmaintained, interactive picking still works but may miss terminal compatibility.
- Migration plan: Replace with simple arrow-key loop using termios (Unix only).

**Chrono for Date Parsing (dependency of api.rs):**
- Risk: Industry standard, actively maintained.
- Impact: Low risk.
- Migration plan: None needed.

## Missing Critical Features

**Concurrent Dispatch Support:**
- Problem: Only one dispatch can run per sprite (enforced by tmux window naming). If user runs two `cs dispatch` commands, second one must use `--force` to replace first.
- Blocks: Parallel multi-task workflows. Testing multiple versions simultaneously.
- Priority: Medium — workaround is to use separate sprites.

**Session Persistence Across CLI Versions:**
- Problem: If CLI version changes significantly, cached session IDs in history may not deserialize correctly.
- Blocks: Long-term session resumption across major version upgrades.
- Priority: Medium — can be handled with version migration code.

**Credential Rotation Tooling:**
- Problem: API key is set once during `cs setup`. No tooling to rotate it or revoke on compromised sprite.
- Blocks: Security incident response. Key rotation best practices.
- Priority: High — should add `cs auth --rotate` command.

**Dry-Run for Destructive Operations:**
- Problem: `cs dispatch --force` and `cs abort` have no `--dry-run` to preview what will happen.
- Blocks: Safe testing of automation scripts.
- Priority: Low — users can verify with `cs status` first.

## Test Coverage Gaps

**Sprite Reachability Checks:**
- What's not tested: `sprite.rs:196-199` uses `self.exec(&["true"])` to test reachability. No test for network timeout, permission denied, or slow responses.
- Files: `cli/cs-rs/src/sprite.rs:196-200`
- Risk: Hangs or misreports sprite as unreachable under adverse network conditions.
- Priority: High — add timeout tests.

**Config Parsing Edge Cases:**
- What's not tested: TOML parsing in `config.rs` for malformed files, missing keys, environment variable overrides with special characters.
- Files: `cli/cs-rs/src/config.rs`
- Risk: CLI crashes on malformed config instead of helpful error message.
- Priority: Medium.

**Context Merge Conflicts:**
- What's not tested: `context.rs` push/pull operations for simultaneous edits on local and remote. If both sides modified same session file, pull could lose data.
- Files: `cli/cs-rs/src/context.rs:76-100,126-186`
- Risk: Silent data loss during context sync.
- Priority: High — need three-way merge or conflict detection.

**Error Recovery (Process Failures):**
- What's not tested: Spawn failures, pipe breakage, remote command failures during multi-step operations (e.g., sync + context push). Partial success states.
- Files: `cli/cs-rs/src/sync.rs`, `cli/cs-rs/src/context.rs`, `cli/cs-rs/src/dispatch.rs`
- Risk: Partial state left behind (e.g., synced files but failed context push). User must manually clean up.
- Priority: High.

**WebSocket Disconnection Scenarios:**
- What's not tested: Abrupt WebSocket closure, timeouts, partial message delivery in `terminal_ws.py`.
- Files: `app/terminal_ws.py:318-381`
- Risk: Browser tab hangs or shows corrupted output on network glitch.
- Priority: Medium — test with network throttling and kill signals.

---

*Concerns audit: 2026-03-19*
