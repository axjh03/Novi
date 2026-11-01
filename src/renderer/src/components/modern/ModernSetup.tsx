import { useRef } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, Building2, Check, Download, FastForward, FileText, FolderOpen, Info, LoaderCircle, Pencil, Play, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react';
import Markdown from 'react-markdown';
import type { Snapshot } from '../../../../shared/types';
import { ANSWER_STYLES, INTERVIEW_DOMAINS, interviewSkill, profileFileKind, wordCount, type InterviewProfile } from '../../../../shared/interviewProfile';
import { SESSION_MODES, VOCABULARY_LEVELS } from '../../../../shared/sessionModes';
import { lockedMessage } from '../../../../shared/plans';
import { ProviderPicker } from '../chat/ProviderPicker';
import { SessionPreflight } from '../SessionPreflight';
import { PlanLock } from '../PlanLock';
import { modeName, SETUP_STEPS, useSessionSetup, type SessionSetup } from '../../hooks/useSessionSetup';
import { Tool } from './DeckKit';

const FRAMEWORKS = [['smart', 'Smart', 'Picks the framework from the question.'], ['star', 'STAR', 'Situation, task, actions, results.'], ['car', 'CAR', 'Context, actions, results.'], ['par', 'PAR', 'Problem, actions, results.'], ['soar', 'SOAR', 'Situation, obstacles, actions, results.']] as const;

/**
 * Session setup as a card: one step at a time, the four steps along the top, Back and Next at
 * the foot, and a saved setup that starts in one click. The same facts and checks as the Classic
 * page (hooks/useSessionSetup.ts); only the presentation is Modern's own.
 */
