import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Cpu, FastForward, FileText, FolderOpen, Play, X } from 'lucide-react';
import type { AppMode, ContextFolder, Snapshot } from '../../../shared/types';
import { activeConnection } from '../../../shared/providers';
import { Brand } from '../components/Brand';
import { ProviderPicker } from '../components/chat/ProviderPicker';
import { SettingsPage } from './SettingsPage';
import { errorText, unwrap } from '../services/api';
import { SESSION_ROLES, presetFields, presetMode } from '../context/sessionPresets';

import { useAppMode } from '../context/AppModeContext';
import { SESSION_MODES, modeInstructions } from '../../../shared/sessionModes';

type Section = 'model' | 'sources' | 'brief';

export function ContextPage({ state, onSaved, onSignOut }: { state: Snapshot; onSaved: (state: Snapshot) => void; onSignOut: () => void }) {
  const { setAppMode } = useAppMode();
  const [startMode, setStartMode] = useState<AppMode | null>(null);
  const [settings, setSettings] = useState(false);
  const [section, setSection] = useState<Section>('model');
  const [folders, setFolders] = useState<ContextFolder[]>([]);
  const [purpose, setPurpose] = useState('');
  const [fields, setFields] = useState(['Role / perspective', 'Level / experience', 'Output format', 'Additional instructions'].map((label) => ({ label, value: '' })));
  const [roleIndex, setRoleIndex] = useState(0), [presetIndex, setPresetIndex] = useState(0);
  const [presetNotice, setPresetNotice] = useState('');
  const instructions = useRef<HTMLDetailsElement>(null);
  const role = SESSION_ROLES[roleIndex], preset = role.presets[presetIndex];
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [modelReady, setModelReady] = useState(false), [checking, setChecking] = useState(false);
  const attempt = useRef(0);
  useEffect(() => () => { attempt.current++; }, []);
  const connection = activeConnection(state.settings!);
  const sourcesReady = folders.some(folder => folder.files.length > 0);
  const briefReady = Boolean(purpose.trim() && startMode);
  const canStart = !busy && modelReady && sourcesReady && briefReady && section === 'brief';

  async function loadFolders() {
    setBusy(true); setError('');
    try { const loaded = await unwrap(window.novi.pickContextFolders()); if (loaded.length) setFolders(loaded); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }

  async function startEmpty() {
    if (busy || !modelReady) return;
    const current = ++attempt.current;
    setBusy(true); setChecking(true); setError('');
    try {
      await unwrap(window.novi.testConnection());
      if (current !== attempt.current) return;
      setChecking(false);
      const next = await unwrap(window.novi.startEmptySession());
      setAppMode('normal');
      onSaved(next);
    } catch (err) { if (current === attempt.current) setError(errorText(err)); }
    finally { if (current === attempt.current) { setBusy(false); setChecking(false); } }
  }

  async function start() {
    if (!canStart || !startMode) return;
    const current = ++attempt.current;
    setBusy(true); setChecking(true); setError('');
    try {
      await unwrap(window.novi.testConnection());
      if (current !== attempt.current) return;
      setChecking(false);
      const next = await unwrap(window.novi.startContext({ folderIds: folders.map((f) => f.id), purpose: purpose.trim(), fields }));
      setAppMode(startMode);
      onSaved(next);
    } catch (err) { if (current === attempt.current) setError(errorText(err)); }
    finally { if (current === attempt.current) { setBusy(false); setChecking(false); } }
  }

  if (settings) return <SettingsPage state={state} onSaved={onSaved} onBack={() => setSettings(false)} onSignOut={onSignOut} onCleared={() => {}} />;
  return <main className="context-page">
    <header className="context-header">
      <div className="context-header-identity"><Brand /><span>Session setup</span></div>
      <div className="context-header-actions">
        <button className="text-button" disabled={busy} onClick={() => setSettings(true)}>Settings</button>
        <button className="text-button" disabled={busy} onClick={onSignOut}>Sign out</button>
      </div>
    </header>

    <div className="context-workspace">
      <aside className="context-rail">
        <div className="context-rail-title"><span className="context-overline">NEW WORKSPACE</span><h1>Temporary session</h1><p>Choose a model, add sources, and set the task.</p></div>
        <nav className="context-section-nav" aria-label="Session setup">
          {([
            ['model', 'Model', Cpu, modelReady],
            ['sources', 'Sources', FolderOpen, sourcesReady],
            ['brief', 'Instructions', FileText, briefReady],
          ] as const).map(([id, label, Icon, done]) => <button key={id} id={`context-tab-${id}`} type="button" aria-current={section === id ? 'page' : undefined} aria-controls={`context-panel-${id}`} className={`context-nav-item ${section === id ? 'active' : ''}`} disabled={busy || (id !== 'model' && !modelReady) || (id === 'brief' && !sourcesReady)} onClick={() => setSection(id)}>
            <Icon size={16} /><span>{label}</span>{done && <Check className="context-nav-check" size={14} aria-label="Complete" />}
          </button>)}
        </nav>
        <p className="context-rail-note">Conversations are saved across sessions. Ending a session removes only its temporary context file; source folders stay in place.</p>
      </aside>

      <div className="context-main-panel">
        <section id="context-panel-model" aria-labelledby="context-tab-model" className="context-panel-content" hidden={section !== 'model'}>
          <div className="context-panel-heading"><div className="context-panel-icon"><Cpu size={19} /></div><div><span className="context-overline">01 / CONNECTION</span><h2>Choose a model</h2><p>Select the connection Novi will use for this session.</p></div></div>
          <div className="context-control-block"><ProviderPicker state={state} disabled={busy} onSaved={onSaved} onError={setError} onReady={setModelReady} />
            {!connection && <p className="managed-note">No enabled connection is available. Enable one in Settings.</p>}
          </div>
        </section>

        {section === 'sources' && <section id="context-panel-sources" aria-labelledby="context-tab-sources" className="context-panel-content">
          <div className="context-panel-heading"><div className="context-panel-icon"><FolderOpen size={19} /></div><div><span className="context-overline">02 / FILES</span><h2>Source folders</h2><p>Load the documents Novi should use as context.</p></div></div>
          <div className="context-sources-toolbar"><button className="secondary" disabled={busy || !connection} onClick={() => void loadFolders()}><FolderOpen size={15} />{busy ? 'Working…' : folders.length ? 'Replace folders' : 'Choose folders'}</button><span>TXT and PDF · up to 30 files / 80k characters</span></div>
          <div className="context-folder-list">
            {folders.length ? folders.map((folder) => <div className="context-folder" key={folder.id}><div className="context-folder-row"><FolderOpen size={16} /><strong title={folder.name}>{folder.name}</strong><span>{folder.files.length} files · {folder.characters.toLocaleString()} chars</span><button className="icon-button" disabled={busy} aria-label={`Remove ${folder.name}`} onClick={() => setFolders((items) => items.filter((f) => f.id !== folder.id))}><X size={14} /></button></div><details><summary>Included files</summary><ul>{folder.files.map((file) => <li key={file}>{file}</li>)}</ul></details></div>) : <div className="context-empty-sources"><FolderOpen size={25} /><strong>No source folders</strong><span>Choose a folder to load its supported documents.</span></div>}
          </div>
        </section>}

        {section === 'brief' && <section id="context-panel-brief" aria-labelledby="context-tab-brief" className="context-panel-content">
          <div className="context-panel-heading"><div className="context-panel-icon"><FileText size={19} /></div><div><span className="context-overline">03 / TASK</span><h2>Session instructions</h2><p>Describe what you want to do with these sources.</p></div></div>
          <fieldset className="context-presets" disabled={busy}><legend>Start in a mode</legend>
            <div className="context-preset-options">{SESSION_MODES.map((mode) => <button type="button" key={mode.id} aria-pressed={startMode === mode.id} onClick={() => setStartMode(mode.id)}><strong>{mode.name}</strong><span>{mode.description}</span></button>)}</div>
            {startMode && startMode !== 'normal' && <details className="context-preset-preview"><summary>How AI will answer</summary><p>{modeInstructions(startMode)}</p></details>}
          </fieldset>
          <div className="context-brief-editor"><label htmlFor="context-purpose">Purpose <span>Required</span></label><textarea id="context-purpose" required maxLength={2000} value={purpose} disabled={busy} onChange={(e) => setPurpose(e.target.value)} placeholder="What should Novi help you accomplish?" />
            <fieldset className="context-presets" disabled={busy}>
              <legend>Start from a role preset</legend>
              <p>Optional starting points for this session. Preview a preset, then apply and edit its instructions.</p>
              <label htmlFor="context-preset-role">Role</label>
              <select id="context-preset-role" value={roleIndex} onChange={(event) => { setRoleIndex(Number(event.target.value)); setPresetIndex(0); setPresetNotice(''); }}>
                {SESSION_ROLES.map((item, index) => <option key={item.name} value={index}>{item.name}</option>)}
              </select>
              <div className="context-preset-options" role="group" aria-label={`${role.name} presets`}>
                {role.presets.map((item, index) => <button type="button" key={item.name} aria-pressed={presetIndex === index} onClick={() => { setPresetIndex(index); setPresetNotice(''); }}>
                  <strong>{item.name}</strong><span>{item.description}</span>
                </button>)}
              </div>
              <details className="context-preset-preview"><summary>Preview instructions: {preset.name}</summary>
                <dl>{presetFields(role, preset).map((field) => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
              </details>
              <button type="button" className="secondary" onClick={() => {
                setFields((current) => presetFields(role, preset).map((field, index) => index === 1 || index === 3 ? { ...field, value: current[index].value || field.value } : field));
                setStartMode(presetMode(preset.name));
                setPresetNotice(`${role.name} / ${preset.name} applied. Mode selected. Edit the instructions below.`);
                if (instructions.current) instructions.current.open = true;
              }}>Apply preset</button>
              <small>Applying selects the mode and fills role and output guidance. Your experience, additional instructions, and purpose are preserved.</small>
              <span className="context-preset-notice" role="status">{presetNotice}</span>
            </fieldset>
            <details ref={instructions} className="custom-fields-accordion"><summary>Additional instructions <span>Optional · editable</span></summary><div className="context-fields">{fields.map((field, index) => <div className="context-field" key={index}><input aria-label={`Instruction ${index + 1} name`} maxLength={80} value={field.label} disabled={busy} onChange={(e) => { setPresetNotice(''); setFields((items) => items.map((f, i) => i === index ? { ...f, label: e.target.value } : f)); }} /><textarea aria-label={`${field.label || `Instruction ${index + 1}`} details`} maxLength={2000} value={field.value} disabled={busy} onChange={(e) => { setPresetNotice(''); setFields((items) => items.map((f, i) => i === index ? { ...f, value: e.target.value } : f)); }} placeholder="Add a detail…" /></div>)}</div></details>
          </div>
        </section>}
      </div>
    </div>

    <footer className="context-footer">
      <div className="context-footer-status" role="status">{error ? <span className="error" role="alert">{error}</span> : checking ? 'Checking connection…' : busy ? 'Starting session…' : !modelReady ? 'Choose an available model' : !sourcesReady ? 'Add source documents in step 2, or skip setup for an empty chat.' : !briefReady ? 'Enter a purpose and choose a mode in step 3.' : `${folders.length} ${folders.length === 1 ? 'folder' : 'folders'} ready · ${connection?.model || 'Model ready'}`}</div>
      <div className="context-footer-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" className="secondary context-start-empty" disabled={busy || !modelReady} title="Open an empty chat in Chat mode without these sources or instructions" onClick={() => void startEmpty()}><FastForward size={15} />{busy ? 'Starting…' : 'Skip session setup'}</button>
        {section !== 'model' && <button type="button" className="text-button" disabled={busy} onClick={() => setSection(section === 'brief' ? 'sources' : 'model')}><ArrowLeft size={15} />Back</button>}
        {section === 'brief'
          ? <button type="button" className="primary context-start" disabled={!canStart} onClick={() => void start()}><Play size={15} />{busy ? 'Starting…' : 'Start session'}</button>
          : <button type="button" className="primary context-start" disabled={busy || !modelReady || (section === 'sources' && !sourcesReady)} onClick={() => setSection(section === 'model' ? 'sources' : 'brief')}>Next<ArrowRight size={15} /></button>}
      </div>
    </footer>
  </main>;
}
