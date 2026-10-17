#!/usr/bin/env bash
# ==============================================================================
# Novi Linux Automated Provisioner (Debian / Ubuntu / Universal AppImage)
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
case "$ARCH" in
    x86_64|amd64) ARCH_SUFFIX="" ;;
    aarch64|arm64) ARCH_SUFFIX="-arm64" ;;
    *) log_error "Unsupported architecture: $ARCH"; exit 1 ;;
esac

WORK_DIR=$(mktemp -d /tmp/novi-linux.XXXXXX)
cleanup_linux() { rm -rf "${WORK_DIR}" 2>/dev/null || true; }
trap cleanup_linux EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

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
