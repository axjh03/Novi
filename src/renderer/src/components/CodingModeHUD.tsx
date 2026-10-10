import { useEffect, useState } from 'react';
import { Check, Code2, Copy, X } from 'lucide-react';
import type { ChatMessage, CodeViewerBlock } from '../../../shared/types';
import { unwrap } from '../services/api';
import { MermaidDiagram } from './MermaidDiagram';
import { useStealth } from '../hooks/useStealth';

type CodeToken = { kind: 'plain' | 'comment' | 'string' | 'keyword' | 'number' | 'type' | 'function' | 'property' | 'operator'; text: string };

const EXTENSIONS: Record<string, string> = {
  c: 'c', cc: 'cpp', cpp: 'cpp', cs: 'csharp', css: 'css', go: 'go', html: 'html', java: 'java', js: 'javascript', jsx: 'jsx',
  json: 'json', kt: 'kotlin', php: 'php', py: 'python', rb: 'ruby', rs: 'rust', sh: 'shell', sql: 'sql', swift: 'swift', ts: 'typescript',
  tsx: 'tsx', vue: 'vue', xml: 'xml', yaml: 'yaml', yml: 'yaml',
};
const KEYWORDS = String.raw`\b(?:abstract|as|async|await|break|case|catch|class|const|continue|def|default|delete|do|else|enum|export|extends|false|final|finally|for|from|function|if|implements|import|in|instanceof|interface|let|new|null|package|private|protected|public|raise|return|static|struct|super|switch|this|throw|throws|true|try|type|typeof|undefined|var|void|while|with|yield)\b`;

function languageFor(fence: string, file: string | undefined, code: string) {
  const requested = fence.trim().split(/\s+/)[0].toLowerCase();
  if (requested) return EXTENSIONS[requested] || requested;
  const extension = file?.split('.').at(-1)?.toLowerCase() || '';
  if (extension) return EXTENSIONS[extension] || extension;
  if (/^\s*[<{[]/.test(code) && /[}\]>]\s*$/.test(code)) try { JSON.parse(code); return 'json'; } catch { /* keep detecting */ }
  if (/^\s*(?:import |export |const |let |function |interface |type )/m.test(code)) return /:\s*(?:string|number|boolean|[A-Z]\w*)\b/.test(code) ? 'typescript' : 'javascript';
  if (/^\s*(?:from \S+ import |import \S+|def |class ).*:/m.test(code) || /\bprint\s*\(/.test(code)) return 'python';
  if (/^\s*(?:SELECT|INSERT|UPDATE|DELETE|CREATE)\b/im.test(code)) return 'sql';
  if (/^\s*<(?:!doctype|html|[A-Za-z][\w-]*[\s>])/i.test(code)) return 'html';
  return 'code';
}

export function tokenizeCode(code: string, language = 'code'): CodeToken[] {
  const hashComments = ['python', 'py', 'ruby', 'rb', 'shell', 'sh', 'bash', 'yaml', 'yml'].includes(language.toLowerCase());
  const comment = hashComments ? String.raw`#[^\n]*|\/\*[\s\S]*?\*\/` : String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->`;
  const patterns = [
    ['comment', comment],
    ['string', String.raw`"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\x60(?:\\.|[^\x60\\])*\x60`],
    ['keyword', KEYWORDS],
    ['number', String.raw`\b(?:0x[\da-f]+|\d+(?:\.\d+)?)\b`],
    ['function', String.raw`\b[A-Za-z_$][\w$]*(?=\s*\()`],
    ['type', String.raw`\b[A-Z][A-Za-z\d_$]*\b`],
    ['property', String.raw`(?<=\.)[A-Za-z_$][\w$]*\b`],
    ['operator', String.raw`=>|===?|!==?|\+\+|--|&&|\|\||\?\?|[{}()[\].,;:+\-*/%=<>!?&|^~]`],
  ] as const;
  const matcher = new RegExp(patterns.map(([kind, source]) => `(?<${kind}>${source})`).join('|'), 'gi');
  const tokens: CodeToken[] = [];
  let offset = 0;
  for (const match of code.matchAll(matcher)) {
    if (match.index! > offset) tokens.push({ kind: 'plain', text: code.slice(offset, match.index) });
    const kind = patterns.find(([name]) => match.groups?.[name])?.[0] || 'plain';
    tokens.push({ kind, text: match[0] });
    offset = match.index! + match[0].length;
  }
  if (offset < code.length) tokens.push({ kind: 'plain', text: code.slice(offset) });
  return tokens;
}

