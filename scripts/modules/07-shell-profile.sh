#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Module 07 — Shell profile integration
# =============================================================================
# Appends sourcing of workspace.bashrc and workspace-aliases.sh to the user's
# ~/.bashrc. Uses a marker comment for idempotency.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

log_info "=== Module 07: Shell Profile ==="

WORKSPACE_USER="$(resolve_workspace_user)"
MARKER="# workspace-profile-loaded"

# Determine home directory
if [[ "$(id -u)" -eq 0 ]] && [[ "$(whoami)" != "$WORKSPACE_USER" ]]; then
    USER_HOME="$(eval echo "~${WORKSPACE_USER}")"
else
    USER_HOME="$HOME"
fi

BASHRC="${USER_HOME}/.bashrc"

# Ensure .bashrc exists
if [[ ! -f "$BASHRC" ]]; then
    touch "$BASHRC"
    chown "${WORKSPACE_USER}:${WORKSPACE_USER}" "$BASHRC"
    log_info "Created ${BASHRC}"
fi

# ---- Check for existing marker ----
if grep -qF "$MARKER" "$BASHRC"; then
    log_info "Workspace profile already loaded in ${BASHRC} — skipping."
    log_info "=== Module 07: Shell Profile — complete ==="
    exit 0
fi

# ---- Append workspace sourcing block ----
log_info "Appending workspace profile sources to ${BASHRC} ..."

cat >> "$BASHRC" <<EOF

${MARKER}
# Source workspace-specific bashrc if present
if [[ -f "${PROJECT_ROOT}/config/shell/workspace.bashrc" ]]; then
    source "${PROJECT_ROOT}/config/shell/workspace.bashrc"
fi

# Source workspace aliases if present
if [[ -f "${PROJECT_ROOT}/config/shell/workspace-aliases.sh" ]]; then
    source "${PROJECT_ROOT}/config/shell/workspace-aliases.sh"
fi
EOF

chown "${WORKSPACE_USER}:${WORKSPACE_USER}" "$BASHRC"
log_info "Workspace profile sources appended to ${BASHRC}"

log_info "=== Module 07: Shell Profile — complete ==="
