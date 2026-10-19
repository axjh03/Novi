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
import { SESSION_ROLES, defaultPurpose, presetFields } from '../context/sessionPresets';

import { useAppMode } from '../context/AppModeContext';
import { SESSION_MODES, modeInstructions } from '../../../shared/sessionModes';

type Section = 'model' | 'sources' | 'brief';
type Field = { label: string; value: string };
type Applied = { role: number; preset: number } | null;

/** The display name of a session type, for example 'coding' => "Coding". */
const modeName = (mode: AppMode) => SESSION_MODES.find((item) => item.id === mode)?.name ?? mode;
/** "1 folder" / "3 folders". */
const folderCount = (count: number) => `${count} ${count === 1 ? 'folder' : 'folders'}`;

/**
 * Session setup: the screen shown after Get ready and before a session starts.
 *
 * Three steps, all rendered at once and shown one at a time (so nothing typed is lost when switching):
 *   1. Model: choose the AI connection and model. Saved profiles can be started from here in one click.
 *      "Start an empty chat instead" skips setup entirely.
 *   2. Documents (optional): load folders of resumes, job descriptions or notes.
 *   3. Instructions: purpose (auto-suggested), session type, company and role, and optional presets.
 *      "More options" holds the four detailed answer instructions and Save profile.
 *
 * Start stays pressable even when something is missing: it then jumps to the missing item instead
 * of doing nothing, which helps when someone is nervous and can't see why nothing happens.
 *
 * Get ready (SessionPreflight) is shown first, once per launch per account. After that, ending a
 * session comes straight back here, and the "Run Get ready" button in the header opens Get ready
 * again (with today's results filled in), so its checks can be repeated between sessions.
 *
 * @param state     the current app snapshot (signed-in user, settings, profiles).
 * @param onSaved   called with the new snapshot whenever main-process state changes (session started, profile saved...).
 * @param onSignOut passed through to Settings, which is where Sign out lives.
 */
