#!/usr/bin/env bash
# ==============================================================================
# Novi Linux Automated Provisioner (Debian / Ubuntu / Universal AppImage)
# ==============================================================================

set -euo pipefail

C_RESET='\033[0m'
C_CYAN='\033[36m'
C_GREEN='\033[32m'
C_RED='\033[31m'

log_info() { printf "==> %b%s%b\n" "${C_CYAN}" "$1" "${C_RESET}"; }
log_step() { printf "  -> %s\n" "$1"; }
log_ok() { printf "==> %b%s%b\n" "${C_GREEN}" "$1" "${C_RESET}"; }
log_error() { printf "==> %bERROR: %s%b\n" "${C_RED}" "$1" "${C_RESET}" >&2; }

OS_TYPE="$(uname -s)"
ARCH="$(uname -m)"
BASE_URL="${NOVI_BASE_URL:-"https://novi-virid.vercel.app"}"

if [ "${OS_TYPE}" != "Linux" ]; then
    log_error "This script is designed for Linux. Detected OS: ${OS_TYPE}"
    exit 1
fi

log_info "Initializing Novi Linux Provisioner"
log_step "Architecture: ${ARCH}"

WORK_DIR=$(mktemp -d /tmp/novi-linux.XXXXXX)
cleanup_linux() { rm -rf "${WORK_DIR}" 2>/dev/null || true; }
trap cleanup_linux EXIT INT TERM

if command -v dpkg >/dev/null 2>&1 && [ -f /etc/debian_version ]; then
    log_step "Detected Debian / Ubuntu environment. Preparing .deb package..."
    DEB_PATH="${WORK_DIR}/novi.deb"
    PAYLOAD_URL="${BASE_URL}/api/download?asset=linux-deb"
    
    log_info "Downloading package payload..."
    log_step "Endpoint: ${PAYLOAD_URL}"
    curl -fSL --progress-bar "${PAYLOAD_URL}" -o "${DEB_PATH}"

    log_info "Installing package (requires sudo privileges)..."
    if [ "$EUID" -ne 0 ]; then
        sudo dpkg -i "${DEB_PATH}" || sudo apt-get install -f -y
    else
        dpkg -i "${DEB_PATH}" || apt-get install -f -y
    fi
    log_ok "Installation completed successfully."
    log_info "Launching Novi..."
    nohup novi >/dev/null 2>&1 &
    exit 0
else
    log_step "Preparing Universal AppImage payload..."
    APPIMAGE_DIR="${HOME}/.local/bin"
    APPIMAGE_PATH="${APPIMAGE_DIR}/novi"
    mkdir -p "${APPIMAGE_DIR}"

    PAYLOAD_URL="${BASE_URL}/api/download?asset=linux-appimage"
    log_info "Downloading AppImage payload..."
    log_step "Endpoint: ${PAYLOAD_URL}"
    curl -fSL --progress-bar "${PAYLOAD_URL}" -o "${APPIMAGE_PATH}"
    chmod +x "${APPIMAGE_PATH}"

    log_ok "Installed binary to ${APPIMAGE_PATH}"
    log_info "Launching Novi..."
    nohup "${APPIMAGE_PATH}" >/dev/null 2>&1 &
    exit 0
fi
