#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# common.sh — Shared library sourced by all workspace modules
# =============================================================================

# Guard against double-sourcing
if [[ "${_COMMON_SH_LOADED:-}" == "true" ]]; then
    return 0
fi
_COMMON_SH_LOADED="true"

# ---------------------------------------------------------------------------
# Colors (disabled when stdout is not a terminal or NO_COLOR is set)
# ---------------------------------------------------------------------------
if [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]; then
    _CLR_RESET="\033[0m"
    _CLR_GREEN="\033[0;32m"
    _CLR_YELLOW="\033[0;33m"
    _CLR_RED="\033[0;31m"
    _CLR_CYAN="\033[0;36m"
else
    _CLR_RESET=""
    _CLR_GREEN=""
    _CLR_YELLOW=""
    _CLR_RED=""
    _CLR_CYAN=""
fi

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

_timestamp() {
    date "+%Y-%m-%d %H:%M:%S"
}

# shellcheck disable=SC2059
log_info() {
    printf "${_CLR_GREEN}[INFO]${_CLR_RESET}  ${_CLR_CYAN}%s${_CLR_RESET}  %s\n" "$(_timestamp)" "$*"
}

# shellcheck disable=SC2059
log_warn() {
    printf "${_CLR_YELLOW}[WARN]${_CLR_RESET}  ${_CLR_CYAN}%s${_CLR_RESET}  %s\n" "$(_timestamp)" "$*" >&2
}

# shellcheck disable=SC2059
log_error() {
    printf "${_CLR_RED}[ERROR]${_CLR_RESET} ${_CLR_CYAN}%s${_CLR_RESET}  %s\n" "$(_timestamp)" "$*" >&2
}

# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------

# is_installed CMD — returns 0 if CMD is found in PATH
is_installed() {
    command -v "$1" &>/dev/null
}

# require_root — exit 1 if effective UID is not 0
require_root() {
    if [[ "$(id -u)" -ne 0 ]]; then
        log_error "This script must be run as root (or with sudo)."
        exit 1
    fi
}

# resolve_workspace_user — return WORKSPACE_USER if it exists, otherwise auto-detect
resolve_workspace_user() {
    local candidate="${WORKSPACE_USER:-coder}"
    if id "$candidate" &>/dev/null; then
        echo "$candidate"
        return
    fi
    # Fallback: check common VM users
    for u in sprite ubuntu coder; do
        if id "$u" &>/dev/null; then
            echo "$u"
            return
        fi
    done
    # Last resort: use SUDO_USER or current user
    echo "${SUDO_USER:-$(whoami)}"
}

# require_var VAR_NAME — exit 1 if the named environment variable is unset or empty
require_var() {
    local var_name="$1"
    if [[ -z "${!var_name:-}" ]]; then
        log_error "Required environment variable ${var_name} is not set."
        exit 1
    fi
}

# ---------------------------------------------------------------------------
# Package management
# ---------------------------------------------------------------------------

# ensure_package PKG — install PKG via apt-get if it is not already installed
ensure_package() {
    local pkg="$1"
    if dpkg -s "$pkg" &>/dev/null; then
        log_info "Package '${pkg}' is already installed — skipping."
    else
        log_info "Installing package '${pkg}' ..."
        apt-get install -y -qq "$pkg"
        log_info "Package '${pkg}' installed."
    fi
}

# ---------------------------------------------------------------------------
# Filesystem
# ---------------------------------------------------------------------------

# ensure_dir DIR [OWNER] — create DIR (and parents) and optionally chown
ensure_dir() {
    local dir="$1"
    local owner="${2:-}"

    if [[ ! -d "$dir" ]]; then
        mkdir -p "$dir"
        log_info "Created directory: ${dir}"
    fi

    if [[ -n "$owner" ]]; then
        chown -R "$owner:$owner" "$dir"
    fi
}

# ---------------------------------------------------------------------------
# Templating
# ---------------------------------------------------------------------------

# template_render TEMPLATE_FILE OUTPUT_FILE
# Render a template using envsubst. All current environment variables are
# available inside the template as ${VAR_NAME}.
template_render() {
    local template_file="$1"
    local output_file="$2"

    if [[ ! -f "$template_file" ]]; then
        log_error "Template file not found: ${template_file}"
        return 1
    fi

    ensure_dir "$(dirname "$output_file")"
    envsubst < "$template_file" > "$output_file"
    log_info "Rendered template: ${template_file} -> ${output_file}"
}

# ---------------------------------------------------------------------------
# Retry logic
# ---------------------------------------------------------------------------

# retry MAX_ATTEMPTS DELAY_SECONDS COMMAND [ARGS...]
# Re-run COMMAND up to MAX_ATTEMPTS times, sleeping DELAY_SECONDS between tries.
retry() {
    local max_attempts="$1"; shift
    local delay="$1"; shift
    local attempt=1

    while true; do
        if "$@"; then
            return 0
        fi

        if (( attempt >= max_attempts )); then
            log_error "Command failed after ${max_attempts} attempts: $*"
            return 1
        fi

        log_warn "Attempt ${attempt}/${max_attempts} failed. Retrying in ${delay}s ..."
        sleep "$delay"
        (( attempt++ ))
    done
}
