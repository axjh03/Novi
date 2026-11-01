import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Check, ChevronDown, Minus, Plus } from 'lucide-react';

/*
 * The Deck kit: the controls every Modern window is built from. A deck is one card with an optional
 * status strip along its top and a row of tools under it. Tools sit in clusters (a tinted plate per
 * job), a split tool pairs an action with its related choices, tabs underline the current panel,
 * the meter is seven bars, and the stepper is minus, value, plus. Styles live in styles/modern.css
 * under `deck-`.
 */

export const modifierKey = /mac/i.test(navigator.platform) ? '⌘' : 'Ctrl';

/** One floating card. The window drags from the card; its controls do not. */
export function Deck({ label, className = '', strip, children }: { label: string; className?: string; strip?: ReactNode; children: ReactNode }) {
  return <div className={`deck ${className}`.trim()} role="toolbar" aria-label={label}>
    {strip && <div className="deck-strip">{strip}</div>}
    <div className="deck-row">{children}</div>
  </div>;
}

/** Controls that share a job sit on one plate. Plates are told apart by space, never by lines. */
export function Cluster({ label, className = '', children }: { label?: string; className?: string; children: ReactNode }) {
  return <div className={`deck-cluster ${className}`.trim()} role={label ? 'group' : undefined} aria-label={label}>{children}</div>;
}

export function Spacer() { return <span className="deck-spacer" aria-hidden="true" />; }

export type ToolTone = 'plain' | 'primary' | 'live' | 'danger' | 'quiet';

/**
 * One control. `label` is always its accessible name and shows when `showLabel` is set.
 * `pressed` makes it a toggle; `status` adds a small corner dot for background state.
 */
export function Tool({ icon, label, showLabel = false, tone = 'plain', pressed, disabled, onClick, title, className = '', kbd, status, badge, type = 'button' }: {
  icon?: ReactNode; label: string; showLabel?: boolean; tone?: ToolTone; pressed?: boolean; disabled?: boolean;
  onClick?: () => void; title?: string; className?: string; kbd?: string; status?: 'live' | 'error' | 'on'; badge?: ReactNode; type?: 'button' | 'submit';
}) {
  return <button type={type} className={`deck-tool tone-${tone} ${showLabel ? 'has-label' : ''} ${pressed ? 'is-on' : ''} ${className}`.trim()}
    aria-label={label} title={title ?? label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
    {icon}
    {showLabel && <span className="deck-tool-label">{label}</span>}
    {kbd && <kbd className="deck-kbd" aria-hidden="true">{kbd}</kbd>}
    {status && <i className={`deck-dot is-${status}`} aria-hidden="true" />}
    {badge}
  </button>;
}

/**
 * A menu that opens from its trigger. One Modern menu is open per window; a click outside or
 * Escape closes it and the trigger gets focus back. `up` opens it above the trigger.
 */
export function ToolMenu({ label, icon, text, align = 'start', up = false, width, className = '', children, keepMounted = false, badge, chevron = true, tone = 'plain' }: {
  label: string; icon?: ReactNode; text?: ReactNode; align?: 'start' | 'center' | 'end'; up?: boolean; width?: number; className?: string; children: ReactNode; keepMounted?: boolean; badge?: ReactNode; chevron?: boolean; tone?: ToolTone;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const details = ref.current;
    if (!open || !details) return;
    const doc = details.ownerDocument;
    const outside = (event: PointerEvent) => { if (!event.composedPath().includes(details)) details.open = false; };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      details.open = false;
      details.querySelector('summary')?.focus();
    };
    doc.addEventListener('pointerdown', outside);
    doc.addEventListener('keydown', escape);
    return () => { doc.removeEventListener('pointerdown', outside); doc.removeEventListener('keydown', escape); };
  }, [open]);
  return <details ref={ref} name="deck-menus" className={`deck-menu ${up ? 'opens-up' : ''} ${className}`.trim()} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className={`deck-tool tone-${tone} ${text ? 'has-label' : ''}`} aria-label={label} title={label}>
      {icon}{text && <span className="deck-tool-label">{text}</span>}{badge}{chevron && <ChevronDown size={11} className="deck-chevron" aria-hidden="true" />}
    </summary>
    {(open || keepMounted) && <div className="deck-menu-content" data-align={align} style={width ? { width } : undefined}>{children}</div>}
  </details>;
}

