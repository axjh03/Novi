import { useEffect, useRef, useState } from 'react';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { repairFlowchart } from '../../../shared/diagrams';
import { errorText, unwrap } from '../services/api';

export function MermaidDiagram({ code }: { code: string }) {
  const container = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [retry, setRetry] = useState(0);
  const [hasDiagram, setHasDiagram] = useState(false);
  const [zoom, setZoom] = useState(1);
  zoomRef.current = zoom;

  function applyZoom() {
    const target = container.current;
    const svg = target?.querySelector('svg');
    if (!target || !svg) return;
    const width = svg.viewBox.baseVal.width || Number.parseFloat(svg.getAttribute('width') || '') || 800;
    const height = svg.viewBox.baseVal.height || Number.parseFloat(svg.getAttribute('height') || '') || 600;
    let stage = target.querySelector<HTMLDivElement>('.mermaid-stage');
    if (!stage) {
      stage = document.createElement('div');
      stage.className = 'mermaid-stage';
      target.replaceChildren(stage);
      stage.append(svg);
    }
    stage.style.width = `${width * zoomRef.current}px`;
    stage.style.height = `${height * zoomRef.current}px`;
    svg.style.width = `${width}px`;
    svg.style.height = `${height}px`;
    svg.style.transform = `scale(${zoomRef.current})`;
  }

  useEffect(() => { applyZoom(); }, [zoom]);
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
          if (!cancelled) {
            target.innerHTML = svg;
            applyZoom();
            setHasDiagram(true);
          }
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

  return <>
    {status && <p role="status">{status}</p>}
    {error && <div role="alert">
      <p>{hasDiagram ? 'The update could not be drawn. Your previous diagram is still shown.' : 'This diagram needs another correction. Your earlier drawings are still saved.'}</p>
      <button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>Retry drawing</button>
      <details><summary>Details</summary><p>{error}</p><pre>{code}</pre></details>
    </div>}
    <div className="mermaid-diagram">
      <div className="mermaid-controls" aria-label="Diagram zoom controls">
        <button type="button" aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom(value => Math.max(0.5, value - 0.25))}><ZoomOut size={14} /></button>
        <span aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="Zoom in" disabled={zoom >= 2.5} onClick={() => setZoom(value => Math.min(2.5, value + 0.25))}><ZoomIn size={14} /></button>
        <button type="button" aria-label="Reset zoom" disabled={zoom === 1} onClick={() => setZoom(1)}><RotateCcw size={13} /></button>
      </div>
      <div className="mermaid-viewport" ref={container} role="region" aria-label="Interactive system architecture diagram" aria-busy={!!status} tabIndex={0} onWheel={event => {
        if (event.ctrlKey) {
          event.preventDefault();
          setZoom(value => Math.min(2.5, Math.max(0.5, value + (event.deltaY < 0 ? 0.1 : -0.1))));
        }
      }} />
    </div>
  </>;
}
