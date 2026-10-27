import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocalCodingBinding, ProjectState } from '../../../shared/localCoding';
import type { ChatMessage } from '../../../shared/types';
import { errorText, unwrap } from '../services/api';

/** The selected conversation's Local Coding project: versions, selection and engine. Reloads after each task. */
export function useLocalCodingProject(binding: LocalCodingBinding | undefined, busy: boolean, messages: ChatMessage[] | undefined, onError: (message: string) => void) {
  const [project, setProject] = useState<ProjectState | null>(null);
  const [notice, setNotice] = useState<{ versionId: string; label: string; baseLabel: string } | null>(null);
  const projectId = binding?.projectId;
  const selectedProject = useRef(projectId);
  selectedProject.current = projectId;
  const request = useRef(0);
  const errors = useRef(onError);
  errors.current = onError;
  const load = useCallback(async () => {
    const current = ++request.current;
    if (!projectId) { setProject(null); return null; }
    try {
      const next = await unwrap(window.novi.getProjectState(projectId));
      if (current !== request.current || selectedProject.current !== projectId) return null;
      setProject(next);
      return next;
    } catch (cause) {
      if (current === request.current && selectedProject.current === projectId) { setProject(null); errors.current(errorText(cause)); }
      return null;
    }
  }, [projectId]);
  useEffect(() => { setNotice(null); void load(); return () => { request.current++; }; }, [load, binding?.engine, binding?.model, binding?.connectionId]);
  // When a task ends, reload; if its result was not selected because the user moved elsewhere, say it is ready.
  const wasBusy = useRef(busy);
  useEffect(() => {
    const finished = wasBusy.current && !busy;
    wasBusy.current = busy;
    if (busy && projectId) void load();
    if (!finished || !projectId) return;
    void (async () => {
      const state = await load();
      if (!state || selectedProject.current !== projectId) return;
      const last = [...(messages ?? [])].reverse().find((message) => message.localCoding?.projectId === projectId)?.localCoding;
      if (!last?.resultingVersionId) return;
      if (state.selectedVersionId !== last.resultingVersionId) setNotice({ versionId: last.resultingVersionId, label: last.resultingLabel ?? 'A new iteration', baseLabel: last.baseLabel });
    })();
  }, [busy]);
  return {
    project: project?.projectId === projectId ? project : null,
    setProject(next: ProjectState) { if (next.projectId === selectedProject.current) setProject(next); },
    notice, clearNotice: () => setNotice(null), reload: load,
  };
}
