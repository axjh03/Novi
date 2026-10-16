import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { recordShortcut, sameShortcut } from '../../../shared/shortcuts';
import { unwrap } from '../services/api';

const mac = /Mac/i.test(navigator.platform);

interface Props {
  label: string;
  value: string;
  defaultValue: string;
  description?: string;
  /** Shortcuts already used by other actions, so one combination cannot be given two jobs. */
  others: Array<{ label: string; value: string }>;
  onChange: (shortcut: string) => void;
}

/** Records a shortcut from the keys pressed instead of from typed text. */
export function ShortcutField({ label, value, defaultValue, description, others, onChange }: Props) {
  const [recording, setRecording] = useState(false), [held, setHeld] = useState(''), [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null), recordingRef = useRef(false), hintId = useId();

  // Novi's global hotkeys would otherwise take the key press before this field sees it.
  const suspend = (suspended: boolean) => { void unwrap(window.novi.suspendShortcuts(suspended)).catch(() => {}); };
  useEffect(() => () => { if (recordingRef.current) suspend(false); }, []);

  function start() {
    if (recordingRef.current) return;
    recordingRef.current = true;
    setRecording(true); setHeld('');
    setMessage(`Press the new combination. Esc keeps ${value}.`);
    suspend(true);
  }
  function stop() {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false); setHeld('');
    suspend(false);
  }
  function choose(shortcut: string) {
    const clash = others.find((other) => sameShortcut(other.value, shortcut));
    if (clash) { setMessage(`${shortcut} is already used for ${clash.label}. Choose another combination.`); return false; }
    onChange(shortcut);
    setMessage(`Recorded ${shortcut}. Save changes to apply it.`);
    return true;
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!recordingRef.current) return;
    // Tab still moves between fields.
    if (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) { stop(); return; }
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) {
      setMessage(`Kept ${value}.`);
      input.current?.blur();
      return;
    }
    const result = recordShortcut(event, mac);
    if ('partial' in result) { setHeld(result.partial); return; }
    if ('error' in result) { setMessage(result.error); return; }
    if (choose(result.shortcut)) input.current?.blur();
  }
  function onKeyUp(event: KeyboardEvent<HTMLInputElement>) {
    if (!recordingRef.current) return;
    const result = recordShortcut(event, mac);
    if ('partial' in result) setHeld(result.partial);
  }

  return <label>
    {label}
    <div className="shortcut-setting">
      <input
        ref={input}
        className={`shortcut-input ${recording ? 'recording' : ''}`}
        value={recording ? held ? `${held}+…` : '' : value}
        placeholder="Press keys…"
        readOnly
        aria-describedby={hintId}
        onFocus={start}
        onBlur={stop}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
      />
      <button className="text-button" type="button" onClick={() => input.current?.focus()}>Record</button>
      {!sameShortcut(value, defaultValue) && <button className="text-button" type="button" onClick={() => choose(defaultValue)}>Use default</button>}
    </div>
    {(message || description) && <small id={hintId} role="status">{message || `${description} Default: ${defaultValue}.`}</small>}
  </label>;
}
