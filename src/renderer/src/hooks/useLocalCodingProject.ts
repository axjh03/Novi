import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocalCodingBinding, ProjectState } from '../../../shared/localCoding';
import type { ChatMessage } from '../../../shared/types';
import { errorText, unwrap } from '../services/api';

/** The selected conversation's Local Coding project. Reloads after each task and opens the review window when a task proposed changes. */
export function useLocalCodingProject(binding: LocalCodingBinding | undefined, busy: boolean, messages: ChatMessage[] | undefined, onError: (message: string) => void) {
  const [project, setProject] = useState<ProjectState | null>(null);
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
  useEffect(() => { void load(); return () => { request.current++; }; }, [load, binding?.engine, binding?.model, binding?.connectionId]);
  // When a task ends, reload the project; a proposal with changes opens in the review window.
  const wasBusy = useRef(busy);
  useEffect(() => {
    const finished = wasBusy.current && !busy;
    wasBusy.current = busy;
    if (busy && projectId) void load();
    if (!finished || !projectId) return;
    void load();
    const last = [...(messages ?? [])].reverse().find((message) => message.role === 'assistant')?.localCoding;
    if (!last || last.projectId !== projectId || last.state !== 'complete' || !last.resultingVersionId) return;
    void unwrap(window.novi.openReview({ projectId, toVersionId: last.resultingVersionId })).catch((cause) => errors.current(errorText(cause)));
  }, [busy]);
  return {
    project: project?.projectId === projectId ? project : null,
    setProject(next: ProjectState) { if (next.projectId === selectedProject.current) setProject(next); },
    reload: load,
  };
}
