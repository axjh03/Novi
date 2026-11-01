'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type SyntheticEvent } from 'react';
import Link from 'next/link';

export type MenuItem =
  | { separator: true }
  | { label: string; icon?: ReactNode; onSelect?: () => void; href?: string; external?: boolean; danger?: boolean; disabled?: boolean; separator?: false };

type Props = {
  /** The accessible name of the trigger; also its tooltip. */
  label: string;
  /** What the trigger button shows. */
  trigger: ReactNode;
  className?: string;
  items: MenuItem[];
  /** Optional block above the items: who this menu is about. */
  head?: ReactNode;
  align?: 'start' | 'end';
  disabled?: boolean;
};

/**
 * A menu on the browser's top layer (the Popover API), so it never gets clipped by a scrolling table,
 * anchored to its trigger and scaled in from that corner. Escape and an outside click close it; the
 * arrow keys move between items.
 */
export default function Menu({ label, trigger, className, items, head, align = 'end', disabled }: Props) {
  const id = useId().replace(/:/g, '');
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  function place() {
    const anchor = button.current?.getBoundingClientRect(), menu = panel.current;
    if (!anchor || !menu) return;
    const width = menu.offsetWidth, height = menu.offsetHeight, gap = 6, margin = 12;
    let left = align === 'end' ? anchor.right - width : anchor.left;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    const below = anchor.bottom + gap + height <= window.innerHeight - margin;
    const top = below ? anchor.bottom + gap : Math.max(margin, anchor.top - gap - height);
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.style.setProperty('--origin', `${below ? 'top' : 'bottom'} ${align === 'end' ? 'right' : 'left'}`);
  }
  function onToggle(event: SyntheticEvent<HTMLDivElement>) {
    const next = (event.nativeEvent as ToggleEvent).newState === 'open';
    setOpen(next);
    if (next) { place(); panel.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus(); }
  }
  useEffect(() => {
    if (!open) return;
    const close = () => panel.current?.hidePopover();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [open]);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const focusable = [...(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') || [])];
    if (!focusable.length) return;
    const index = focusable.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? focusable.length - 1 : event.key === 'ArrowDown' ? (index + 1) % focusable.length : (index - 1 + focusable.length) % focusable.length;
    focusable[next].focus();
  }
  const choose = (item: Exclude<MenuItem, { separator: true }>) => () => { panel.current?.hidePopover(); item.onSelect?.(); };

  return <>
    <button ref={button} type="button" className={className} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} aria-controls={id} popoverTarget={id} disabled={disabled}>{trigger}</button>
    <div ref={panel} id={id} popover="auto" className="menu" role="menu" aria-label={label} onToggle={onToggle} onKeyDown={onKeyDown}>
      {head && <div className="menu-head">{head}</div>}
      {items.map((item, index) => item.separator
        ? <hr key={index} />
        : item.href
          ? item.external
            ? <a key={index} role="menuitem" href={item.href} target="_blank" rel="noopener noreferrer" onClick={() => panel.current?.hidePopover()}>{item.icon}{item.label}</a>
            : <Link key={index} role="menuitem" href={item.href} onClick={() => panel.current?.hidePopover()}>{item.icon}{item.label}</Link>
          : <button key={index} type="button" role="menuitem" className={item.danger ? 'danger' : undefined} disabled={item.disabled} onClick={choose(item)}>{item.icon}{item.label}</button>)}
    </div>
  </>;
}
