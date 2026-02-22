#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Module 06 — tmux configuration & persistent session
# =============================================================================
# Copies the project tmux.conf to the user's home and creates a persistent
# tmux session. Idempotent.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

log_info "=== Module 06: tmux ==="

WORKSPACE_USER="$(resolve_workspace_user)"
TMUX_SESSION_NAME="${TMUX_SESSION_NAME:-workspace}"

# Determine home directory
if [[ "$(id -u)" -eq 0 ]] && [[ "$(whoami)" != "$WORKSPACE_USER" ]]; then
    USER_HOME="$(eval echo "~${WORKSPACE_USER}")"
    RUN_AS="sudo -u ${WORKSPACE_USER}"
else
    USER_HOME="$HOME"
    RUN_AS=""
fi

# ---- Copy tmux config ----
TMUX_SRC="${PROJECT_ROOT}/config/tmux/tmux.conf"
TMUX_DST="${USER_HOME}/.tmux.conf"

if [[ -f "$TMUX_SRC" ]]; then
    cp "$TMUX_SRC" "$TMUX_DST"
    chown "${WORKSPACE_USER}:${WORKSPACE_USER}" "$TMUX_DST"
    log_info "Copied tmux config: ${TMUX_SRC} -> ${TMUX_DST}"
else
    log_warn "tmux config not found at ${TMUX_SRC} — skipping copy."
fi

# ---- Create persistent session ----
if ${RUN_AS} tmux has-session -t "$TMUX_SESSION_NAME" 2>/dev/null; then
    log_info "tmux session '${TMUX_SESSION_NAME}' already exists — skipping creation."
else
    log_info "Creating tmux session '${TMUX_SESSION_NAME}' ..."
    ${RUN_AS} tmux new-session -d -s "$TMUX_SESSION_NAME" -c "${WORKSPACE_DIR:-${USER_HOME}}"
    log_info "tmux session '${TMUX_SESSION_NAME}' created."
fi

log_info "=== Module 06: tmux — complete ==="
