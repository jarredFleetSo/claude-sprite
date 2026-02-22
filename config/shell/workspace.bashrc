# =============================================================================
# Remote Development Workspace — Shell Profile
# =============================================================================
# Sourced by .bashrc to configure the workspace environment.
# This file sets up environment variables, prompt, PATH, and helper functions.

# ---------------------------------------------------------------------------
# Source workspace environment variables
# ---------------------------------------------------------------------------
if [ -f /etc/default/workspace ]; then
    set -a
    # shellcheck disable=SC1091
    source /etc/default/workspace
    set +a
fi

if [ -f "$HOME/.workspace.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$HOME/.workspace.env"
    set +a
fi

# ---------------------------------------------------------------------------
# Environment Variables
# ---------------------------------------------------------------------------
export WORKSPACE_NAME="${WORKSPACE_NAME:-workspace}"
export WORKSPACE_DIR="${WORKSPACE_DIR:-$HOME/workspace}"
export CODE_SERVER_PORT="${CODE_SERVER_PORT:-8080}"
export TTYD_PORT="${TTYD_PORT:-7681}"
export PREVIEW_PORT="${PREVIEW_PORT:-3000}"

# Editor defaults
export EDITOR="${EDITOR:-vim}"
export VISUAL="${VISUAL:-vim}"
export LANG="${LANG:-en_US.UTF-8}"

# ---------------------------------------------------------------------------
# PATH additions
# ---------------------------------------------------------------------------
# Add local bin directories (user-installed tools, workspace scripts)
for dir in "$HOME/.local/bin" "$HOME/bin" "$WORKSPACE_DIR/node_modules/.bin" "/usr/local/bin"; do
    case ":$PATH:" in
        *":$dir:"*) ;;
        *) [ -d "$dir" ] && export PATH="$dir:$PATH" ;;
    esac
done

# ---------------------------------------------------------------------------
# Auto-cd to workspace directory
# ---------------------------------------------------------------------------
if [ -d "$WORKSPACE_DIR" ] && [ "$PWD" = "$HOME" ]; then
    cd "$WORKSPACE_DIR" || true
fi

# ---------------------------------------------------------------------------
# Git-aware PS1 prompt
# ---------------------------------------------------------------------------
__git_branch() {
    local branch
    branch=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null)
    if [ -n "$branch" ]; then
        # Show * if there are uncommitted changes
        local dirty=""
        if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
            dirty="*"
        fi
        echo " ($branch$dirty)"
    fi
}

# Colorized prompt: user@workspace-name:~/path (git-branch)$
export PS1='\[\033[01;32m\]\u@${WORKSPACE_NAME}\[\033[00m\]:\[\033[01;34m\]\w\[\033[33m\]$(__git_branch)\[\033[00m\]\$ '

# ---------------------------------------------------------------------------
# Auto-attach to tmux session
# ---------------------------------------------------------------------------
# If we're in an interactive shell, not already in tmux, and a session exists,
# attach to it. Skip if we're in a code-server terminal (it manages its own).
if [ -n "$PS1" ] && [ -z "$TMUX" ] && [ -z "$VSCODE_IPC_HOOK_CLI" ]; then
    if command -v tmux &>/dev/null; then
        if tmux has-session -t "$WORKSPACE_NAME" 2>/dev/null; then
            exec tmux attach-session -t "$WORKSPACE_NAME"
        fi
    fi
fi

# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------

# Print the preview URL for the dev server
workspace-preview-url() {
    local hostname="${PREVIEW_HOSTNAME:-preview.localhost}"
    echo "https://${hostname}"
}

# Show comprehensive workspace status
workspace-info() {
    echo "============================================="
    echo "  Workspace: ${WORKSPACE_NAME}"
    echo "============================================="
    echo ""

    echo "--- Services ---"
    local services=("code-server" "ttyd" "cloudflared" "workspace-preview")
    for svc in "${services[@]}"; do
        if systemctl is-active --quiet "$svc" 2>/dev/null; then
            echo "  $svc: RUNNING"
        elif systemctl is-enabled --quiet "$svc" 2>/dev/null; then
            echo "  $svc: STOPPED (enabled)"
        else
            echo "  $svc: NOT CONFIGURED"
        fi
    done
    echo ""

    echo "--- URLs ---"
    echo "  IDE:      https://${CODE_HOSTNAME:-code.localhost}"
    echo "  Terminal:  https://${TERM_HOSTNAME:-term.localhost}"
    echo "  Preview:   https://${PREVIEW_HOSTNAME:-preview.localhost}"
    echo ""

    echo "--- Local Ports ---"
    echo "  code-server: ${CODE_SERVER_PORT}"
    echo "  ttyd:        ${TTYD_PORT}"
    echo "  preview:     ${PREVIEW_PORT}"
    echo ""

    echo "--- Workspace ---"
    echo "  Directory: ${WORKSPACE_DIR}"
    echo "  User:      $(whoami)"
    echo "  Tmux:      $(tmux list-sessions 2>/dev/null || echo 'no sessions')"
    echo ""

    echo "--- System ---"
    echo "  Uptime:$(uptime)"
    echo "  Disk:  $(df -h "$WORKSPACE_DIR" 2>/dev/null | tail -1 | awk '{print $3 "/" $2 " (" $5 " used)"}')"
    echo "============================================="
}

# ---------------------------------------------------------------------------
# Source workspace aliases if available
# ---------------------------------------------------------------------------
if [ -f "$HOME/.workspace-aliases.sh" ]; then
    # shellcheck disable=SC1091
    source "$HOME/.workspace-aliases.sh"
fi

if [ -f "$(dirname "${BASH_SOURCE[0]}")/workspace-aliases.sh" ]; then
    # shellcheck disable=SC1091
    source "$(dirname "${BASH_SOURCE[0]}")/workspace-aliases.sh"
fi
