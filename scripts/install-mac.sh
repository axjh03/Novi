#!/usr/bin/env bash
# ==============================================================================
# Novi macOS Deployment & Provisioning Script
# Target Architecture: Darwin (arm64 / x86_64)
# ==============================================================================

set -euo pipefail

# Run a quiet install step in an alternate screen; restore the terminal even on failure or Ctrl+C.
# While it runs, Pac-Man eats his way along the lane. When NOVI_PROGRESS names a file holding
# "done total speed" (bytes, bytes, bytes per second), he follows the download and the bar under him
# shows the percentage, the speed and the size; otherwise he runs on his own. NOVI_DETAILS holds the
# lines of the installation sheet, separated by |, shown when the terminal has room for them.
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
    human() {
        if [ "$1" -ge 1048576 ]; then printf '%d.%d MB' "$(($1 / 1048576))" "$(($1 * 10 / 1048576 % 10))"
        elif [ "$1" -ge 1024 ]; then printf '%d KB' "$(($1 / 1024))"
        else printf '%d B' "$1"; fi
    }
    printf '\033[?1049h\033[?25l\033[2J'
    "$@" >"$log" 2>&1 </dev/null & job=$!
    frame=0; started=$SECONDS; last_size=''; pct=-1; done_b=0; total=0; speed=0
    while kill -0 "$job" 2>/dev/null; do
        cols=$(tput cols 2>/dev/null || echo 80)
        rows=$(tput lines 2>/dev/null || echo 24)
        width=$((cols - 6)); [ "$width" -gt 64 ] && width=64
        elapsed=$((SECONDS - started))
        case "$((frame / 2 % 4))" in 0) spinner='|' ;; 1) spinner='/' ;; 2) spinner='-' ;; 3) spinner='\' ;; esac
        if [ -n "${NOVI_PROGRESS:-}" ] && [ -r "${NOVI_PROGRESS}" ]; then
            read -r done_b total speed < "$NOVI_PROGRESS" 2>/dev/null || true
            case "$done_b$total$speed" in *[!0-9]*|'') done_b=0; total=0; speed=0 ;; esac
            if [ "$total" -gt 0 ]; then pct=$((done_b * 100 / total)); [ "$pct" -gt 100 ] && pct=100; else pct=-1; fi
        fi
        if [ "$last_size" != "$cols:$rows" ]; then printf '\033[2J'; last_size="$cols:$rows"; fi
        if [ "$width" -ge 38 ] && [ "$rows" -ge 14 ]; then
            height=14; lane=4; sheet=0
            if [ "$width" -ge 54 ] && [ "$rows" -ge 24 ]; then height=20; lane=10; fi
            if [ "$width" -ge 54 ] && [ "$rows" -ge 30 ] && [ -n "${NOVI_DETAILS:-}" ]; then height=26; sheet=1; fi
            left=$(((cols - width) / 2 + 1)); top=$(((rows - height) / 2 + 1))
            printf '\033[%s;%sH\033[2K\033[0;1;36mNOVI  /  INSTALLING' "$top" "$left"
            if [ "$lane" -eq 10 ]; then
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
            inside=$((width - 2))
            if [ "$pct" -ge 0 ]; then pos=$(((inside - 6) * pct / 100)); else pos=$((frame / 2 % (inside - 5))); fi
            remaining=$((inside - pos - 6))
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
            if [ "$pct" -ge 0 ]; then
                filled=$((inside * pct / 100)); bar=$(printf '%*s' "$filled" '' | tr ' ' '#')
                rest=$(printf '%*s' "$((inside - filled))" '' | tr ' ' '.')
                printf '\033[%s;%sH\033[2K\033[0;36m[%s\033[0;2m%s\033[0;36m]' "$((top + lane + 5))" "$left" "$bar" "$rest"
                stats=$(printf '%3d%%   %s/s   %s of %s' "$pct" "$(human "$speed")" "$(human "$done_b")" "$(human "$total")")
            else
                printf '\033[%s;%sH\033[2K' "$((top + lane + 5))" "$left"
                stats=''
            fi
            label_width=$((width - 18))
            printf '\033[%s;%sH\033[2K\033[0;36m%s\033[0m  %-*s  \033[2m%02d:%02d elapsed' "$((top + lane + 6))" "$left" "$spinner" "$label_width" "${label:0:label_width}" "$((elapsed / 60))" "$((elapsed % 60))"
            printf '\033[%s;%sH\033[2K\033[0;1m%s\033[0m' "$((top + lane + 7))" "$left" "${stats:0:width}"
            printf '\033[%s;%sH\033[2K\033[0;2mWorking on your setup.  Ctrl+C to cancel\033[0m' "$((top + lane + 8))" "$left"
            if [ "$sheet" -eq 1 ]; then
                row=$((top + lane + 10)); rest_details=$NOVI_DETAILS
                while [ -n "$rest_details" ] && [ "$row" -le "$((top + height - 1))" ]; do
                    line=${rest_details%%|*}
                    if [ "$line" = "$rest_details" ]; then rest_details=''; else rest_details=${rest_details#*|}; fi
                    printf '\033[%s;%sH\033[2K\033[0;2m%s\033[0m' "$row" "$left" "${line:0:width}"
                    row=$((row + 1))
                done
            fi
        else
            if [ "$pct" -ge 0 ]; then compact="NOVI $spinner $label $pct% ($(human "$speed")/s)"; else compact="NOVI $spinner $label (${elapsed}s)"; fi
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

# Downloads a file while writing "done total speed" to the file named by NOVI_PROGRESS for the animation.
novi_fetch() {
    url=$1; out=$2; total=0; prev=0; speed=0
    total=$(curl -sIL "$url" 2>/dev/null | tr -d '\r' | awk 'tolower($1) == "content-length:" { n = $2 } END { print n + 0 }') || total=0
    curl -fsSL "$url" -o "$out" & pid=$!
    prev_t=$(date +%s)
    while kill -0 "$pid" 2>/dev/null; do
        size=$(stat -f %z "$out" 2>/dev/null || stat -c %s "$out" 2>/dev/null || echo 0)
        now=$(date +%s)
        if [ "$now" -gt "$prev_t" ]; then speed=$(((size - prev) / (now - prev_t))); prev=$size; prev_t=$now; fi
        if [ -n "${NOVI_PROGRESS:-}" ]; then printf '%s %s %s\n' "$size" "$total" "$speed" > "${NOVI_PROGRESS}.tmp" && mv -f "${NOVI_PROGRESS}.tmp" "$NOVI_PROGRESS"; fi
        sleep 0.25
    done
    wait "$pid"
}

# Terminal status colors
C_RESET='\033[0m'
C_BOLD='\033[1m'
C_DIM='\033[2m'
C_CYAN='\033[36m'
C_GREEN='\033[32m'
C_RED='\033[31m'
C_YELLOW='\033[33m'

log_info() { printf "==> %b%s%b\n" "${C_CYAN}" "$1" "${C_RESET}"; }
log_step() { printf "  -> %s\n" "$1"; }
log_ok() { printf "==> %b%s%b\n" "${C_GREEN}" "$1" "${C_RESET}"; }
log_warn() { printf "==> %bWARNING: %s%b\n" "${C_YELLOW}" "$1" "${C_RESET}"; }
log_error() { printf "==> %bERROR: %s%b\n" "${C_RED}" "$1" "${C_RESET}" >&2; }

# The version this site is serving, from its release endpoint; empty when it cannot be reached.
novi_latest_version() {
    curl -fsSL --max-time 8 "${BASE_URL}/api/releases/latest" 2>/dev/null | tr -d '\n' | grep -o '"version" *: *"[^"]*"' | head -n 1 | sed 's/.*"\([^"]*\)"$/\1/'
}

# Decides what this run does. $1 is the version found on the machine (empty when none), $2 the latest.
# Sets MODE to install or update, and stops when the installed copy is already the latest.
novi_plan() {
    INSTALLED=$1; LATEST=$2; MODE=install
    if [ -n "${INSTALLED}" ]; then
        if [ -n "${LATEST}" ] && [ "${INSTALLED}" = "${LATEST}" ] && [ -z "${NOVI_FORCE:-}" ]; then
            log_ok "Novi ${INSTALLED} is already installed and is the latest version."
            log_step "Nothing to do. Run again with NOVI_FORCE=1 to reinstall it."
            exit 0
        fi
        MODE=update
        log_info "Updating Novi ${INSTALLED} to ${LATEST:-the latest release}..."
    else
        log_info "Installing Novi ${LATEST:-}..."
    fi
    if [ "${MODE}" = update ]; then ACTION="Update    Novi ${INSTALLED} to ${LATEST:-the latest release}"; STEP_LABEL='Updating Novi'; else ACTION="Install   Novi ${LATEST:-}"; STEP_LABEL='Installing Novi'; fi
}

# What to do next, printed once the app is on the machine. $1 is where it went, $2 how to remove it.
print_guide() {
    printf '\n%b' "${C_BOLD}"
    if [ "${MODE:-install}" = update ]; then printf '  Novi is updated to %s and opening now.%b\n\n' "${LATEST:-the latest release}" "${C_RESET}"; else printf '  Novi is installed and opening now.%b\n\n' "${C_RESET}"; fi
    printf '  %-12s%s\n' 'Installed' "$1"
    printf '  %-12s%s\n' 'Sign in' 'Individuals: the username and password from your Novi account.'
    printf '  %-12s%s\n' '' 'Teams: the desktop login your organisation created for you.'
    printf '  %-12s%s\n' 'AI key' "Add a provider key once in your account: ${BASE_URL}/api-keys"
    printf '  %-12s%s\n' 'Guide' "${BASE_URL}/how-it-works"
    printf '  %-12s%s\n' 'Plans' "${BASE_URL}/get-access"
    printf '  %-12s%s\n' 'Help' 'getnoviapp@outlook.com  ·  Instagram @getnoviapp'
    printf '  %-12s%s\n\n' 'Remove' "$2"
}

OS_TYPE="$(uname -s)"
ARCH="$(uname -m)"
BASE_URL="${NOVI_BASE_URL:-"https://novi-virid.vercel.app"}"

if [ "${OS_TYPE}" != "Darwin" ]; then
    log_error "This script is designed strictly for macOS (Darwin)."
    exit 1
fi

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
INSTALLED_VERSION=''
if [ -d "${INSTALL_TARGET}" ]; then INSTALLED_VERSION=$(defaults read "${INSTALL_TARGET}/Contents/Info" CFBundleShortVersionString 2>/dev/null || true); fi
novi_plan "${INSTALLED_VERSION}" "$(novi_latest_version || true)"
WORK_DIR=$(mktemp -d /tmp/novi-installer.XXXXXX)
DMG_PATH="${WORK_DIR}/novi-payload.dmg"
MOUNT_DIR="${WORK_DIR}/mount"
export NOVI_PROGRESS="${WORK_DIR}/progress"
export NOVI_DETAILS="${ACTION}|Package   Novi for ${ARCH_LABEL} (.dmg)|From      ${BASE_URL}|Into      ${INSTALL_TARGET}|System    macOS ${SW_VERS}|Then      the quarantine flag is cleared and Novi opens"

cleanup_mac() {
    if [ -d "${MOUNT_DIR}" ]; then hdiutil detach "${MOUNT_DIR}" -quiet 2>/dev/null || true; fi
    rm -rf "${WORK_DIR}" 2>/dev/null || true
}
trap cleanup_mac EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

log_info "Downloading application payload..."
log_step "Endpoint: ${PAYLOAD_URL}"
pacman_run "Downloading Novi ${LATEST}" novi_fetch "${PAYLOAD_URL}" "${DMG_PATH}"
if [ ! -s "${DMG_PATH}" ]; then
    log_error "Downloaded image payload is empty or invalid."
    exit 1
fi
log_step "Received $(du -h "${DMG_PATH}" | cut -f1 | tr -d ' ')"
unset NOVI_PROGRESS

log_info "Mounting disk image container..."
mkdir -p "${MOUNT_DIR}"
pacman_run "Opening disk image" hdiutil attach "${DMG_PATH}" -nobrowse -readonly -mountpoint "${MOUNT_DIR}" -quiet
if [ ! -d "${MOUNT_DIR}/Novi.app" ]; then
    log_error "Novi.app bundle not found in attached volume."
    exit 1
fi

log_info "Deploying bundle to /Applications/Novi.app..."
if [ -d "${INSTALL_TARGET}" ]; then log_step "Removing the previous bundle..."; rm -rf "${INSTALL_TARGET}"; fi
pacman_run "${STEP_LABEL}" ditto "${MOUNT_DIR}/Novi.app" "${INSTALL_TARGET}"

log_info "Detaching disk image container..."
hdiutil detach "${MOUNT_DIR}" -quiet 2>/dev/null || true

# Novi is not notarised with Apple, so Gatekeeper would refuse the bundle. Clearing the quarantine
# flag is what a manual .dmg install needs too: xattr -cr /Applications/Novi.app
log_info "Configuring Gatekeeper policy (removing com.apple.quarantine)..."
xattr -cr "${INSTALL_TARGET}"

if [ -x "${INSTALL_TARGET}/Contents/MacOS/Novi" ]; then
    log_step "Main binary verified: ${INSTALL_TARGET}/Contents/MacOS/Novi"
else
    log_warn "Executable binary check returned non-zero. Application structure may differ."
fi

if [ "${MODE}" = update ]; then log_ok "Update completed successfully."; else log_ok "Installation completed successfully."; fi
print_guide "${INSTALL_TARGET}" "rm -rf /Applications/Novi.app"
log_info "Launching /Applications/Novi.app..."
open "${INSTALL_TARGET}"
exit 0
