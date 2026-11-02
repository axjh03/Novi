import type { Metadata } from 'next';
import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import PublicNavbar from '@/components/PublicNavbar';
import SiteFooter from '@/components/SiteFooter';
import { ChapterPage, CloseRow, Title } from '@/components/Chapters';
import { AddKeyFragment } from '@/components/Fragments';
import BrainBot from './BrainBot';
import { marks, PROVIDER_BRAND, type ProviderId } from './ProviderMarks';
import CopyButton from './CopyButton';
import KeyChecker from './KeyChecker';
import DeskLaptop from '@/components/DeskLaptop';
import chapters from '@/components/Chapters.module.css';
import styles from './api-keys.module.css';

export const metadata: Metadata = {
  title: 'Setup guide: API keys for Anthropic, OpenAI, Gemini and Kimi | Novi',
  description: 'Get an API key from Anthropic Claude, OpenAI, Google Gemini or Kimi (Moonshot AI), add it once to your Novi account, and use it in the desktop app.',
};

/* The four doors. Each test command lists the models the key can use, which is also what Novi does
   after you add it: no model name to keep up to date. */
const providers: { id: string; name: string; tone: string; home: string; keys: string; base: string; format: string; steps: ReactNode[]; test: string; mark?: ReactNode }[] = [
  {
    id: 'anthropic', name: 'Anthropic Claude', tone: 'tone-rose', home: 'https://console.anthropic.com/', keys: 'https://console.anthropic.com/settings/keys', base: 'https://api.anthropic.com/v1', format: 'sk-ant-api03-…',
    mark: marks.anthropic,
    steps: [
      <>Sign in or sign up at <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer">console.anthropic.com</a>. Anthropic may ask for phone verification before it lets you create keys.</>,
      <>Open <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">Settings, API keys</a> and press <b>Create Key</b>.</>,
      <>Name it (<code>Novi Desktop</code> works) and create it.</>,
      <>Copy the key. It starts with <code>sk-ant-api03-</code> and Anthropic shows it only once.</>,
    ],
    test: `curl https://api.anthropic.com/v1/models \\\n  -H "x-api-key: YOUR_KEY_HERE" \\\n  -H "anthropic-version: 2023-06-01"`,
  },
  {
    id: 'openai', name: 'OpenAI', tone: 'tone-paper', home: 'https://platform.openai.com/', keys: 'https://platform.openai.com/api-keys', base: 'https://api.openai.com/v1', format: 'sk-proj-…',
    mark: marks.openai,
    steps: [
      <>Sign in at <a href="https://platform.openai.com/" target="_blank" rel="noreferrer">platform.openai.com</a>, the developer platform, not ChatGPT.</>,
      <>Open <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">API keys</a> and press <b>Create new secret key</b>.</>,
      <>Name it, keep the permissions at <b>All</b> or <b>Model capabilities</b>, and create it.</>,
      <>Copy the key. It starts with <code>sk-proj-</code>. Add billing on the platform if the account has none; keys without credit are rejected.</>,
    ],
    test: `curl https://api.openai.com/v1/models \\\n  -H "Authorization: Bearer YOUR_KEY_HERE"`,
  },
  {
    id: 'gemini', name: 'Google Gemini', tone: 'tone-wine', home: 'https://aistudio.google.com/', keys: 'https://aistudio.google.com/app/apikey', base: 'https://generativelanguage.googleapis.com/v1beta', format: 'AIzaSy…',
    mark: marks.gemini,
    steps: [
      <>Open <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer">aistudio.google.com</a> and sign in with a Google account.</>,
      <>Go to <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Get API key</a> and press <b>Create API key</b>, in a new project if it asks.</>,
      <>Copy the key. It starts with <code>AIzaSy</code> and is 39 characters long.</>,
    ],
    test: `curl "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY_HERE"`,
  },
  {
    id: 'kimi', name: 'Kimi (Moonshot AI)', tone: 'tone-deep', home: 'https://platform.moonshot.cn/', keys: 'https://platform.moonshot.cn/console/api-keys', base: 'https://api.moonshot.cn/v1', format: 'sk-…',
    mark: marks.kimi,
    steps: [
      <>Register or sign in at <a href="https://platform.moonshot.cn/" target="_blank" rel="noreferrer">platform.moonshot.cn</a>.</>,
      <>Open <a href="https://platform.moonshot.cn/console/api-keys" target="_blank" rel="noreferrer">API Keys</a> and press <b>新建 API Key</b> (Create API Key).</>,
      <>Label it and copy the key. It starts with <code>sk-</code>, like an OpenAI key, so note which it is.</>,
      <>Add it with the provider set to <b>Kimi (Moonshot AI)</b>; Novi points it at the Moonshot endpoint for you.</>,
    ],
    test: `curl https://api.moonshot.cn/v1/models \\\n  -H "Authorization: Bearer YOUR_KEY_HERE"`,
  },
];

