#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# ssh-git-setup.sh — Self-contained SSH key & Git identity setup
# =============================================================================
# A standalone script that does NOT require workspace.env. It will prompt the
# user interactively for name/email if not supplied via environment variables.
#
# Usage:
#   ./scripts/ssh-git-setup.sh
#
# Environment (optional — prompted if empty):
#   GIT_USER_NAME   — full name for git commits
#   GIT_USER_EMAIL  — email for git commits
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

log_info "=== SSH & Git Setup (standalone) ==="

SSH_DIR="${HOME}/.ssh"
SSH_KEY="${SSH_DIR}/id_ed25519"

# ---------------------------------------------------------------------------
# SSH key
# ---------------------------------------------------------------------------
ensure_dir "$SSH_DIR"
chmod 700 "$SSH_DIR"

if [[ -f "$SSH_KEY" ]]; then
    log_info "SSH key already exists at ${SSH_KEY} — skipping generation."
else
    log_info "Generating ed25519 SSH key ..."
    ssh-keygen -t ed25519 -f "$SSH_KEY" -N "" -C "$(whoami)@workspace"
    log_info "SSH key generated: ${SSH_KEY}"
fi

# ---------------------------------------------------------------------------
# SSH config for GitHub
# ---------------------------------------------------------------------------
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
    chmod 600 "$SSH_CONFIG"
    log_info "SSH config updated."
fi

# ---------------------------------------------------------------------------
# Git identity — prompt if not set
# ---------------------------------------------------------------------------
GIT_USER_NAME="${GIT_USER_NAME:-}"
GIT_USER_EMAIL="${GIT_USER_EMAIL:-}"

if [[ -z "$GIT_USER_NAME" ]]; then
    # Check if git already has a name configured
    EXISTING_NAME="$(git config --global user.name 2>/dev/null || true)"
    if [[ -n "$EXISTING_NAME" ]]; then
        log_info "Git user.name already set to: ${EXISTING_NAME}"
    else
        read -rp "Enter your full name for git commits: " GIT_USER_NAME
        if [[ -n "$GIT_USER_NAME" ]]; then
            git config --global user.name "$GIT_USER_NAME"
            log_info "Git user.name set to: ${GIT_USER_NAME}"
        else
            log_warn "No name provided — skipping git user.name."
        fi
    fi
else
    git config --global user.name "$GIT_USER_NAME"
    log_info "Git user.name set to: ${GIT_USER_NAME}"
fi

if [[ -z "$GIT_USER_EMAIL" ]]; then
    EXISTING_EMAIL="$(git config --global user.email 2>/dev/null || true)"
    if [[ -n "$EXISTING_EMAIL" ]]; then
        log_info "Git user.email already set to: ${EXISTING_EMAIL}"
    else
        read -rp "Enter your email for git commits: " GIT_USER_EMAIL
        if [[ -n "$GIT_USER_EMAIL" ]]; then
            git config --global user.email "$GIT_USER_EMAIL"
            log_info "Git user.email set to: ${GIT_USER_EMAIL}"
        else
            log_warn "No email provided — skipping git user.email."
        fi
    fi
else
    git config --global user.email "$GIT_USER_EMAIL"
    log_info "Git user.email set to: ${GIT_USER_EMAIL}"
fi

# ---------------------------------------------------------------------------
# Print the public key
# ---------------------------------------------------------------------------
echo ""
log_info "---------- SSH Public Key ----------"
log_info "Add this key to GitHub: https://github.com/settings/ssh/new"
echo ""
cat "${SSH_KEY}.pub"
echo ""
log_info "------------------------------------"
echo ""

# Quick connectivity test (non-fatal)
log_info "Testing SSH connection to GitHub ..."
if ssh -T git@github.com 2>&1 | grep -qi "successfully authenticated"; then
    log_info "GitHub SSH authentication successful."
else
    log_warn "GitHub SSH authentication did not succeed — add the key above to GitHub first."
fi

log_info "=== SSH & Git Setup — complete ==="
