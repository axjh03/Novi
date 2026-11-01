import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';

/*
 * The Modern kit: the few controls every floating window is built from. Glass capsules, round
 * buttons with a pressed scale, menus that open from their trigger, a segmented switch with a sliding
 * thumb, a level meter and a confirmation card. Styles live in styles/modern.css under `mod-`.
 */

export const modifierKey = /mac/i.test(navigator.platform) ? '⌘' : 'Ctrl';

/** One floating capsule. The window drags from the capsule; its controls do not. */
export function ModernBar({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return <div className={`mod-bar ${className}`.trim()} role="toolbar" aria-label={label}>{children}</div>;
}

export type ButtonTone = 'plain' | 'primary' | 'live' | 'danger' | 'quiet';

/**
 * A round control. `label` is always its accessible name; it is also shown when `showLabel` is set.
 * `pressed` renders a toggle; `status` adds a small dot for background state (listening, an error).
 */
export function ModernButton({ icon, label, showLabel = false, tone = 'plain', pressed, disabled, onClick, title, className = '', kbd, status, badge, type = 'button' }: {
  icon?: ReactNode; label: string; showLabel?: boolean; tone?: ButtonTone; pressed?: boolean; disabled?: boolean;
  onClick?: () => void; title?: string; className?: string; kbd?: string; status?: 'live' | 'error' | 'on'; badge?: ReactNode; type?: 'button' | 'submit';
}) {
  return <button type={type} className={`mod-btn tone-${tone} ${showLabel ? 'has-label' : ''} ${pressed ? 'is-on' : ''} ${className}`.trim()}
    aria-label={label} title={title ?? label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
    {icon}
    {showLabel && <span className="mod-btn-label">{label}</span>}
    {kbd && <kbd className="mod-kbd" aria-hidden="true">{kbd}</kbd>}
    {status && <i className={`mod-dot is-${status}`} aria-hidden="true" />}
    {badge}
  </button>;
}

/**
 * A menu that opens from its trigger. Only one Modern menu is open at a time in a window; a click
 * outside or Escape closes it, and the trigger gets focus back.
 */
export function ModernMenu({ label, icon, text, align = 'start', width, className = '', children, keepMounted = false, badge }: {
  label: string; icon?: ReactNode; text?: ReactNode; align?: 'start' | 'center' | 'end'; width?: number; className?: string; children: ReactNode; keepMounted?: boolean; badge?: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const details = ref.current;
    if (!open || !details) return;
    const doc = details.ownerDocument;
    const outside = (event: PointerEvent) => { if (!event.composedPath().includes(details)) details.open = false; };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      details.open = false;
      details.querySelector('summary')?.focus();
    };
    doc.addEventListener('pointerdown', outside);
    doc.addEventListener('keydown', escape);
    return () => { doc.removeEventListener('pointerdown', outside); doc.removeEventListener('keydown', escape); };
  }, [open]);
  return <details ref={ref} name="mod-menus" className={`mod-menu ${className}`.trim()} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className={`mod-btn tone-plain ${text ? 'has-label' : ''}`} aria-label={label} title={label}>
      {icon}{text && <span className="mod-btn-label">{text}</span>}{badge}<ChevronDown size={12} className="mod-chevron" aria-hidden="true" />
    </summary>
    {(open || keepMounted) && <div className="mod-menu-content" data-align={align} style={width ? { width } : undefined}>{children}</div>}
  </details>;
}

/** Closes the menu that contains the element, returning focus to its trigger. For menu items that complete an action. */
export function closeMenu(element: HTMLElement) {
  const menu = element.closest('details');
  if (menu) { menu.open = false; menu.querySelector('summary')?.focus(); }
}

export function MenuTitle({ children }: { children: ReactNode }) { return <div className="mod-menu-title">{children}</div>; }

