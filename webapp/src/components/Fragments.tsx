import { PLANS, type PlanId } from '@/lib/site';
import styles from './Fragments.module.css';

/* ----------------------------------------------------------------------------------------------
   Fragments of the product's own interface, at true size, shared by every public page. Each root is
   marked data-ui so its small type and rules are read as the product's, not the page's.
   Sample answers show the shape of what Novi returns in each session mode; a live session uses the
   visitor's own AI key. Keep them short and true to the modes.
   ---------------------------------------------------------------------------------------------- */
export type Mode = 'Code' | 'Behavioral' | 'System design' | 'Recruiter call' | 'Technical screen';
export type FollowUp = { question: string; title: string; points: string[]; meta: string };
export type Diagram = { nodes: { id: string; label: string; x: number; y: number; tone?: 'store' }[]; edges: { from: string; to: string; label?: string }[] };
export type Answer = { mode: Mode; title: string; code?: string[]; points?: string[]; flow?: string[]; diagram?: Diagram; meta: string; followUp?: FollowUp };

export const reverseList: Answer = { mode: 'Code', title: 'Reverse the list in place', code: [
  'function reverse(head) {',
  '  let prev = null, node = head;',
  '  while (node) {',
  '    const next = node.next;',
  '    node.next = prev;',
  '    prev = node;',
  '    node = next;',
  '  }',
  '  return prev;',
  '}',
], meta: 'O(n) time · O(1) space · edge case: empty list returns null', followUp: { question: 'Can you do it recursively?', title: 'Yes, and say why you would not', points: ['Recurse to the tail, then point each node back at its caller on the way up.', 'It costs O(n) stack; on a long list that is a real limit, which is why the loop wins in production.'], meta: 'Same session · offer the loop as the version you would ship' } };
export const twoSum: Answer = { mode: 'Code', title: 'Two numbers that add up to a target', code: [
  'function findPair(numbers, target) {',
  '  const seen = new Map();',
  '  for (const [i, value] of numbers.entries()) {',
  '    const match = target - value;',
  '    if (seen.has(match)) return [seen.get(match), i];',
  '    seen.set(value, i);',
  '  }',
  '  return null;',
  '}',
], meta: 'O(n) time · O(n) space · one pass, say why the map beats sorting', followUp: { question: 'And why does the map beat sorting here?', title: 'Because one pass is enough', points: ['Sorting costs O(n log n) and loses the original indices, which the answer needs.', 'The map trades O(n) memory for a single pass; say that trade out loud.'], meta: 'Same context, same session · ask again if they push on memory' } };
export const failed: Answer = { mode: 'Behavioral', title: 'A time you failed, in STAR', points: [
  'Situation: the migration I owned slipped two weeks past the date I had promised.',
  'Task: I had estimated it alone and skipped the legacy auth module.',
  'Action: I split the rest into daily slices, posted a burn-down, and paired on the auth piece.',
  'Result: it shipped nine days late instead of a month, and estimates now get a second reviewer.',
], meta: 'Framework: STAR · pulled from your resume and project notes · 60 seconds spoken', followUp: { question: 'What would you do differently now?', title: 'Estimate with someone, and surface slips early', points: ['Name the one habit that changed: a second reviewer on every estimate.', 'Then the signal you now watch for: a slice that misses its day gets raised the same day.'], meta: 'Keep it to two sentences · they are checking for self-awareness, not a new story' } };
export const shortener: Answer = { mode: 'System design', title: 'A URL shortener', diagram: {
  nodes: [
    { id: 'client', label: 'Client', x: 0, y: 0 }, { id: 'api', label: 'API', x: 1, y: 0 }, { id: 'cache', label: 'Cache', x: 2, y: 0 }, { id: 'store', label: 'Link store', x: 3, y: 0, tone: 'store' },
    { id: 'keys', label: 'Key service', x: 1, y: 1 }, { id: 'analytics', label: 'Click queue', x: 2, y: 1, tone: 'store' },
  ],
  edges: [
    { from: 'client', to: 'api', label: 'GET /x7Kq2' }, { from: 'api', to: 'cache', label: 'lookup' }, { from: 'cache', to: 'store', label: 'miss' },
    { from: 'api', to: 'keys', label: 'new key' }, { from: 'api', to: 'analytics', label: 'async' },
  ],
}, points: [
  'Write path: hand out pre-generated 7-character keys from a key service, store the mapping once.',
  'Read path: cache the hottest 20% of links; redirects are 301 for permanence, 302 to keep click analytics.',
  'Scale: 100M links is about 50 GB; shard the store by key prefix, replicate reads.',
], meta: 'Trade-offs to raise: custom aliases, expiry, abuse limits · diagram available', followUp: { question: 'What happens when one link goes viral?', title: 'A hot key, served from cache', points: ['The cache absorbs it: the mapping is tiny, so replicate it to every edge and pin it.', 'Analytics write asynchronously to a queue so the redirect path never waits on a database.'], meta: 'Mention rate limits per key and a short TTL on the hottest entries' } };
export const whyJob: Answer = { mode: 'Recruiter call', title: 'Why this role', points: [
  'Lead with the overlap: their stack is the one from your last two projects.',
  'Name one concrete thing you want to work on there, taken from the job description.',
  'Close with timing: available in two weeks, open on the band they listed.',
], meta: 'Keep it under 45 seconds · they decide the next round on this call', followUp: { question: 'What are your salary expectations?', title: 'Anchor on their band, not a number', points: ['Ask what the band is for the level; if they already listed it, say you are aligned with it.', 'If pushed, give a range whose bottom you would actually accept.'], meta: 'Pulled from the job description in your context' } };
export const screenQuestion: Answer = { mode: 'Technical screen', title: 'Walk me through your project', points: [
  'Open with the problem it solved and who had it, in one sentence.',
  'Name the decision you made that was not obvious, and the trade-off you accepted.',
  'Close with the result and the thing you would change now.',
], meta: 'Pulled from the project notes in your context · 90 seconds spoken', followUp: { question: 'What was the hardest bug in it?', title: 'The retry that charged twice', points: ['A declined card threw, the retry wrapper caught it and charged again.', 'Fixed with an idempotency key per order; the test now asserts one charge per decline.'], meta: 'From your project notes · say what you would test first next time' } };
export const chatService: Answer = { mode: 'System design', title: 'A chat service for 10M users', diagram: {
  nodes: [
    { id: 'app', label: 'Mobile app', x: 0, y: 0 }, { id: 'gw', label: 'Gateway', x: 1, y: 0 }, { id: 'chat', label: 'Chat service', x: 2, y: 0 }, { id: 'msgs', label: 'Message store', x: 3, y: 0, tone: 'store' },
    { id: 'presence', label: 'Presence', x: 2, y: 1 }, { id: 'queue', label: 'Fan-out queue', x: 3, y: 1, tone: 'store' }, { id: 'push', label: 'Push service', x: 1, y: 1 },
  ],
  edges: [
    { from: 'app', to: 'gw', label: 'websocket' }, { from: 'gw', to: 'chat' }, { from: 'chat', to: 'msgs', label: 'append' },
    { from: 'chat', to: 'presence', label: 'heartbeat' }, { from: 'chat', to: 'queue', label: 'publish' }, { from: 'queue', to: 'push', label: 'offline' },
  ],
}, points: [
  'Connections: one websocket per device through a gateway; the chat service is stateless behind it.',
  'Storage: append-only message log per conversation, sharded by conversation id; read the last page from cache.',
  'Delivery: publish to a fan-out queue; online devices get it over the socket, offline ones through push.',
], meta: 'Trade-offs to raise: ordering per conversation, read receipts, media uploads · diagram rendered in the app', followUp: { question: 'How do you keep messages in order?', title: 'Order per conversation, not globally', points: ['One shard owns a conversation, so it can assign a monotonic sequence number on append.', 'Clients ack by sequence; a gap means a refetch of that range, never a full resync.'], meta: 'Mention clock skew and why a global order is not needed' } };
export const generic = (question: string): Answer => ({ mode: 'Technical screen', title: question.trim().replace(/\?$/, '') || 'Your question', points: [
  'Restate the problem in one sentence and confirm the input and output.',
  'Pick the structure that fits (map, heap, two pointers, graph walk) and say why.',
  'Walk one small example out loud, then write it, then state the complexity.',
], meta: 'Novi listens for the follow-up and keeps the same context' });

