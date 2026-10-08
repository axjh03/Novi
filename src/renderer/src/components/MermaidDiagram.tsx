import { useEffect, useRef, useState } from 'react';
import { errorText } from '../services/api';

export function MermaidDiagram({ code }: { code: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setError('');
    const target = container.current!;
    target.replaceChildren();
    void (async () => {
      const { default: mermaid } = await import('mermaid');
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true,
        maxTextSize: 50000, maxEdges: 300, theme: 'dark', themeVariables: { background: 'transparent' },
        flowchart: { htmlLabels: false } });
      const { svg } = await mermaid.render(`diagram-${crypto.randomUUID()}`, code);
      if (!cancelled) target.innerHTML = svg;
    })().catch((cause) => { if (!cancelled) setError(errorText(cause)); });
    return () => { cancelled = true; };
  }, [code]);
  return <>{error && <p className="error" role="alert">Could not render diagram: {error}. Ask chat to correct the Mermaid syntax.</p>}<div className="mermaid-diagram" ref={container} role="img" aria-label="System architecture diagram" /></>;
}
