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
    frame=0; started=$SECONDS; last_size=''
    while kill -0 "$job" 2>/dev/null; do
        cols=$(tput cols 2>/dev/null || echo 80)
        rows=$(tput lines 2>/dev/null || echo 24)
        width=$((cols - 6)); [ "$width" -gt 64 ] && width=64
        elapsed=$((SECONDS - started))
        case "$((frame / 2 % 4))" in 0) spinner='|' ;; 1) spinner='/' ;; 2) spinner='-' ;; 3) spinner='\' ;; esac
        if [ "$last_size" != "$cols:$rows" ]; then printf '\033[2J'; last_size="$cols:$rows"; fi
        if [ "$width" -ge 38 ] && [ "$rows" -ge 14 ]; then
            height=14; lane=4
            if [ "$width" -ge 54 ] && [ "$rows" -ge 24 ]; then height=20; lane=10; fi
            left=$(((cols - width) / 2 + 1)); top=$(((rows - height) / 2 + 1))
            printf '\033[%s;%sH\033[2K\033[0;1;36mNOVI  /  INSTALLING' "$top" "$left"
            if [ "$height" -eq 20 ]; then
                printf '\033[%s;%sH\033[2K%s' "$((top + 2))" "$left" '  NN   N   OOO   V     V  III'
                printf '\033[%s;%sH\033[2K%s' "$((top + 3))" "$left" '  N N  N  O   O   V   V    I '
                printf '\033[%s;%sH\033[2K%s' "$((top + 4))" "$left" '  N  N N  O   O    V V     I '
                printf '\033[%s;%sH\033[2K%s' "$((top + 5))" "$left" '  N   NN   OOO      V     III'
                printf '\033[%s;%sH\033[2K\033[0;2mA quiet space to think. Almost yours.' "$((top + 7))" "$left"
            fi
            case "$label" in
                *Downloading*) phases='\033[1;36m01 DOWNLOAD\033[0;2m / 02 INSTALL / 03 LAUNCH' ;;
                *) phases='\033[32m01 DOWNLOAD\033[0m / \033[1;36m02 INSTALL\033[0;2m / 03 LAUNCH' ;;
            esac
            printf '\033[%s;%sH\033[2K%b\033[0m' "$((top + lane - 2))" "$left" "$phases"
            inside=$((width - 2)); pos=$((frame / 2 % (inside - 5))); remaining=$((inside - pos - 6))
            prefix=$(printf '%*s' "$pos" ''); suffix=$(printf '%*s' "$remaining" '')
            pellets=''; i=0
            while [ "$i" -lt "$remaining" ]; do
                if [ "$((i % 3))" -eq 0 ]; then pellets="${pellets}."; else pellets="${pellets} "; fi
                i=$((i + 1))
            done
            if [ "$((frame % 4))" -lt 2 ]; then mouth='(   < '; else mouth='(    )'; fi
            border=$(printf '%*s' "$inside" '' | tr ' ' '-')
            printf '\033[%s;%sH\033[2K\033[0;2;36m+%s+' "$((top + lane))" "$left" "$border"
            printf '\033[%s;%sH\033[2K\033[0;2;36m|\033[0;1;33m%s .--. %s\033[0;2;36m|' "$((top + lane + 1))" "$left" "$prefix" "$suffix"
            printf '\033[%s;%sH\033[2K\033[0;2;36m|\033[0;1;33m%s%s\033[0;2;36m%s|' "$((top + lane + 2))" "$left" "$prefix" "$mouth" "$pellets"
            printf '\033[%s;%sH\033[2K\033[0;2;36m|\033[0;1;33m%s %s %s\033[0;2;36m|' "$((top + lane + 3))" "$left" "$prefix" "'--'" "$suffix"
            printf '\033[%s;%sH\033[2K\033[0;2;36m+%s+' "$((top + lane + 4))" "$left" "$border"
            label_width=$((width - 18))
            printf '\033[%s;%sH\033[2K\033[0;36m%s\033[0m  %-*s  \033[2m%02d:%02d elapsed' "$((top + lane + 6))" "$left" "$spinner" "$label_width" "${label:0:label_width}" "$((elapsed / 60))" "$((elapsed % 60))"
            printf '\033[%s;%sH\033[2K\033[0;2mWorking on your setup.  Ctrl+C to cancel\033[0m' "$((top + lane + 8))" "$left"
        else
            compact="NOVI $spinner $label (${elapsed}s)"
            printf '\033[H\033[2K\033[1;36m%s\033[0m' "${compact:0:$((cols > 1 ? cols - 1 : 1))}"
        fi
        frame=$((frame + 1)); sleep 0.08
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
