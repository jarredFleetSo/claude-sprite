#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Module 05 — SSH key & Git configuration
# =============================================================================
# Generates an ed25519 SSH keypair (if absent), configures Git identity, and
# writes an SSH config entry for GitHub. Idempotent.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

log_info "=== Module 05: SSH & Git ==="

WORKSPACE_USER="${WORKSPACE_USER:-coder}"

# Determine the target home directory
if [[ "$(id -u)" -eq 0 ]] && [[ "$(whoami)" != "$WORKSPACE_USER" ]]; then
    USER_HOME="$(eval echo "~${WORKSPACE_USER}")"
    RUN_AS="sudo -u ${WORKSPACE_USER}"
else
    USER_HOME="$HOME"
    RUN_AS=""
fi

SSH_DIR="${USER_HOME}/.ssh"
SSH_KEY="${SSH_DIR}/id_ed25519"

# ---- SSH key generation ----
ensure_dir "$SSH_DIR" "$WORKSPACE_USER"
chmod 700 "$SSH_DIR"

if [[ -f "$SSH_KEY" ]]; then
    log_info "SSH key already exists at ${SSH_KEY} — skipping generation."
else
    log_info "Generating ed25519 SSH key ..."
    ${RUN_AS} ssh-keygen -t ed25519 -f "$SSH_KEY" -N "" -C "${WORKSPACE_USER}@workspace"
    log_info "SSH key generated: ${SSH_KEY}"
fi

# ---- SSH config for GitHub ----
SSH_CONFIG="${SSH_DIR}/config"
GITHUB_HOST_BLOCK="Host github.com"

if [[ -f "$SSH_CONFIG" ]] && grep -qF "$GITHUB_HOST_BLOCK" "$SSH_CONFIG"; then
    log_info "SSH config already contains GitHub entry — skipping."
else
    log_info "Writing SSH config entry for github.com ..."
    cat >> "$SSH_CONFIG" <<'EOF'

Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519
    StrictHostKeyChecking accept-new
EOF
    chown "${WORKSPACE_USER}:${WORKSPACE_USER}" "$SSH_CONFIG"
    chmod 600 "$SSH_CONFIG"
    log_info "SSH config updated."
fi

# ---- Git identity ----
if [[ -n "${GIT_USER_NAME:-}" ]]; then
    ${RUN_AS} git config --global user.name "$GIT_USER_NAME"
    log_info "Git user.name set to: ${GIT_USER_NAME}"
else
    log_warn "GIT_USER_NAME is not set — skipping git user.name configuration."
fi

if [[ -n "${GIT_USER_EMAIL:-}" ]]; then
    ${RUN_AS} git config --global user.email "$GIT_USER_EMAIL"
    log_info "Git user.email set to: ${GIT_USER_EMAIL}"
else
    log_warn "GIT_USER_EMAIL is not set — skipping git user.email configuration."
fi

# ---- Print public key ----
log_info "---------- SSH Public Key ----------"
log_info "Add this key to GitHub: https://github.com/settings/ssh/new"
echo ""
cat "${SSH_KEY}.pub"
echo ""
log_info "------------------------------------"

log_info "=== Module 05: SSH & Git — complete ==="