/** One row in a menu: an icon, a label, an optional description, and a check when it is the current choice. */
export function MenuItem({ icon, label, description, selected, disabled, onClick, trailing, danger }: {
  icon?: ReactNode; label: ReactNode; description?: ReactNode; selected?: boolean; disabled?: boolean; onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void; trailing?: ReactNode; danger?: boolean;
}) {
  return <button type="button" className={`mod-menu-item ${selected ? 'is-selected' : ''} ${danger ? 'is-danger' : ''}`.trim()} aria-pressed={selected} disabled={disabled} onClick={onClick}>
    {icon && <span className="mod-menu-icon" aria-hidden="true">{icon}</span>}
    <span className="mod-menu-text"><span>{label}</span>{description && <small>{description}</small>}</span>
    {trailing}
    {selected && <Check size={14} className="mod-menu-check" aria-hidden="true" />}
  </button>;
}

/** A segmented switch with a thumb that slides to the choice. `tabs` gives it tab semantics for content panels. */
export function ModernSegmented<T extends string>({ value, options, onChange, label, tabs = false, idPrefix = 'mod-seg' }: {
  value: T; options: Array<{ id: T; label: string; dot?: boolean }>; onChange: (value: T) => void; label: string; tabs?: boolean; idPrefix?: string;
}) {
  const index = Math.max(0, options.findIndex(option => option.id === value));
  const style = { '--seg-index': index, '--seg-count': options.length } as CSSProperties;
  return <div className="mod-seg" role={tabs ? 'tablist' : 'radiogroup'} aria-label={label} style={style}>
    {options.map(option => {
      const selected = option.id === value;
      const common = {
        key: option.id, type: 'button' as const, className: 'mod-seg-option', tabIndex: tabs ? (selected ? 0 : -1) : undefined,
        onClick: () => onChange(option.id),
        onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const next = options[(index + (event.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length];
          onChange(next.id);
          event.currentTarget.ownerDocument.getElementById(`${idPrefix}-${next.id}`)?.focus();
        },
      };
      return tabs
        ? <button {...common} role="tab" id={`${idPrefix}-${option.id}`} aria-selected={selected} aria-controls={`${idPrefix}-panel-${option.id}`}>{option.label}{option.dot && <i className="mod-dot is-live" aria-hidden="true" />}</button>
        : <button {...common} role="radio" id={`${idPrefix}-${option.id}`} aria-checked={selected}>{option.label}{option.dot && <i className="mod-dot is-live" aria-hidden="true" />}</button>;
    })}
  </div>;
}

/** Four bars that move with the input level while listening, and rest when not. */
export function LiveMeter({ level, active, connecting = false }: { level: number; active: boolean; connecting?: boolean }) {
  const style = { '--level': Math.max(0.15, Math.min(1, level / 60)) } as CSSProperties;
  return <span className={`mod-meter ${active ? 'is-active' : ''} ${connecting ? 'is-connecting' : ''}`.trim()} style={style} aria-hidden="true"><i /><i /><i /><i /></span>;
}

/** A confirmation inside the answer window: a question, what happens, two choices. Escape keeps things as they are. */
export function ModernConfirm({ title, children, confirmLabel, onConfirm, onCancel, busy = false, cancelLabel = 'Keep going' }: {
  title: string; children: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void; busy?: boolean; cancelLabel?: string;
}) {
  const id = useRef(`mod-confirm-${Math.random().toString(36).slice(2, 8)}`);
  return <div className="mod-confirm" role="alertdialog" aria-modal="true" aria-labelledby={`${id.current}-title`} aria-describedby={`${id.current}-text`}
    onKeyDown={event => { if (event.key === 'Escape' && !busy) { event.preventDefault(); onCancel(); } }}>
    <h2 id={`${id.current}-title`}>{title}</h2>
    <p id={`${id.current}-text`}>{children}</p>
    <div className="mod-confirm-actions">
      <button type="button" className="mod-btn tone-quiet has-label" autoFocus disabled={busy} onClick={onCancel}><span className="mod-btn-label">{cancelLabel}</span></button>
      <button type="button" className="mod-btn tone-danger has-label" disabled={busy} onClick={onConfirm}><span className="mod-btn-label">{confirmLabel}</span></button>
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
