import logoSvg from '../assets/logo.svg';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'compact' : ''}`}>
      <span className="brand-mark" aria-hidden="true">
        <img src={logoSvg} alt="Novi" className="brand-logo-img" />
      </span>
      {!compact && (
        <span>
          novi<span className="brand-dot">.</span>
        </span>
      )}
    </div>
  );
}