export function codeFromMessages(messages: ChatMessage[]) {
  let solution = 0;
  return messages.flatMap((message) => {
    if (message.role !== 'assistant') return [];
    return Array.from(message.content.matchAll(/```([^\n`]*)\r?\n([\s\S]*?)```/g), (match, index) => {
      const precedingLine = message.content.slice(0, match.index).trimEnd().split('\n').at(-1) || '';
      const file = precedingLine.match(/(?:^|[`\s])([\w./\\-]+\.[a-z\d]+)[`\s:]*$/i)?.[1];
      const fence = match[1].trim();
      const code = match[2].trimEnd();
      const time = new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      return { id: `${message.id}-${index}`, label: `Soln ${++solution} (${time})${file ? ` — ${file}` : ''}`, code, language: languageFor(fence, file, code) };
    });
  });
}

export function DetachedCodeViewer() {
  const [blocks, setBlocks] = useState<CodeViewerBlock[]>([]);
  useStealth();
  useEffect(() => {
    const syncStealthVars = () => {
      document.documentElement.style.setProperty('--transparent-opacity', `${localStorage.getItem('novi_transparent_opacity') || 35}%`);
      document.documentElement.style.setProperty('--transparent-bg', localStorage.getItem('novi_transparent_bg') || '#0f172a');
    };
    syncStealthVars();
    const unsubStealth = window.novi.onStealthState(() => syncStealthVars());
    const unsubscribe = window.novi.onCodeViewerBlocks(setBlocks);
    void unwrap(window.novi.getCodeViewerBlocks()).then(setBlocks).catch(console.error);
    return () => {
      unsubStealth();
      unsubscribe();
    };
  }, []);
  return <CodingModeHUD blocks={blocks} />;
}

function CodingModeHUD({ blocks }: { blocks: CodeViewerBlock[] }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const diagrams = blocks.some((block) => block.language === 'mermaid') || localStorage.getItem('novi_app_mode') === 'system-design';
  const [copied, setCopied] = useState<string | null>(null);
  const [language, setLanguage] = useState(() => localStorage.getItem('novi_code_language') || 'auto');

  async function copy(id: string, code: string) {
    try {
      await unwrap(window.novi.copyText(code));
      setCopied(id);
    } catch {
      setCopied(null);
    }
  }

  return <section className={`code-viewer ${diagrams ? 'diagram-viewer' : ''}`} aria-label={diagrams ? 'Diagram viewer' : 'Code viewer'}>
    <header className="code-viewer-header"><Code2 size={15} /><strong>{diagrams ? 'Diagrams' : 'Code viewer'}</strong>{!diagrams && <select className="code-viewer-language" aria-label="Code language" value={language} onChange={(event) => { setLanguage(event.target.value); localStorage.setItem('novi_code_language', event.target.value); }}>
      <option value="auto">Auto (Smart)</option>{['javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'html', 'css', 'json', 'sql', 'shell', 'yaml'].map((item) => <option key={item} value={item}>{item}</option>)}
    </select>}<span>{blocks.length ? `${blocks.length} ${diagrams ? 'diagrams' : 'blocks'}` : ''}</span><button className="code-viewer-close" type="button" aria-label={diagrams ? 'Close diagram window' : 'Close code viewer'} onClick={() => void unwrap(window.novi.closeWindow())}><X size={15} /></button></header>
    <div className="code-viewer-scroll" tabIndex={0} role="region" aria-label={diagrams ? 'Scrollable diagrams' : 'Scrollable code'}>
      {diagrams && <p>Diagrams are saved in chat. Close a diagram below to hide it here; reopen it from this list.</p>}
      {diagrams && hidden.length > 0 && <button type="button" className="secondary" onClick={() => setHidden([])}>Reopen closed diagrams</button>}
      {diagrams && !blocks.length && <p>Use “Draw / update diagram” in chat after adding your question, audio transcript, or images.</p>}
      {blocks.filter((block) => !hidden.includes(block.id)).map((block) => <article className="code-viewer-file" key={block.id}>
        <div className="code-viewer-file-header"><span title={block.label}>{block.label}</span>
          <button type="button" className="code-viewer-copy" onClick={() => void copy(block.id, block.code)} aria-label={`Copy ${block.label}`}>
            {copied === block.id ? <Check size={13} /> : <Copy size={13} />}{copied === block.id ? 'Copied' : 'Copy'}
          </button>
          {block.language === 'mermaid' && <button type="button" className="icon-button" aria-label={`Close ${block.label}`} onClick={() => setHidden((ids) => [...ids, block.id])}><X size={13} /></button>}
        </div>
        {block.language === 'mermaid' ? <MermaidDiagram code={block.code} /> : <pre><code className="syntax-code">{tokenizeCode(block.code, language === 'auto' ? block.language : language).map((token, index) => token.kind === 'plain' ? token.text : <span className={`syntax-${token.kind}`} key={index}>{token.text}</span>)}</code></pre>}
      </article>)}
    </div>
  </section>;
}
