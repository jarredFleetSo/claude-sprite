#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Module 01 — System Packages
# =============================================================================
# Installs essential system packages. All operations are idempotent.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

require_root

log_info "=== Module 01: System Packages ==="

# Update package index (at most once per run)
if [[ -z "${_APT_UPDATED:-}" ]]; then
    log_info "Updating apt package index ..."
    apt-get update -qq
    _APT_UPDATED="true"
    export _APT_UPDATED
fi

# Core packages
PACKAGES=(
    tmux
    jq
    unzip
    curl
    wget
    htop
    ripgrep
    build-essential
)

for pkg in "${PACKAGES[@]}"; do
    ensure_package "$pkg"
done

# Optional: Docker
if [[ "${ENABLE_DOCKER:-false}" == "true" ]]; then
    log_info "ENABLE_DOCKER=true — installing Docker ..."
    ensure_package "docker.io"

    # Ensure the workspace user can use Docker without sudo
    if [[ -n "${WORKSPACE_USER:-}" ]]; then
        if ! id -nG "$WORKSPACE_USER" 2>/dev/null | grep -qw docker; then
            usermod -aG docker "$WORKSPACE_USER"
            log_info "Added user '${WORKSPACE_USER}' to the docker group."
        fi
    fi
else
    log_info "ENABLE_DOCKER is not true — skipping Docker installation."
fi

log_info "=== Module 01: System Packages — complete ==="
