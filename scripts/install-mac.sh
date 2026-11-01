#!/usr/bin/env bash
# ==============================================================================
# Novi macOS Deployment & Provisioning Script
# Target Architecture: Darwin (arm64 / x86_64)
# ==============================================================================

set -euo pipefail

# Terminal status colors, only when the output is a terminal.
if [ -t 1 ]; then
    C_RESET='\033[0m'; C_BOLD='\033[1m'; C_DIM='\033[2m'
    C_CYAN='\033[36m'; C_GREEN='\033[32m'; C_RED='\033[31m'; C_YELLOW='\033[33m'
else
    C_RESET=''; C_BOLD=''; C_DIM=''; C_CYAN=''; C_GREEN=''; C_RED=''; C_YELLOW=''
fi

log_info() { printf "==> %b%s%b\n" "${C_CYAN}" "$1" "${C_RESET}"; }
log_step() { printf "  -> %s\n" "$1"; }
log_ok() { printf "==> %b%s%b\n" "${C_GREEN}" "$1" "${C_RESET}"; }
log_warn() { printf "==> %bWARNING: %s%b\n" "${C_YELLOW}" "$1" "${C_RESET}"; }
log_error() { printf "==> %bERROR: %s%b\n" "${C_RED}" "$1" "${C_RESET}" >&2; }

# ---- novi stage begin ----
# The stage. While the install runs, a background renderer draws a card on the alternate screen:
# the NOVI wordmark lights up as the download comes in, a bar with the speed and the time left, the
# plan of steps with the one in progress, and the installation sheet, one line at a time. The main
# shell never draws. It keeps the plan in $NOVI_STAGE/plan (one "status<TAB>label<TAB>note" line per
# step) and the download writes "done total speed" (bytes, bytes, bytes per second) to $NOVI_PROGRESS.
#
#   novi_stage_start "Step one" "Step two"   enters the stage with the plan
#   novi_step "Step one" command...          runs one step quietly; returns the command's status
#   novi_note "80 MB"                        annotates the step that just ran
#   novi_stage_end                           holds the finished card, leaves, prints the receipt
#   novi_fail "message"                      leaves the stage, prints the message, exits 1
#
# Without a terminal (pipes, CI, TERM=dumb, NOVI_NO_ANIMATION=1) the steps print as plain lines and
# their output passes through. NOVI_ASCII=1 draws without Unicode. Ctrl+C or a failing step restores
# the terminal, and the output of every failed step is printed after it.
novi_human() {
    if [ "$1" -ge 1048576 ]; then printf '%d.%d MB' "$(($1 / 1048576))" "$(($1 * 10 / 1048576 % 10))"
    elif [ "$1" -ge 1024 ]; then printf '%d KB' "$(($1 / 1024))"
    else printf '%d B' "$1"; fi
}

novi_glyphs() {
    local utf=''
    case "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" in *[Uu][Tt][Ff]-8*|*[Uu][Tt][Ff]8*) utf=1 ;; esac
    if [ -n "${NOVI_ASCII:-}" ]; then utf=''; fi
    if [ -n "$utf" ]; then
        G_TL='╭'; G_TR='╮'; G_BL='╰'; G_BR='╯'; G_H='─'; G_V='│'
        G_TOP='▀'; G_BOT='▄'; G_FULL='█'; G_BAR='━'; G_HALF='╸'; G_TRACK='─'
        G_OK='✓'; G_BAD='✗'; G_DOT='·'; G_SPIN0='▖'; G_SPIN1='▘'; G_SPIN2='▝'; G_SPIN3='▗'
    else
        G_TL='+'; G_TR='+'; G_BL='+'; G_BR='+'; G_H='-'; G_V='|'
        G_TOP='#'; G_BOT='#'; G_FULL='#'; G_BAR='='; G_HALF='-'; G_TRACK='-'
        G_OK='+'; G_BAD='x'; G_DOT='.'; G_SPIN0='|'; G_SPIN1='/'; G_SPIN2='-'; G_SPIN3='\'
    fi
}

novi_stage_write() {
    [ -n "${NOVI_STAGE:-}" ] || return 0
    local i=0 body=''
    while [ "$i" -lt "$NOVI_STEPS" ]; do
        body+="${NOVI_ST[i]}"$'\t'"${NOVI_LB[i]}"$'\t'"${NOVI_NT[i]}"$'\n'
        i=$((i + 1))
    done
    printf '%s' "$body" > "$NOVI_STAGE/plan.tmp" && mv -f "$NOVI_STAGE/plan.tmp" "$NOVI_STAGE/plan"
}

