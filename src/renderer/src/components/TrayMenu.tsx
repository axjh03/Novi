import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** Native disclosures share one open slot and use the tray's own document for dismissal. */
export function TrayMenu({ label, title, children, className = '' }: {
  label: string; title: ReactNode; children: ReactNode; className?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const details = ref.current;
    if (!open || !details) return;
    const doc = details.ownerDocument;
    const outside = (event: PointerEvent) => {
      if (!event.composedPath().includes(details)) details.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      details.open = false;
      details.querySelector('summary')?.focus();
    };
    doc.addEventListener('pointerdown', outside);
    doc.addEventListener('keydown', escape);
    return () => {
      doc.removeEventListener('pointerdown', outside);
      doc.removeEventListener('keydown', escape);
    };
  }, [open]);

  return <details ref={ref} name="tray-controls" className={`tray-menu ${className}`}
    onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary aria-label={label} title={label}>{title}<ChevronDown size={12} className="tray-menu-chevron" aria-hidden="true" /></summary>
    {open && <div className="tray-menu-content">{children}</div>}
  </details>;
}
