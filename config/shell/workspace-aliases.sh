# =============================================================================
# Remote Development Workspace — Convenience Aliases
# =============================================================================

# ---------------------------------------------------------------------------
# Service Management
# ---------------------------------------------------------------------------
# Start, stop, restart, and check status of workspace services
alias ws-start='sudo systemctl start code-server ttyd cloudflared'
alias ws-stop='sudo systemctl stop code-server ttyd cloudflared'
alias ws-restart='sudo systemctl restart code-server ttyd cloudflared'
alias ws-status='systemctl status code-server ttyd cloudflared --no-pager'

# Individual service control
alias ws-start-code='sudo systemctl start code-server'
alias ws-stop-code='sudo systemctl stop code-server'
alias ws-restart-code='sudo systemctl restart code-server'

alias ws-start-term='sudo systemctl start ttyd'
alias ws-stop-term='sudo systemctl stop ttyd'
alias ws-restart-term='sudo systemctl restart ttyd'

alias ws-start-tunnel='sudo systemctl start cloudflared'
alias ws-stop-tunnel='sudo systemctl stop cloudflared'
alias ws-restart-tunnel='sudo systemctl restart cloudflared'

alias ws-start-preview='sudo systemctl start workspace-preview'
alias ws-stop-preview='sudo systemctl stop workspace-preview'
alias ws-restart-preview='sudo systemctl restart workspace-preview'

# ---------------------------------------------------------------------------
# Workspace Info & Logs
# ---------------------------------------------------------------------------
alias ws-info='workspace-info'

# Show service logs (follows by default)
ws-logs() {
    local service="${1:-code-server}"
    local lines="${2:-50}"
    sudo journalctl -u "$service" -f -n "$lines"
}

# Show all workspace service logs interleaved
alias ws-logs-all='sudo journalctl -u code-server -u ttyd -u cloudflared -u workspace-preview -f -n 100'

# ---------------------------------------------------------------------------
# Preview / Dev Server Shortcuts
# ---------------------------------------------------------------------------
# Start Next.js dev server bound to all interfaces (accessible via tunnel)
alias preview-next='npx next dev -H 0.0.0.0 -p ${PREVIEW_PORT:-3000}'

# Start Vite dev server bound to all interfaces (accessible via tunnel)
alias preview-vite='npx vite --host 0.0.0.0 --port ${PREVIEW_PORT:-3000}'

# Generic preview: start any dev server on the preview port
alias preview-http='python3 -m http.server ${PREVIEW_PORT:-3000} --bind 0.0.0.0'

# ---------------------------------------------------------------------------
# tmux Shortcuts
# ---------------------------------------------------------------------------
alias ta='tmux attach-session -t "${WORKSPACE_NAME:-workspace}" 2>/dev/null || tmux attach'
alias tls='tmux list-sessions'
alias tn='tmux new-session -s'
alias tk='tmux kill-session -t'

# ---------------------------------------------------------------------------
# Code Editing
# ---------------------------------------------------------------------------
# Open a file in code-server (if installed and running)
alias code='code-server'

# ---------------------------------------------------------------------------
# Git Shortcuts
# ---------------------------------------------------------------------------
alias gs='git status'
alias gd='git diff'
alias gl='git log --oneline --graph --decorate -20'
alias gp='git pull'
alias ga='git add'
alias gc='git commit'
alias gco='git checkout'
alias gb='git branch'
alias gf='git fetch --all --prune'

# ---------------------------------------------------------------------------
# General Convenience
# ---------------------------------------------------------------------------
alias cls='clear'
alias ll='ls -alFh'
alias la='ls -A'
alias l='ls -CF'
alias ..='cd ..'
alias ...='cd ../..'
alias grep='grep --color=auto'

# ---------------------------------------------------------------------------
# Quick file searching
# ---------------------------------------------------------------------------
alias ff='find . -type f -name'
alias fd='find . -type d -name'