export default function ApiKeysPage() {
  return (
    <ChapterPage>
      <PublicNavbar active="setup-guide" />
      <main>
        {/* 1 · The claim, and the account with its keys. */}
        <section className={chapters.hero} aria-labelledby="setup-title">
          <div className={chapters.heroCopy}>
            <Title id="setup-title" lines={['Get a key.', 'Add it once.']} />
            <p className={chapters.lead} data-load style={{ '--d': '480ms' } as CSSProperties}>Novi talks to your AI provider directly, with your own key. Make the key at the provider, paste it into your Novi account, and the desktop app picks it up when you sign in. Four providers: OpenAI, Anthropic, Google Gemini and Kimi.</p>
            <nav className={styles.jump} aria-label="Providers on this page" data-load style={{ '--d': '560ms' } as CSSProperties}>
              {providers.map(provider => <a key={provider.id} href={`#${provider.id}`}>{provider.name}</a>)}
              <a href="#add-key">Add it to Novi</a>
            </nav>
          </div>
          <div className={`${chapters.heroSide} ${styles.heroRelay}`}><div data-open><BrainBot /></div></div>
        </section>

        {/* 2 · Which key is this, and which door for what. */}
        <section className={`${styles.doors} ${chapters['tone-paper']}`} aria-labelledby="doors-title">
          <div className={styles.doorsWords}>
            <h2 id="doors-title" data-reveal>Four doors. Any one will do.</h2>
            <p data-reveal style={{ '--i': 1 } as CSSProperties}>A key from any of them unlocks every session mode. After you add it, Novi lists the models that key can use, and you pick one when a session starts. The provider bills the usage; the plan covers Novi.</p>
            <div data-reveal style={{ '--i': 2 } as CSSProperties}><KeyChecker /></div>
          </div>
          <div className={styles.doorsPicture} data-reveal style={{ '--i': 1 } as CSSProperties}><img src="/app/modern-light.png" alt="The floating Novi bar in its light theme, answering from a connected key" width={490} height={457} loading="lazy" decoding="async" /></div>
          <table className={styles.doorsTable} data-reveal style={{ '--i': 2 } as CSSProperties}>
            <caption className={chapters.srOnly}>What each provider is good at</caption>
            <colgroup><col /><col /><col /></colgroup>
            <thead><tr><th scope="col">Provider</th><th scope="col">Good at</th><th scope="col">Key starts with</th></tr></thead>
            <tbody>
              <tr><th scope="row"><a href="#anthropic">Anthropic Claude</a></th><td>Long reasoning, code explanations, system design write-ups.</td><td><code>sk-ant-</code></td></tr>
              <tr><th scope="row"><a href="#openai">OpenAI</a></th><td>Screenshots and other images, balanced answers, broad model choice.</td><td><code>sk-proj-</code></td></tr>
              <tr><th scope="row"><a href="#gemini">Google Gemini</a></th><td>Very long documents, fast replies, a generous free tier to start.</td><td><code>AIza</code></td></tr>
              <tr><th scope="row"><a href="#kimi">Kimi (Moonshot AI)</a></th><td>Long resumes and project notes, Chinese and English questions.</td><td><code>sk-</code></td></tr>
            </tbody>
          </table>
        </section>

        {/* 3 · One chapter per provider. */}
        {providers.map(provider => (
          <section key={provider.id} id={provider.id} className={`${styles.provider} ${chapters[provider.tone]} ${provider.tone === 'tone-deep' ? styles.onDark : ''}`} aria-labelledby={`${provider.id}-title`}>
            <div className={styles.providerSide}>
              <div className={styles.providerName} data-reveal style={{ '--brand': PROVIDER_BRAND[provider.id as ProviderId] } as CSSProperties}>{provider.mark}<h2 id={`${provider.id}-title`}>{provider.name}</h2></div>
              <p className={styles.format} data-reveal style={{ '--i': 1 } as CSSProperties}><span>The key looks like</span><code>{provider.format}</code></p>
              <ul className={styles.links} data-reveal style={{ '--i': 2 } as CSSProperties}>
                <li><span>Console</span><a href={provider.home} target="_blank" rel="noreferrer">{provider.home.replace('https://', '')}</a></li>
                <li><span>Keys page</span><a href={provider.keys} target="_blank" rel="noreferrer">{provider.keys.replace('https://', '')}</a></li>
                <li><span>Endpoint</span><code>{provider.base}</code></li>
              </ul>
              <a className={styles.go} href={provider.keys} target="_blank" rel="noreferrer" data-reveal style={{ '--i': 3 } as CSSProperties}>Open the keys page</a>
            </div>
            <div className={styles.providerMain}>
              <h3 data-reveal>Make the key</h3>
              <ol className={styles.steps} data-reveal style={{ '--i': 1 } as CSSProperties}>{provider.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
              <h3 data-reveal style={{ '--i': 2 } as CSSProperties}>Check it from a terminal</h3>
              <p data-reveal style={{ '--i': 3 } as CSSProperties}>Lists the models the key can use, which is what Novi asks for after you add it. A list back means the key works; a 401 means it does not.</p>
              <div className={styles.code} data-reveal style={{ '--i': 4 } as CSSProperties}>
                <pre><code>{provider.test}</code></pre>
                <CopyButton text={provider.test} label="Copy the command" />
              </div>
            </div>
          </section>
        ))}

        {/* 4 · Into Novi: once on the website, then on the desk. */}
        <section className={`${styles.into} ${chapters['tone-black']}`} id="add-key" aria-labelledby="into-title">
          <div className={chapters.chapterHead}>
            <h2 id="into-title" data-reveal>Add it to your Novi account.</h2>
            <p data-reveal style={{ '--i': 1 } as CSSProperties}>Once, on this website. Individuals use it directly in the desktop app. Enterprise desktop accounts inherit the keys their organisation added.</p>
          </div>
          <div className={styles.intoGrid}>
            <div className={styles.intoScreen} data-reveal><AddKeyFragment provider="Anthropic" /></div>
            <div className={styles.intoWords} data-reveal style={{ '--i': 1 } as CSSProperties}>
              <h3>On this website</h3>
              <ol>
                <li><Link className={chapters.inline} href="/#signin">Sign in</Link> to your Novi account.</li>
                <li>Open <b>API management</b> in the sidebar and press <b>Add API key</b>.</li>
                <li>Choose the provider: OpenAI, Anthropic, Google Gemini or Kimi.</li>
                <li>Give it a nickname you will recognise and paste the key.</li>
                <li>Save. The key is encrypted at rest; only its last four characters show from then on.</li>
              </ol>
            </div>
            <div className={styles.intoWords} data-reveal style={{ '--i': 2 } as CSSProperties}>
              <h3>In the desktop app</h3>
              <ol>
                <li>Sign in with the same username and password. Enterprise members use the desktop login from <b>User management</b>.</li>
                <li>Open <b>Settings</b>, then <b>API management</b>. Your account’s keys are listed; press <b>Refresh</b> if a new one is missing.</li>
                <li>Select the key you want, one per provider. Keys cannot be typed into the app itself.</li>
                <li>Pick the model when you start a session.</li>
              </ol>
              <p><Link className={chapters.inline} href="/download">Download the app</Link> if it is not installed yet.</p>
            </div>
          </div>
        </section>

        {/* 5 · Where the key lives. */}
        <section className={`${styles.security} ${chapters['tone-rose']}`} aria-labelledby="security-title">
          <div className={styles.securityWords}>
          <h2 id="security-title" data-reveal>Where the key lives.</h2>
          <ul className={styles.securityList}>
            <li data-reveal style={{ '--i': 1 } as CSSProperties}><strong>Encrypted on the server.</strong><span>Keys in your account are stored with AES-256-GCM, each with its own initialisation vector. The workspace shows the last four characters; owners can reveal or copy a key on demand.</span></li>
            <li data-reveal style={{ '--i': 2 } as CSSProperties}><strong>In memory on the desk.</strong><span>The desktop app holds keys in memory while you are signed in and drops them when you sign out. A remembered sign-in lives in Novi’s local app data.</span></li>
            <li data-reveal style={{ '--i': 3 } as CSSProperties}><strong>No middle server.</strong><span>Prompts, transcripts and screenshots go from your computer to the provider you chose. Nothing passes through, or is logged by, a server of ours.</span></li>
          </ul>
          </div>
          <div className={styles.securityPicture} data-reveal style={{ '--i': 2 } as CSSProperties}><DeskLaptop /></div>
        </section>

        <CloseRow id="setup-close" title={<>Key in hand?<br />Get the app.</>} text="Add the key to your account first, then install Novi and sign in. No account yet? Create an individual account, or contact us for a team." action="Download Novi" href="/download" />
      </main>
      <SiteFooter />
    </ChapterPage>
  );
}