export function answerFor(question: string): Answer {
  const q = question.toLowerCase();
  if (/linked list|reverse/.test(q)) return reverseList;
  if (/two sum|add up|pair|target/.test(q)) return twoSum;
  if (/chat|messag|whatsapp/.test(q)) return chatService;
  if (/design|shortener|scale|architecture|system/.test(q)) return shortener;
  if (/tell me|time (you|when)|fail|conflict|weakness|yourself|disagree/.test(q)) return failed;
  if (/why|salary|notice|this (job|role|company)|expect/.test(q)) return whyJob;
  if (/project|walk me/.test(q)) return screenQuestion;
  return generic(question);
}
export const examples = ['Reverse a linked list in place', 'Tell me about a time you failed', 'Design a URL shortener', 'Why do you want this job?'];

/* The architecture diagram the app renders for a system design answer: boxes on a grid, arrows between
   them, labels on the arrows. Drawn as geometry in the product's own colours. */
const cell = { w: 128, h: 64, bw: 104, bh: 36, pad: 8 };
export function ArchitectureDiagram({ diagram, title }: { diagram: Diagram; title: string }) {
  const cols = Math.max(...diagram.nodes.map(node => node.x)) + 1;
  const rows = Math.max(...diagram.nodes.map(node => node.y)) + 1;
  const width = cols * cell.w + cell.pad * 2, height = rows * cell.h + cell.pad * 2;
  const centre = (id: string) => { const node = diagram.nodes.find(item => item.id === id)!; return { x: cell.pad + node.x * cell.w + cell.w / 2, y: cell.pad + node.y * cell.h + cell.h / 2 }; };
  const port = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const dx = to.x - from.x, dy = to.y - from.y;
    if (Math.abs(dx) >= Math.abs(dy)) return { x: from.x + Math.sign(dx) * cell.bw / 2, y: from.y };
    return { x: from.x, y: from.y + Math.sign(dy) * cell.bh / 2 };
  };
  return (
    <svg className={styles.uiDiagram} viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`Architecture diagram: ${title}`}>
      <defs><marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0.5 L8 4 L0 7.5 Z" fill="#a89da3" /></marker></defs>
      {diagram.edges.map(edge => {
        const a = centre(edge.from), b = centre(edge.to);
        const p1 = port(a, b), p2 = port(b, a);
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const vertical = Math.abs(p2.x - p1.x) < Math.abs(p2.y - p1.y);
        return (
          <g key={`${edge.from}-${edge.to}`}>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#a89da3" strokeWidth="1.5" markerEnd="url(#arrow)" />
            {edge.label && <text x={vertical ? mid.x + 6 : mid.x} y={vertical ? mid.y + 3 : mid.y - 5} textAnchor={vertical ? 'start' : 'middle'} fill="#a89da3" fontSize="10">{edge.label}</text>}
          </g>
        );
      })}
      {diagram.nodes.map(node => {
        const c = centre(node.id);
        return (
          <g key={node.id}>
            <rect x={c.x - cell.bw / 2} y={c.y - cell.bh / 2} width={cell.bw} height={cell.bh} rx="6" fill={node.tone === 'store' ? '#171519' : '#2a1a21'} stroke={node.tone === 'store' ? '#4a3e45' : 'none'} />
            <text x={c.x} y={c.y + 4} textAnchor="middle" fill={node.tone === 'store' ? '#ece6ea' : '#e4a0b2'} fontSize="12" fontWeight="500">{node.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** The answer window: question at the top, Novi's answer under it, a composer for the follow-up. */
export function NoviAnswer({ answer, question, compact = false, time = '12:04', state = 'answer' }: { answer: Answer; question: string; compact?: boolean; time?: string; state?: 'listening' | 'answer' | 'follow-up' }) {
  return (
    <div className={`${styles.ui} ${compact ? styles.uiCompact : ''}`} data-ui>
      <div className={styles.uiBar}><span className={styles.uiMode}>{answer.mode}</span><span>Session · {time}</span><span className={styles.uiLive}><i />Listening</span></div>
      <p className={styles.uiQuestion}><span>Interviewer</span>{question}</p>
      {state === 'listening' ? (
        <div className={styles.uiAnswer}><p className={styles.uiThinking}><span className={styles.uiMark}>n</span>Transcribing the question…<i /><i /><i /></p></div>
      ) : (
        <div className={styles.uiAnswer}>
          <p className={styles.uiTitle}><span className={styles.uiMark}>n</span>{answer.title}</p>
          {answer.diagram && <div className={styles.uiDiagramWrap}><ArchitectureDiagram diagram={answer.diagram} title={answer.title} /></div>}
          {answer.flow && !answer.diagram && <ol className={styles.uiFlow}>{answer.flow.map(step => <li key={step}>{step}</li>)}</ol>}
          {answer.code && <pre className={styles.uiCode}><code>{answer.code.map((line, index) => <span key={index}><i>{index + 1}</i>{line}</span>)}</code></pre>}
          {answer.points && <ul className={styles.uiPoints}>{answer.points.map(point => <li key={point}>{point}</li>)}</ul>}
          <p className={styles.uiMeta}>{answer.meta}</p>
        </div>
      )}
      {state === 'follow-up' && answer.followUp ? (
        <>
          <p className={styles.uiQuestion}><span>Interviewer</span>{answer.followUp.question}</p>
          <div className={styles.uiAnswer}>
            <p className={styles.uiTitle}><span className={styles.uiMark}>n</span>{answer.followUp.title}</p>
            <ul className={styles.uiPoints}>{answer.followUp.points.map(point => <li key={point}>{point}</li>)}</ul>
            <p className={styles.uiMeta}>{answer.followUp.meta}</p>
          </div>
        </>
      ) : null}
      <div className={styles.uiComposer}><span>Ask a follow-up…</span><b>Send</b></div>
    </div>
  );
}

/** The account card that moves through the three steps of getting started. */
export function AccountCard({ step, plan = 'pro', keyLabel = 'OpenAI · ends in 4f2a' }: { step: 0 | 1 | 2; plan?: PlanId; keyLabel?: string }) {
  return (
    <div className={styles.account} data-ui>
      <div className={styles.accountHead}><span className={styles.uiMark}>n</span><span>Your Novi account</span><span className={step === 2 ? styles.accountOn : ''}>{step === 2 ? 'Desktop online' : 'Web only'}</span></div>
      <dl>
        <div><dt>Login</dt><dd>@you · Individual</dd></div>
        <div><dt>Plan</dt><dd>{PLANS[plan].name} · {PLANS[plan].price} {PLANS[plan].unit}</dd></div>
        <div><dt>License</dt><dd>{step === 0 ? 'Pending our confirmation' : plan === 'lifetime' ? 'Active · lifetime' : 'Active · 29 days left'}</dd></div>
        <div className={step < 1 ? styles.accountOff : ''}><dt>AI key</dt><dd>{step < 1 ? 'Not connected' : keyLabel}</dd></div>
        <div className={step < 2 ? styles.accountOff : ''}><dt>Device</dt><dd>{step < 2 ? 'No device yet' : 'MacBook Pro · signed in'}</dd></div>
      </dl>
    </div>
  );
}

/** The screenshot path: a captured question and the answer about exactly that. */
export function ScreenshotFragment() {
  return (
    <div className={`${styles.ui} ${styles.uiShot}`} data-ui>
      <div className={styles.uiBar}><span className={styles.uiMode}>Technical screen</span><span>Screenshot attached</span></div>
      <figure className={styles.uiCapture}><img src="/app/transparent.png" alt="A captured screenshot of a code question" width={1180} height={940} loading="lazy" decoding="async" /><figcaption>Captured 12:06 · the question on screen</figcaption></figure>
      <div className={styles.uiAnswer}>
        <p className={styles.uiTitle}><span className={styles.uiMark}>n</span>What the error means</p>
        <ul className={styles.uiPoints}><li>The copy keeps the original string; the function logs the message, so nothing mutates.</li><li>If they ask about the comment, it is a block comment and is ignored at runtime.</li></ul>
        <p className={styles.uiMeta}>Ask about the exact problem in front of you without retyping it</p>
      </div>
    </div>
  );
}

/** The API management panel from the account: the keys a desktop sign-in picks up. */
export function KeysFragment({ selected = 'anthropic' }: { selected?: 'openai' | 'anthropic' | 'gemini' | 'kimi' }) {
  const keys = [
    { id: 'openai', provider: 'OpenAI', name: 'Main OpenAI key', tail: '4f2a', added: 'Added 12 Oct' },
    { id: 'anthropic', provider: 'Anthropic', name: 'Claude for interviews', tail: 'q9Lm', added: 'Added 14 Oct' },
    { id: 'gemini', provider: 'Google Gemini', name: 'Gemini, long documents', tail: 'x7Pd', added: 'Added 14 Oct' },
    { id: 'kimi', provider: 'Kimi (Moonshot AI)', name: 'Kimi', tail: 'Z2kr', added: 'Added 20 Oct' },
  ] as const;
  return (
    <div className={styles.ui} data-ui>
      <div className={styles.uiBar}><span className={styles.uiMode}>API management</span><span>4 keys · encrypted at rest</span></div>
      <ul className={styles.uiKeys}>
        {keys.map(key => (
          <li key={key.id} className={key.id === selected ? styles.uiKeySelected : ''}>
            <span className={styles.uiKeyProvider}>{key.provider}</span>
            <span className={styles.uiKeyName}>{key.name}<small>{key.added}</small></span>
            <code>••••{key.tail}</code>
            <b>{key.id === selected ? 'In use' : 'Use'}</b>
          </li>
        ))}
      </ul>
      <div className={styles.uiComposer}><span>Add API key</span><b>New key</b></div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------
   The three screens of getting started, as they look: the sign-up form on this site, the add-a-key
   dialog in the account, the desktop app's sign-in. Each is 280px wide so the steps line up.
   --------------------------------------------------------------------------------------------- */
function Field({ label, value, type = 'text', hint }: { label: string; value: string; type?: 'text' | 'password' | 'select'; hint?: string }) {
  return (
    <div className={styles.formField}>
      <span>{label}</span>
      <span className={`${styles.formInput} ${type === 'password' ? styles.formSecret : ''} ${type === 'select' ? styles.formSelect : ''}`}>{value}</span>
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function SignupFragment({ plan = 'pro' }: { plan?: PlanId }) {
  return (
    <div className={styles.form} data-ui>
      <div className={styles.formHead}><span className={styles.uiMark}>n</span><span>Create your account.</span></div>
      <Field label="Full name" value="Alex Rivera" />
      <Field label="Username" value="alexr" />
      <Field label="Password" value="••••••••••••••" type="password" hint="At least 12 characters" />
      <div className={styles.formPlan}><span>Plan</span><b>{PLANS[plan].name} · {PLANS[plan].price} {PLANS[plan].unit}</b><small>License attached once we confirm payment</small></div>
      <div className={styles.formButton}>Create individual account</div>
    </div>
  );
}

export function AddKeyFragment({ provider = 'OpenAI' }: { provider?: string }) {
  return (
    <div className={styles.form} data-ui>
      <div className={styles.formHead}><span className={styles.uiMark}>n</span><span>Add a provider key</span><span>API management</span></div>
      <Field label="Provider" value={provider} type="select" />
      <Field label="Nickname" value={`Main ${provider} key`} />
      <Field label="API key" value="sk-proj-••••••••••••••••••••4f2a" type="password" hint="Encrypted on the server. Only the last four stay visible." />
      <div className={styles.formButton}>Save key</div>
    </div>
  );
}

export function DesktopSignInFragment() {
  return (
    <div className={`${styles.form} ${styles.formDesktop}`} data-ui>
      <div className={styles.formHead}><span className={styles.uiMark}>n</span><span>Welcome back.</span><span>Novi 0.2.2 · macOS</span></div>
      <p className={styles.formNote}>Individuals: use your web account. Enterprise members: your assigned desktop login.</p>
      <Field label="Username" value="alexr" />
      <Field label="Password" value="••••••••••••••" type="password" />
      <div className={styles.formCheck}><i /><span>Remember username</span></div>
      <div className={styles.formButton}>Sign in</div>
    </div>
  );
}