novi_stage_start() {
    NOVI_STEPS=0; NOVI_CURRENT=-1; NOVI_STAGE=''; NOVI_STAGE_PID=''; NOVI_STAGE_T0=$SECONDS
    local label
    for label in "$@"; do
        NOVI_ST[NOVI_STEPS]=pending; NOVI_LB[NOVI_STEPS]=$label; NOVI_NT[NOVI_STEPS]=''
        NOVI_STEPS=$((NOVI_STEPS + 1))
    done
    novi_glyphs
    if [ ! -t 1 ] || [ "${TERM:-dumb}" = dumb ] || [ -n "${CI:-}${NOVI_NO_ANIMATION:-}" ]; then return 0; fi
    NOVI_STAGE=$(mktemp -d "${TMPDIR:-/tmp}/novi-stage.XXXXXX" 2>/dev/null) || { NOVI_STAGE=''; return 0; }
    export NOVI_PROGRESS="$NOVI_STAGE/progress"
    novi_stage_write
    printf '\033[?1049h\033[?25l\033[2J'
    novi_stage_render "$NOVI_STAGE" </dev/null & NOVI_STAGE_PID=$!
}

novi_step() {
    local label=$1 i=0 found=-1 status=0 started=$SECONDS log done_b total speed
    shift
    while [ "$i" -lt "$NOVI_STEPS" ]; do
        if [ "$found" -lt 0 ] && [ "${NOVI_ST[i]}" = pending ] && [ "${NOVI_LB[i]}" = "$label" ]; then found=$i; fi
        i=$((i + 1))
    done
    if [ "$found" -lt 0 ]; then
        found=$((NOVI_CURRENT + 1)); i=$NOVI_STEPS
        while [ "$i" -gt "$found" ]; do
            NOVI_ST[i]=${NOVI_ST[i - 1]}; NOVI_LB[i]=${NOVI_LB[i - 1]}; NOVI_NT[i]=${NOVI_NT[i - 1]}
            i=$((i - 1))
        done
        NOVI_ST[found]=pending; NOVI_LB[found]=$label; NOVI_NT[found]=''; NOVI_STEPS=$((NOVI_STEPS + 1))
    fi
    NOVI_CURRENT=$found
    if [ -z "${NOVI_STAGE:-}" ]; then
        log_info "$label"
        "$@"
        return $?
    fi
    NOVI_ST[found]=active; novi_stage_write
    rm -f "$NOVI_PROGRESS"
    log="$NOVI_STAGE/step-$found.log"
    "$@" >"$log" 2>&1 </dev/null || status=$?
    if [ "$status" -eq 0 ]; then
        NOVI_ST[found]=done
        if [ -z "${NOVI_NT[found]}" ]; then
            done_b=0; total=0; speed=0
            if [ -r "$NOVI_PROGRESS" ]; then read -r done_b total speed < "$NOVI_PROGRESS" 2>/dev/null || done_b=0; fi
            case "$done_b" in *[!0-9]*|'') done_b=0 ;; esac
            if [ "$done_b" -gt 0 ] && [ "$((SECONDS - started))" -ge 1 ]; then NOVI_NT[found]="$(novi_human "$done_b") in $((SECONDS - started))s"
            elif [ "$done_b" -gt 0 ]; then NOVI_NT[found]=$(novi_human "$done_b")
            elif [ "$((SECONDS - started))" -ge 2 ]; then NOVI_NT[found]="$((SECONDS - started))s"; fi
        fi
    else
        NOVI_ST[found]=failed; NOVI_NT[found]="exit $status"
    fi
    novi_stage_write
    return $status
}

novi_note() {
    if [ -z "${NOVI_STAGE:-}" ]; then log_step "$1"; return 0; fi
    if [ "$NOVI_CURRENT" -ge 0 ]; then NOVI_NT[NOVI_CURRENT]=$1; novi_stage_write; fi
}

