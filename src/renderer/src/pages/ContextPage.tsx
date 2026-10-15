import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, Check, Cpu, FastForward, FileText, FolderOpen, Pencil, Play, Trash2, X } from 'lucide-react';
import type { AppMode, ContextFolder, SessionProfile, Snapshot } from '../../../shared/types';
import { activeConnection } from '../../../shared/providers';
import { Brand } from '../components/Brand';
import { ProviderPicker } from '../components/chat/ProviderPicker';
import { SettingsPage } from './SettingsPage';
import { SessionPreflight } from '../components/SessionPreflight';
import { BehavioralModeHUD } from '../components/BehavioralModeHUD';
import { errorText, unwrap } from '../services/api';
import { continueFromGetReady, getReadyContinued } from '../services/readiness';
import { SESSION_ROLES, presetFields, presetMode } from '../context/sessionPresets';

import { useAppMode } from '../context/AppModeContext';
import { SESSION_MODES, modeInstructions } from '../../../shared/sessionModes';

type Section = 'model' | 'sources' | 'brief';

export function ContextPage({ state, onSaved, onSignOut }: { state: Snapshot; onSaved: (state: Snapshot) => void; onSignOut: () => void }) {
  const { setAppMode, behavioralFramework, setBehavioralFramework } = useAppMode();
  const [startMode, setStartMode] = useState<AppMode | null>(null);
  const [settings, setSettings] = useState(false);
  const [preflightDone, setPreflightDone] = useState(getReadyContinued);
  const [section, setSection] = useState<Section>('model');
  const [folders, setFolders] = useState<ContextFolder[]>([]);
  const [purpose, setPurpose] = useState('');
  const [company, setCompany] = useState(''), [targetRole, setTargetRole] = useState('');
  // The profile name follows company and role (or the purpose) until the user types their own.
  const [profileName, setProfileName] = useState(''), [profileNameEdited, setProfileNameEdited] = useState(false);
  const [profileNotice, setProfileNotice] = useState(''), [confirmDelete, setConfirmDelete] = useState<string | null>(null);
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
  const profiles = state.settings!.sessionProfiles || [];
  const nameForProfile = profileNameEdited ? profileName : ([company.trim(), targetRole.trim()].filter(Boolean).join(' ') || purpose.trim()).replace(/\s+/g, ' ').slice(0, 60);
  const existingProfile = profiles.find((profile) => profile.name.toLowerCase() === nameForProfile.trim().toLowerCase());

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
      const next = await unwrap(window.novi.startContext({ folderIds: folders.map((f) => f.id), purpose: purpose.trim(), company, role: targetRole, fields }));
      setAppMode(startMode);
      onSaved(next);
    } catch (err) { if (current === attempt.current) setError(errorText(err)); }
    finally { if (current === attempt.current) { setBusy(false); setChecking(false); } }
  }

  async function saveProfile() {
    const name = nameForProfile.trim();
    if (!canStart || !startMode || !name) return;
    setBusy(true); setError(''); setProfileNotice('');
    try {
      const next = await unwrap(window.novi.saveSessionProfile({ name, folderIds: folders.map((f) => f.id), mode: startMode, framework: behavioralFramework, company, role: targetRole, purpose: purpose.trim(), fields }));
      onSaved(next);
      setProfileName(name); setProfileNameEdited(true);
      setProfileNotice(`${existingProfile ? 'Updated' : 'Saved'} “${name}”. Next time, start it from the Model step in one click.`);
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }

  async function deleteProfile(id: string) {
    setBusy(true); setError('');
    try { onSaved(await unwrap(window.novi.deleteSessionProfile(id))); setConfirmDelete(null); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }

  // Fills the setup from a profile; with startNow it then starts the session exactly as Start session would.
  async function applyProfile(profile: SessionProfile, startNow: boolean) {
    if (busy) return;
    const current = ++attempt.current;
    const stale = () => current !== attempt.current;
    let reached: Section = 'model';
    setBusy(true); setError(''); setProfileNotice(''); setPresetNotice(''); setConfirmDelete(null);
    setCompany(profile.company); setTargetRole(profile.role); setPurpose(profile.purpose);
    setFields(profile.fields.map((field) => ({ ...field }))); setStartMode(profile.mode);
    setProfileName(profile.name); setProfileNameEdited(true);
    try {
      // Saved before anything else so its settings update cannot land after the session starts.
      if (profile.framework !== behavioralFramework) await setBehavioralFramework(profile.framework);
      if (stale()) return;
      const connection = activeConnection(state.settings!);
      if (connection?.id !== profile.connectionId || connection.model !== profile.model) {
        try { const next = await unwrap(window.novi.selectConnection(profile.connectionId, profile.model)); if (stale()) return; onSaved(next); }
        catch (cause) { throw new Error(`This profile’s model (${profile.model}) isn’t available. ${errorText(cause)} Choose a model, then save the profile again.`); }
      }
      reached = 'sources';
      const loaded = await unwrap(window.novi.loadSessionProfileFolders(profile.id));
      if (stale()) return;
      setFolders(loaded);
      reached = 'brief';
      const skipped = profile.folders.length - loaded.length;
      const note = skipped ? ` ${skipped} saved ${skipped === 1 ? 'folder has' : 'folders have'} no readable files now.` : '';
      if (!startNow) { setSection('brief'); setProfileNotice(`Loaded “${profile.name}”.${note} Review it, then start the session.`); return; }
      setChecking(true);
      await unwrap(window.novi.testConnection());
      if (stale()) return;
      setChecking(false);
      const next = await unwrap(window.novi.startContext({ folderIds: loaded.map((f) => f.id), purpose: profile.purpose, company: profile.company, role: profile.role, fields: profile.fields }));
      setAppMode(profile.mode);
      onSaved(next);
    } catch (err) {
      if (stale()) return;
      setSection(reached);
      setError(errorText(err));
    } finally { if (!stale()) { setBusy(false); setChecking(false); } }
  }

  if (settings) return <SettingsPage state={state} onSaved={onSaved} onBack={() => setSettings(false)} onSignOut={onSignOut} onCleared={() => {}} />;
  if (!preflightDone) return <SessionPreflight state={state} onSaved={onSaved} onContinue={() => { continueFromGetReady(); setPreflightDone(true); }} onSettings={() => setSettings(true)} onFolders={setFolders} />;
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
        <p className="context-rail-note">Conversations and a copy of their source text are saved locally for later questions. Ending a session removes only its temporary context file; source folders stay in place.</p>
      </aside>

      <div className="context-main-panel">
        <section id="context-panel-model" aria-labelledby="context-tab-model" className="context-panel-content" hidden={section !== 'model'}>
          <div className="context-panel-heading"><div className="context-panel-icon"><Cpu size={19} /></div><div><span className="context-overline">01 / CONNECTION</span><h2>Choose a model</h2><p>Select the connection Novi will use for this session.</p></div></div>
          {profiles.length ? <div className="profile-list" role="group" aria-label="Saved profiles">
            <h3><Bookmark size={14} />Saved profiles</h3>
            {profiles.map((profile) => <div className="profile-card" key={profile.id}>
              <div className="profile-card-text"><strong title={profile.name}>{profile.name}</strong>
                <span>{SESSION_MODES.find((mode) => mode.id === profile.mode)?.name} · {profile.model} · {profile.folders.length} {profile.folders.length === 1 ? 'folder' : 'folders'}</span></div>
              {confirmDelete === profile.id
                ? <div className="profile-card-actions"><span>Delete?</span><button type="button" className="danger-button" disabled={busy} onClick={() => void deleteProfile(profile.id)}>Delete</button><button type="button" className="text-button" disabled={busy} onClick={() => setConfirmDelete(null)}>Keep</button></div>
                : <div className="profile-card-actions">
                  <button type="button" className="primary" disabled={busy} aria-label={`Start ${profile.name}`} onClick={() => void applyProfile(profile, true)}><Play size={14} />Start</button>
                  <button type="button" className="text-button" disabled={busy} aria-label={`Edit ${profile.name}`} onClick={() => void applyProfile(profile, false)}><Pencil size={14} />Edit</button>
                  <button type="button" className="icon-button" disabled={busy} aria-label={`Delete ${profile.name}`} title="Delete profile" onClick={() => setConfirmDelete(profile.id)}><Trash2 size={14} /></button>
                </div>}
            </div>)}
          </div> : <p className="profile-tip">Tip: on the last step, save this setup as a profile to start it in one click next time.</p>}
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
            {startMode === 'behavioral' && <div className="context-framework"><span>Answer framework</span><BehavioralModeHUD framework={behavioralFramework} onSelectFramework={(framework) => void setBehavioralFramework(framework)} /></div>}
          </fieldset>
          <div className="context-brief-editor">
            <div className="context-brief-row">
              <label>Company <span>Optional</span><input maxLength={120} value={company} disabled={busy} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Acme" /></label>
              <label>Role you’re interviewing for <span>Optional</span><input maxLength={120} value={targetRole} disabled={busy} onChange={(e) => setTargetRole(e.target.value)} placeholder="e.g. Software Engineer II" /></label>
            </div>
            <label htmlFor="context-purpose">Purpose <span>Required</span></label><textarea id="context-purpose" required maxLength={2000} value={purpose} disabled={busy} onChange={(e) => setPurpose(e.target.value)} placeholder="What should Novi help you accomplish?" />
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
            <fieldset className="profile-save" disabled={busy}>
              <legend>Save as a profile</legend>
              <p>Next time, start this exact setup in one click: model, folders, mode, framework, and instructions. Folders are read again each time, so updated files are used.</p>
              <div className="profile-save-row">
                <input aria-label="Profile name" maxLength={60} value={nameForProfile} placeholder="e.g. Acme SWE round 2" onChange={(e) => { setProfileName(e.target.value); setProfileNameEdited(true); setProfileNotice(''); }} />
                <button type="button" className="secondary" disabled={!canStart || !nameForProfile.trim()} onClick={() => void saveProfile()}><Bookmark size={14} />{existingProfile ? 'Update profile' : 'Save profile'}</button>
              </div>
              <span className="context-preset-notice" role="status">{profileNotice}</span>
            </fieldset>
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
