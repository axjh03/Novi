import { Check } from 'lucide-react';
import type { InterfaceStyle } from '../../../shared/appearance';

export function InterfaceStylePicker({ value, onChange }: { value: InterfaceStyle; onChange: (style: InterfaceStyle) => void }) {
  return <div className="interface-style-picker" role="group" aria-label="Interface style">
    {(['classic', 'modern'] as const).map(style => <button type="button" key={style} className={`interface-style-option ${style}`} aria-pressed={value === style} onClick={() => onChange(style)}>
      <span className="interface-style-preview" aria-hidden="true"><span className="preview-bar"><i /><i /><i /><i /></span><span className="preview-window"><span /><span /><span /></span></span>
      <span className="interface-style-name"><strong>{style === 'classic' ? 'Classic' : 'Modern'}</strong>{value === style ? <Check size={16} /> : style === 'classic' && <small>Default</small>}</span>
      <span>{style === 'classic' ? 'The familiar desktop layout, with controls in your chat window.' : 'A floating capsule. Everything opens from the top; answers stay below.'}</span>
    </button>)}
  </div>;
}