# Leaves the stage. $1 is the exit status the script is leaving with: when it is not zero, the
# output of each failed step follows, so nothing a command said is lost behind the card.
novi_stage_stop() {
    local status=${1:-0} i=0
    [ -n "${NOVI_STAGE:-}" ] || return 0
    if [ -n "$NOVI_STAGE_PID" ]; then kill -TERM "$NOVI_STAGE_PID" 2>/dev/null || true; wait "$NOVI_STAGE_PID" 2>/dev/null || true; NOVI_STAGE_PID=''; fi
    printf '\033[0m\033[?25h\033[?1049l'
    if [ "$status" -ne 0 ]; then
        while [ "$i" -lt "$NOVI_STEPS" ]; do
            case "${NOVI_ST[i]}" in
                failed)
                    printf '%b==> %s %s failed (%s)%b\n' "$C_RED" "$G_BAD" "${NOVI_LB[i]}" "${NOVI_NT[i]}" "$C_RESET" >&2
                    if [ -s "$NOVI_STAGE/step-$i.log" ]; then sed 's/^/    /' "$NOVI_STAGE/step-$i.log" >&2; fi ;;
                active)
                    printf '%b==> Stopped during: %s%b\n' "$C_YELLOW" "${NOVI_LB[i]}" "$C_RESET" >&2
                    if [ -s "$NOVI_STAGE/step-$i.log" ]; then tail -n 20 "$NOVI_STAGE/step-$i.log" | sed 's/^/    /' >&2; fi ;;
            esac
            i=$((i + 1))
        done
    fi
    rm -rf "$NOVI_STAGE"; NOVI_STAGE=''
}

novi_stage_end() {
    local i=0 mark colour
    [ -n "${NOVI_STAGE:-}" ] || return 0
    sleep 1.4
    novi_stage_stop 0
    printf '\n'
    while [ "$i" -lt "$NOVI_STEPS" ]; do
        case "${NOVI_ST[i]}" in
            done) mark=$G_OK; colour=$C_GREEN ;;
            failed) mark=$G_BAD; colour=$C_RED ;;
            *) mark=$G_DOT; colour=$C_DIM ;;
        esac
        printf '  %b%s%b  %-40s %b%s%b\n' "$colour" "$mark" "$C_RESET" "${NOVI_LB[i]}" "$C_DIM" "${NOVI_NT[i]}" "$C_RESET"
        i=$((i + 1))
    done
    printf '\n'
}

novi_fail() {
    novi_stage_stop 1
    log_error "$1"
    exit 1
}

