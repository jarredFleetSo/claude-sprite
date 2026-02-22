#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# detect-environment.sh — Detect Sprite VM vs bare VM
# =============================================================================
# Exports:
#   IS_SPRITE        — "true" if running inside a Sprite VM, "false" otherwise
#   SPRITE_ENV_CMD   — path to the sprite-env binary (empty string if absent)
# =============================================================================

# Guard against double-sourcing
if [[ "${_DETECT_ENV_SH_LOADED:-}" == "true" ]]; then
    return 0
fi
_DETECT_ENV_SH_LOADED="true"

IS_SPRITE="false"
SPRITE_ENV_CMD=""

# Detection strategy (any match → Sprite environment)

# 1. Check for the /run/sprite sentinel directory
if [[ -d "/run/sprite" ]]; then
    IS_SPRITE="true"
fi

# 2. Check for the SPRITE environment variable
if [[ -n "${SPRITE:-}" ]]; then
    IS_SPRITE="true"
fi

# 3. Check for sprite-env command in PATH
if command -v sprite-env &>/dev/null; then
    IS_SPRITE="true"
    SPRITE_ENV_CMD="$(command -v sprite-env)"
fi

export IS_SPRITE
export SPRITE_ENV_CMD

# Provide a human-readable summary when sourced with logging available
if declare -f log_info &>/dev/null; then
    if [[ "$IS_SPRITE" == "true" ]]; then
        log_info "Environment detected: Sprite VM"
        if [[ -n "$SPRITE_ENV_CMD" ]]; then
            log_info "sprite-env command: ${SPRITE_ENV_CMD}"
        fi
    else
        log_info "Environment detected: bare VM (non-Sprite)"
    fi
fi
