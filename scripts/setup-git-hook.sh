#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOK_PATH="$ROOT_DIR/.git/hooks/pre-push"

echo "Creating pre-push git hook at $HOOK_PATH..."

cat << 'EOF' > "$HOOK_PATH"
#!/usr/bin/env bash
exec < /dev/tty 2>/dev/null || true

echo "========================================================"
echo "  GIT PUSH DETECTED"
echo "========================================================"
read -r -p "Do you want to release with a new build number? [y/N]: " ans || ans="n"
if [[ "$ans" =~ ^[Yy]$ ]]; then
    echo "Launching release script..."
    node scripts/release.mjs
    # Abort the original push so release.mjs pushes the tagged release
    exit 1
fi
exit 0
EOF

chmod +x "$HOOK_PATH"
echo "Hook successfully installed!"
