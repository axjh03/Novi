import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import { ArrowUp, ImagePlus, Plus, Square, X } from 'lucide-react';
import type { ImageAttachment } from '../../../../shared/types';
import { errorText, unwrap } from '../../services/api';
import { ImagePreview } from './Message';

interface Props { busy: boolean; model: string; onSend: (content: string, images: ImageAttachment[]) => Promise<boolean> }
export function Composer({ busy, model, onSend }: Props) {
  const [text, setText] = useState(''), [images, setImages] = useState<ImageAttachment[]>([]);
  const [error, setError] = useState(''), [menu, setMenu] = useState(false), [dragging, setDragging] = useState(false), [attaching, setAttaching] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null), depth = useRef(0);
  async function attach(files?: File[]) {
    if (busy || attaching) return;
    setError(''); setMenu(false); setAttaching(true);
    try {
      if (files?.some((file) => !/\.(png|jpe?g|webp)$/i.test(file.name))) throw new Error('Only PNG, JPG, JPEG, and WEBP images are supported.');
      if (files && images.length + files.length > 6) throw new Error('Attach up to 6 images per message.');
      const added = await unwrap(files ? window.novi.dropImages(files) : window.novi.pickImages());
      if (images.length + added.length > 6) throw new Error('Attach up to 6 images per message.');
      setImages((current) => [...current, ...added]); textarea.current?.focus();
    } catch (error) { setError(errorText(error)); }
    finally { setAttaching(false); }
  }
  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (busy || attaching || (!text.trim() && !images.length)) return;
    const sentText = text, sentImages = images;
    setError(''); setText(''); setImages([]);
    if (textarea.current) textarea.current.style.height = '';
    const success = await onSend(sentText.trim(), sentImages);
    if (!success) { setText(sentText); setImages(sentImages); }
    textarea.current?.focus();
  }
  function drag(event: DragEvent) { event.preventDefault(); event.stopPropagation(); }
  return <div className="composer-wrap"><form className={`composer ${dragging ? 'dragging' : ''}`} onSubmit={submit}
    onDragEnter={(e) => { drag(e); if (e.dataTransfer.types.includes('Files')) { depth.current++; setDragging(true); } }}
    onDragOver={drag} onDragLeave={(e) => { drag(e); if (--depth.current <= 0) { depth.current = 0; setDragging(false); } }}
    onDrop={(e) => { drag(e); depth.current = 0; setDragging(false); void attach(Array.from(e.dataTransfer.files)); }}>
    {dragging && <div className="drop-overlay"><ImagePlus size={24} />Drop images here</div>}
    {!!images.length && <div className="attachment-tray">{images.map((image) => <div className="attachment" key={image.id}><ImagePreview image={image} /><button type="button" aria-label={`Remove ${image.name}`} onClick={() => setImages(images.filter((item) => item.id !== image.id))}><X size={12} /></button></div>)}</div>}
    <textarea ref={textarea} aria-label="Message Novi" placeholder="A question, an idea, a starting point…" rows={2} value={text} maxLength={100000} disabled={busy}
      onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`; }}
      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); } }} />
    <div className="composer-controls"><div className="attach-control"><button className="icon-button attach-button" aria-label="Add attachment" aria-expanded={menu} type="button" disabled={busy || attaching} onClick={() => setMenu(!menu)}><Plus size={20} /></button>{menu && <div className="attach-menu"><button type="button" onClick={() => void attach()}><ImagePlus size={17} />Attach image<span>PNG, JPG, WEBP</span></button></div>}<span className="composer-model">{attaching ? 'Opening images…' : model}</span></div>{busy ? <button type="button" className="send-button stop" aria-label="Stop generation" onClick={() => { unwrap(window.novi.stop()).catch((error) => setError(errorText(error))); }}><Square size={15} fill="currentColor" /></button> : <button type="submit" className="send-button" aria-label="Send message" disabled={attaching || (!text.trim() && !images.length)}><ArrowUp size={20} /></button>}</div>
  </form>{error && <div className="error composer-error" role="alert">{error}</div>}<div className="composer-footnote"><span>Your ideas stay here. Messages go only to your provider.</span><span>↵ Send <span className="shortcut-divider">/</span> Shift ↵ New line</span></div></div>;
}
