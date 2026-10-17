#!/usr/bin/env bash
# ==============================================================================
# Novi Unix Automated Provisioner (macOS & Linux)
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

# Terminal status colors
C_RESET='\033[0m'
C_BOLD='\033[1m'
C_CYAN='\033[36m'
C_GREEN='\033[32m'
C_RED='\033[31m'
C_YELLOW='\033[33m'

log_info() { printf "==> %b%s%b\n" "${C_CYAN}" "$1" "${C_RESET}"; }
log_step() { printf "  -> %s\n" "$1"; }
log_ok() { printf "==> %b%s%b\n" "${C_GREEN}" "$1" "${C_RESET}"; }
log_warn() { printf "==> %bWARNING: %s%b\n" "${C_YELLOW}" "$1" "${C_RESET}"; }
log_error() { printf "==> %bERROR: %s%b\n" "${C_RED}" "$1" "${C_RESET}" >&2; }

OS_TYPE="$(uname -s)"
ARCH="$(uname -m)"
BASE_URL="${NOVI_BASE_URL:-"https://novi-virid.vercel.app"}"

# ------------------------------------------------------------------------------
# macOS Flow (Darwin)
# ------------------------------------------------------------------------------
if [ "${OS_TYPE}" = "Darwin" ]; then
    SW_VERS=$(sw_vers -productVersion 2>/dev/null || echo "Unknown")
    log_info "Initializing Novi macOS Provisioner"
    log_step "OS Version: macOS ${SW_VERS}"
    log_step "Architecture: ${ARCH}"

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

    PAYLOAD_URL="${BASE_URL}/api/download?asset=${TARGET_ASSET}"
    INSTALL_TARGET="/Applications/Novi.app"
    WORK_DIR=$(mktemp -d /tmp/novi-installer.XXXXXX)
    DMG_PATH="${WORK_DIR}/novi-payload.dmg"
    MOUNT_DIR="${WORK_DIR}/mount"

    cleanup_mac() {
        if [ -d "${MOUNT_DIR}" ]; then hdiutil detach "${MOUNT_DIR}" -quiet 2>/dev/null || true; fi
        rm -rf "${WORK_DIR}" 2>/dev/null || true
    }
    trap cleanup_mac EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM

    log_info "Downloading application payload..."
    log_step "Endpoint: ${PAYLOAD_URL}"
    pacman_run "Downloading Novi" curl -fsSL "${PAYLOAD_URL}" -o "${DMG_PATH}"

    log_info "Mounting disk image container..."
    mkdir -p "${MOUNT_DIR}"
    pacman_run "Opening disk image" hdiutil attach "${DMG_PATH}" -nobrowse -readonly -mountpoint "${MOUNT_DIR}" -quiet

    log_info "Deploying bundle to /Applications/Novi.app..."
    if [ -d "${INSTALL_TARGET}" ]; then rm -rf "${INSTALL_TARGET}"; fi
    pacman_run "Installing Novi" ditto "${MOUNT_DIR}/Novi.app" "${INSTALL_TARGET}"

    log_info "Detaching disk image container..."
    hdiutil detach "${MOUNT_DIR}" -quiet 2>/dev/null || true

    log_info "Configuring Gatekeeper policy (removing com.apple.quarantine)..."
    xattr -cr "${INSTALL_TARGET}"

    log_ok "Installation completed successfully."
    log_info "Launching /Applications/Novi.app..."
    open "${INSTALL_TARGET}"
    exit 0

# ------------------------------------------------------------------------------
# Linux Flow
# ------------------------------------------------------------------------------
elif [ "${OS_TYPE}" = "Linux" ]; then
    log_info "Initializing Novi Linux Provisioner"
    log_step "Architecture: ${ARCH}"

    case "${ARCH}" in
        x86_64|amd64) ARCH_SUFFIX="" ;;
        aarch64|arm64) ARCH_SUFFIX="-arm64" ;;
        *) log_error "Unsupported architecture: ${ARCH}. Novi for Linux is built for x86_64 and arm64."; exit 1 ;;
    esac

    WORK_DIR=$(mktemp -d /tmp/novi-linux.XXXXXX)
    cleanup_linux() { rm -rf "${WORK_DIR}" 2>/dev/null || true; }
    trap cleanup_linux EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM

    # If Debian/Ubuntu and apt/dpkg is available
    if command -v dpkg >/dev/null 2>&1 && [ -f /etc/debian_version ]; then
        log_step "Detected Debian / Ubuntu environment. Preparing .deb package..."
        DEB_PATH="${WORK_DIR}/novi.deb"
        PAYLOAD_URL="${BASE_URL}/api/download?asset=linux-deb${ARCH_SUFFIX}"

        log_info "Downloading package payload..."
        log_step "Endpoint: ${PAYLOAD_URL}"
        pacman_run "Downloading Novi" curl -fsSL "${PAYLOAD_URL}" -o "${DEB_PATH}"

        log_info "Installing package (requires sudo privileges)..."
        if [ "$EUID" -ne 0 ]; then
            sudo -v
            pacman_run "Installing Novi" sudo -n dpkg --force-confdef --force-confold -i "${DEB_PATH}" || sudo apt-get install -f -y
        else
            pacman_run "Installing Novi" dpkg --force-confdef --force-confold -i "${DEB_PATH}" || apt-get install -f -y
        fi
        log_ok "Installation completed successfully."
        log_info "Launching Novi..."
        nohup novi >/dev/null 2>&1 &
        exit 0
    else
        # Universal AppImage flow
        log_step "Preparing Universal AppImage payload..."
        APPIMAGE_DIR="${HOME}/.local/bin"
        APPIMAGE_PATH="${APPIMAGE_DIR}/novi"
        mkdir -p "${APPIMAGE_DIR}"

        PAYLOAD_URL="${BASE_URL}/api/download?asset=linux-appimage${ARCH_SUFFIX}"
        log_info "Downloading AppImage payload..."
        log_step "Endpoint: ${PAYLOAD_URL}"
        pacman_run "Downloading Novi" curl -fsSL "${PAYLOAD_URL}" -o "${APPIMAGE_PATH}"
        chmod +x "${APPIMAGE_PATH}"

        log_ok "Installed binary to ${APPIMAGE_PATH}"
        log_info "Launching Novi..."
        nohup "${APPIMAGE_PATH}" >/dev/null 2>&1 &
        exit 0
    fi
else
    log_error "Unsupported operating system: ${OS_TYPE}. Use PowerShell on Windows."
    exit 1
fi
