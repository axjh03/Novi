#!/usr/bin/env bash
# ==============================================================================
# Novi macOS Deployment & Provisioning Script
# Target Architecture: Darwin (arm64 / x86_64)
# ==============================================================================

set -euo pipefail

# Run a quiet install step in an alternate screen; restore the terminal even on failure or Ctrl+C.
pacman_run() (
    label=$1; shift
    if [ ! -t 1 ] || [ "${TERM:-dumb}" = dumb ] || [ -n "${CI:-}${NOVI_NO_ANIMATION:-}" ]; then
        "$@"; exit $?
    fi
    log=$(mktemp); job=''
    cleanup_pacman() {
        if [ -n "$job" ]; then kill "$job" 2>/dev/null || true; wait "$job" 2>/dev/null || true; fi
        printf '\033[0m\033[?25h\033[?1049l'
        rm -f "$log"
    }
    trap cleanup_pacman EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    printf '\033[?1049h\033[?25l\033[2J'
    "$@" >"$log" 2>&1 </dev/null & job=$!
    frame=0
    while kill -0 "$job" 2>/dev/null; do
        cols=$(tput cols 2>/dev/null || echo 80)
        rows=$(tput lines 2>/dev/null || echo 24)
        width=$((cols - 8)); [ "$width" -gt 54 ] && width=54
        if [ "$width" -ge 12 ] && [ "$rows" -ge 10 ]; then
            left=$(((cols - width) / 2)); top=$(((rows - 7) / 2))
            track=''; pos=$((frame % (width - 2)))
            i=0
            while [ "$i" -lt "$((width - 2))" ]; do
                if [ "$i" -eq "$pos" ]; then
                    if [ "$((frame % 2))" -eq 0 ]; then track="${track}C"; else track="${track}O"; fi
                elif [ "$i" -lt "$pos" ]; then track="${track} "; else track="${track}."; fi
                i=$((i + 1))
            done
            border=$(printf '%*s' "$width" '' | tr ' ' '=')
            printf '\033[H\033[J\033[%s;%sH\033[1;36mNOVI  /  INSTALLING\033[%s;%sH%s\033[%s;%sH\033[33m|%s|\033[%s;%sH\033[36m%s\033[%s;%sH\033[0m%s\033[%s;%sHCtrl+C to cancel' \
                "$top" "$left" "$((top + 2))" "$left" "$border" "$((top + 3))" "$left" "$track" \
                "$((top + 4))" "$left" "$border" "$((top + 6))" "$left" "$label" "$((top + 8))" "$left"
        fi
        frame=$((frame + 1)); sleep 0.12
    done
    status=0; wait "$job" || status=$?; job=''
    printf '\033[0m\033[?25h\033[?1049l'
    trap - EXIT
    if [ "$status" -ne 0 ]; then cat "$log" >&2; fi
    rm -f "$log"
    exit "$status"
)

# Visual formatting (Technical UNIX style, no emojis)
C_RESET='\033[0m'
C_BOLD='\033[1m'
C_CYAN='\033[36m'
C_GREEN='\033[32m'
C_RED='\033[31m'
C_YELLOW='\033[33m'

log_info() {
    printf "==> %b%s%b\n" "${C_CYAN}" "$1" "${C_RESET}"
}

log_step() {
    printf "  -> %s\n" "$1"
}

log_ok() {
    printf "==> %b%s%b\n" "${C_GREEN}" "$1" "${C_RESET}"
}

log_warn() {
    printf "==> %bWARNING: %s%b\n" "${C_YELLOW}" "$1" "${C_RESET}"
}

log_error() {
    printf "==> %bERROR: %s%b\n" "${C_RED}" "$1" "${C_RESET}" >&2
}

# 1. Platform validation
if [ "$(uname -s)" != "Darwin" ]; then
    log_error "This script is designed strictly for macOS (Darwin)."
    exit 1
fi