# The renderer: a background process that draws the card about twelve times a second from the plan
# and progress files in $1. It stops on SIGTERM once the frame in hand is written.
novi_stage_render() (
    set +eu
    dir=$1; quit=''
    trap 'quit=1' TERM
    E=$'\033'; RS="${E}[0m"; BG="${E}[48;5;233m"; BOLD="${E}[1m"; NOBOLD="${E}[22m"
    INK="${E}[38;5;255m"; MUTED="${E}[38;5;245m"; FAINT="${E}[38;5;240m"; LINE="${E}[38;5;237m"
    ROSE="${E}[38;5;217m"; ROSE_MID="${E}[38;5;181m"; OKC="${E}[38;5;151m"; BADC="${E}[38;5;210m"
    # The wordmark: ten pixel rows, thirty-two columns, drawn two pixel rows per text row.
    PX0='#.....#   .#####.   #......#   #'
    PX1='##....#   #.....#   #......#   #'
    PX2='##....#   #.....#   #......#   #'
    PX3='#.#...#   #.....#   .#....#.   #'
    PX4='#.#...#   #.....#   .#....#.   #'
    PX5='#..#..#   #.....#   .#....#.   #'
    PX6='#...#.#   #.....#   ..#..#..   #'
    PX7='#....##   #.....#   ..#..#..   #'
    PX8='#....##   #.....#   ...##...   #'
    PX9='#.....#   .#####.   ...##...   #'
    r=0
    while [ "$r" -lt 5 ]; do
        eval "t=\$PX$((r * 2)); b=\$PX$((r * 2 + 1))"
        c=0
        while [ "$c" -lt 32 ]; do
            case "${t:c:1}${b:c:1}" in '##') g=$G_FULL ;; '#.') g=$G_TOP ;; '.#') g=$G_BOT ;; *) g=' ' ;; esac
            WM[r * 32 + c]=$g
            c=$((c + 1))
        done
        r=$((r + 1))
    done
    nd=0; rest="${NOVI_DETAILS:-}|Ctrl+C stops the install and tidies up"; rest=${rest#|}
    while [ -n "$rest" ]; do
        DT[nd]=${rest%%|*}; nd=$((nd + 1))
        if [ "${rest%%|*}" = "$rest" ]; then rest=''; else rest=${rest#*|}; fi
    done
    title=${NOVI_STAGE_TITLE:-}
    spaces() { printf -v pad '%*s' "$1" ''; }
    put() { out+="${E}[${row};${left}H${BG}${LINE}${G_V}$1${LINE}${G_V}${RS}"; row=$((row + 1)); }
    frame=0; started=$SECONDS; size=''; W=0
    while [ -z "$quit" ]; do
        out=''
        if [ $((frame % 6)) -eq 0 ]; then
            set -- $(stty size 2>/dev/null </dev/tty); rows=${1:-}; cols=${2:-}
            case "$cols" in ''|0|*[!0-9]*) cols=80 ;; esac
            case "$rows" in ''|0|*[!0-9]*) rows=24 ;; esac
            if [ -n "$size" ] && [ "$size" != "$cols:$rows" ]; then out="${E}[2J"; fi
            size="$cols:$rows"
            w=$((cols - 4)); [ "$w" -gt 64 ] && w=64
            if [ "$w" -ne "$W" ]; then
                W=$w; HLINE=''; i=0
                while [ "$i" -lt "$W" ]; do HLINE+=$G_H; i=$((i + 1)); done
                spaces "$W"; BLANK=$pad
            fi
        fi
        n=0; active=-1; dn=0
        if [ -r "$dir/plan" ]; then
            while IFS=$'\t' read -r s l t; do
                ST[n]=$s; LB[n]=$l; NT[n]=$t
                [ "$s" = active ] && active=$n
                [ "$s" = done ] && dn=$((dn + 1))
                n=$((n + 1))
            done < "$dir/plan" 2>/dev/null
        fi
        pct=-1; done_b=0; total=0; speed=0; permille=0
        if [ -r "$dir/progress" ]; then
            read -r done_b total speed < "$dir/progress" 2>/dev/null
            case "$done_b$total$speed" in *[!0-9]*|'') done_b=0; total=0; speed=0 ;; esac
            if [ "$total" -gt 0 ]; then
                permille=$((done_b * 1000 / total)); [ "$permille" -gt 1000 ] && permille=1000
                pct=$((permille / 10))
            fi
        fi
        finale=0; [ "$n" -gt 0 ] && [ "$dn" -eq "$n" ] && finale=1
        elapsed=$((SECONDS - started))
        case "$((frame / 2 % 4))" in 0) spin=$G_SPIN0 ;; 1) spin=$G_SPIN1 ;; 2) spin=$G_SPIN2 ;; *) spin=$G_SPIN3 ;; esac
        printf -v clock '%02d:%02d' "$((elapsed / 60))" "$((elapsed % 60))"
        full_h=$((17 + n)); med_h=$((11 + n))
        if [ "$W" -ge 52 ] && [ "$rows" -ge "$full_h" ]; then mode=full; H=$full_h
        elif [ "$W" -ge 40 ] && [ "$rows" -ge "$med_h" ]; then mode=medium; H=$med_h
        else mode=compact; fi
        if [ "$mode" = compact ]; then
            if [ "$finale" -eq 1 ]; then text='Novi is ready'; spin="${OKC}${G_OK}"; elif [ "$active" -ge 0 ]; then text=${LB[active]}; else text='Preparing'; fi
            if [ "$pct" -ge 0 ] && [ "$finale" -eq 0 ]; then text="$text  ${pct}%  $(novi_human "$speed")/s"; else text="$text  $clock"; fi
            text=${text:0:$((cols > 10 ? cols - 9 : 1))}
            out+="${E}[H${E}[2K${ROSE}${BOLD}NOVI${NOBOLD} ${spin} ${INK}${text}${RS}"
            printf '%s' "$out"
            frame=$((frame + 1)); sleep 0.08
            continue
        fi
        left=$(((cols - W - 2) / 2 + 1)); top=$(((rows - H) / 2 + 1)); row=$top
        out+="${E}[${row};${left}H${BG}${LINE}${G_TL}${HLINE}${G_TR}${RS}"; row=$((row + 1))
        put "$BLANK"
        if [ "$mode" = full ]; then
            # The wordmark. Lit columns follow the download; a glint sweeps over what is lit. Without
            # a known size, a band of light passes back and forth over the dim letters.
            if [ "$finale" -eq 1 ]; then lit=32; elif [ "$pct" -ge 0 ]; then lit=$((permille * 32 / 1000)); else lit=-1; fi
            glint=$((frame * 2 % 96 - 12))
            p=$((frame % 100)); [ "$p" -gt 50 ] && p=$((100 - p)); centre=$((p * 48 / 50 - 8))
            r0=''; r1=''; r2=''; r3=''; r4=''; last=''; c=0
            while [ "$c" -lt 32 ]; do
                if [ "$lit" -ge 0 ]; then
                    if [ "$c" -lt "$lit" ]; then
                        d=$((c - glint)); [ "$d" -lt 0 ] && d=$((-d))
                        if [ "$d" -eq 0 ]; then colour=231; elif [ "$d" -eq 1 ]; then colour=224
                        elif [ "$c" -lt 11 ]; then colour=175; elif [ "$c" -lt 21 ]; then colour=181; else colour=217; fi
                    elif [ "$c" -eq "$lit" ]; then
                        if [ $((frame / 3 % 2)) -eq 0 ]; then colour=181; else colour=239; fi
                    else colour=237; fi
                else
                    d=$((c - centre)); [ "$d" -lt 0 ] && d=$((-d))
                    if [ "$d" -le 1 ]; then colour=224; elif [ "$d" -le 3 ]; then colour=217
                    elif [ "$d" -le 6 ]; then colour=181; elif [ "$d" -le 10 ]; then colour=175; else colour=132; fi
                fi
                if [ "$colour" != "$last" ]; then
                    seq="${E}[38;5;${colour}m"; r0+=$seq; r1+=$seq; r2+=$seq; r3+=$seq; r4+=$seq; last=$colour
                fi
                r0+=${WM[c]}; r1+=${WM[32 + c]}; r2+=${WM[64 + c]}; r3+=${WM[96 + c]}; r4+=${WM[128 + c]}
                c=$((c + 1))
            done
            wl=$(((W - 32) / 2)); spaces "$wl"; lpad=$pad; spaces $((W - 32 - wl)); rpad=$pad
            put "${lpad}${r0}${rpad}"; put "${lpad}${r1}${rpad}"; put "${lpad}${r2}${rpad}"; put "${lpad}${r3}${rpad}"; put "${lpad}${r4}${rpad}"
            put "$BLANK"
            tag='A quiet space to think.'
            tw=$((W - 6 - ${#tag} - 2)); [ "$tw" -lt 0 ] && tw=0
            shown=${title:0:tw}; spaces $((W - 6 - ${#tag} - ${#shown}))
            put "   ${MUTED}${tag}${pad}${INK}${shown}   "
            put "$BLANK"
        else
            tw=$((W - 6 - 9 - 2)); [ "$tw" -lt 0 ] && tw=0
            shown=${title:0:tw}; spaces $((W - 6 - 7 - ${#shown}))
            put "   ${ROSE}${BOLD}N O V I${NOBOLD}${pad}${INK}${shown}   "
            put "$BLANK"
        fi
        # The bar, with half-cell precision, and the line of figures under it.
        bw=$((W - 6)); bar=''
        if [ "$finale" -eq 1 ] || [ "$pct" -ge 0 ]; then
            if [ "$finale" -eq 1 ]; then eighths=$((bw * 2)); else eighths=$((permille * bw * 2 / 1000)); fi
            cells=$((eighths / 2)); half=$((eighths % 2))
            bar=$ROSE; i=0; while [ "$i" -lt "$cells" ]; do bar+=$G_BAR; i=$((i + 1)); done
            if [ "$half" -eq 1 ]; then bar+=$G_HALF; i=$((i + 1)); fi
            bar+=$LINE; while [ "$i" -lt "$bw" ]; do bar+=$G_TRACK; i=$((i + 1)); done
        else
            span=$((bw - 10)); p=$((frame % (span * 2))); [ "$p" -gt "$span" ] && p=$((span * 2 - p))
            bar=$LINE; i=0
            while [ "$i" -lt "$bw" ]; do
                if [ "$i" -eq "$p" ]; then bar+="${ROSE_MID}${G_BAR}${G_BAR}${ROSE}${G_BAR}${G_BAR}${G_BAR}${G_BAR}${G_BAR}${G_BAR}${ROSE_MID}${G_BAR}${G_BAR}${LINE}"; i=$((i + 10))
                else bar+=$G_TRACK; i=$((i + 1)); fi
            done
        fi
        put "   ${bar}   "
        if [ "$finale" -eq 1 ]; then
            l="${OKC}${G_OK} ${INK}Novi is ready."; lw=16; r="Done in ${clock}"
        elif [ "$pct" -ge 0 ]; then
            printf -v l1 '%3d%%' "$pct"; l2="   $(novi_human "$speed")/s   $(novi_human "$done_b") of $(novi_human "$total")"
            l="${INK}${BOLD}${l1}${NOBOLD}${MUTED}${l2}"; lw=$((${#l1} + ${#l2}))
            r=''
            if [ "$pct" -ge 100 ]; then r='finishing up'
            elif [ "$speed" -gt 0 ]; then
                eta=$(((total - done_b) / speed))
                if [ "$eta" -ge 3600 ]; then r="about $((eta / 3600))h $((eta % 3600 / 60))m left"
                elif [ "$eta" -ge 60 ]; then r="about $((eta / 60))m left"
                elif [ "$eta" -ge 1 ]; then r="about ${eta}s left"
                else r='almost there'; fi
            fi
        elif [ "$active" -ge 0 ]; then
            l="${MUTED}${LB[active]}..."; lw=$((${#LB[active]} + 3)); r=''
        else
            l="${MUTED}Preparing..."; lw=12; r=''
        fi
        if [ $((W - 6 - lw - ${#r})) -lt 2 ]; then r=''; fi
        spaces $((W - 6 - lw - ${#r})); put "   ${l}${pad}${MUTED}${r}   "
        put "$BLANK"
        # The plan.
        i=0
        while [ "$i" -lt "$n" ]; do
            case "${ST[i]}" in
                done) mark="${OKC}${G_OK}"; lc=$MUTED; nc=$MUTED ;;
                active) mark="${ROSE}${spin}"; lc="${INK}${BOLD}"; nc=$MUTED ;;
                failed) mark="${BADC}${G_BAD}"; lc=$BADC; nc=$BADC ;;
                *) mark="${FAINT}${G_DOT}"; lc=$FAINT; nc=$FAINT ;;
            esac
            note=${NT[i]}; lw=$((W - 6 - 3 - ${#note} - 2)); [ "$lw" -lt 8 ] && lw=8
            label=${LB[i]:0:lw}; spaces $((W - 6 - 3 - ${#label} - ${#note}))
            put "   ${mark}  ${lc}${label}${NOBOLD}${pad}${nc}${note}   "
            i=$((i + 1))
        done
        put "$BLANK"
        # The sheet, a line at a time, and the clock.
        detail=''
        if [ "$nd" -gt 0 ]; then
            detail=${DT[frame / 50 % nd]}
            if [ $((frame % 50)) -lt 3 ]; then dc=$FAINT; else dc=$MUTED; fi
        fi
        dw=$((W - 6 - 5 - 3)); [ "$dw" -lt 0 ] && dw=0; detail=${detail:0:dw}
        spaces $((W - 6 - ${#detail} - 5))
        put "   ${dc}${detail}${pad}${MUTED}${clock}   "
        put "$BLANK"
        out+="${E}[${row};${left}H${BG}${LINE}${G_BL}${HLINE}${G_BR}${RS}"
        printf '%s' "$out"
        frame=$((frame + 1)); sleep 0.08
    done
)
# ---- novi stage end ----

# Downloads a file while writing "done total speed" to the file named by NOVI_PROGRESS for the stage.
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
    if [ "${MODE}" = update ]; then ACTION="Update Novi ${INSTALLED} to ${LATEST:-the latest release}"; else ACTION="Install Novi ${LATEST:-}"; fi
    DOWNLOAD_LABEL="Download Novi${LATEST:+ ${LATEST}}"
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
if [ "${OS_TYPE}" != "Darwin" ]; then printf '==> ERROR: This script is for macOS. On Linux, use install.sh.\n' >&2; exit 1; fi
ARCH="$(uname -m)"
BASE_URL="${NOVI_BASE_URL:-"https://novi-virid.vercel.app"}"
SITE_HOST=${BASE_URL#*://}; SITE_HOST=${SITE_HOST%%/*}

# ------------------------------------------------------------------------------
# macOS Flow
# ------------------------------------------------------------------------------
if [ "${OS_TYPE}" = "Darwin" ]; then
    SW_VERS=$(sw_vers -productVersion 2>/dev/null || echo "Unknown")
    log_info "Novi for macOS"
    log_step "macOS ${SW_VERS} on ${ARCH}"

    if [ "${ARCH}" = "arm64" ]; then
        TARGET_ASSET="mac-arm64"
        ARCH_LABEL="Apple Silicon"
    elif [ "${ARCH}" = "x86_64" ]; then
        TARGET_ASSET="mac-x64"
        ARCH_LABEL="Intel"
    else
        log_error "Unsupported CPU architecture: ${ARCH}"
        exit 1
    fi

    PAYLOAD_URL="${BASE_URL}/api/download?asset=${TARGET_ASSET}"
    INSTALL_TARGET="/Applications/Novi.app"
    INSTALLED_VERSION=''
    if [ -d "${INSTALL_TARGET}" ]; then INSTALLED_VERSION=$(defaults read "${INSTALL_TARGET}/Contents/Info" CFBundleShortVersionString 2>/dev/null || true); fi
    novi_plan "${INSTALLED_VERSION}" "$(novi_latest_version || true)"
    WORK_DIR=$(mktemp -d /tmp/novi-installer.XXXXXX)
    DMG_PATH="${WORK_DIR}/novi-payload.dmg"
    MOUNT_DIR="${WORK_DIR}/mount"
    export NOVI_STAGE_TITLE="macOS ${SW_VERS}, ${ARCH_LABEL}"
    export NOVI_DETAILS="${ACTION}|A disk image built for ${ARCH_LABEL} Macs|From ${SITE_HOST}|Into ${INSTALL_TARGET}|Quarantine is cleared so Gatekeeper lets it open|Novi opens by itself at the end"

    cleanup_mac() {
        if [ -d "${MOUNT_DIR}" ]; then hdiutil detach "${MOUNT_DIR}" -quiet 2>/dev/null || true; fi
        rm -rf "${WORK_DIR}" 2>/dev/null || true
    }
    install_bundle() {
        rm -rf "${INSTALL_TARGET}" && ditto "${MOUNT_DIR}/Novi.app" "${INSTALL_TARGET}" && hdiutil detach "${MOUNT_DIR}" -quiet
    }
    trap 'novi_stage_stop $?; cleanup_mac' EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM

    novi_stage_start "${DOWNLOAD_LABEL}" "Open the disk image" "Copy Novi into Applications" "Clear the quarantine flag" "Open Novi"
    novi_step "${DOWNLOAD_LABEL}" novi_fetch "${PAYLOAD_URL}" "${DMG_PATH}"
    if [ ! -s "${DMG_PATH}" ]; then novi_fail "The downloaded disk image is empty. Check your connection and try again."; fi

    mkdir -p "${MOUNT_DIR}"
    novi_step "Open the disk image" hdiutil attach "${DMG_PATH}" -nobrowse -readonly -mountpoint "${MOUNT_DIR}" -quiet
    if [ ! -d "${MOUNT_DIR}/Novi.app" ]; then novi_fail "Novi.app was not found inside the disk image."; fi

    novi_step "Copy Novi into Applications" install_bundle

    # Novi is not notarised with Apple, so Gatekeeper would refuse the bundle. Clearing the quarantine
    # flag is what a manual .dmg install needs too: xattr -cr /Applications/Novi.app
    novi_step "Clear the quarantine flag" xattr -cr "${INSTALL_TARGET}"
    if [ ! -x "${INSTALL_TARGET}/Contents/MacOS/Novi" ]; then novi_note "the main binary looks unusual"; fi

    novi_step "Open Novi" open "${INSTALL_TARGET}"
    novi_stage_end
    if [ "${MODE}" = update ]; then log_ok "Update completed successfully."; else log_ok "Installation completed successfully."; fi
    print_guide "${INSTALL_TARGET}" "rm -rf /Applications/Novi.app"
    exit 0

# ------------------------------------------------------------------------------
# Linux Flow
# ------------------------------------------------------------------------------
elif [ "${OS_TYPE}" = "Linux" ]; then
    log_info "Novi for Linux"
    log_step "Architecture: ${ARCH}"

    case "${ARCH}" in
        x86_64|amd64) ARCH_SUFFIX="" ;;
        aarch64|arm64) ARCH_SUFFIX="-arm64" ;;
        *) log_error "Unsupported architecture: ${ARCH}. Novi for Linux is built for x86_64 and arm64."; exit 1 ;;
    esac

    LATEST_VERSION=$(novi_latest_version || true)
    WORK_DIR=$(mktemp -d /tmp/novi-linux.XXXXXX)
    cleanup_linux() { rm -rf "${WORK_DIR}" 2>/dev/null || true; }
    trap 'novi_stage_stop $?; cleanup_linux' EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM

    # If Debian/Ubuntu and apt/dpkg is available
    if command -v dpkg >/dev/null 2>&1 && [ -f /etc/debian_version ]; then
        log_step "Debian / Ubuntu detected. Novi comes as a .deb package."
        DEB_PATH="${WORK_DIR}/novi.deb"
        PAYLOAD_URL="${BASE_URL}/api/download?asset=linux-deb${ARCH_SUFFIX}"
        novi_plan "$(dpkg-query -W -f='${Version}' novi 2>/dev/null || true)" "${LATEST_VERSION}"
        export NOVI_STAGE_TITLE="Debian / Ubuntu, ${ARCH}"
        export NOVI_DETAILS="${ACTION}|A .deb package for ${ARCH}|From ${SITE_HOST}|Into /usr through dpkg, with a menu entry|Remove it later with: sudo apt remove novi|Novi opens by itself at the end"

        SUDO=''
        if [ "$EUID" -ne 0 ]; then
            log_info "Installing the package needs administrator rights."
            sudo -v
            SUDO='sudo -n'
        fi
        novi_stage_start "${DOWNLOAD_LABEL}" "Install the package" "Open Novi"
        novi_step "${DOWNLOAD_LABEL}" novi_fetch "${PAYLOAD_URL}" "${DEB_PATH}"
        if [ ! -s "${DEB_PATH}" ]; then novi_fail "The downloaded package is empty. Check your connection and try again."; fi
        novi_step "Install the package" ${SUDO} dpkg --force-confdef --force-confold -i "${DEB_PATH}" || novi_step "Fix missing dependencies" ${SUDO} apt-get install -f -y
        novi_step "Open Novi" sh -c 'nohup novi >/dev/null 2>&1 &'
        novi_stage_end
        if [ "${MODE}" = update ]; then log_ok "Update completed successfully."; else log_ok "Installation completed successfully."; fi
        print_guide "the novi package (dpkg), in your applications menu" "sudo apt remove novi"
        exit 0
    else
        # Universal AppImage flow
        log_step "Novi comes as a universal AppImage on this system."
        APPIMAGE_DIR="${HOME}/.local/bin"
        APPIMAGE_PATH="${APPIMAGE_DIR}/novi"
        mkdir -p "${APPIMAGE_DIR}"

        PAYLOAD_URL="${BASE_URL}/api/download?asset=linux-appimage${ARCH_SUFFIX}"
        INSTALLED_VERSION=''
        if [ -x "${APPIMAGE_PATH}" ]; then INSTALLED_VERSION=$(cat "${APPIMAGE_PATH}.version" 2>/dev/null || true); fi
        novi_plan "${INSTALLED_VERSION}" "${LATEST_VERSION}"
        export NOVI_STAGE_TITLE="Linux, ${ARCH}"
        export NOVI_DETAILS="${ACTION}|An AppImage for ${ARCH}|From ${SITE_HOST}|Into ${APPIMAGE_PATH}|Remove it later by deleting that file|Novi opens by itself at the end"
        finish_appimage() {
            chmod +x "${APPIMAGE_PATH}" && { [ -z "${LATEST}" ] || printf '%s\n' "${LATEST}" > "${APPIMAGE_PATH}.version"; }
        }

        novi_stage_start "${DOWNLOAD_LABEL}" "Make it executable" "Open Novi"
        novi_step "${DOWNLOAD_LABEL}" novi_fetch "${PAYLOAD_URL}" "${APPIMAGE_PATH}"
        if [ ! -s "${APPIMAGE_PATH}" ]; then novi_fail "The downloaded AppImage is empty. Check your connection and try again."; fi
        novi_step "Make it executable" finish_appimage
        novi_step "Open Novi" sh -c 'nohup "$1" >/dev/null 2>&1 &' sh "${APPIMAGE_PATH}"
        novi_stage_end
        if [ "${MODE}" = update ]; then log_ok "Updated binary at ${APPIMAGE_PATH}"; else log_ok "Installed binary to ${APPIMAGE_PATH}"; fi
        print_guide "${APPIMAGE_PATH}" "rm ${APPIMAGE_PATH} ${APPIMAGE_PATH}.version"
        exit 0
    fi
else
    log_error "Unsupported operating system: ${OS_TYPE}. Use PowerShell on Windows."
    exit 1
fi
