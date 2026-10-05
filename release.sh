#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================================"
echo "              NOVI DESKTOP RELEASE ASSISTANT"
echo "========================================================"
echo ""

exec node "$SCRIPT_DIR/scripts/release.mjs" "$@"
