#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Module 03 — ttyd
# =============================================================================
# Downloads a pinned ttyd release binary from GitHub. Idempotent — skips if
# the expected version is already installed.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

require_root

log_info "=== Module 03: ttyd ==="

TTYD_VERSION="1.7.7"
TTYD_BIN="/usr/local/bin/ttyd"

# Determine architecture for download URL
ARCH="$(uname -m)"
case "$ARCH" in
    x86_64)  TTYD_ARCH="x86_64" ;;
    aarch64) TTYD_ARCH="aarch64" ;;
    arm64)   TTYD_ARCH="aarch64" ;;
    *)
        log_error "Unsupported architecture: ${ARCH}"
        exit 1
        ;;
esac

TTYD_URL="https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.${TTYD_ARCH}"

# ---- Check existing installation ----
if [[ -x "$TTYD_BIN" ]]; then
    INSTALLED_VERSION="$("$TTYD_BIN" --version 2>&1 | grep -oP '\d+\.\d+\.\d+' || echo "unknown")"
    if [[ "$INSTALLED_VERSION" == "$TTYD_VERSION" ]]; then
        log_info "ttyd ${TTYD_VERSION} is already installed at ${TTYD_BIN} — skipping."
        log_info "=== Module 03: ttyd — complete ==="
        exit 0
    else
        log_warn "ttyd version mismatch: installed=${INSTALLED_VERSION}, expected=${TTYD_VERSION}. Upgrading ..."
    fi
fi

# ---- Download and install ----
log_info "Downloading ttyd ${TTYD_VERSION} for ${TTYD_ARCH} ..."
retry 3 5 curl -fsSL -o "$TTYD_BIN" "$TTYD_URL"
chmod +x "$TTYD_BIN"

# Verify
if "$TTYD_BIN" --version &>/dev/null; then
    log_info "ttyd installed: $("$TTYD_BIN" --version 2>&1)"
else
    log_error "ttyd binary downloaded but failed version check."
    exit 1
fi

log_info "=== Module 03: ttyd — complete ==="
