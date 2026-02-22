#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Module 04 — cloudflared
# =============================================================================
# Installs cloudflared and renders the tunnel configuration template.
# Idempotent — skips installation if cloudflared is already present.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

require_root

log_info "=== Module 04: cloudflared ==="

# ---- Install cloudflared ----
if is_installed cloudflared; then
    log_info "cloudflared is already installed ($(cloudflared --version 2>&1)) — skipping install."
else
    log_info "Installing cloudflared ..."

    ARCH="$(uname -m)"
    case "$ARCH" in
        x86_64)  CF_ARCH="amd64" ;;
        aarch64) CF_ARCH="arm64" ;;
        arm64)   CF_ARCH="arm64" ;;
        *)
            log_error "Unsupported architecture: ${ARCH}"
            exit 1
            ;;
    esac

    DEB_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}.deb"
    TMP_DEB="$(mktemp /tmp/cloudflared-XXXXXX.deb)"

    retry 3 5 curl -fsSL -o "$TMP_DEB" "$DEB_URL"
    dpkg -i "$TMP_DEB" || apt-get install -f -y -qq
    rm -f "$TMP_DEB"

    log_info "cloudflared installed: $(cloudflared --version 2>&1)"
fi

# ---- Render tunnel configuration ----
TEMPLATE_FILE="${PROJECT_ROOT}/config/cloudflared/config.yml.template"
OUTPUT_FILE="/etc/cloudflared/config.yml"

if [[ -f "$TEMPLATE_FILE" ]]; then
    # Export all vars so envsubst can see them
    export CODE_SERVER_PORT="${CODE_SERVER_PORT:-8080}"
    export TTYD_PORT="${TTYD_PORT:-7681}"
    export PREVIEW_PORT="${PREVIEW_PORT:-3000}"
    export CLOUDFLARE_TUNNEL_TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-}"
    export CODE_HOSTNAME="${CODE_HOSTNAME:-}"
    export TERM_HOSTNAME="${TERM_HOSTNAME:-}"
    export PREVIEW_HOSTNAME="${PREVIEW_HOSTNAME:-}"
    export ENABLE_PREVIEW_SERVICE="${ENABLE_PREVIEW_SERVICE:-false}"

    ensure_dir "/etc/cloudflared"
    template_render "$TEMPLATE_FILE" "$OUTPUT_FILE"
    log_info "Tunnel config rendered to ${OUTPUT_FILE}"
else
    log_warn "Template not found at ${TEMPLATE_FILE} — skipping tunnel config rendering."
    log_warn "You will need to create /etc/cloudflared/config.yml manually."
fi

log_info "=== Module 04: cloudflared — complete ==="
