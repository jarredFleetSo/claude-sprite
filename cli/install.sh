#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# install.sh — Install the cs CLI
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/usr/local/bin"

if [[ ! -f "${SCRIPT_DIR}/cs" ]]; then
    echo "Error: cs script not found in ${SCRIPT_DIR}" >&2
    exit 1
fi

echo "Installing cs to ${INSTALL_DIR}/cs ..."
cp "${SCRIPT_DIR}/cs" "${INSTALL_DIR}/cs"
chmod +x "${INSTALL_DIR}/cs"
echo "Done. Run 'cs setup' to configure your workspace."
