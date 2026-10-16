import type { ChatMessage, CodeViewerBlock } from './types';

export const DIAGRAM_SYNTAX = 'Use valid Mermaid flowchart syntax with simple ASCII node IDs. Double-quote all node, edge, and subgraph labels, especially punctuation: cache["Cache (Redis)"], A -->|"Request (async)"| B, subgraph storage["Storage / Database"]. Use separate arrows for multiple destinations, never A --> B / C. Close every shape, quote, and subgraph. Do not include Mermaid configuration directives or HTML.';

// shortcut: Repair common flowchart typos only; unfamiliar syntax goes through model repair and validation.
export function repairFlowchart(code: string): string {
  if (!/^\s*(?:flowchart|graph)\s+(?:TB|TD|BT|RL|LR)\b/.test(code)) return code;
  const nodes = new Set<string>();
  const quote = (label: string) => `"${label.replace(/"/g, '#quot;')}"`;
  const labels = code.replace(/"[^"\r\n]*"|%%[^\r\n]*|\b([A-Za-z_][\w-]*)\[([^\[\]\r\n]*)\]|--[\t ]+([^"\r\n]+?)[\t ]+-->/g, (match, id: string | undefined, label: string, edge: string | undefined) => {
    if (id) {
      nodes.add(id);
      // Preserve quoted labels and the delimiters for cylinders, subroutines, and slanted shapes.
      if (!label || /^["([/\\]/.test(label) || /[/\\]$/.test(label)) return match;
      return `${id}[${quote(label)}]`;
    }
    return edge ? `-- ${quote(edge)} -->` : match;
  });
  return labels.split('\n').map(line => line.trimStart().startsWith('%%') ? line : line.replace(/(-->)\s+([A-Za-z_][\w-]*(?:[\t ]+\/[\t ]+[A-Za-z_][\w-]*)+)([\t ]*;?[\t ]*)$/, (match, arrow: string, targets: string, ending: string) => {
    const ids = targets.split(/\s+\/\s+/);
    return ids.every(id => nodes.has(id)) ? `${arrow} ${ids.join(' & ')}${ending}` : match;
  })).join('\n');
}

export function diagramBlocks(messages: ChatMessage[], streamingMessageId?: string): CodeViewerBlock[] {
  const blocks: CodeViewerBlock[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    if (message.role !== 'assistant' || (message.status !== 'complete' && !(message.id === streamingMessageId && message.status === undefined))) continue;
    for (const match of message.content.matchAll(/^```mermaid[\t ]*\r?\n([\s\S]*?)^[\t ]*```[\t ]*\r?$/gim)) {
      const code = match[1].trim();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      const title = message.content.slice(0, match.index).trim().split('\n').at(-1)?.replace(/^#+\s*/, '');
      blocks.push({ id: `${message.id}-${blocks.length}`, label: title || `Diagram ${blocks.length + 1}`, code, language: 'mermaid' });
    }
  }
  return blocks;
}
