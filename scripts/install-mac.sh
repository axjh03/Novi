#!/usr/bin/env bash
# ==============================================================================
# Novi macOS Deployment & Provisioning Script
# Target Architecture: Darwin (arm64 / x86_64)
# ==============================================================================

set -euo pipefail

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
trap cleanup EXIT INT TERM

# 4. Fetch release binary
log_info "Downloading application payload..."
log_step "Endpoint: ${PAYLOAD_URL}"

if command -v curl >/dev/null 2>&1; then
    curl -fSL --progress-bar "${PAYLOAD_URL}" -o "${DMG_PATH}"
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
hdiutil attach "${DMG_PATH}" -nobrowse -readonly -mountpoint "${MOUNT_DIR}" -quiet

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
ditto "${MOUNT_DIR}/Novi.app" "${INSTALL_TARGET}"

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