export function ModernSetup({ state, onSaved, onOpenSettings }: { state: Snapshot; onSaved: (state: Snapshot) => void; onOpenSettings: () => void }) {
  const setup = useSessionSetup(state, onSaved);
  const purposeInput = useRef<HTMLTextAreaElement>(null), modeOptions = useRef<HTMLDivElement>(null);
  const focusMissing = (target: 'purpose' | 'mode' | null) => {
    if (!target) return;
    window.setTimeout(() => { const element = target === 'purpose' ? purposeInput.current : modeOptions.current?.querySelector('button'); element?.focus(); }, 0);
  };
  const { busy, researching, error } = setup;
  if (!setup.preflightDone) {
    return <div className="mod-setup" data-direction="forward">
      <header className="mod-setup-head"><ShieldCheck size={16} aria-hidden="true" /><h1>System check</h1><span className="deck-spacer" /><Tool label="Settings" showLabel tone="quiet" onClick={onOpenSettings} /></header>
      <div className="mod-setup-body"><div className="mod-step"><SessionPreflight embedded state={state} onContinue={() => setup.finishPreflight()} onChooseModel={() => setup.finishPreflight(true)} onSettings={onOpenSettings} /></div></div>
      <footer className="mod-setup-foot"><span className="mod-setup-status">Your connection and devices, checked once a day.</span>
        <Tool icon={<ArrowRight />} label="Continue to setup" showLabel tone="primary" onClick={() => setup.finishPreflight()} /></footer>
    </div>;
  }
  return <div className="mod-setup" data-direction={setup.direction}>
    <header className="mod-setup-head">
      <h1>Set up your session</h1>
      <span className="deck-spacer" />
      <nav className="mod-steps" aria-label="Session setup steps">
        {SETUP_STEPS.map(({ id, name }, index) => {
          const done = setup.visitedSteps.includes(id) && setup.stepReady[id] && setup.section !== id;
          return <button key={id} type="button" className={done ? 'is-done' : ''} aria-current={setup.section === id ? 'step' : undefined} disabled={busy} onClick={() => setup.setSection(id)} title={name}>
            <i aria-hidden="true">{done ? <Check /> : index + 1}</i><span>{name}</span>
          </button>;
        })}
      </nav>
    </header>
    <div className="mod-setup-body">
      {setup.section === 'sources' && <div className="mod-step" key="sources">
        <h2>Who are you talking to, and as whom?</h2>
        <p>Paste the job, add your background folder, then let Novi fetch the briefing.</p>
        {setup.profiles.length > 0 && <div className="mod-rows" role="group" aria-label="Saved setups">
          {setup.profiles.map(profile => <div className="mod-row" key={profile.id}><Bookmark size={15} aria-hidden="true" />
            <span className="mod-row-text"><strong>{profile.name}</strong><small>{modeName(profile.mode)}{profile.company ? ` · ${profile.company}` : ''}</small></span>
            {setup.confirmDelete === profile.id
              ? <><Tool label="Delete" showLabel tone="danger" disabled={busy} onClick={() => void setup.deleteProfile(profile.id)} /><Tool label="Keep" showLabel tone="quiet" disabled={busy} onClick={() => setup.setConfirmDelete(null)} /></>
              : <><Tool icon={<Play />} label={`Start ${profile.name}`} title="Start with this setup" showLabel={false} tone="primary" disabled={busy} onClick={() => void setup.applyProfile(profile, true)} /><Tool icon={<Pencil />} label={`Review ${profile.name}`} title="Load and review" disabled={busy} onClick={() => void setup.applyProfile(profile, false)} /><Tool icon={<Trash2 />} label={`Delete ${profile.name}`} title="Delete" tone="quiet" disabled={busy} onClick={() => setup.setConfirmDelete(profile.id)} /></>}
          </div>)}
        </div>}
        <label className="mod-label"><span>Job posting link</span><input type="url" maxLength={2000} value={setup.interview.jobDescriptionUrl} disabled={busy} placeholder="https://…" onChange={event => setup.changeDescription({ jobDescriptionUrl: event.target.value })} /></label>
        <label className="mod-label"><span>Job description<b>or paste the text</b></span><textarea maxLength={20_000} value={setup.interview.jobDescriptionText} disabled={busy} placeholder="Responsibilities, requirements, anything else about the role…" onChange={event => setup.changeDescription({ jobDescriptionText: event.target.value })} /></label>
        <div className="mod-row"><FolderOpen size={15} aria-hidden="true" />
          <span className="mod-row-text"><strong>{setup.folders.length ? setup.folders.map(folder => folder.name).join(', ') : 'Your background folder'}</strong><small>{setup.folders.length ? `${setup.folders.flatMap(folder => folder.files).length} files · resume, projects, notes` : 'resume.pdf, job description, projects and notes. Originals stay put.'}</small></span>
          <span className="profile-help"><button type="button" className="deck-tool" aria-label="Profile folder guide and privacy" aria-describedby="mod-folder-help"><Info size={14} /></button><span id="mod-folder-help" role="tooltip">Name the folder Firstname Lastname. Add resume.pdf and job-description.pdf or .txt; optional projects.md, company.txt, notes.md. PDF, TXT, Markdown · 30 files / 50 MB. Text goes to your AI and unencrypted chat history; clear history to remove it.</span></span>
          <Tool label={setup.folders.length ? 'Replace' : 'Load folder'} showLabel disabled={busy} onClick={() => void setup.loadFolders()} />
        </div>
        {setup.folders.map(folder => <ul className="profile-file-list" key={folder.id} aria-label={`${folder.name} files`}>{folder.files.map(file => <li key={file}><FileText size={13} /><span>{file.startsWith(folder.name + '/') ? file.slice(folder.name.length + 1) : file}</span><small>{profileFileKind(file)}</small></li>)}<li><X size={13} /><button type="button" className="text-button" disabled={busy} onClick={() => setup.setFolders(current => current.filter(item => item.id !== folder.id))}>Remove {folder.name}</button></li></ul>)}
        <div className="deck-inline">
          <span className="mod-setup-status" role="status">{researching ? <><LoaderCircle size={13} className="spin" /> Reading the description and looking up the company…</> : !setup.modelReady ? 'Choose a model (step 4) to analyse the description.' : setup.research ? 'Briefing ready. Everything below can be edited.' : 'Fetch reads the description and looks up the company.'}</span>
          {!setup.modelReady && <Tool icon={<ArrowRight />} label="Choose model" showLabel tone="quiet" onClick={() => setup.setSection('model')} />}
          <Tool icon={<Sparkles />} label="Fetch briefing" showLabel tone="primary" disabled={busy || researching || !setup.hasJobDescription} onClick={() => void setup.generateResearch()} />
        </div>
        {(setup.company || setup.targetRole || setup.interview.companyBrief) && <section className="mod-brief" aria-busy={researching} aria-label="Company briefing">
          <div className="mod-brief-head"><span className="mod-brief-mark"><Building2 size={22} aria-hidden="true" />{setup.research?.logoDataUrl && <img key={setup.research.logoDataUrl} src={setup.research.logoDataUrl} alt={`${setup.company || 'Company'} logo`} onError={event => { event.currentTarget.hidden = true; }} />}</span>
            <div><h3>{setup.company || 'Your next opportunity'}</h3><p>{setup.targetRole || 'The role will appear here.'}</p></div></div>
          {setup.interview.companyBrief && <div className="profile-briefing"><Markdown skipHtml components={{ img: () => null, a: ({ children }) => <span>{children}</span> }}>{setup.interview.companyBrief}</Markdown></div>}
          {setup.interview.companyValues && <p className="mod-note">{setup.interview.companyValues}</p>}
          <details><summary>Edit company details</summary><div>
            <label className="mod-label"><span>Company</span><input maxLength={120} value={setup.company} disabled={busy || researching} onChange={event => setup.setCompany(event.target.value)} /></label>
            <label className="mod-label"><span>Target role</span><input maxLength={120} value={setup.targetRole} disabled={busy || researching} onChange={event => setup.setTargetRole(event.target.value)} /></label>
            <label className="mod-label"><span>Company website</span><input type="url" maxLength={2000} value={setup.interview.companyUrl} disabled={busy || researching} onChange={event => setup.updateInterview({ companyUrl: event.target.value })} /></label>
            <label className="mod-label"><span>Values and culture</span><textarea maxLength={2000} value={setup.interview.companyValues || ''} disabled={busy || researching} onChange={event => setup.updateInterview({ companyValues: event.target.value })} /></label>
            <label className="mod-label"><span>Briefing</span><textarea maxLength={4000} value={setup.interview.companyBrief} disabled={busy || researching} onChange={event => setup.updateInterview({ companyBrief: event.target.value })} /></label>
          </div></details>
          {setup.research && setup.research.sources.length > 0 && <details><summary>Sources ({setup.research.sources.length})</summary><div>{setup.research.sources.map(source => <small key={source.url}>{source.title} · <code>{source.url}</code></small>)}</div></details>}
          {setup.research?.warnings.map(warning => <small className="mod-setup-status" key={warning}>{warning}</small>)}
        </section>}
        <label className="mod-label"><span>Years of experience<b>{setup.interview.experienceYears === 0 ? 'Entry level' : setup.interview.experienceYears}</b></span>
          <input type="range" min={0} max={15} step={1} value={setup.interview.experienceYears} disabled={busy || researching} aria-valuetext={setup.interview.experienceYears === 0 ? 'Entry level, 0 years' : `${setup.interview.experienceYears} years`} onChange={event => setup.updateInterview({ experienceYears: Number(event.target.value) })} /></label>
        <label className="mod-label"><span>Domain</span><select value={setup.interview.domain} disabled={busy || researching} onChange={event => setup.updateInterview({ domain: event.target.value as InterviewProfile['domain'] })}>{INTERVIEW_DOMAINS.map(domain => <option key={domain.id} value={domain.id}>{domain.name}</option>)}</select></label>
        <label className="mod-label"><span>Vocabulary<b>{setup.vocabularyIndex + 1} / {VOCABULARY_LEVELS.length} · {VOCABULARY_LEVELS[setup.vocabularyIndex].name}</b></span>
          <input type="range" min={1} max={VOCABULARY_LEVELS.length} step={1} value={setup.vocabularyIndex + 1} disabled={busy || researching} aria-valuetext={`${setup.vocabularyIndex + 1} of ${VOCABULARY_LEVELS.length}, ${VOCABULARY_LEVELS[setup.vocabularyIndex].name}`} onChange={event => setup.setVocabulary(VOCABULARY_LEVELS[Number(event.target.value) - 1].id)} />
          <small>{VOCABULARY_LEVELS[setup.vocabularyIndex].instructions}</small></label>
      </div>}
      {setup.section === 'brief' && <div className="mod-step" key="brief">
        <h2>What kind of conversation is this?</h2>
        <p>You can change the mode during the session.</p>
        <div ref={modeOptions} className="mod-choices" role="group" aria-label="Session mode">{SESSION_MODES.map(mode => { const locked = !setup.allows(mode.id); return <button type="button" key={mode.id} className={`mod-choice ${locked ? 'plan-locked' : ''}`} aria-pressed={setup.startMode === mode.id} aria-disabled={locked || undefined} disabled={busy} title={locked ? lockedMessage(mode.id) : undefined}
          onClick={() => { if (locked) setup.setError(lockedMessage(mode.id)); else { setup.setStartMode(mode.id); setup.setError(''); } }}><strong>{mode.name}{locked && <PlanLock feature={mode.id} />}</strong><span>{mode.description}</span></button>; })}</div>
        {setup.startMode === 'behavioral' && <div className="mod-choices" role="group" aria-label="Story framework">{FRAMEWORKS.map(([id, label, description]) => <button type="button" key={id} className="mod-choice" aria-pressed={setup.behavioralFramework === id} disabled={busy} onClick={() => void setup.setBehavioralFramework(id)}><strong>{label}</strong><span>{description}</span></button>)}</div>}
        <label className="mod-label"><span>Purpose{setup.purposeEdited && <button type="button" className="text-button" disabled={busy} onClick={() => setup.setPurposeEdited(false)}>Use the suggested purpose</button>}</span>
          <textarea ref={purposeInput} required maxLength={2000} value={setup.purposeValue} disabled={busy} placeholder="Choose a mode to suggest a purpose, or write your own." onChange={event => { setup.setPurpose(event.target.value); setup.setPurposeEdited(true); }} /></label>
        <label className="mod-label"><span>Anything else Novi should know?<b className={wordCount(setup.interview.additionalContext) > 100 ? 'is-over' : ''}>{wordCount(setup.interview.additionalContext)} / 100 words</b></span>
          <textarea maxLength={4000} value={setup.interview.additionalContext} disabled={busy} onChange={event => setup.updateInterview({ additionalContext: event.target.value })} /></label>
      </div>}
      {setup.section === 'style' && <div className="mod-step" key="style">
        <h2>How should answers sound?</h2>
        <p>A starting style. Switch between these from the session bar at any time.</p>
        <div className="mod-choices" role="group" aria-label="Answer style">{ANSWER_STYLES.map(style => <button type="button" key={style.id} className="mod-choice" disabled={busy} aria-pressed={setup.interview.answerStyle === style.id} onClick={() => setup.updateInterview({ answerStyle: style.id })}><strong>{style.name}</strong><span>{style.description}</span></button>)}</div>
        {setup.interview.answerStyle === 'custom' && <>
          <label className="mod-label"><span>Your custom answer style</span><textarea maxLength={4000} value={setup.interview.customAnswerStyle || ''} disabled={busy} placeholder="How answers should sound, be structured, or be explained…" onChange={event => { setup.updateInterview({ customAnswerStyle: event.target.value }); setup.setProfileNotice(''); }} /></label>
          <div className="deck-inline"><Tool icon={<Bookmark />} label="Save on this device" showLabel disabled={busy || !setup.interview.customAnswerStyle?.trim()} onClick={() => void setup.saveCustomStyle()} /></div>
        </>}
        <details className="mod-brief"><summary>Preview or export the speaking skills</summary><div><pre className="profile-skill-preview">{interviewSkill(setup.startMode ?? setup.fallbackMode(), setup.interview, setup.vocabulary)}</pre><div className="deck-inline"><Tool icon={<Download />} label="Export speaking skills" showLabel disabled={busy} onClick={() => void setup.exportSkills()} /></div></div></details>
      </div>}
      {setup.section === 'model' && <div className="mod-step" key="model">
        <h2>Which model answers?</h2>
        <p>Checked again, with your internet, right before the session starts.</p>
        <ProviderPicker state={state} disabled={busy || researching} onSaved={onSaved} onError={setup.setError} onReady={setup.setModelReady} />
        {!setup.connection && <p className="mod-note">Enable a connection in Settings to choose a model.</p>}
        <p className="mod-setup-status" role="status">{setup.checking && <LoaderCircle size={13} className="spin" />} {setup.connectionNotice || 'Internet and the model are tested when you press Start.'}</p>
        <div className="deck-inline" aria-label="Session review">{[setup.summary.profile, setup.summary.mode, setup.summary.experience, setup.summary.voice].map(item => <span className="deck-state" key={item}>{item}</span>)}</div>
        <div className="mod-row"><Bookmark size={15} aria-hidden="true" />
          <input aria-label="Setup name" maxLength={60} value={setup.nameForProfile} placeholder="Firstname Lastname · role" onChange={event => { setup.setProfileName(event.target.value); setup.setProfileNameEdited(true); setup.setProfileNotice(''); }} />
          <Tool label={setup.existingProfile ? 'Update setup' : 'Save setup'} showLabel disabled={!setup.canStart || !setup.nameForProfile.trim()} onClick={() => void setup.saveProfile()} />
        </div>
      </div>}
    </div>
    <footer className="mod-setup-foot">
      {setup.section === 'sources' && <Tool icon={<FastForward />} label="Start an empty chat" showLabel tone="quiet" className="mod-shrink" disabled={busy || researching || !setup.modelReady} onClick={() => void setup.startEmpty()} />}
      <span className={`mod-setup-status ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>{error || setup.footerStatus}</span>
      {setup.section !== 'sources' && <Tool icon={<ArrowLeft />} label="Back" showLabel tone="quiet" disabled={busy} onClick={setup.back} />}
      {setup.section === 'model'
        ? <Tool icon={<Play />} label={setup.checking ? 'Checking…' : 'Start session'} showLabel tone="primary" disabled={busy || researching} className={setup.canStart ? '' : 'is-waiting'} onClick={() => setup.canStart ? void setup.start() : focusMissing(setup.showMissing())} />
        : <Tool icon={<ArrowRight />} label="Next" showLabel tone="primary" disabled={busy || researching} onClick={() => focusMissing(setup.next())} />}
    </footer>
  </div>;
}
export type { SessionSetup };
