'use client';

import { useId, useState } from 'react';
import styles from './api-keys.module.css';

/* Paste a key, learn which door it came from. The value never leaves the page: no request, no storage. */
function read(value: string): { verdict: string; detail: string } {
  const key = value.trim();
  if (!key) return { verdict: 'Paste a key to see which provider it belongs to.', detail: 'It is checked here in the page and never sent anywhere.' };
  if (/\s/.test(key)) return { verdict: 'There is a space or a line break inside it.', detail: 'Keys are one unbroken string; copy it again from the provider.' };
  if (key.startsWith('sk-ant-')) return { verdict: 'An Anthropic key.', detail: `Add it with the provider set to Anthropic. ${key.length < 60 ? 'It looks short, check that the whole key was copied.' : 'Length looks right.'}` };
  if (key.startsWith('AIza')) return { verdict: 'A Google Gemini key.', detail: key.length === 39 ? 'Thirty-nine characters, as expected.' : `Gemini keys are 39 characters; this one is ${key.length}.` };
  if (key.startsWith('sk-proj-')) return { verdict: 'An OpenAI project key.', detail: 'Add it with the provider set to OpenAI.' };
  if (key.startsWith('sk-')) return { verdict: 'An OpenAI or a Kimi key.', detail: 'Both start with sk-. Pick the provider you made it at; a key only works at its own door.' };
  return { verdict: 'Not a key from these four providers.', detail: 'Anthropic keys start with sk-ant-, OpenAI with sk-, Gemini with AIza, Kimi with sk-.' };
}

export default function KeyChecker() {
  const [value, setValue] = useState('');
  const id = useId();
  const result = read(value);
  return (
    <div className={styles.checker}>
      <label htmlFor={id}>Which key is this?</label>
      <div className={styles.checkerLine}>
        <input id={id} type="text" value={value} onChange={event => setValue(event.target.value.slice(0, 400))} autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="Paste a key, or just its first characters" aria-describedby={`${id}-result`} />
        {value && <button type="button" onClick={() => setValue('')}>Clear</button>}
      </div>
      <p id={`${id}-result`} aria-live="polite"><strong>{result.verdict}</strong> {result.detail}</p>
    </div>
  );
}
