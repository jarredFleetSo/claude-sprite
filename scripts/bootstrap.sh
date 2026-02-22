#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# bootstrap.sh — Main orchestrator for the Remote Claude Code Workspace
# =============================================================================
# Usage:
#   sudo ./scripts/bootstrap.sh [OPTIONS]
#
# Options:
#   --dry-run       Print what would be executed without running anything
#   --skip N        Skip the first N modules
#   --only N        Run only module number N (e.g., --only 3 runs 03-ttyd.sh)
#   --help          Show this help message
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_FILE="/var/log/workspace-bootstrap.log"

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
DRY_RUN="false"
SKIP_COUNT=0
ONLY_MODULE=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        --skip)
            SKIP_COUNT="${2:?--skip requires a number}"
            shift 2
            ;;
        --only)
            ONLY_MODULE="${2:?--only requires a module number}"
            shift 2
            ;;
        --help|-h)
            head -n 13 "$0" | tail -n +3 | sed 's/^# \?//'
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

# ---------------------------------------------------------------------------
# Load configuration
# ---------------------------------------------------------------------------
ENV_FILE="${PROJECT_ROOT}/config/workspace.env"

if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck source=../config/workspace.env
    source "$ENV_FILE"
    set +a
else
    echo "[WARN] Configuration file not found: ${ENV_FILE}" >&2
    echo "[WARN] Continuing with environment variables and defaults." >&2
fi

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
require_root

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# ---------------------------------------------------------------------------
# Module discovery
# ---------------------------------------------------------------------------
MODULES=()
for f in "${SCRIPT_DIR}/modules/"[0-9][0-9]-*.sh; do
    [[ -f "$f" ]] && MODULES+=("$f")
done

if [[ ${#MODULES[@]} -eq 0 ]]; then
    log_error "No modules found in ${SCRIPT_DIR}/modules/"
    exit 1
fi

log_info "Found ${#MODULES[@]} modules."

# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------
STARTED_AT="$(date +%s)"
EXECUTED=()
SKIPPED=()
FAILED=()

run_module() {
    local module_path="$1"
    local module_name
    module_name="$(basename "$module_path")"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would execute: ${module_name}"
        EXECUTED+=("$module_name (dry-run)")
        return 0
    fi

    log_info "--- Running: ${module_name} ---"
    if bash "$module_path"; then
        EXECUTED+=("$module_name")
    else
        log_error "Module ${module_name} failed with exit code $?"
        FAILED+=("$module_name")
    fi
}

module_index=0
for module in "${MODULES[@]}"; do
    module_index=$((module_index + 1))
    module_num="$(printf "%02d" "$module_index")"

    # --only: run only the specified module
    if [[ -n "$ONLY_MODULE" ]]; then
        only_padded="$(printf "%02d" "$ONLY_MODULE")"
        if [[ "$module_num" != "$only_padded" ]]; then
            SKIPPED+=("$(basename "$module") (--only filter)")
            continue
        fi
    fi

    # --skip: skip the first N modules
    if (( module_index <= SKIP_COUNT )); then
        SKIPPED+=("$(basename "$module") (--skip)")
        continue
    fi

    run_module "$module"
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
ENDED_AT="$(date +%s)"
DURATION=$(( ENDED_AT - STARTED_AT ))

echo ""
log_info "============================================================"
log_info "  Bootstrap Summary"
log_info "============================================================"
log_info "  Duration:  ${DURATION}s"
log_info ""

if [[ ${#EXECUTED[@]} -gt 0 ]]; then
    log_info "  Executed (${#EXECUTED[@]}):"
    for m in "${EXECUTED[@]}"; do
        log_info "    - ${m}"
    done
fi

if [[ ${#SKIPPED[@]} -gt 0 ]]; then
    log_warn "  Skipped (${#SKIPPED[@]}):"
    for m in "${SKIPPED[@]}"; do
        log_warn "    - ${m}"
    done
fi

if [[ ${#FAILED[@]} -gt 0 ]]; then
    log_error "  Failed (${#FAILED[@]}):"
    for m in "${FAILED[@]}"; do
        log_error "    - ${m}"
    done
fi

echo ""
log_info "  Access URLs (once tunnel is connected):"
log_info "    code-server:  https://${CODE_HOSTNAME:-code.<your-domain>}"
log_info "    terminal:     https://${TERM_HOSTNAME:-term.<your-domain>}"
if [[ "${ENABLE_PREVIEW_SERVICE:-false}" == "true" ]]; then
    log_info "    preview:      https://${PREVIEW_HOSTNAME:-preview.<your-domain>}"
fi
log_info ""
log_info "  Log file: ${LOG_FILE}"
log_info "============================================================"

# Exit with failure if any module failed
if [[ ${#FAILED[@]} -gt 0 ]]; then
    exit 1
fi