/** Closes the menu around the element and returns focus to its trigger; for items that complete an action. */
export function closeMenu(element: HTMLElement) {
  const menu = element.closest('details');
  if (menu) { menu.open = false; menu.querySelector('summary')?.focus(); }
}

export function MenuTitle({ children }: { children: ReactNode }) { return <div className="deck-menu-title">{children}</div>; }
export function MenuGroup({ children, className = '', ...rest }: { children: ReactNode; className?: string; role?: string; 'aria-label'?: string }) { return <div className={`deck-menu-group ${className}`.trim()} {...rest}>{children}</div>; }
export function MenuFoot({ children }: { children: ReactNode }) { return <div className="deck-menu-foot">{children}</div>; }

/** One row in a menu: an icon, a label, an optional description, and a check when it is the current choice. */
export function MenuItem({ icon, label, description, selected, disabled, onClick, trailing, danger }: {
  icon?: ReactNode; label: ReactNode; description?: ReactNode; selected?: boolean; disabled?: boolean; onClick?: (event: MouseEvent<HTMLButtonElement>) => void; trailing?: ReactNode; danger?: boolean;
}) {
  return <button type="button" className={`deck-menu-item ${selected ? 'is-selected' : ''} ${danger ? 'is-danger' : ''}`.trim()} aria-pressed={selected} disabled={disabled} onClick={onClick}>
    {icon && <span className="deck-menu-icon" aria-hidden="true">{icon}</span>}
    <span className="deck-menu-text"><span>{label}</span>{description && <small>{description}</small>}</span>
    {trailing}
    {selected && <Check size={14} className="deck-menu-check" aria-hidden="true" />}
  </button>;
}

/** An action and, beside it, a chevron with the related choices. */
export function SplitTool({ icon, label, tone = 'primary', disabled, onClick, kbd, title, menuLabel, width, align = 'end', children }: {
  icon?: ReactNode; label: string; tone?: ToolTone; disabled?: boolean; onClick: () => void; kbd?: string; title?: string; menuLabel: string; width?: number; align?: 'start' | 'center' | 'end'; children: ReactNode;
}) {
  return <span className={`deck-split tone-${tone}`}>
    <Tool icon={icon} label={label} showLabel tone={tone} disabled={disabled} onClick={onClick} kbd={kbd} title={title} className="deck-split-main" />
    <ToolMenu label={menuLabel} align={align} width={width} tone={tone} className="deck-split-more">{children}</ToolMenu>
  </span>;
}

/** Underline tabs with a marker that slides to the current one. */
export function Tabs<T extends string>({ value, options, onChange, label, idPrefix = 'deck-tab' }: {
  value: T; options: Array<{ id: T; label: string; count?: number; busy?: boolean }>; onChange: (value: T) => void; label: string; idPrefix?: string;
}) {
  const index = Math.max(0, options.findIndex(option => option.id === value));
  const style = { '--i': index, '--n': options.length } as CSSProperties;
  return <div className="deck-tabs" role="tablist" aria-label={label} style={style}>
    {options.map(option => {
      const selected = option.id === value;
      return <button key={option.id} type="button" role="tab" id={`${idPrefix}-${option.id}`} className="deck-tab" aria-selected={selected} aria-controls={`${idPrefix}-panel-${option.id}`} tabIndex={selected ? 0 : -1}
        onClick={() => onChange(option.id)}
        onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const next = options[(index + (event.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length];
          onChange(next.id);
          event.currentTarget.ownerDocument.getElementById(`${idPrefix}-${next.id}`)?.focus();
        }}>
        {option.label}{typeof option.count === 'number' && option.count > 0 && <b className="deck-count">{option.count}</b>}{option.busy && <i className="deck-dot is-live" aria-hidden="true" />}
      </button>;
    })}
  </div>;
}

