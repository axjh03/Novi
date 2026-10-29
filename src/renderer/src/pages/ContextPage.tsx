import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, Building2, Check, Cpu, Download, FastForward, FileText, FolderOpen, LoaderCircle, MessageSquare, Pencil, Play, Sparkles, Trash2, X } from 'lucide-react';
import type { AppMode, ContextFolder, SessionProfile, Snapshot, VocabularyLevel } from '../../../shared/types';
import { activeConnection } from '../../../shared/providers';
import { ANSWER_STYLES, DEFAULT_INTERVIEW_PROFILE, INTERVIEW_DOMAINS, interviewSkill, profileFileKind, wordCount, type InterviewProfile, type ProfileResearch } from '../../../shared/interviewProfile';
import { Brand } from '../components/Brand';
import { ProviderPicker } from '../components/chat/ProviderPicker';
import { SettingsPage } from './SettingsPage';
import { SessionPreflight } from '../components/SessionPreflight';
import { BehavioralModeHUD } from '../components/BehavioralModeHUD';
import { errorText, unwrap } from '../services/api';
import { continueFromGetReady, getReadyContinued, recordReadiness } from '../services/readiness';
import { defaultPurpose } from '../context/sessionPresets';
import { useAppMode } from '../context/AppModeContext';
import { SESSION_MODES, VOCABULARY_LEVELS } from '../../../shared/sessionModes';
import { fallbackMode, lockedMessage } from '../../../shared/plans';
import { PlanLock } from '../components/PlanLock';

const STEPS = [
  { id: 'sources', name: 'Load profile', Icon: FolderOpen },
  { id: 'brief', name: 'Instructions', Icon: FileText },
  { id: 'style', name: 'Answer style', Icon: MessageSquare },
  { id: 'model', name: 'Model', Icon: Cpu },
] as const;
type Section = typeof STEPS[number]['id'];
const modeName = (mode: AppMode) => SESSION_MODES.find(item => item.id === mode)?.name ?? mode;

