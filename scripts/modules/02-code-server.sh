#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Module 02 — code-server
# =============================================================================
# Installs code-server (VS Code in the browser) and writes its configuration.
# Idempotent — skips installation if code-server is already present.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

require_root

log_info "=== Module 02: code-server ==="

CODE_SERVER_PORT="${CODE_SERVER_PORT:-8080}"
CODE_SERVER_AUTH="${CODE_SERVER_AUTH:-none}"
WORKSPACE_USER="$(resolve_workspace_user)"
WORKSPACE_USER_HOME="$(eval echo "~${WORKSPACE_USER}")"

# ---- Install code-server ----
if is_installed code-server; then
    log_info "code-server is already installed ($(code-server --version | head -1)) — skipping install."
else
    log_info "Installing code-server via official install script ..."
    retry 3 5 curl -fsSL https://code-server.dev/install.sh | sh
    log_info "code-server installed: $(code-server --version | head -1)"
fi

# ---- Write configuration ----
CONFIG_DIR="${WORKSPACE_USER_HOME}/.config/code-server"
CONFIG_FILE="${CONFIG_DIR}/config.yaml"

ensure_dir "$CONFIG_DIR" "$WORKSPACE_USER"

cat > "$CONFIG_FILE" <<EOF
bind-addr: 0.0.0.0:${CODE_SERVER_PORT}
auth: ${CODE_SERVER_AUTH}
cert: false
EOF

chown "${WORKSPACE_USER}:${WORKSPACE_USER}" "$CONFIG_FILE"
log_info "Wrote code-server config: ${CONFIG_FILE}"
log_info "  bind-addr: 0.0.0.0:${CODE_SERVER_PORT}"
log_info "  auth: ${CODE_SERVER_AUTH}"

log_info "=== Module 02: code-server — complete ==="
