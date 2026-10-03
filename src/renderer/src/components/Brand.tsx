export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'compact' : ''}`}><span className="brand-mark" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 32 32" fill="none"><path d="M7 24V8l18 16V8M7 16l9-8 9 8-9 8-9-8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg></span>{!compact && <span>novi<span className="brand-dot">.</span></span>}</div>;
}