/** One candidate folder, followed by interview preferences, speaking style and model selection. */
export function ContextPage({ state, onSaved, onSignOut }: { state: Snapshot; onSaved: (state: Snapshot) => void; onSignOut: () => void }) {
  const { setAppMode, allows, behavioralFramework, setBehavioralFramework } = useAppMode();
  const [settings, setSettings] = useState(false);
  const [preflightDone, setPreflightDone] = useState(() => getReadyContinued(state.user!.id));
  const [section, setActiveSection] = useState<Section>('sources');
  const [visitedSteps, setVisitedSteps] = useState<Section[]>(['sources']);
  const [direction, setDirection] = useState('forward');
  const index = STEPS.findIndex(step => step.id === section);
  function setSection(next: Section) { setDirection(STEPS.findIndex(step => step.id === next) < index ? 'backward' : 'forward'); setVisitedSteps(current => current.includes(next) ? current : [...current, next]); setActiveSection(next); }
  const [folders, setFolders] = useState<ContextFolder[]>([]);
  const [loadedSavedProfile, setLoadedSavedProfile] = useState(false);
  const [interview, setInterview] = useState<InterviewProfile>({ ...DEFAULT_INTERVIEW_PROFILE, customAnswerStyle: state.settings?.customAnswerStyle || '' });
  const updateInterview = (patch: Partial<InterviewProfile>) => setInterview(current => ({ ...current, ...patch }));
  const [vocabulary, setVocabulary] = useState<VocabularyLevel>('everyday');
  const vocabularyIndex = VOCABULARY_LEVELS.findIndex(level => level.id === vocabulary);
  const [startMode, setStartMode] = useState<AppMode | null>(null);
  const [company, setCompany] = useState(''), [targetRole, setTargetRole] = useState('');
  const [purpose, setPurpose] = useState(''), [purposeEdited, setPurposeEdited] = useState(false);
  const purposeValue = purposeEdited ? purpose : defaultPurpose(startMode, { company, role: targetRole });
  const [fields, setFields] = useState(['Role / perspective', 'Level / experience', 'Output format', 'Additional instructions'].map(label => ({ label, value: '' })));
  const [research, setResearch] = useState<ProfileResearch | null>(null);
  const [busy, setBusy] = useState(false), [checking, setChecking] = useState(false), [researching, setResearching] = useState(false), [error, setError] = useState('');
  const [modelReady, setModelReady] = useState(false);
  const [profileName, setProfileName] = useState(''), [profileNameEdited, setProfileNameEdited] = useState(false);
  const [profileNotice, setProfileNotice] = useState(''), [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [connectionNotice, setConnectionNotice] = useState('');
  const purposeInput = useRef<HTMLTextAreaElement>(null), modeOptions = useRef<HTMLDivElement>(null);
  const attempt = useRef(0);
  const researchAttempt = useRef(0);
  useEffect(() => () => { attempt.current++; researchAttempt.current++; }, []);
  const connection = activeConnection(state.settings!);
  useEffect(() => { setConnectionNotice(''); }, [connection?.id, connection?.model]);
  const files = folders.flatMap(folder => folder.files);
  const hasJobDescription = Boolean(interview.jobDescriptionUrl.trim() || interview.jobDescriptionText.trim() || files.some(file => ['Job description', 'Profile bundle'].includes(profileFileKind(file))));
  const profileReady = loadedSavedProfile || hasJobDescription;
  const briefReady = Boolean(startMode && purposeValue.trim() && wordCount(interview.additionalContext) <= 100);
  const styleReady = interview.answerStyle !== 'custom' || Boolean(interview.customAnswerStyle?.trim());
  const canStart = !busy && !researching && profileReady && briefReady && styleReady && modelReady && section === 'model';
  const profiles = state.settings!.sessionProfiles || [];
  const nameForProfile = profileNameEdited ? profileName : ([folders[0]?.name, company, targetRole].filter(Boolean).join(' · ') || purposeValue).replace(/\s+/g, ' ').slice(0, 60);
  const existingProfile = profiles.find(profile => profile.name.toLowerCase() === nameForProfile.trim().toLowerCase());
  const missing = !profileReady ? 'profile' : !startMode ? 'mode' : !purposeValue.trim() ? 'purpose' : wordCount(interview.additionalContext) > 100 ? 'notes' : !styleReady ? 'style' : !modelReady ? 'model' : null;
  useEffect(() => { researchAttempt.current++; setResearching(false); }, [connection?.id, connection?.model, settings]);

  function changeDescription(patch: Partial<InterviewProfile>) {
    researchAttempt.current++;
    setResearching(false); setResearch(null); setLoadedSavedProfile(false);
    updateInterview({ ...(research?.companyUrl && interview.companyUrl === research.companyUrl ? { companyUrl: '' } : {}), ...patch });
  }

  async function loadFolders() {
    researchAttempt.current++; setResearching(false);
    setBusy(true); setError('');
    try {
      const loaded = await unwrap(window.novi.pickContextFolders());
      if (loaded.length) { setFolders(loaded); setLoadedSavedProfile(false); setResearch(null); }
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  async function generateResearch() {
    if (!connection?.model || !modelReady) { setError('Choose a model before fetching the profile, then return to Load profile.'); setSection('model'); return; }
    const current = ++researchAttempt.current;
    setResearching(true); setError('');
    try {
      const result = await unwrap(window.novi.researchProfile({ folderIds: folders.map(folder => folder.id), jobDescriptionUrl: interview.jobDescriptionUrl, companyUrl: interview.companyUrl, jobDescriptionText: interview.jobDescriptionText }));
      if (current !== researchAttempt.current) return;
      setResearch(result);
      setCompany(result.company); setTargetRole(result.role);
      setVocabulary(result.vocabulary);
      const jobDescriptionText = result.jobDescriptionText || interview.jobDescriptionText;
      updateInterview({ domain: result.domain, experienceYears: result.experienceYears ?? 0, companyUrl: result.companyUrl || interview.companyUrl, companyBrief: result.summary, companyValues: result.companyValues, jobDescriptionText });
    } catch (cause) { if (current === researchAttempt.current) setError(`Profile fetch failed (${connection.name} · ${connection.model}): ${errorText(cause)}`); }
    finally { if (current === researchAttempt.current) setResearching(false); }
  }
  function prepareProfile(profile: InterviewProfile, sources: ContextFolder[], employer: string, role: string) {
    if (profile.jobDescriptionUrl.trim() && !profile.jobDescriptionText.trim() && !sources.some(folder => folder.files.some(file => ['Job description', 'Profile bundle'].includes(profileFileKind(file))))) throw new Error('Click Fetch to load the job posting, or paste its text before starting.');
    return { interview: profile, company: employer, role };
  }
  async function checkBeforeStart() {
    setConnectionNotice('Checking internet speed…');
    let internet: string;
    try { internet = await unwrap(window.novi.testInternet()); recordReadiness('internet', { ok: true, detail: internet }); }
    catch (cause) { internet = errorText(cause); recordReadiness('internet', { ok: false, detail: internet }); }
    setConnectionNotice(`${internet} · Checking ${connection?.model || 'selected model'}…`);
    const started = performance.now();
    try {
      await unwrap(window.novi.testConnection());
      const detail = `${connection?.name} · ${connection?.model} answered in ${Math.round(performance.now() - started)} ms`;
      recordReadiness('ai', { ok: true, detail }); setConnectionNotice(detail);
    } catch (cause) {
      const detail = errorText(cause);
      recordReadiness('ai', { ok: false, detail }); setConnectionNotice(detail);
      throw cause;
    }
  }
  async function startEmpty() {
    if (busy || !modelReady) return;
    const current = ++attempt.current;
    setBusy(true); setChecking(true); setError('');
    try {
      await checkBeforeStart();
      if (current !== attempt.current) return;
      setChecking(false);
      const next = await unwrap(window.novi.startEmptySession());
      setAppMode(fallbackMode(state.user?.features)); onSaved(next);
    } catch (cause) { if (current === attempt.current) setError(errorText(cause)); }
    finally { if (current === attempt.current) { setBusy(false); setChecking(false); } }
  }
  async function start() {
    if (!canStart || !startMode) return;
    if (!allows(startMode)) { setError(lockedMessage(startMode)); return; }
    const current = ++attempt.current;
    setBusy(true); setChecking(true); setError('');
    try {
      const prepared = prepareProfile(interview, folders, company, targetRole);
      setResearching(false);
      if (current !== attempt.current) return;
      await checkBeforeStart();
      if (current !== attempt.current) return;
      setChecking(false);
      const next = await unwrap(window.novi.startContext({ connectionId: connection!.id, model: connection!.model, folderIds: folders.map(folder => folder.id), purpose: (purposeEdited ? purposeValue : defaultPurpose(startMode, prepared)).trim(), ...prepared, vocabulary, fields }));
      setAppMode(startMode); onSaved(next);
    } catch (cause) { if (current === attempt.current) setError(errorText(cause)); }
    finally { if (current === attempt.current) { setBusy(false); setChecking(false); setResearching(false); } }
  }
  function showMissing() {
    if (missing === 'profile') { setSection('sources'); setError('Add a job description URL, paste its text, or include job-description.pdf / .txt in your profile folder.'); return; }
    if (missing === 'style') { setSection('style'); setError('Paste your custom answer style, or choose a preset.'); return; }
    if (missing === 'model') { setSection('model'); return; }
    setSection('brief');
    setError(missing === 'notes' ? 'Keep your additional context to 100 words.' : missing === 'mode' ? 'Choose a starting session type.' : 'Add a purpose.');
    window.setTimeout(() => { const target = missing === 'purpose' ? purposeInput.current : modeOptions.current?.querySelector('button'); target?.focus(); }, 0);
  }
  async function saveProfile() {
    if (!canStart || !startMode || !nameForProfile.trim()) return;
    setBusy(true); setError(''); setProfileNotice('');
    try {
      onSaved(await unwrap(window.novi.saveSessionProfile({ name: nameForProfile.trim(), folderIds: folders.map(folder => folder.id), mode: startMode, framework: behavioralFramework, company, role: targetRole, purpose: purposeValue.trim(), vocabulary, interview, fields })));
      setProfileNotice(`${existingProfile ? 'Updated' : 'Saved'} “${nameForProfile.trim()}”. Load it from the first step next time.`);
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  async function deleteProfile(id: string) {
    setBusy(true); setError('');
    try { onSaved(await unwrap(window.novi.deleteSessionProfile(id))); setConfirmDelete(null); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  async function applyProfile(profile: SessionProfile, startNow: boolean) {
    if (busy) return;
    if (!allows(profile.mode)) { setError(lockedMessage(profile.mode)); return; }
    const current = ++attempt.current;
    researchAttempt.current++; setResearching(false);
    setBusy(true); setError(''); setProfileNotice(''); setConfirmDelete(null); setResearch(null);
    setCompany(profile.company); setTargetRole(profile.role); setPurpose(profile.purpose); setPurposeEdited(true);
    setVocabulary(profile.vocabulary ?? 'everyday'); setInterview({ ...DEFAULT_INTERVIEW_PROFILE, ...profile.interview });
    setFields(profile.fields.map(field => ({ ...field }))); setStartMode(profile.mode);
    setProfileName(profile.name); setProfileNameEdited(true);
    try {
      if (profile.framework !== behavioralFramework) await setBehavioralFramework(profile.framework);
      if (current !== attempt.current) return;
      const loaded = await unwrap(window.novi.loadSessionProfileFolders(profile.id));
      if (current !== attempt.current) return;
      setFolders(loaded); setLoadedSavedProfile(true);
      if (!startNow) { setSection('sources'); setProfileNotice(`Loaded “${profile.name}”. Review your preferences before starting.`); return; }
      const prepared = profile.interview ? prepareProfile(profile.interview, loaded, profile.company, profile.role) : { company: profile.company, role: profile.role };
      if (current !== attempt.current) return;
      setResearching(false); setChecking(true); await checkBeforeStart();
      if (current !== attempt.current) return;
      setChecking(false);
      const next = await unwrap(window.novi.startContext({ connectionId: connection!.id, model: connection!.model, folderIds: loaded.map(folder => folder.id), purpose: profile.purpose, vocabulary: profile.vocabulary, ...prepared, fields: profile.fields }));
      setAppMode(profile.mode); onSaved(next);
    } catch (cause) { if (current === attempt.current) { setSection('sources'); setError(errorText(cause)); } }
    finally { if (current === attempt.current) { setBusy(false); setChecking(false); setResearching(false); } }
  }
  async function saveCustomStyle() {
    setBusy(true); setError('');
    try {
      onSaved(await unwrap(window.novi.saveSettings({ ...state.settings!, customAnswerStyle: interview.customAnswerStyle?.trim() || '' })));
      setProfileNotice('Custom answer style saved locally.');
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  async function exportSkills() {
    setBusy(true); setError('');
    try { if (await unwrap(window.novi.exportInterviewSkills({ interview, vocabulary }))) setProfileNotice('Exported a separate SKILL.md for each of the seven session types.'); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  if (settings) return <SettingsPage state={state} onSaved={onSaved} onBack={() => setSettings(false)} onSignOut={onSignOut} onCleared={() => {}} />;
  if (!preflightDone) return <SessionPreflight state={state} onContinue={() => { continueFromGetReady(state.user!.id); setPreflightDone(true); }} onChooseModel={() => { setSection('model'); continueFromGetReady(state.user!.id); setPreflightDone(true); }} onSettings={() => setSettings(true)} />;
  return <main className="context-page interview-setup" data-direction={direction}>
    <header className="context-header"><div className="context-header-identity"><Brand /></div><div className="context-header-actions"><button className="text-button" disabled={busy} onClick={() => setPreflightDone(false)}>System Check</button><button className="text-button" disabled={busy} onClick={() => setSettings(true)}>Settings</button></div></header>
    <div className="context-workspace">
      <aside className="context-rail"><div className="context-rail-title"><h1>Session setup</h1><div className="context-setup-progress" role="progressbar" aria-label="Session setup step" aria-valuemin={1} aria-valuemax={4} aria-valuenow={index + 1}><span style={{ width: `${(index + 1) / 4 * 100}%` }} /></div><span className="context-step-count">STEP 0{index + 1} / 04</span></div>
        <nav className="context-section-nav" aria-label="Session setup">{STEPS.map(({ id, name, Icon }) => <button key={id} id={`context-tab-${id}`} type="button" aria-current={section === id ? 'step' : undefined} aria-controls={`context-panel-${id}`} className={`context-nav-item ${section === id ? 'active' : ''}`} disabled={busy} onClick={() => setSection(id)}><Icon size={16} /><span>{name}</span>{visitedSteps.includes(id) && (id === 'sources' ? profileReady : id === 'brief' ? briefReady : id === 'style' ? Boolean(startMode) : modelReady) && <Check className="context-nav-check" size={14} aria-label="Complete" />}</button>)}</nav>
      </aside>
      <div className="context-main-panel">
        <section id="context-panel-sources" aria-labelledby="context-tab-sources" className="context-panel-content" hidden={section !== 'sources'}>
          <div className="context-panel-heading"><div className="context-panel-icon"><FolderOpen size={19} /></div><div><span className="context-overline">STEP 1 OF 4</span><h2>Load your profile</h2><p>Add your job description and background, then click Fetch.</p></div></div>
          <div className="interview-form">
              <label>Job description<textarea className="profile-job-description" maxLength={20_000} value={interview.jobDescriptionText} disabled={busy} placeholder="Paste the job description here. Click Fetch when you’re ready to fill in the company details." onChange={event => changeDescription({ jobDescriptionText: event.target.value })} /></label>
              <label>Job posting URL <span className="muted">Optional</span><input type="url" maxLength={2000} value={interview.jobDescriptionUrl} disabled={busy} placeholder="https://company.com/careers/your-role" onChange={event => changeDescription({ jobDescriptionUrl: event.target.value })} /></label>

            <div className="interview-profile-load"><div><h3>One folder. Your background.</h3><p>Name it <code>Firstname Lastname/</code>. Add <code>resume.pdf</code> and <code>job-description.pdf</code> or <code>.txt</code>. Extra notes are optional.</p></div><button type="button" className="secondary" disabled={busy} onClick={() => void loadFolders()}><FolderOpen size={15} />{folders.length ? 'Replace profile folder' : 'Load profile'}</button></div>
            <details className="interview-details"><summary>File guide & privacy</summary><pre className="profile-folder-guide">{'Firstname Lastname/\n  resume.pdf\n  job-description.txt\n  projects.md       (optional)\n  company.txt       (optional)\n  notes.md         (optional)'}</pre><p className="muted">PDF, TXT and Markdown · up to 30 files / 50 MB. A single <code>profile.md</code> can contain Resume, Job description and Projects sections. Names classify files; your originals stay in place.</p><p className="muted">Loaded text goes to your selected AI model when you generate a briefing or start a session. It is saved in local conversation history as unencrypted text. Delete those conversations or clear history to remove the saved references.</p></details>
            <div className="context-folder-list">{folders.map(folder => <div className="context-folder" key={folder.id}><div className="context-folder-row"><FolderOpen size={16} /><strong title={folder.name}>{folder.name}</strong><span>{folder.files.length} files</span><button type="button" className="icon-button" aria-label={`Remove ${folder.name}`} disabled={busy} onClick={() => setFolders(current => current.filter(item => item.id !== folder.id))}><X size={14} /></button></div><ul className="profile-file-list" aria-label={`${folder.name} classified files`}>{folder.files.map(file => <li key={file}><FileText size={14} /><span>{file.startsWith(folder.name + '/') ? file.slice(folder.name.length + 1) : file}</span><small>{profileFileKind(file)}</small></li>)}</ul></div>)}</div>


              <div className="profile-analysis-bar"><span className="muted" role="status">{researching ? <><LoaderCircle size={15} className="spin" />Loading description and company details…</> : !modelReady ? 'Choose a model to analyze the description.' : research ? 'Details are ready. You can edit everything below.' : 'Click Fetch to analyze the description and look up the company.'}</span><button type="button" className="secondary" disabled={busy || researching || !hasJobDescription} onClick={() => void generateResearch()}><Sparkles size={14} />Fetch</button></div>
              {!modelReady && <button type="button" className="text-button" onClick={() => setSection('model')}>Choose model<ArrowRight size={14} /></button>}
              <section className="interview-research" aria-busy={researching} aria-label="Company details">
                <div className="profile-company-heading">{research?.logoDataUrl ? <img src={research.logoDataUrl} alt={`${company || 'Company'} logo`} className="profile-company-logo" onError={event => { event.currentTarget.hidden = true; }} /> : <Building2 size={22} aria-hidden="true" />}<h3>Company & role</h3>{research && !research.logoDataUrl && <small className="muted">Logo unavailable</small>}</div>
                <div className="context-brief-row"><label>Company<input maxLength={120} value={company} disabled={busy || researching} onChange={event => setCompany(event.target.value)} /></label><label>Target role<input maxLength={120} value={targetRole} disabled={busy || researching} onChange={event => setTargetRole(event.target.value)} /></label></div>
                <label>Company website<input type="url" maxLength={2000} value={interview.companyUrl} disabled={busy || researching} placeholder="Discovered from the description, or add a website" onChange={event => updateInterview({ companyUrl: event.target.value })} /></label>
                <label>Company values & culture<textarea maxLength={2000} value={interview.companyValues || ''} disabled={busy || researching} placeholder="Verified values and culture will appear here." onChange={event => updateInterview({ companyValues: event.target.value })} /></label>
                <label>Company & role briefing<textarea className="profile-company-brief" maxLength={4000} value={interview.companyBrief} disabled={busy || researching} placeholder="A detailed company overview, role expectations and interview preparation will appear here." onChange={event => updateInterview({ companyBrief: event.target.value })} /></label>
                {research && <div className="interview-research-sources">{research.sources.length > 0 && <details><summary>Sources ({research.sources.length})</summary><ul aria-label="Research sources">{research.sources.map(source => <li key={source.url}><span>{source.title}</span><code>{source.url}</code></li>)}</ul></details>}{research.warnings.map(warning => <p className="muted" key={warning}>{warning}</p>)}</div>}
              </section>
              <section className="profile-detection" aria-label="Detected interview preferences"><h3>Tailored to this role</h3>
                <fieldset className="context-presets context-vocabulary" disabled={busy || researching}><legend>Experience</legend><label htmlFor="interview-experience">Years of experience: <strong>{interview.experienceYears}</strong></label><input id="interview-experience" type="range" min={0} max={15} step={1} value={interview.experienceYears} aria-valuetext={interview.experienceYears === 0 ? 'Entry level, 0 years' : `${interview.experienceYears} years`} onChange={event => updateInterview({ experienceYears: Number(event.target.value) })} /><div className="context-vocabulary-labels" aria-hidden="true"><span>0 · Entry level</span><span>15 years</span></div><p className="muted">Detected from the role’s requirements. Adjust it for your preparation; your resume supplies the facts.</p>{research?.experienceYears === null && <p className="muted">Years of experience weren’t stated in the description. Choose your preferred level.</p>}</fieldset>
                <div className="interview-domain-row"><label>Domain<select value={interview.domain} disabled={busy || researching} onChange={event => updateInterview({ domain: event.target.value as InterviewProfile['domain'] })}>{INTERVIEW_DOMAINS.map(domain => <option key={domain.id} value={domain.id}>{domain.name}</option>)}</select></label></div>
                <fieldset className="context-presets context-vocabulary" disabled={busy || researching}><legend>Vocabulary complexity</legend><label htmlFor="context-vocabulary">Word choice: <strong>{vocabularyIndex + 1} / {VOCABULARY_LEVELS.length} · {VOCABULARY_LEVELS[vocabularyIndex].name}</strong></label><input id="context-vocabulary" type="range" min={1} max={VOCABULARY_LEVELS.length} step={1} value={vocabularyIndex + 1} aria-valuetext={`${vocabularyIndex + 1} of ${VOCABULARY_LEVELS.length}, ${VOCABULARY_LEVELS[vocabularyIndex].name}`} aria-describedby="context-vocabulary-description" onChange={event => setVocabulary(VOCABULARY_LEVELS[Number(event.target.value) - 1].id)} /><div className="context-vocabulary-labels" aria-hidden="true"><span>1 · Plain</span><span>4 · Intern</span><span>8 · CRACKED</span></div><p id="context-vocabulary-description" className="muted">{VOCABULARY_LEVELS[vocabularyIndex].instructions}</p></fieldset>
              </section>
            {profiles.length > 0 && <section className="profile-list" role="group" aria-label="Saved profiles"><h3><Bookmark size={14} />Saved interview setups</h3>{profiles.map(profile => <div className="profile-card" key={profile.id}><div className="profile-card-text"><strong>{profile.name}</strong><span>{modeName(profile.mode)}{profile.company ? ` · ${profile.company}` : ''}</span></div>{confirmDelete === profile.id ? <div className="profile-card-actions"><span>Delete?</span><button type="button" className="danger-button" disabled={busy} onClick={() => void deleteProfile(profile.id)}>Delete</button><button type="button" className="text-button" disabled={busy} onClick={() => setConfirmDelete(null)}>Keep</button></div> : <div className="profile-card-actions"><button type="button" className="primary" disabled={busy} aria-label={`Start ${profile.name}`} onClick={() => void applyProfile(profile, true)}><Play size={14} />Start</button><button type="button" className="text-button" disabled={busy} aria-label={`Edit ${profile.name}`} onClick={() => void applyProfile(profile, false)}><Pencil size={14} />Review</button><button type="button" className="icon-button" aria-label={`Delete ${profile.name}`} disabled={busy} onClick={() => setConfirmDelete(profile.id)}><Trash2 size={14} /></button></div>}</div>)}</section>}
          </div>
        </section>
        <section id="context-panel-brief" aria-labelledby="context-tab-brief" className="context-panel-content" hidden={section !== 'brief'}>
          <div className="context-panel-heading"><div className="context-panel-icon"><FileText size={19} /></div><div><span className="context-overline">STEP 2 OF 4</span><h2>Make it fit your interview</h2></div></div>
          <div className="interview-form">
            <fieldset className="context-presets" disabled={busy}><legend>Starting session type</legend><p className="muted">You can change the mode during the session.</p><div ref={modeOptions} className="context-preset-options context-mode-options">{SESSION_MODES.map(mode => { const locked = !allows(mode.id); return <button type="button" key={mode.id} className={locked ? 'plan-locked' : undefined} aria-pressed={startMode === mode.id} aria-disabled={locked || undefined} title={locked ? lockedMessage(mode.id) : undefined} onClick={() => { if (locked) setError(lockedMessage(mode.id)); else { setStartMode(mode.id); setError(''); } }}><strong>{mode.name}{locked && <PlanLock feature={mode.id} />}</strong><span>{mode.description}</span></button>; })}</div>{startMode === 'behavioral' && <BehavioralModeHUD framework={behavioralFramework} onSelectFramework={framework => void setBehavioralFramework(framework)} />}</fieldset>
            <label>Purpose<textarea ref={purposeInput} required maxLength={2000} value={purposeValue} disabled={busy} placeholder="Choose a session type to suggest a purpose, or write your own." onChange={event => { setPurpose(event.target.value); setPurposeEdited(true); }} /></label>{purposeEdited && <button type="button" className="text-button" disabled={busy} onClick={() => setPurposeEdited(false)}>Use suggested purpose</button>}

            <label>Anything else Novi should know? <span className="muted">Up to 100 words</span><textarea maxLength={4000} value={interview.additionalContext} disabled={busy} onChange={event => updateInterview({ additionalContext: event.target.value })} /><small className={wordCount(interview.additionalContext) > 100 ? 'error' : 'muted'}>{wordCount(interview.additionalContext)} / 100 words</small></label>
          </div>
        </section>
        <section id="context-panel-style" aria-labelledby="context-tab-style" className="context-panel-content" hidden={section !== 'style'}>
          <div className="context-panel-heading"><div className="context-panel-icon"><MessageSquare size={19} /></div><div><span className="context-overline">STEP 3 OF 4</span><h2>How should answers sound?</h2><p>Choose a starting style. Switch between these in the chat controls at any time.</p></div></div>
          <div className="interview-form"><div className="context-preset-options interview-answer-styles" role="group" aria-label="Answer style">{ANSWER_STYLES.map(style => <button type="button" key={style.id} disabled={busy} aria-pressed={interview.answerStyle === style.id} onClick={() => updateInterview({ answerStyle: style.id })}><strong>{style.name}</strong><span>{style.description}</span></button>)}</div>
            {interview.answerStyle === 'custom' && <div className="custom-answer-style"><label>Your custom answer style<textarea maxLength={4000} value={interview.customAnswerStyle || ''} disabled={busy} placeholder="Paste how you want answers to sound, be structured, or be explained…" onChange={event => { updateInterview({ customAnswerStyle: event.target.value }); setProfileNotice(''); }} /></label><button type="button" className="secondary" disabled={busy || !interview.customAnswerStyle?.trim()} onClick={() => void saveCustomStyle()}><Bookmark size={14} />Save locally</button></div>}
            <details className="interview-details"><summary>Preview or export speaking skills</summary><pre className="profile-skill-preview">{interviewSkill(startMode ?? fallbackMode(state.user?.features), interview, vocabulary)}</pre><button type="button" className="secondary" disabled={busy} onClick={() => void exportSkills()}><Download size={14} />Export speaking skills</button></details>
          </div>
        </section>
        <section id="context-panel-model" aria-labelledby="context-tab-model" className="context-panel-content" hidden={section !== 'model'}>
          <div className="context-panel-heading"><div className="context-panel-icon"><Cpu size={19} /></div><div><span className="context-overline">STEP 4 OF 4</span><h2>Choose your model</h2><p>This model will be used for your session.</p></div></div>
          <div className="context-control-block"><ProviderPicker state={state} disabled={busy || researching} onSaved={onSaved} onError={setError} onReady={setModelReady} />{!connection && <p className="managed-note">Enable a connection in Settings to choose a model.</p>}</div>
          <div className="interview-form"><p className="profile-connection-status" role="status">{checking && <LoaderCircle size={15} className="spin" />}{connectionNotice || 'Internet and the selected model are checked again before your session starts.'}</p><div className="interview-review" aria-label="Session review"><span>{folders[0]?.name || (loadedSavedProfile ? 'Saved profile' : hasJobDescription ? 'Job description loaded' : 'No profile yet')}</span><span>{startMode ? modeName(startMode) : 'Choose a session type'}</span><span>{interview.experienceYears} years · {INTERVIEW_DOMAINS.find(domain => domain.id === interview.domain)!.name}</span><span>{vocabularyIndex + 1}/{VOCABULARY_LEVELS.length} vocabulary · {ANSWER_STYLES.find(style => style.id === interview.answerStyle)!.name}</span></div>
            <fieldset className="profile-save" disabled={busy}><legend>Save this interview setup</legend><div className="profile-save-row"><input aria-label="Profile name" maxLength={60} value={nameForProfile} placeholder="Firstname Lastname · role" onChange={event => { setProfileName(event.target.value); setProfileNameEdited(true); setProfileNotice(''); }} /><button type="button" className="secondary" disabled={!canStart || !nameForProfile.trim()} onClick={() => void saveProfile()}><Bookmark size={14} />{existingProfile ? 'Update profile' : 'Save profile'}</button></div></fieldset>
          </div>
        </section>
      </div>
    </div>
    <footer className="context-footer"><button type="button" className="text-button context-empty-chat" disabled={busy || researching || !modelReady} onClick={() => void startEmpty()}><FastForward size={15} />Start an empty chat</button><div className="context-footer-status" role="status">{error ? <span className="error" role="alert">{error}</span> : researching ? 'Loading description and company details…' : checking ? connectionNotice || 'Checking connection…' : busy ? 'Working…' : profileNotice}</div><div className="context-footer-actions">{section !== 'sources' && <button type="button" className="text-button" disabled={busy} onClick={() => setSection(STEPS[index - 1].id)}><ArrowLeft size={15} />Back</button>}{section === 'model' ? <button type="button" className="primary context-start" aria-disabled={!canStart || undefined} disabled={busy || researching} onClick={() => canStart ? void start() : showMissing()}><Play size={15} />{checking ? 'Checking…' : 'Start session'}</button> : <button type="button" className="primary context-start" disabled={busy || researching} onClick={() => { if ((section === 'sources' && !profileReady) || (section === 'brief' && !briefReady) || (section === 'style' && !styleReady)) showMissing(); else { setError(''); setSection(STEPS[index + 1].id); } }}>Next<ArrowRight size={15} /></button>}</div></footer>
  </main>;
}