/** Seven bars that follow the input level while listening and rest when not. */
export function Meter({ level, active, connecting = false }: { level: number; active: boolean; connecting?: boolean }) {
  const style = { '--level': Math.max(0.15, Math.min(1, level / 60)) } as CSSProperties;
  return <span className={`deck-meter ${active ? 'is-active' : ''} ${connecting ? 'is-connecting' : ''}`.trim()} style={style} aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span>;
}

/** Minus, the value, plus. */
export function Stepper({ label, value, onDown, onUp, downLabel, upLabel, downDisabled, upDisabled }: {
  label: string; value: string; onDown: () => void; onUp: () => void; downLabel: string; upLabel: string; downDisabled?: boolean; upDisabled?: boolean;
}) {
  return <div className="deck-stepper" role="group" aria-label={label}>
    <button type="button" className="deck-tool tone-quiet" aria-label={downLabel} title={downLabel} disabled={downDisabled} onClick={onDown}><Minus size={13} /></button>
    <output className="deck-stepper-value" aria-live="polite">{value}</output>
    <button type="button" className="deck-tool tone-quiet" aria-label={upLabel} title={upLabel} disabled={upDisabled} onClick={onUp}><Plus size={13} /></button>
  </div>;
}

/** What the session is doing right now, as a strip: the state, the meter, the clock, and the identity. */
export function StatusStrip({ state, live, connecting, level, elapsed, meta }: { state: string; live: boolean; connecting: boolean; level: number; elapsed: number; meta: ReactNode }) {
  return <>
    <span className={`deck-state ${live ? 'is-live' : ''} ${connecting ? 'is-connecting' : ''}`.trim()} role="status"><i aria-hidden="true" />{state}</span>
    <Meter level={level} active={live} connecting={connecting} />
    <span className="deck-clock" aria-label={`${clockText(elapsed)} listened`} title="Time spent listening">{clockText(elapsed)}</span>
    <span className="deck-spacer" aria-hidden="true" />
    <span className="deck-meta">{meta}</span>
  </>;
}

/** A confirmation inside the center window: a question, what happens, two choices. Escape keeps things as they are. */
export function DeckConfirm({ title, children, confirmLabel, onConfirm, onCancel, busy = false, cancelLabel = 'Keep going' }: {
  title: string; children: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void; busy?: boolean; cancelLabel?: string;
}) {
  const id = useRef(`deck-confirm-${Math.random().toString(36).slice(2, 8)}`);
  return <div className="deck-confirm" role="alertdialog" aria-modal="true" aria-labelledby={`${id.current}-title`} aria-describedby={`${id.current}-text`}
    onKeyDown={event => { if (event.key === 'Escape' && !busy) { event.preventDefault(); onCancel(); } }}>
    <h2 id={`${id.current}-title`}>{title}</h2>
    <p id={`${id.current}-text`}>{children}</p>
    <div className="deck-confirm-actions">
      <button type="button" className="deck-tool tone-quiet has-label" autoFocus disabled={busy} onClick={onCancel}><span className="deck-tool-label">{cancelLabel}</span></button>
      <button type="button" className="deck-tool tone-danger has-label" disabled={busy} onClick={onConfirm}><span className="deck-tool-label">{confirmLabel}</span></button>
    </div>
  </div>;
}

/** Elapsed time as m:ss or h:mm:ss. */
export function clockText(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600), minutes = Math.floor(total % 3600 / 60), seconds = total % 60;
  const two = (value: number) => String(value).padStart(2, '0');
  return hours ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}

/** Time spent listening in this session: runs while audio is captured, holds while paused. */
export function useListeningClock(listening: boolean) {
  const [held, setHeld] = useState(0);
  const [since, setSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (listening) { setSince(Date.now()); return; }
    setSince(current => { if (current) setHeld(value => value + Date.now() - current); return null; });
  }, [listening]);
  useEffect(() => {
    if (!since) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [since]);
  return held + (since ? Math.max(0, now - since) : 0);
}
