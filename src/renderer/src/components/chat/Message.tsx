import { useEffect, useState, type ComponentPropsWithoutRef } from 'react';
import Markdown from 'react-markdown';
import { Check, Copy, UserRound } from 'lucide-react';
import type { ChatMessage, ImageAttachment } from '../../../../shared/types';
import { Brand } from '../Brand';
import { unwrap } from '../../services/api';

export function ImagePreview({ image }: { image: ImageAttachment }) {
  const [url, setUrl] = useState(image.previewUrl), [failed, setFailed] = useState(false);
  useEffect(() => {
    if (image.previewUrl) return;
    let alive = true;
    unwrap(window.novi.previewImage(image.id)).then((url) => { if (alive) setUrl(url); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [image.id, image.previewUrl]);
  return url ? <img src={url} alt={image.name} title={image.name} /> : <span className="image-placeholder">{failed ? 'Image unavailable' : 'Loading image…'}</span>;
}
function CodeBlock({ children, className, ...props }: ComponentPropsWithoutRef<'code'>) {
  const [copied, setCopied] = useState(false), [failed, setFailed] = useState(false);
  const code = String(children ?? '');
  const language = /language-(\S+)/.exec(className || '')?.[1];
  const block = Boolean(language) || code.includes('\n');
  if (!block) return <code className={className} {...props}>{children}</code>;
  return <span className="code-block"><span className="code-toolbar"><span>{language || 'code'}</span><button onClick={async () => { try { await unwrap(window.novi.copyText(code.replace(/\n$/, ''))); setCopied(true); setFailed(false); } catch { setFailed(true); } }} aria-label="Copy code">{copied ? <Check size={13} /> : <Copy size={13} />}{failed ? 'Select to copy' : copied ? 'Copied' : 'Copy'}</button></span><code className={className}>{children}</code></span>;
}
export function Message({ message, generating, displayName }: { message: ChatMessage; generating: boolean; displayName: string }) {
  return <article className={`message ${message.role}`}><div className="message-avatar">{message.role === 'assistant' ? <Brand compact /> : <UserRound size={17} />}</div><div className="message-body"><div className="message-heading"><strong>{message.role === 'assistant' ? 'Novi' : displayName}</strong>{message.model && <span className="message-model" title={message.providerName}>{message.model}</span>}<time dateTime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></div>
    {!!message.images?.length && <div className="message-images">{message.images.map((image) => <ImagePreview key={image.id} image={image} />)}</div>}
    {message.role === 'assistant' ? <div className="markdown"><Markdown skipHtml components={{ code: ({ node: _node, ...props }) => <CodeBlock {...props} />, img: () => null, a: ({ children }) => <span className="markdown-link">{children}</span> }}>{message.content}</Markdown></div> : <p className="user-content">{message.content}</p>}
    {generating && !message.content && <div className="activity" role="status" aria-label="Novi is thinking"><span /><span /><span /></div>}
    {message.error && <div className="error message-error" role="alert">{message.error}</div>}
    {message.status === 'stopped' && <small className="muted">Response stopped</small>}
  </div></article>;
}
