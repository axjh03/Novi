import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocalCodingBinding, ProjectState } from '../../../shared/localCoding';
import type { ChatMessage } from '../../../shared/types';
import { errorText, unwrap } from '../services/api';

/** The selected conversation's Local Coding project: versions, selection and engine. Reloads after each task. */
export function useLocalCodingProject(binding: LocalCodingBinding | undefined, busy: boolean, messages: ChatMessage[] | undefined, onError: (message: string) => void) {
  const [project, setProject] = useState<ProjectState | null>(null);
  const [notice, setNotice] = useState<{ versionId: string; label: string; baseLabel: string } | null>(null);
  const projectId = binding?.projectId;
  const errors = useRef(onError);
  errors.current = onError;
  const load = useCallback(async () => {
    if (!projectId) { setProject(null); return; }
    try { setProject(await unwrap(window.novi.getProjectState(projectId))); }
    catch (cause) { setProject(null); errors.current(errorText(cause)); }
  }, [projectId]);
  useEffect(() => { setNotice(null); void load(); }, [load, binding?.engine, binding?.model, binding?.connectionId]);
  // When a task ends, reload; if its result was not selected because the user moved elsewhere, say it is ready.
  const wasBusy = useRef(busy);
  useEffect(() => {
    const finished = wasBusy.current && !busy;
    wasBusy.current = busy;
    if (busy && projectId) void load();
    if (!finished || !projectId) return;
    void (async () => {
      await load();
      const last = [...(messages ?? [])].reverse().find((message) => message.localCoding?.projectId === projectId)?.localCoding;
      if (!last?.resultingVersionId) return;
      const state = await unwrap(window.novi.getProjectState(projectId)).catch(() => null);
      if (state && state.selectedVersionId !== last.resultingVersionId) setNotice({ versionId: last.resultingVersionId, label: last.resultingLabel ?? 'A new iteration', baseLabel: last.baseLabel });
    })();
  }, [busy]);
  return { project, setProject, notice, clearNotice: () => setNotice(null), reload: load };
}
