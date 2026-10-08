import type { ChatMessage, CodeViewerBlock } from './types';

export function diagramBlocks(messages: ChatMessage[]): CodeViewerBlock[] {
  const blocks: CodeViewerBlock[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    if (message.role !== 'assistant' || message.status !== 'complete') continue;
    for (const match of message.content.matchAll(/```mermaid\s*\r?\n([\s\S]*?)```/gi)) {
      const code = match[1].trim();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      const title = message.content.slice(0, match.index).trim().split('\n').at(-1)?.replace(/^#+\s*/, '');
      blocks.push({ id: `${message.id}-${blocks.length}`, label: title || `Diagram ${blocks.length + 1}`, code, language: 'mermaid' });
    }
  }
  return blocks;
}
