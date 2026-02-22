#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Module 08 — Service registration (Sprite or systemd)
# =============================================================================
# Dual-path: uses sprite-env services on Sprite VMs, or installs systemd unit
# files on bare VMs.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"
# shellcheck source=../lib/detect-environment.sh
source "${SCRIPT_DIR}/../lib/detect-environment.sh"

require_root

log_info "=== Module 08: Services ==="

WORKSPACE_USER="${WORKSPACE_USER:-coder}"
CODE_SERVER_PORT="${CODE_SERVER_PORT:-8080}"
TTYD_PORT="${TTYD_PORT:-7681}"
PREVIEW_PORT="${PREVIEW_PORT:-3000}"
TMUX_SESSION_NAME="${TMUX_SESSION_NAME:-workspace}"
WORKSPACE_DIR="${WORKSPACE_DIR:-/home/${WORKSPACE_USER}/workspace}"
CLOUDFLARE_TUNNEL_TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-}"
ENABLE_PREVIEW_SERVICE="${ENABLE_PREVIEW_SERVICE:-false}"

# ---------------------------------------------------------------------------
# Sprite VM path
# ---------------------------------------------------------------------------
register_sprite_services() {
    log_info "Registering services via sprite-env ..."

    local sprite="${SPRITE_ENV_CMD:-sprite-env}"

    # code-server
    $sprite services create \
        --name code-server \
        --command "code-server --bind-addr 0.0.0.0:${CODE_SERVER_PORT}" \
        --user "$WORKSPACE_USER" \
        --working-dir "$WORKSPACE_DIR" \
        --autostart true
    log_info "Registered Sprite service: code-server"

    # ttyd
    $sprite services create \
        --name ttyd \
        --command "ttyd -p ${TTYD_PORT} -t fontSize=14 tmux attach-session -t ${TMUX_SESSION_NAME}" \
        --user "$WORKSPACE_USER" \
        --working-dir "$WORKSPACE_DIR" \
        --autostart true
    log_info "Registered Sprite service: ttyd"

    # cloudflared
    if [[ -n "$CLOUDFLARE_TUNNEL_TOKEN" ]]; then
        $sprite services create \
            --name cloudflared \
            --command "cloudflared tunnel run --token ${CLOUDFLARE_TUNNEL_TOKEN}" \
            --user root \
            --autostart true
        log_info "Registered Sprite service: cloudflared"
    else
        log_warn "CLOUDFLARE_TUNNEL_TOKEN is not set — skipping cloudflared service."
    fi

    # preview (optional)
    if [[ "$ENABLE_PREVIEW_SERVICE" == "true" ]]; then
        $sprite services create \
            --name preview \
            --command "npx serve -l ${PREVIEW_PORT}" \
            --user "$WORKSPACE_USER" \
            --working-dir "$WORKSPACE_DIR" \
            --autostart false
        log_info "Registered Sprite service: preview (autostart=false)"
    fi
}

# ---------------------------------------------------------------------------
# Bare VM (systemd) path
# ---------------------------------------------------------------------------
register_systemd_services() {
    log_info "Installing systemd unit files ..."

    local systemd_src="${PROJECT_ROOT}/systemd"
    local systemd_dst="/etc/systemd/system"

    if [[ ! -d "$systemd_src" ]]; then
        log_error "systemd unit directory not found: ${systemd_src}"
        log_error "Please create unit files in ${systemd_src}/ before running this module."
        exit 1
    fi

    # List of services to install
    local services=("code-server" "ttyd" "cloudflared")
    if [[ "$ENABLE_PREVIEW_SERVICE" == "true" ]]; then
        services+=("preview")
    fi

    for svc in "${services[@]}"; do
        local unit_file="${systemd_src}/${svc}.service"
        if [[ -f "$unit_file" ]]; then
            cp "$unit_file" "${systemd_dst}/${svc}.service"
            log_info "Installed unit file: ${svc}.service"
        else
            log_warn "Unit file not found: ${unit_file} — skipping ${svc}."
        fi
    done

    # Reload and enable
    systemctl daemon-reload
    log_info "systemd daemon reloaded."

    for svc in "${services[@]}"; do
        if [[ -f "${systemd_dst}/${svc}.service" ]]; then
            systemctl enable "$svc"
            systemctl start "$svc"
            log_info "Enabled and started: ${svc}"
        fi
    done
}

# ---------------------------------------------------------------------------
# Dispatch based on environment
# ---------------------------------------------------------------------------
if [[ "$IS_SPRITE" == "true" ]]; then
    register_sprite_services
else
    register_systemd_services
fi

log_info "=== Module 08: Services — complete ==="
