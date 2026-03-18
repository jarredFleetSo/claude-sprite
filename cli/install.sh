#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# install.sh — Build and install the cs CLI (Rust)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/usr/local/bin"
CRATE_DIR="${SCRIPT_DIR}/cs-rs"

if [[ ! -f "${CRATE_DIR}/Cargo.toml" ]]; then
    echo "Error: Cargo.toml not found in ${CRATE_DIR}" >&2
    exit 1
fi

# Check for cargo
if ! command -v cargo &>/dev/null; then
    echo "Error: cargo not found. Install Rust: https://rustup.rs" >&2
    exit 1
fi

echo "Building cs (release)..."
(cd "$CRATE_DIR" && cargo build --release)

BINARY="${CRATE_DIR}/target/release/cs"
if [[ ! -f "$BINARY" ]]; then
    echo "Error: build failed — binary not found at ${BINARY}" >&2
    exit 1
fi

echo "Installing cs to ${INSTALL_DIR}/cs ..."
cp "$BINARY" "${INSTALL_DIR}/cs"
chmod +x "${INSTALL_DIR}/cs"
echo "Done. Run 'cs setup' to configure your workspace."