export function ContextPage({ state, onSaved, onSignOut }: { state: Snapshot; onSaved: (state: Snapshot) => void; onSignOut: () => void }) {
  const { setAppMode, behavioralFramework, setBehavioralFramework } = useAppMode();
  const [startMode, setStartMode] = useState<AppMode | null>(null);
  const [settings, setSettings] = useState(false);
  const [preflightDone, setPreflightDone] = useState(() => getReadyContinued(state.user!.id));
  const [section, setSection] = useState<Section>('model');
  const [folders, setFolders] = useState<ContextFolder[]>([]);
  // The purpose follows the session type, preset, company and role until the user writes their own.
  const [purpose, setPurpose] = useState(''), [purposeEdited, setPurposeEdited] = useState(false);
  const [company, setCompany] = useState(''), [targetRole, setTargetRole] = useState('');
  // The profile name follows company and role (or the purpose) until the user types their own.
  const [profileName, setProfileName] = useState(''), [profileNameEdited, setProfileNameEdited] = useState(false);
  const [profileNotice, setProfileNotice] = useState(''), [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [fields, setFields] = useState<Field[]>(['Role / perspective', 'Level / experience', 'Output format', 'Additional instructions'].map((label) => ({ label, value: '' })));
  const [roleIndex, setRoleIndex] = useState(0);
  // Only an applied preset shows as selected; Undo restores what applying it replaced.
  const [applied, setApplied] = useState<Applied>(null);
  const [undo, setUndo] = useState<{ fields: Field[]; startMode: AppMode | null; applied: Applied } | null>(null);
  const [presetNotice, setPresetNotice] = useState('');
  const moreOptions = useRef<HTMLDetailsElement>(null), purposeInput = useRef<HTMLTextAreaElement>(null), modeOptions = useRef<HTMLDivElement>(null);
  const role = SESSION_ROLES[roleIndex];
  const appliedPreset = applied ? SESSION_ROLES[applied.role].presets[applied.preset] : null;
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [modelReady, setModelReady] = useState(false), [checking, setChecking] = useState(false);
  const attempt = useRef(0);
  useEffect(() => () => { attempt.current++; }, []);
  const connection = activeConnection(state.settings!);
  // The Purpose actually used: the user's own text once they have typed in the field, otherwise the suggestion.
  const purposeValue = purposeEdited ? purpose : defaultPurpose(startMode, { company, role: targetRole, preset: appliedPreset });
  // The Instructions step is complete when there is a purpose and a session type.
  const briefReady = Boolean(purposeValue.trim() && startMode);
  // Start really starts only on the Instructions step, with a working model and a complete brief.
  const canStart = !busy && modelReady && briefReady && section === 'brief';
  // What still blocks Start, in the order it appears on the page.
  const missing = !modelReady ? 'model' : purposeEdited && !purposeValue.trim() ? 'purpose' : !startMode ? 'mode' : !purposeValue.trim() ? 'purpose' : null;
  // The short hint shown next to the step's main button, saying what is still needed ('' when nothing).
  const needs = section === 'model' ? (modelReady ? '' : 'Choose a model to continue')
    : section === 'brief' ? ({ model: 'Choose a model first', purpose: 'Add a purpose', mode: 'Choose a session type' } as const)[missing!] ?? '' : '';
  const profiles = state.settings!.sessionProfiles || [];
  // The name Save profile will use: the user's own once typed, otherwise "<company> <role>" or the purpose (max 60 characters).
  const nameForProfile = profileNameEdited ? profileName : ([company.trim(), targetRole.trim()].filter(Boolean).join(' ') || purposeValue.trim()).replace(/\s+/g, ' ').slice(0, 60);
  // A saved profile with the same name (case-insensitive); saving then updates it instead of adding a copy.
  const existingProfile = profiles.find((profile) => profile.name.toLowerCase() === nameForProfile.trim().toLowerCase());

  /** Opens the folder picker and loads the chosen folders' documents. Keeps the current list if the user cancels. */
  async function loadFolders() {
    setBusy(true); setError('');
    try { const loaded = await unwrap(window.novi.pickContextFolders()); if (loaded.length) setFolders(loaded); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }

  /**
   * "Start an empty chat instead": checks the AI connection, then starts a session with no documents
   * and no instructions, in normal chat mode.
   * `attempt` guards against a slow reply landing after the user has already done something else.
   */
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

  /**
   * Starts the session: checks the AI connection first (so a broken key fails here, with the setup
   * still on screen), then sends the documents, purpose, company, role and instructions to the main
   * process and switches to the chosen session type.
   */
  async function start() {
    if (!canStart || !startMode) return;
    const current = ++attempt.current;
    setBusy(true); setChecking(true); setError('');
    try {
      await unwrap(window.novi.testConnection());
      if (current !== attempt.current) return;
      setChecking(false);
      const next = await unwrap(window.novi.startContext({ folderIds: folders.map((f) => f.id), purpose: purposeValue.trim(), company, role: targetRole, fields }));
      setAppMode(startMode);
      onSaved(next);
    } catch (err) { if (current === attempt.current) setError(errorText(err)); }
    finally { if (current === attempt.current) { setBusy(false); setChecking(false); } }
  }

  /**
   * Called when Start is pressed while something is missing. Start looks disabled in that state but
   * stays pressable, and this takes the user to the first missing thing instead of doing nothing:
   * the Model step, the Purpose field, or the session type buttons (scrolled into view and focused).
   */
  function showMissing() {
    if (missing === 'model') { setSection('model'); return; }
    const target = missing === 'purpose' ? purposeInput.current : modeOptions.current?.querySelector('button');
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target?.focus({ preventScroll: true });
  }

  /** Picks a session type by hand. That replaces what a preset chose, so preset Undo is no longer offered. */
  function chooseMode(mode: AppMode) { setStartMode(mode); setUndo(null); }

  /** Changes one of the four answer-instruction fields. Editing by hand also clears the preset notice and its Undo. */
  function editField(index: number, patch: Partial<Field>) {
    setPresetNotice(''); setUndo(null);
    setFields((items) => items.map((field, i) => i === index ? { ...field, ...patch } : field));
  }

  /**
   * Applies a preset as soon as it is clicked (no separate Apply button):
   * - remembers the current fields, session type and preset so Undo can restore them;
   * - fills the answer instructions from the preset, but keeps the user's own Experience and
   *   Additional instructions when they already wrote something there;
   * - sets the session type the preset belongs to;
   * - says what changed and opens More options so the filled-in fields are visible.
   */
  function applyPreset(index: number) {
    const preset = role.presets[index];
    setUndo({ fields, startMode, applied });
    // Experience and additional instructions are the user's own; keep them when they exist.
    setFields(presetFields(role, preset).map((field, i) => i === 1 || i === 3 ? { ...field, value: fields[i].value || field.value } : field));
    setStartMode(preset.mode);
    setApplied({ role: roleIndex, preset: index });
    setPresetNotice(`Applied ${preset.name}: session type set to ${modeName(preset.mode)}, and answer instructions filled in under More options.`);
    if (moreOptions.current) moreOptions.current.open = true;
  }

  /** Puts back exactly what the last preset replaced (fields, session type, selected preset). */
  function undoPreset() {
    if (!undo) return;
    setFields(undo.fields); setStartMode(undo.startMode); setApplied(undo.applied);
    setUndo(null); setPresetNotice('Preset undone.');
  }

  /**
   * Saves the current setup (model, folders, session type, framework, company, role, purpose and
   * instructions) as a named profile, or updates the profile with the same name. Only allowed when
   * the setup could be started, so a saved profile is always complete.
   */
  async function saveProfile() {
    const name = nameForProfile.trim();
    if (!canStart || !startMode || !name) return;
    setBusy(true); setError(''); setProfileNotice('');
    try {
      const next = await unwrap(window.novi.saveSessionProfile({ name, folderIds: folders.map((f) => f.id), mode: startMode, framework: behavioralFramework, company, role: targetRole, purpose: purposeValue.trim(), fields }));
      onSaved(next);
      setProfileName(name); setProfileNameEdited(true);
      setProfileNotice(`${existingProfile ? 'Updated' : 'Saved'} “${name}”. Next time, start it from the Model step in one click.`);
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }

  /** Deletes a saved profile (after the inline "Delete?" confirmation). */
  async function deleteProfile(id: string) {
    setBusy(true); setError('');
    try { onSaved(await unwrap(window.novi.deleteSessionProfile(id))); setConfirmDelete(null); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }

  /**
   * Fills the whole setup from a saved profile.
   *
   * Steps, in order: behavioral framework, model (switching connection if needed), document folders
   * (a profile without folders loads none), then either shows the Instructions step for review
   * (startNow false) or checks the connection and starts the session exactly as Start would (startNow true).
   *
   * If a step fails, the error is shown on the step where it happened (`reached`), and folders that
   * no longer have readable files are reported instead of failing the whole profile.
   */
  async function applyProfile(profile: SessionProfile, startNow: boolean) {
    if (busy) return;
    const current = ++attempt.current;
    const stale = () => current !== attempt.current;
    let reached: Section = 'model';
    setBusy(true); setError(''); setProfileNotice(''); setPresetNotice(''); setConfirmDelete(null);
    setCompany(profile.company); setTargetRole(profile.role); setPurpose(profile.purpose); setPurposeEdited(true);
    setFields(profile.fields.map((field) => ({ ...field }))); setStartMode(profile.mode); setApplied(null); setUndo(null);
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
  if (!preflightDone) return <SessionPreflight state={state} onContinue={() => { continueFromGetReady(state.user!.id); setPreflightDone(true); }} onSettings={() => setSettings(true)} />;
  return <main className="context-page">
    <header className="context-header">
      <div className="context-header-identity"><Brand /></div>
      <div className="context-header-actions">
        {/* Get ready only opens by itself once per launch; this brings it back (the ready card and practice coach point here).
            Its Continue button returns to this setup, and everything typed here is kept because this page stays mounted. */}
        <button className="text-button" disabled={busy} onClick={() => setPreflightDone(false)}>Run Get ready</button>
        {/* Sign out lives in Settings › General › Data & account, away from the button people use most here. */}
        <button className="text-button" disabled={busy} onClick={() => setSettings(true)}>Settings</button>
      </div>
    </header>

    <div className="context-workspace">
      <aside className="context-rail">
        <div className="context-rail-title"><h1>Session setup</h1></div>
        <nav className="context-section-nav" aria-label="Session setup">
          {([
            ['model', 'Model', Cpu, modelReady],
            ['sources', 'Documents', FolderOpen, folders.length > 0],
            ['brief', 'Instructions', FileText, briefReady],
          ] as const).map(([id, label, Icon, done]) => <button key={id} id={`context-tab-${id}`} type="button" aria-current={section === id ? 'step' : undefined} aria-controls={`context-panel-${id}`} className={`context-nav-item ${section === id ? 'active' : ''}`} disabled={busy || (id !== 'model' && !modelReady)} onClick={() => setSection(id)}>
            <Icon size={16} /><span>{label}</span>{done && <Check className="context-nav-check" size={14} aria-label="Complete" />}
          </button>)}
        </nav>
      </aside>

      <div className="context-main-panel">
        <section id="context-panel-model" aria-labelledby="context-tab-model" className="context-panel-content" hidden={section !== 'model'}>
          <div className="context-panel-heading"><div className="context-panel-icon"><Cpu size={19} /></div><div><span className="context-overline">STEP 1 OF 3</span><h2>Choose a model</h2></div></div>
          {profiles.length ? <div className="profile-list" role="group" aria-label="Saved profiles">
            <h3><Bookmark size={14} />Saved profiles</h3>
            {profiles.map((profile) => <div className="profile-card" key={profile.id}>
              <div className="profile-card-text"><strong title={profile.name}>{profile.name}</strong>
                <span>{modeName(profile.mode)} · {profile.model} · {profile.folders.length ? folderCount(profile.folders.length) : 'No documents'}</span></div>
              {confirmDelete === profile.id
                ? <div className="profile-card-actions"><span>Delete?</span><button type="button" className="danger-button" disabled={busy} onClick={() => void deleteProfile(profile.id)}>Delete</button><button type="button" className="text-button" disabled={busy} onClick={() => setConfirmDelete(null)}>Keep</button></div>
                : <div className="profile-card-actions">
                  <button type="button" className="primary" disabled={busy} aria-label={`Start ${profile.name}`} onClick={() => void applyProfile(profile, true)}><Play size={14} />Start</button>
                  <button type="button" className="text-button" disabled={busy} aria-label={`Edit ${profile.name}`} onClick={() => void applyProfile(profile, false)}><Pencil size={14} />Edit</button>
                  <button type="button" className="icon-button" disabled={busy} aria-label={`Delete ${profile.name}`} title="Delete profile" onClick={() => setConfirmDelete(profile.id)}><Trash2 size={14} /></button>
                </div>}
            </div>)}
          </div> : null}
          <div className="context-control-block"><ProviderPicker state={state} disabled={busy} onSaved={onSaved} onError={setError} onReady={setModelReady} />
            {!connection && <p className="managed-note">No enabled connection is available. Enable one in Settings.</p>}
          </div>
          <div className="context-skip">
            <button type="button" className="text-button" disabled={busy || !modelReady} onClick={() => void startEmpty()}><FastForward size={15} />Start an empty chat instead</button>
          </div>
        </section>

        <section id="context-panel-sources" aria-labelledby="context-tab-sources" className="context-panel-content" hidden={section !== 'sources'}>
          <div className="context-panel-heading"><div className="context-panel-icon"><FolderOpen size={19} /></div><div><span className="context-overline">STEP 2 OF 3 · OPTIONAL</span><h2>Add documents</h2></div></div>
          <div className="context-sources-toolbar"><button className="secondary" disabled={busy || !connection} onClick={() => void loadFolders()}><FolderOpen size={15} />{busy ? 'Working…' : folders.length ? 'Replace folders' : 'Choose folders'}</button><span>TXT and PDF · up to 30 files / 80k characters</span></div>
          <div className="context-folder-list">
            {folders.length ? folders.map((folder) => <div className="context-folder" key={folder.id}><div className="context-folder-row"><FolderOpen size={16} /><strong title={folder.name}>{folder.name}</strong><span>{folder.files.length} files · {folder.characters.toLocaleString()} chars</span><button className="icon-button" disabled={busy} aria-label={`Remove ${folder.name}`} onClick={() => setFolders((items) => items.filter((f) => f.id !== folder.id))}><X size={14} /></button></div><details><summary>Included files</summary><ul>{folder.files.map((file) => <li key={file}>{file}</li>)}</ul></details></div>) : <div className="context-empty-sources"><FolderOpen size={25} /><strong>No documents yet</strong></div>}
          </div>
        </section>

        <section id="context-panel-brief" aria-labelledby="context-tab-brief" className="context-panel-content" hidden={section !== 'brief'}>
          <div className="context-panel-heading"><div className="context-panel-icon"><FileText size={19} /></div><div><span className="context-overline">STEP 3 OF 3</span><h2>Set instructions</h2></div></div>
          <div className="context-brief-editor">
            <label htmlFor="context-purpose">Purpose <span>Required</span></label>
            <textarea id="context-purpose" ref={purposeInput} required maxLength={2000} value={purposeValue} disabled={busy}
              onChange={(e) => { setPurpose(e.target.value); setPurposeEdited(true); }} placeholder="Choose a session type below and this fills in, or write your own." />
            {purposeEdited && startMode && <button type="button" className="text-button" disabled={busy} onClick={() => setPurposeEdited(false)}>Use suggested purpose</button>}

            <fieldset className="context-presets" disabled={busy}><legend>Session type <span>Required</span></legend>
              <div ref={modeOptions} className="context-preset-options context-mode-options">{SESSION_MODES.map((mode) => <button type="button" key={mode.id} aria-pressed={startMode === mode.id} onClick={() => chooseMode(mode.id)}><strong>{mode.name}</strong><span>{mode.description}</span></button>)}</div>
              {startMode && startMode !== 'normal' && <details className="context-preset-preview"><summary>How AI will answer</summary><p>{modeInstructions(startMode)}</p></details>}
              {startMode === 'behavioral' && <div className="context-framework"><span>Answer framework</span><BehavioralModeHUD framework={behavioralFramework} onSelectFramework={(framework) => void setBehavioralFramework(framework)} /></div>}
            </fieldset>

            <div className="context-brief-row">
              <label>Company <span>Optional</span><input maxLength={120} value={company} disabled={busy} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Acme" /></label>
              <label>Role you’re interviewing for <span>Optional</span><input maxLength={120} value={targetRole} disabled={busy} onChange={(e) => setTargetRole(e.target.value)} placeholder="e.g. Software Engineer II" /></label>
            </div>

            <fieldset className="context-presets" disabled={busy}>
              <legend>Presets <span>Optional</span></legend>
              <label htmlFor="context-preset-role">Role type</label>
              <select id="context-preset-role" value={roleIndex} onChange={(event) => setRoleIndex(Number(event.target.value))}>
                {SESSION_ROLES.map((item, index) => <option key={item.name} value={index}>{item.name}</option>)}
              </select>
              <div className="context-preset-options" role="group" aria-label={`${role.name} presets`}>
                {role.presets.map((item, index) => <button type="button" key={item.name} aria-pressed={applied?.role === roleIndex && applied.preset === index} onClick={() => applyPreset(index)}>
                  <strong>{item.name}</strong><span>{item.description}</span>
                </button>)}
              </div>
              <div className="context-preset-notice" role="status">{presetNotice}{undo && <button type="button" className="text-button" onClick={undoPreset}>Undo</button>}</div>
            </fieldset>

            <details ref={moreOptions} className="custom-fields-accordion"><summary>More options</summary>
              <div className="context-fields">{fields.map((field, index) => <div className="context-field" key={index}><input aria-label={`Instruction ${index + 1} name`} maxLength={80} value={field.label} disabled={busy} onChange={(e) => editField(index, { label: e.target.value })} /><textarea aria-label={`${field.label || `Instruction ${index + 1}`} details`} maxLength={2000} value={field.value} disabled={busy} onChange={(e) => editField(index, { value: e.target.value })} placeholder="Add a detail…" /></div>)}</div>
              <fieldset className="profile-save" disabled={busy}>
                <legend>Save as a profile</legend>
                <div className="profile-save-row">
                  <input aria-label="Profile name" maxLength={60} value={nameForProfile} placeholder="e.g. Acme SWE round 2" onChange={(e) => { setProfileName(e.target.value); setProfileNameEdited(true); setProfileNotice(''); }} />
                  <button type="button" className="secondary" disabled={!canStart || !nameForProfile.trim()} onClick={() => void saveProfile()}><Bookmark size={14} />{existingProfile ? 'Update profile' : 'Save profile'}</button>
                </div>
                <span className="context-preset-notice" role="status">{profileNotice}</span>
              </fieldset>
            </details>
          </div>
        </section>
      </div>
    </div>

    <footer className="context-footer">
      <div className="context-footer-status" role="status">{error ? <span className="error" role="alert">{error}</span> : checking ? 'Checking connection…' : busy ? 'Working…' : ''}</div>
      <div className="context-footer-actions">
        {needs && !busy && <span className="context-needs">{needs}</span>}
        {section !== 'model' && <button type="button" className="text-button" disabled={busy} onClick={() => setSection(section === 'brief' ? 'sources' : 'model')}><ArrowLeft size={15} />Back</button>}
        {section === 'brief'
          ? <button type="button" className="primary context-start" aria-disabled={!canStart || undefined} disabled={busy} onClick={() => canStart ? void start() : showMissing()}><Play size={15} />{busy ? 'Starting…' : 'Start session'}</button>
          : <button type="button" className="primary context-start" disabled={busy || !modelReady} onClick={() => setSection(section === 'model' ? 'sources' : 'brief')}>Next<ArrowRight size={15} /></button>}
      </div>
    </footer>
  </main>;
}
