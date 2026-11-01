'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './api-keys.module.css';

export default function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setState('copied'); } catch { setState('failed'); }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2200);
  }
  return <button type="button" className={styles.copy} onClick={() => void copy()} aria-live="polite">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Select and copy it' : label}</button>;
}
