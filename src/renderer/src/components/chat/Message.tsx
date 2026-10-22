import { memo, useEffect, useState, type ComponentPropsWithoutRef } from 'react';
import Markdown, { type Components } from 'react-markdown';
import { Check, Copy, FilePlus2, FileMinus2, FilePen, Loader2, Mic, UserRound } from 'lucide-react';
import type { ChatMessage, ImageAttachment } from '../../../../shared/types';
import { ENGINES, type LocalCodingMessage } from '../../../../shared/localCoding';
import { Brand } from '../Brand';
import { unwrap } from '../../services/api';
import { tokenizeCode } from '../CodingModeHUD';

export function ImagePreview({ image }: { image: ImageAttachment }) {
  const [url, setUrl] = useState(image.previewUrl), [failed, setFailed] = useState(false);
  useEffect(() => {
    if (image.previewUrl || image.mimeType.startsWith('audio/')) return;
    let alive = true;
    unwrap(window.novi.previewImage(image.id)).then((url) => { if (alive) setUrl(url); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [image.id, image.previewUrl, image.mimeType]);

  if (image.mimeType.startsWith('audio/')) {
    return (
      <div className="audio-attachment-pill" title={image.name}>
        <Mic size={14} className="audio-pill-icon" />
        <span className="audio-pill-name">{image.name || 'Audio recording'}</span>
      </div>
    );
  }

  return url ? <img src={url} alt={image.name} title={image.name} /> : <span className="image-placeholder">{failed ? 'Image unavailable' : 'Loading image…'}</span>;
}
function CodeBlock({ children, className, ...props }: ComponentPropsWithoutRef<'code'>) {
  const [copied, setCopied] = useState(false), [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  const code = String(children ?? '');
  const language = /language-(\S+)/.exec(className || '')?.[1];
  const block = Boolean(language) || code.includes('\n');
  if (!block) return <code className={className} {...props}>{children}</code>;
  return <span className="code-block"><span className="code-toolbar"><span>{language || 'code'}</span><button onClick={async () => { try { await unwrap(window.novi.copyText(code.replace(/\n$/, ''))); setCopied(true); setFailed(false); } catch { setFailed(true); } }} aria-label="Copy code">{copied ? <Check size={13} /> : <Copy size={13} />}{failed ? 'Select to copy' : copied ? 'Copied' : 'Copy'}</button></span><code className="syntax-code">{tokenizeCode(code, language).map((token, index) => token.kind === 'plain' ? token.text : <span className={`syntax-${token.kind}`} key={index}>{token.text}</span>)}</code></span>;
}
// Module scope: a new map per render gives each renderer a new component type, remounting every code block.
const markdownComponents: Components = { code: ({ node: _node, ...props }) => <CodeBlock {...props} />, img: () => null, a: ({ children }) => <span className="markdown-link">{children}</span> };
const STATE_LABELS: Record<LocalCodingMessage['state'], string> = {
  preparing: 'Preparing', reading: 'Reading', analyzing: 'Analyzing', validating: 'Validating',
  complete: 'Complete', 'needs-information': 'Needs information', cancelled: 'Stopped', failed: 'Failed',
};
const OPERATION = {
  edit: { label: 'EDIT', Icon: FilePen, verb: 'Proposed edit' },
  create: { label: 'NEW', Icon: FilePlus2, verb: 'Proposed new file' },
  delete: { label: 'DELETE', Icon: FileMinus2, verb: 'Proposed deletion' },
} as const;

/** Task progress and the clickable proposed-file cards of a Local Coding answer. */
function LocalCodingResult({ result, onOpenFile }: { result: LocalCodingMessage; onOpenFile?: (result: LocalCodingMessage, fileId: string) => void }) {
  const engine = ENGINES.find((item) => item.id === result.engine)?.label ?? result.engine;
  const running = ['preparing', 'reading', 'analyzing', 'validating'].includes(result.state);
  return <div className="lc-result">
    {running && <p className="lc-progress" role="status"><Loader2 size={14} className="spin" aria-hidden="true" /><strong>{STATE_LABELS[result.state]}</strong>{result.progress && result.progress !== STATE_LABELS[result.state] ? ` · ${result.progress}` : ''}<span> · {engine} on {result.baseLabel}</span></p>}
    {!!result.changes.length && <ul className="lc-cards" aria-label={`Proposed files in ${result.resultingLabel}`}>
      {result.changes.map((change) => { const { label, Icon, verb } = OPERATION[change.operation]; return <li key={change.fileId}>
        <button type="button" className={`lc-card ${change.operation}`} onClick={() => onOpenFile?.(result, change.fileId)} aria-label={`${verb}: ${change.rootName}/${change.relativePath}, ${change.additions} added, ${change.deletions} removed. Open the diff.`}>
          <span className="lc-op"><Icon size={13} aria-hidden="true" />{label}</span>
          <span className="lc-path" title={`${change.rootName}/${change.relativePath}`}>{change.relativePath}</span>
          <span className="lc-counts">{change.additions > 0 && <span className="lc-add">+{change.additions}</span>}{change.deletions > 0 && <span className="lc-del">−{change.deletions}</span>}</span>
          {change.reason && <span className="lc-reason">{change.reason}</span>}
        </button>
      </li>; })}
    </ul>}
    {!running && result.state !== 'failed' && result.state !== 'cancelled' && <p className="lc-provenance">{result.resultingLabel ? `${result.resultingLabel} · ` : ''}Based on {result.baseLabel} · produced by {engine} · {result.model}{result.reasoningEffort ? ` · reasoning ${result.reasoningEffort}` : ''} · Execution: not run</p>}
  </div>;
}

// Streaming replaces only the active message object, so memo skips re-parsing finished messages.
export const Message = memo(function Message({ message, generating, displayName, onOpenFile }: { message: ChatMessage; generating: boolean; displayName: string; onOpenFile?: (result: LocalCodingMessage, fileId: string) => void }) {
  return <article className={`message ${message.role}`}><div className="message-avatar">{message.role === 'assistant' ? <Brand compact /> : <UserRound size={17} />}</div><div className="message-body"><div className="message-heading"><strong>{message.role === 'assistant' ? 'Novi' : displayName}</strong>{message.model && <span className="message-model" title={message.providerName}>{message.model}</span>}<time dateTime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></div>
    {!!message.images?.length && <div className="message-images">{message.images.map((image) => <ImagePreview key={image.id} image={image} />)}</div>}
    {message.localCodingRequest && <span className="lc-request-base">Asked about {message.localCodingRequest.baseLabel}</span>}
    {message.role === 'assistant' ? <div className="markdown"><Markdown skipHtml components={markdownComponents}>{message.content}</Markdown></div> : <p className="user-content">{message.content}</p>}
    {message.localCoding && <LocalCodingResult result={message.localCoding} onOpenFile={onOpenFile} />}
    {generating && !message.content && !message.localCoding && <div className="activity" role="status" aria-label="Novi is thinking"><span /><span /><span /></div>}
    {message.error && <div className="error message-error" role="alert">{message.error}</div>}
    {message.status === 'stopped' && <small className="muted">Response stopped</small>}
    {message.latency && !generating && <details className="response-latency"><summary>Response timing</summary>
      <dl>{([
        ['UI → main', message.latency.uiToMainMs], ['Access check', message.latency.accessMs],
        ['Provider → first text', message.latency.providerFirstTextMs], ['Provider → first word/number', message.latency.providerFirstUsefulTextMs],
        ['First → last text', message.latency.firstToLastTextMs], ['Provider total', message.latency.providerTotalMs],
      ] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value === undefined ? 'Not reported' : `${Math.round(value)} ms`}</dd></div>)}</dl>
      <small>First word/number is a timing proxy, not a measure of answer quality. Non-streaming responses arrive all at once.</small>
      <p>{message.latency.requestMessages} messages · {message.latency.requestCharacters} text characters (excludes attachments)</p>
      <dl>{(['input', 'cachedInput', 'cacheWrite', 'reasoning', 'output'] as const).map(key => <div key={key}><dt>{({ input: 'Input tokens', cachedInput: 'Cached input tokens', cacheWrite: 'Cache write tokens', reasoning: 'Reasoning tokens', output: 'Output tokens' })[key]}</dt><dd>{message.latency?.usage?.[key] ?? 'Not reported'}</dd></div>)}</dl>
    </details>}
  </div></article>;
});
