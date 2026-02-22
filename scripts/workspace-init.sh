#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# workspace-init.sh — Post-clone project initialization helper
# =============================================================================
# Clones a repository into the workspace directory and detects the project type
# to run the appropriate dependency installation.
#
# Usage:
#   ./scripts/workspace-init.sh [REPO_URL]
#
# If REPO_URL is not provided as an argument, it reads from the
# PROJECT_REPO_URL environment variable.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

log_info "=== Workspace Initialization ==="

# ---------------------------------------------------------------------------
# Determine repo URL
# ---------------------------------------------------------------------------
REPO_URL="${1:-${PROJECT_REPO_URL:-}}"

if [[ -z "$REPO_URL" ]]; then
    log_error "No repository URL provided."
    log_error "Usage: $0 <REPO_URL>  or  set PROJECT_REPO_URL in your environment."
    exit 1
fi

# ---------------------------------------------------------------------------
# Determine workspace directory
# ---------------------------------------------------------------------------
WORKSPACE_USER="${WORKSPACE_USER:-coder}"
WORKSPACE_DIR="${WORKSPACE_DIR:-/home/${WORKSPACE_USER}/workspace}"

# Extract repo name for the target directory
REPO_NAME="$(basename "$REPO_URL" .git)"
TARGET_DIR="${WORKSPACE_DIR}/${REPO_NAME}"

# ---------------------------------------------------------------------------
# Clone
# ---------------------------------------------------------------------------
if [[ -d "$TARGET_DIR/.git" ]]; then
    log_info "Repository already cloned at ${TARGET_DIR} — pulling latest ..."
    git -C "$TARGET_DIR" pull --ff-only || log_warn "Pull failed — continuing with existing checkout."
else
    ensure_dir "$WORKSPACE_DIR" "$WORKSPACE_USER"
    log_info "Cloning ${REPO_URL} into ${TARGET_DIR} ..."
    git clone "$REPO_URL" "$TARGET_DIR"

    # Set ownership if running as root
    if [[ "$(id -u)" -eq 0 ]]; then
        chown -R "${WORKSPACE_USER}:${WORKSPACE_USER}" "$TARGET_DIR"
    fi

    log_info "Clone complete."
fi

cd "$TARGET_DIR"

# ---------------------------------------------------------------------------
# Detect project type and install dependencies
# ---------------------------------------------------------------------------
log_info "Detecting project type ..."

DETECTED=""

# Node.js (package.json)
if [[ -f "package.json" ]]; then
    DETECTED="nodejs"
    log_info "Detected: Node.js project (package.json found)"

    if [[ -f "package-lock.json" ]]; then
        log_info "Running: npm ci"
        npm ci
    elif [[ -f "yarn.lock" ]]; then
        log_info "Running: yarn install --frozen-lockfile"
        yarn install --frozen-lockfile
    elif [[ -f "pnpm-lock.yaml" ]]; then
        log_info "Running: pnpm install --frozen-lockfile"
        pnpm install --frozen-lockfile
    else
        log_info "Running: npm install"
        npm install
    fi
fi

# Python (requirements.txt or pyproject.toml)
if [[ -f "requirements.txt" ]]; then
    DETECTED="${DETECTED:+${DETECTED}, }python"
    log_info "Detected: Python project (requirements.txt found)"
    log_info "Running: pip install -r requirements.txt"
    pip install -r requirements.txt
elif [[ -f "pyproject.toml" ]]; then
    DETECTED="${DETECTED:+${DETECTED}, }python"
    log_info "Detected: Python project (pyproject.toml found)"
    if [[ -f "poetry.lock" ]]; then
        log_info "Running: poetry install"
        poetry install
    else
        log_info "Running: pip install -e ."
        pip install -e .
    fi
fi

# Ruby (Gemfile)
if [[ -f "Gemfile" ]]; then
    DETECTED="${DETECTED:+${DETECTED}, }ruby"
    log_info "Detected: Ruby project (Gemfile found)"
    log_info "Running: bundle install"
    bundle install
fi

# Go (go.mod)
if [[ -f "go.mod" ]]; then
    DETECTED="${DETECTED:+${DETECTED}, }go"
    log_info "Detected: Go project (go.mod found)"
    log_info "Running: go mod download"
    go mod download
fi

# Rust (Cargo.toml)
if [[ -f "Cargo.toml" ]]; then
    DETECTED="${DETECTED:+${DETECTED}, }rust"
    log_info "Detected: Rust project (Cargo.toml found)"
    log_info "Running: cargo fetch"
    cargo fetch
fi

if [[ -z "$DETECTED" ]]; then
    log_warn "No recognized project type detected — skipping dependency installation."
fi

# ---------------------------------------------------------------------------
# Copy preview configuration templates (if present)
# ---------------------------------------------------------------------------
PREVIEW_TEMPLATES_DIR="${PROJECT_ROOT}/config/preview"

if [[ -d "$PREVIEW_TEMPLATES_DIR" ]]; then
    log_info "Copying preview configuration templates ..."
    for tmpl in "${PREVIEW_TEMPLATES_DIR}"/*; do
        if [[ -f "$tmpl" ]]; then
            DEST_NAME="$(basename "$tmpl" .template)"
            if [[ ! -f "${TARGET_DIR}/${DEST_NAME}" ]]; then
                cp "$tmpl" "${TARGET_DIR}/${DEST_NAME}"
                log_info "  Copied: $(basename "$tmpl") -> ${DEST_NAME}"
            else
                log_info "  Skipped (exists): ${DEST_NAME}"
            fi
        fi
    done
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
log_info "============================================================"
log_info "  Workspace Initialization Summary"
log_info "============================================================"
log_info "  Repository:  ${REPO_URL}"
log_info "  Location:    ${TARGET_DIR}"
if [[ -n "$DETECTED" ]]; then
    log_info "  Project(s):  ${DETECTED}"
fi
log_info "============================================================"
echo ""

log_info "=== Workspace Initialization — complete ==="
