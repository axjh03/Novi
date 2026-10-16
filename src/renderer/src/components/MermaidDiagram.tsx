import { useEffect, useRef, useState } from 'react';
import { repairFlowchart } from '../../../shared/diagrams';
import { errorText, unwrap } from '../services/api';

export function MermaidDiagram({ code }: { code: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [retry, setRetry] = useState(0);
  const [hasDiagram, setHasDiagram] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setError('');
    setStatus('Drawing diagram…');
    const target = container.current!;
    void (async () => {
      if (code.length > 50_000) throw new Error('This diagram is too large. Ask for a smaller diagram.');
      const { default: mermaid } = await import('mermaid');
      if (cancelled) return;
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true,
        maxTextSize: 50000, maxEdges: 300, theme: 'dark', themeVariables: { background: 'transparent' },
        flowchart: { htmlLabels: false } });
      let source = code;
      for (let attempt = 0; attempt <= 2; attempt++) {
        try {
          try { await mermaid.parse(source); }
          catch { source = repairFlowchart(source); await mermaid.parse(source); }
          if (cancelled) return;
          const { svg } = await mermaid.render(`diagram-${crypto.randomUUID()}`, source);
          if (!cancelled) { target.innerHTML = svg; setHasDiagram(true); }
          return;
        } catch (cause) {
          if (cancelled) return;
          if (attempt === 2) throw cause;
          setStatus('Correcting diagram syntax…');
          const corrected = await unwrap(window.novi.repairDiagram({ code: source, error: errorText(cause).slice(0, 4_000) }));
          if (cancelled) return;
          if (corrected === source) throw cause;
          source = corrected;
        }
      }
    })().catch((cause) => { if (!cancelled) setError(errorText(cause)); })
      .finally(() => { if (!cancelled) setStatus(''); });
    return () => { cancelled = true; };
  }, [code, retry]);
  return <>{status && <p role="status">{status}</p>}{error && <div role="alert">
    <p>{hasDiagram ? 'The update could not be drawn. Your previous diagram is still shown.' : 'This diagram needs another correction. Your earlier drawings are still saved.'}</p>
    <button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>Retry drawing</button>
    <details><summary>Details</summary><p>{error}</p><pre>{code}</pre></details>
  </div>}<div className="mermaid-diagram" ref={container} role="img" aria-label="System architecture diagram" aria-busy={!!status} /></>;
}
