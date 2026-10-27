import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { require as tsxRequire } from 'tsx/cjs/api';

test('switching projects hides the old version and ignores stale responses and errors', async t => {
  const React = createRequire(import.meta.url)('react');
  const slots: any[] = [];
  let cursor = 0;
  t.mock.method(React, 'useState', (initial: any) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], (next: any) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
  });
  t.mock.method(React, 'useRef', (initial: any) => {
    const index = cursor++;
    return slots[index] ??= { current: initial };
  });
  t.mock.method(React, 'useCallback', (callback: any) => callback);
  t.mock.method(React, 'useEffect', () => {});
  const pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  const previousWindow = (globalThis as any).window;
  (globalThis as any).window = { novi: { getProjectState: (id: string) => new Promise((resolve, reject) => pending.set(id, { resolve, reject })) } };
  t.after(() => { if (previousWindow === undefined) delete (globalThis as any).window; else (globalThis as any).window = previousWindow; });
  const { useLocalCodingProject } = tsxRequire('../src/renderer/src/hooks/useLocalCodingProject.ts', import.meta.url);
  const errors: string[] = [];
  const render = (projectId: string) => {
    cursor = 0;
    return useLocalCodingProject({ projectId, name: projectId, engine: 'codex', connectionId: 'key', model: 'test' }, false, [], (error: string) => errors.push(error));
  };
  const finish = (id: string) => pending.get(id)!.resolve({ ok: true, value: { projectId: id, selectedVersionId: `${id}-version` } });
  let a = render('a');
  let loading = a.reload(); finish('a'); await loading;
  assert.equal(render('a').project?.projectId, 'a');
  const staleA = a.reload();
  const b = render('b');
  assert.equal(b.project, null, 'the previous project is unavailable immediately after switching');
  loading = b.reload(); finish('b'); await loading;
  finish('a'); await staleA;
  assert.equal(render('b').project?.projectId, 'b', 'a late response cannot replace the selected project');
  render('b').setProject({ projectId: 'a', selectedVersionId: 'a-version' });
  assert.equal(render('b').project?.projectId, 'b', 'a late version-selection or refresh reply is ignored too');
  const staleB = b.reload();
  a = render('a');
  loading = a.reload();
  pending.get('b')!.reject(new Error('obsolete failure')); await staleB;
  finish('a'); await loading;
  assert.equal(render('a').project?.projectId, 'a');
  assert.deepEqual(errors, [], 'failures from a previous selection stay out of the active conversation');
});
