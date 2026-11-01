'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { marks, PROVIDER_NAMES, type ProviderId } from './ProviderMarks';
import styles from './KeyRelay.module.css';

/* The hero of the setup guide: four providers orbit one Novi window and take turns writing a code
   change into it, line by line, the way a diff reads. Pure CSS moves the ring and the packets; a small
   loop in here types the lines. With reduced motion, or without script, the finished diff just sits there. */

type Line = { kind: ' ' | '+' | '-'; text: string };
const SNIPPETS: { file: string; lines: Line[] }[] = [
  { file: 'src/reverseList.ts', lines: [
    { kind: ' ', text: 'function reverse(head: Node | null) {' },
    { kind: '-', text: '  let prev = head;' },
    { kind: '+', text: '  let prev: Node | null = null;' },
    { kind: ' ', text: '  let node = head;' },
    { kind: ' ', text: '  while (node) {' },
    { kind: '+', text: '    const next = node.next;' },
    { kind: ' ', text: '    node.next = prev;' },
    { kind: '-', text: '    prev = node; node = node.next;' },
    { kind: '+', text: '    prev = node; node = next;' },
    { kind: ' ', text: '  }' },
    { kind: ' ', text: '  return prev;' },
    { kind: ' ', text: '}' },
  ] },
  { file: 'src/twoSum.ts', lines: [
    { kind: ' ', text: 'function twoSum(nums: number[], target: number) {' },
    { kind: '-', text: '  for (let i = 0; i < nums.length; i++)' },
    { kind: '-', text: '    for (let j = i + 1; j < nums.length; j++)' },
    { kind: '-', text: '      if (nums[i] + nums[j] === target) return [i, j];' },
    { kind: '+', text: '  const seen = new Map<number, number>();' },
    { kind: '+', text: '  for (let i = 0; i < nums.length; i++) {' },
    { kind: '+', text: '    const need = target - nums[i];' },
    { kind: '+', text: '    if (seen.has(need)) return [seen.get(need)!, i];' },
    { kind: '+', text: '    seen.set(nums[i], i);' },
    { kind: '+', text: '  }' },
    { kind: ' ', text: '}' },
  ] },
];
const ORDER: ProviderId[] = ['anthropic', 'openai', 'gemini', 'kimi'];

type State = { snippet: number; shown: number; partial: string; speaker: number | null; turn: number };

export default function KeyRelay() {
  const [s, setS] = useState<State>({ snippet: 0, shown: SNIPPETS[0].lines.length, partial: '', speaker: null, turn: 0 });

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let alive = true;
    const timers: number[] = [];
    const wait = (ms: number) => new Promise<void>(resolve => { timers.push(window.setTimeout(resolve, ms)); });
    (async () => {
      await wait(1600);
      let snippet = 0, turn = 0;
      while (alive) {
        const lines = SNIPPETS[snippet].lines;
        const per = Math.ceil(lines.length / ORDER.length);
        setS({ snippet, shown: 0, partial: '', speaker: null, turn });
        await wait(700);
        for (let p = 0; p < ORDER.length && alive; p++) {
          const from = p * per, to = Math.min(lines.length, from + per);
          turn += 1;
          setS(prev => ({ ...prev, speaker: p, turn }));
          await wait(850);
          for (let l = from; l < to && alive; l++) {
            const text = lines[l].text;
            for (let c = 2; c < text.length; c += 3) { setS(prev => ({ ...prev, shown: l, partial: text.slice(0, c) })); await wait(18); }
            setS(prev => ({ ...prev, shown: l + 1, partial: '' }));
            await wait(120);
          }
          setS(prev => ({ ...prev, speaker: null }));
          await wait(450);
        }
        await wait(2800);
        snippet = (snippet + 1) % SNIPPETS.length;
      }
    })();
    return () => { alive = false; for (const t of timers) clearTimeout(t); };
  }, []);

  const { file, lines } = SNIPPETS[s.snippet];
  const added = lines.filter(l => l.kind === '+').length, removed = lines.filter(l => l.kind === '-').length;
  const speaker = s.speaker === null ? null : ORDER[s.speaker];
  return (
    <div className={styles.relay} role="img" aria-label="Anthropic, OpenAI, Google Gemini and Kimi orbit one Novi window and take turns writing a code change into it.">
      <div className={styles.scene}>
        <div className={styles.orbit}>
          <div className={styles.ring}>
            {ORDER.map((id, index) => (
              <div className={styles.orbiter} key={id} style={{ '--n': index } as CSSProperties}>
                {s.speaker === index && <i className={styles.packet} key={s.turn} />}
                <div className={styles.unspin}>
                  <div className={styles.face}>
                    <div className={styles.mark} data-active={s.speaker === index || undefined}>{marks[id]}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.window} data-ui>
          <div className={styles.bar}><span className={styles.file}>{file}</span><span className={styles.stat}><b>+{added}</b> <i>−{removed}</i></span></div>
          <pre className={styles.diff}><code>
            {lines.map((line, index) => {
              const state = index < s.shown ? 'done' : index === s.shown && s.partial ? 'typing' : 'pending';
              return <span key={index} data-kind={line.kind} data-state={state}><i>{line.kind === ' ' ? '' : line.kind}</i>{state === 'typing' ? s.partial : line.text}{state === 'typing' && <b className={styles.caret} />}</span>;
            })}
          </code></pre>
          <div className={styles.foot}>{speaker ? <><i /><span><b>{PROVIDER_NAMES[speaker]}</b> is writing</span></> : <span>Four providers. Any one key will do.</span>}</div>
        </div>
      </div>
    </div>
  );
}
