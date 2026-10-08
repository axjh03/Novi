import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, openSync, closeSync, fsyncSync, renameSync, lstatSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { atomicJSON, readJSON } from './storage';
import { UserError } from './validation';
import type { InterviewMode, InterviewSession, TranscriptSegment } from '../../shared/interview';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type Metadata = Omit<InterviewSession, 'segments'>;

export class InterviewStore {
  readonly root: string;
  constructor(userData: string) {
    this.root = join(userData, 'interviews');
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
  }
  private folder(owner: string, id?: string) {
    if (!owner || (id !== undefined && !uuid.test(id))) throw new UserError('Invalid interview.');
    const account = createHash('sha256').update(owner).digest('hex');
    const path = join(this.root, account, ...(id ? [id] : []));
    for (const dir of [this.root, join(this.root, account), path]) {
      if (existsSync(dir) && lstatSync(dir).isSymbolicLink()) throw new UserError('Unsafe interview storage path.');
    }
    return path;
  }
  create(owner: string, mode: InterviewMode, modelId: string, modelVersion?: string): InterviewSession {
    const session: InterviewSession = { id: randomUUID(), mode, modelId, modelVersion, startedAt: Date.now(), updatedAt: Date.now(), status: 'recording', speakers: { system_1: 'Interviewer', ...(mode !== 'interviewer' ? { microphone_1: 'You' } : {}) }, segments: [] };
    mkdirSync(join(this.folder(owner, session.id), 'segments'), { recursive: true, mode: 0o700 });
    this.metadata(owner, session);
    return session;
  }
  metadata(owner: string, session: InterviewSession) {
    const { segments: _segments, ...metadata } = session;
    atomicJSON(join(this.folder(owner, session.id), 'session.json'), metadata);
  }
  finalize(owner: string, segment: TranscriptSegment) {
    if (!segment.isFinal || !uuid.test(segment.segmentId) || !segment.text || segment.text.length > 32_000) throw new UserError('Invalid final transcript segment.');
    const dir = join(this.folder(owner, segment.sessionId), 'segments');
    if (!lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink()) throw new UserError('Unsafe interview storage path.');
    const target = join(dir, `${segment.segmentId}.json`);
    if (existsSync(target)) return; // Exactly once; retries cannot overwrite finalized speech.
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      const fd = openSync(temporary, 'wx', 0o600);
      try { writeFileSync(fd, JSON.stringify(segment)); fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(temporary, target);
    } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  }
  read(owner: string, id: string): InterviewSession {
    const folder = this.folder(owner, id);
    const metadata = readJSON<Metadata | null>(join(folder, 'session.json'), null);
    if (!metadata || metadata.id !== id) throw new UserError('Interview not found for this account.');
    const segmentFiles = readdirSync(join(folder, 'segments')).filter(name => name.endsWith('.json') && uuid.test(name.slice(0, -5)));
    if (segmentFiles.length > 10_000) throw new UserError('This interview exceeds the current viewer limit. Its files have been preserved.');
    const segments = segmentFiles.map(name => JSON.parse(readFileSync(join(folder, 'segments', name), 'utf8')) as TranscriptSegment)
      .filter(segment => segment.sessionId === id && segment.isFinal).sort((a, b) => a.startTime - b.startTime);
    return { ...metadata, status: metadata.status === 'recording' ? 'interrupted' : metadata.status, segments };
  }
  list(owner: string): Array<Omit<InterviewSession, 'segments'>> {
    const account = this.folder(owner);
    if (!existsSync(account)) return [];
    return readdirSync(account).filter(id => uuid.test(id)).map(id => {
      const metadata = readJSON<Metadata>(join(this.folder(owner, id), 'session.json'), null as unknown as Metadata);
      return metadata && { ...metadata, status: metadata.status === 'recording' ? 'interrupted' as const : metadata.status };
    }).filter(item => Boolean(item)).sort((a, b) => b.startedAt - a.startedAt).slice(0, 100);
  }
}
