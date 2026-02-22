#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Module 09 — Web dashboard service registration
# =============================================================================
# Registers the Python stdlib dashboard (app/server.py) as a service using
# the same dual-path strategy as module 08 (Sprite / systemd / direct).
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"
# shellcheck source=../lib/detect-environment.sh
source "${SCRIPT_DIR}/../lib/detect-environment.sh"

require_root

log_info "=== Module 09: Web Dashboard ==="

WORKSPACE_USER="$(resolve_workspace_user)"
WEBAPP_PORT="${WEBAPP_PORT:-8888}"
WORKSPACE_DIR="${WORKSPACE_DIR:-/home/${WORKSPACE_USER}/workspace}"

# ---------------------------------------------------------------------------
# Verify Python 3
# ---------------------------------------------------------------------------
if ! is_installed python3; then
    log_error "Python 3 is required but not found. Install it first."
    exit 1
fi
log_info "Python 3 found: $(python3 --version 2>&1)"

# ---------------------------------------------------------------------------
# Sprite VM path
# ---------------------------------------------------------------------------
register_sprite_webapp() {
    local sprite="${SPRITE_ENV_CMD:-sprite-env}"

    $sprite services create \
        --name webapp \
        --command "python3 ${PROJECT_ROOT}/app/server.py" \
        --user "$WORKSPACE_USER" \
        --working-dir "$PROJECT_ROOT" \
        --autostart true
    log_info "Registered Sprite service: webapp (port ${WEBAPP_PORT})"
}

# ---------------------------------------------------------------------------
# Bare VM (systemd) path
# ---------------------------------------------------------------------------
register_systemd_webapp() {
    local unit_src="${PROJECT_ROOT}/systemd/webapp.service"
    local unit_dst="/etc/systemd/system/webapp.service"

    if [[ ! -f "$unit_src" ]]; then
        log_error "Unit file not found: ${unit_src}"
        exit 1
    fi

    cp "$unit_src" "$unit_dst"
    systemctl daemon-reload
    systemctl enable webapp
    systemctl start webapp
    log_info "Installed and started systemd service: webapp (port ${WEBAPP_PORT})"
}

# ---------------------------------------------------------------------------
# Fallback: start directly
# ---------------------------------------------------------------------------
start_webapp_directly() {
    local run_as=""
    if [[ "$(id -u)" -eq 0 ]] && [[ "$(whoami)" != "$WORKSPACE_USER" ]]; then
        run_as="sudo -u ${WORKSPACE_USER}"
    fi

    local pids_dir="/var/run/workspace"
    mkdir -p "$pids_dir"

    $run_as python3 "${PROJECT_ROOT}/app/server.py" &>/var/log/webapp.log &
    echo $! > "${pids_dir}/webapp.pid"
    log_info "Started webapp directly (pid: $!, port ${WEBAPP_PORT})"
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------
if [[ "$IS_SPRITE" == "true" ]] && [[ -n "$SPRITE_ENV_CMD" ]]; then
    register_sprite_webapp
elif [[ "${HAS_SYSTEMD:-false}" == "true" ]]; then
    register_systemd_webapp
else
    start_webapp_directly
fi

log_info "=== Module 09: Web Dashboard — complete ==="
