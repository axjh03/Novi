import { useEffect, useRef, useState } from 'react';
import type { AppMode, ContextFolder, SessionProfile, Snapshot, VocabularyLevel } from '../../../shared/types';
import { activeConnection } from '../../../shared/providers';
import { ANSWER_STYLES, DEFAULT_INTERVIEW_PROFILE, INTERVIEW_DOMAINS, profileFileKind, wordCount, type InterviewProfile, type ProfileResearch } from '../../../shared/interviewProfile';
import { errorText, unwrap } from '../services/api';
import { continueFromGetReady, getReadyContinued, recordReadiness } from '../services/readiness';
import { defaultPurpose } from '../context/sessionPresets';
import { useAppMode } from '../context/AppModeContext';
import { SESSION_MODES, VOCABULARY_LEVELS } from '../../../shared/sessionModes';
import { fallbackMode, lockedMessage } from '../../../shared/plans';

export const SETUP_STEPS = [
  { id: 'sources', name: 'Load profile' },
  { id: 'brief', name: 'Instructions' },
  { id: 'style', name: 'Answer style' },
  { id: 'model', name: 'Model' },
] as const;
export type SetupSection = typeof SETUP_STEPS[number]['id'];
export type SetupMissing = 'profile' | 'mode' | 'purpose' | 'notes' | 'style' | 'model' | null;
export const modeName = (mode: AppMode) => SESSION_MODES.find(item => item.id === mode)?.name ?? mode;

/**
 * Session setup: the same facts, checks and start sequence behind both the Classic page and the
 * Modern card flow. The views only render; every decision lives here.
 *
 * The flow: System Check once per launch, then four steps (profile, instructions, answer style, model),
 * a saved profile that can start in one click, and a start that re-checks the internet and the model.
 */
export function useSessionSetup(state: Snapshot, onSaved: (state: Snapshot) => void) {
  const { setAppMode, allows, behavioralFramework, setBehavioralFramework } = useAppMode();
  const [preflightDone, setPreflightDone] = useState(() => getReadyContinued(state.user!.id));
  const [section, setActiveSection] = useState<SetupSection>('sources');
  const [visitedSteps, setVisitedSteps] = useState<SetupSection[]>(['sources']);
  const [direction, setDirection] = useState('forward');
  const index = SETUP_STEPS.findIndex(step => step.id === section);
  function setSection(next: SetupSection) { setDirection(SETUP_STEPS.findIndex(step => step.id === next) < index ? 'backward' : 'forward'); setVisitedSteps(current => current.includes(next) ? current : [...current, next]); setActiveSection(next); }
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
  const missing: SetupMissing = !profileReady ? 'profile' : !startMode ? 'mode' : !purposeValue.trim() ? 'purpose' : wordCount(interview.additionalContext) > 100 ? 'notes' : !styleReady ? 'style' : !modelReady ? 'model' : null;
  const stepReady: Record<SetupSection, boolean> = { sources: profileReady, brief: briefReady, style: Boolean(startMode) && styleReady, model: modelReady };
  useEffect(() => { researchAttempt.current++; setResearching(false); }, [connection?.id, connection?.model]);

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
  /** Goes to the step that still needs input and says what is missing. Returns which field to focus. */
  function showMissing(): 'purpose' | 'mode' | null {
    if (missing === 'profile') { setSection('sources'); setError('Add a job description URL, paste its text, or include job-description.pdf / .txt in your profile folder.'); return null; }
    if (missing === 'style') { setSection('style'); setError('Paste your custom answer style, or choose a preset.'); return null; }
    if (missing === 'model') { setSection('model'); return null; }
    setSection('brief');
    setError(missing === 'notes' ? 'Keep your additional context to 100 words.' : missing === 'mode' ? 'Choose a starting session type.' : 'Add a purpose.');
    return missing === 'purpose' ? 'purpose' : 'mode';
  }
  /** Next from the current step, or the missing item when the step is not complete. */
  function next(): 'purpose' | 'mode' | null {
    if ((section === 'sources' && !profileReady) || (section === 'brief' && !briefReady) || (section === 'style' && !styleReady)) return showMissing();
    setError(''); setSection(SETUP_STEPS[index + 1].id);
    return null;
  }
  function back() { if (index > 0) setSection(SETUP_STEPS[index - 1].id); }
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
  function finishPreflight(toModel = false) {
    continueFromGetReady(state.user!.id);
    setPreflightDone(true);
    if (toModel) setSection('model');
  }
  // What the review line and the summary chips say.
  const summary = {
    profile: folders[0]?.name || (loadedSavedProfile ? 'Saved profile' : hasJobDescription ? 'Job description loaded' : 'No profile yet'),
    mode: startMode ? modeName(startMode) : 'Choose a session type',
    experience: `${interview.experienceYears} years · ${INTERVIEW_DOMAINS.find(domain => domain.id === interview.domain)!.name}`,
    voice: `${vocabularyIndex + 1}/${VOCABULARY_LEVELS.length} vocabulary · ${ANSWER_STYLES.find(style => style.id === interview.answerStyle)!.name}`,
  };
  const footerStatus = error ? '' : researching ? 'Loading description and company details…' : checking ? connectionNotice || 'Checking connection…' : busy ? 'Working…' : profileNotice;

  return {
    state, allows, behavioralFramework, setBehavioralFramework, fallbackMode: () => fallbackMode(state.user?.features),
    preflightDone, setPreflightDone, finishPreflight,
    section, setSection, index, direction, visitedSteps, stepReady,
    folders, setFolders, loadedSavedProfile, interview, updateInterview, changeDescription, vocabulary, setVocabulary, vocabularyIndex,
    startMode, setStartMode, company, setCompany, targetRole, setTargetRole, purposeValue, purposeEdited, setPurpose, setPurposeEdited,
    research, busy, checking, researching, error, setError, modelReady, setModelReady,
    profileName, setProfileName, setProfileNameEdited, nameForProfile, existingProfile, profiles, profileNotice, setProfileNotice, confirmDelete, setConfirmDelete,
    connection, connectionNotice, hasJobDescription, profileReady, briefReady, styleReady, canStart, missing, summary, footerStatus,
    loadFolders, generateResearch, startEmpty, start, showMissing, next, back, saveProfile, deleteProfile, applyProfile, saveCustomStyle, exportSkills,
  };
}
export type SessionSetup = ReturnType<typeof useSessionSetup>;
