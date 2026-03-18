use crate::error::Result;
use crate::output;
use crate::sprite::SpriteClient;

/// Shell provisioning script — const string, no nested bash escaping
const SHELL_SETUP_SCRIPT: &str = r##"
# Only run once — skip if marker exists
[ -f ~/.cs_shell_ready ] && exit 0

# --- Install modern CLI tools (all output suppressed) ---
# starship prompt
if ! command -v starship &>/dev/null; then
    curl -sS https://starship.rs/install.sh | sh -s -- -y &>/dev/null
fi

# fzf (fuzzy finder)
if ! command -v fzf &>/dev/null; then
    git clone --depth 1 https://github.com/junegunn/fzf.git ~/.fzf &>/dev/null
    ~/.fzf/install --all --no-update-rc &>/dev/null
fi

# eza (modern ls), bat (cat with syntax highlighting), ripgrep, fd
if command -v apt-get &>/dev/null; then
    sudo apt-get update -qq &>/dev/null
    sudo apt-get install -y -qq zsh eza bat ripgrep fd-find &>/dev/null || true
fi

# --- zsh plugins (lightweight, no oh-my-zsh) ---
ZSH_PLUGINS="${HOME}/.zsh"
mkdir -p "$ZSH_PLUGINS"

# zsh-autosuggestions
if [ ! -d "$ZSH_PLUGINS/zsh-autosuggestions" ]; then
    git clone --depth 1 https://github.com/zsh-users/zsh-autosuggestions \
        "$ZSH_PLUGINS/zsh-autosuggestions" &>/dev/null
fi

# zsh-syntax-highlighting
if [ ! -d "$ZSH_PLUGINS/zsh-syntax-highlighting" ]; then
    git clone --depth 1 https://github.com/zsh-users/zsh-syntax-highlighting \
        "$ZSH_PLUGINS/zsh-syntax-highlighting" &>/dev/null
fi

# --- Configure zsh ---
cat >> ~/.zshrc << 'RCEOF'

# ── cs shell kit ──────────────────────────────────────────
# Claude Code
alias c="claude --dangerously-skip-permissions"
alias cc="claude --dangerously-skip-permissions -c"

# Git
alias gs="git status"
alias gd="git diff"
alias ga="git add"
alias gc="git commit"
alias gco="git checkout"
alias gp="git push"
alias gl="git log --oneline -20"
alias gll="git log --oneline --graph --all -30"

# Files
alias ls="eza --icons 2>/dev/null || ls --color=auto"
alias ll="eza -lah --icons 2>/dev/null || ls -lah"
alias la="eza -a --icons 2>/dev/null || ls -A"
alias tree="eza --tree --level=3 --icons 2>/dev/null || find . -type f | head -50"
alias cat="batcat --style=plain 2>/dev/null || bat --style=plain 2>/dev/null || cat"
alias ..="cd .."
alias ...="cd ../.."

# Search
alias rg="rg --smart-case"
alias f="fd --type f"

# Starship prompt
eval "$(starship init zsh 2>/dev/null)" || true

# Plugins
[ -f ~/.zsh/zsh-autosuggestions/zsh-autosuggestions.zsh ] && source ~/.zsh/zsh-autosuggestions/zsh-autosuggestions.zsh
[ -f ~/.zsh/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ] && source ~/.zsh/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh

# fzf
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
export FZF_DEFAULT_OPTS="--height 40% --reverse --border"

# Claude Code API key
[ -f ~/.claude_env ] && . ~/.claude_env

# cd into project dir on login
_cs_cd_project() {
    local d
    d=$(find ~ -maxdepth 1 -mindepth 1 -type d ! -name ".*" | head -1)
    [ -n "$d" ] && cd "$d"
}
_cs_cd_project
unfunction _cs_cd_project
# ── end cs shell kit ──────────────────────────────────────
RCEOF

# --- Starship config (minimal, fast) ---
mkdir -p ~/.config
cat > ~/.config/starship.toml << 'STAREOF'
format = """$directory$git_branch$git_status$character"""

[directory]
truncation_length = 3
style = "bold cyan"

[git_branch]
format = " [$branch]($style) "
style = "bold purple"

[git_status]
format = "[$all_status$ahead_behind]($style) "
style = "bold red"

[character]
success_symbol = "[❯](bold green)"
error_symbol = "[❯](bold red)"
STAREOF

# --- Set default shell to zsh ---
if command -v chsh &>/dev/null; then
    sudo chsh -s /usr/bin/zsh $(whoami) 2>/dev/null || true
fi

touch ~/.cs_shell_ready
"##;

/// Set up shell environment on sprite (idempotent)
pub fn setup(client: &SpriteClient) -> Result<()> {
    output::info("Setting up shell environment...");
    match client.exec(&["bash", "-c", SHELL_SETUP_SCRIPT]) {
        Ok(_) => {}
        Err(_) => output::warn("Shell setup had errors (non-fatal)"),
    }
    Ok(())
}

/// Force re-run of shell setup by removing marker
pub fn force_setup(client: &SpriteClient) -> Result<()> {
    output::info(&format!(
        "Installing shell environment on {}...",
        client.name
    ));
    output::info("This installs: starship prompt, fzf, eza, bat, ripgrep, zsh plugins");
    let _ = client.exec(&["rm", "-f", "~/.cs_shell_ready"]);
    setup(client)?;
    output::info("Done. Reconnect with 'cs' to use the new shell.");
    Ok(())
}