SW_VERS=$(sw_vers -productVersion 2>/dev/null || echo "Unknown")
ARCH=$(uname -m)

log_info "Initializing Novi macOS Provisioner"
log_step "OS Version: macOS ${SW_VERS}"
log_step "Architecture: ${ARCH}"

# 2. Architecture resolution
if [ "${ARCH}" = "arm64" ]; then
    TARGET_ASSET="mac-arm64"
    ARCH_LABEL="Apple Silicon (arm64)"
elif [ "${ARCH}" = "x86_64" ]; then
    TARGET_ASSET="mac-x64"
    ARCH_LABEL="Intel (x86_64)"
else
    log_error "Unsupported CPU architecture: ${ARCH}"
    exit 1
fi
log_step "Target binary: ${ARCH_LABEL}"

# 3. Establish endpoints & working directories
BASE_URL="${NOVI_BASE_URL:-"https://novi-virid.vercel.app"}"
PAYLOAD_URL="${BASE_URL}/api/download?asset=${TARGET_ASSET}"
INSTALL_TARGET="/Applications/Novi.app"

WORK_DIR=$(mktemp -d /tmp/novi-installer.XXXXXX)
DMG_PATH="${WORK_DIR}/novi-payload.dmg"
MOUNT_DIR="${WORK_DIR}/mount"

cleanup() {
    local exit_code=$?
    if [ -d "${MOUNT_DIR}" ]; then
        hdiutil detach "${MOUNT_DIR}" -quiet 2>/dev/null || true
    fi
    rm -rf "${WORK_DIR}" 2>/dev/null || true
    exit ${exit_code}
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# 4. Fetch release binary
log_info "Downloading application payload..."
log_step "Endpoint: ${PAYLOAD_URL}"

if command -v curl >/dev/null 2>&1; then
    pacman_run "Downloading Novi" curl -fsSL "${PAYLOAD_URL}" -o "${DMG_PATH}"
else
    log_error "cURL executable not found in PATH."
    exit 1
fi

if [ ! -s "${DMG_PATH}" ]; then
    log_error "Downloaded image payload is empty or invalid."
    exit 1
fi

# 5. Disk image attachment
log_info "Mounting disk image container..."
mkdir -p "${MOUNT_DIR}"
pacman_run "Opening disk image" hdiutil attach "${DMG_PATH}" -nobrowse -readonly -mountpoint "${MOUNT_DIR}" -quiet

if [ ! -d "${MOUNT_DIR}/Novi.app" ]; then
    log_error "Novi.app bundle not found in attached volume."
    exit 1
fi

# 6. Installation
log_info "Deploying bundle to /Applications/Novi.app..."
if [ -d "${INSTALL_TARGET}" ]; then
    log_step "Removing existing bundle at ${INSTALL_TARGET}..."
    rm -rf "${INSTALL_TARGET}"
fi

# Use ditto to maintain full bundle hierarchy, code signatures, and symlinks
pacman_run "Installing Novi" ditto "${MOUNT_DIR}/Novi.app" "${INSTALL_TARGET}"

# 7. Unmount payload container
log_info "Detaching disk image container..."
hdiutil detach "${MOUNT_DIR}" -quiet 2>/dev/null || true

# 8. Clear quarantine attribute (Resolves Gatekeeper damaged/untrusted alerts)
log_info "Configuring Gatekeeper policy..."
log_step "Removing com.apple.quarantine attribute..."
xattr -cr "${INSTALL_TARGET}"

# 9. Verification
log_info "Verifying bundle integrity..."
if [ -x "${INSTALL_TARGET}/Contents/MacOS/Novi" ]; then
    log_step "Main binary verified: ${INSTALL_TARGET}/Contents/MacOS/Novi"
else
    log_warn "Executable binary check returned non-zero. Application structure may differ."
fi

# 10. Execution
log_ok "Installation completed successfully."
log_info "Launching /Applications/Novi.app..."
open "${INSTALL_TARGET}"
