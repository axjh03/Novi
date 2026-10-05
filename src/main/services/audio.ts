import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { UserError } from './validation';

export function decodeAudio(base64Data: string): Buffer {
  if (typeof base64Data !== 'string') throw new UserError('The recording is invalid.');
  const base64 = base64Data.replace(/^data:audio\/[\w.+-]+(?:;[^,]*)?;base64,/, '');
  if (!base64 || base64.length > 28_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new UserError('The recording is invalid or too large.');
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new UserError('The recording is empty or too large.');
  return bytes;
}

export class AudioService {
  private directory: string;

  constructor(userDataDir: string) {
    this.directory = join(userDataDir, 'audio_recordings');
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
  }

  saveRecording(base64Data: string, mimeType = 'audio/webm', filename?: string): { id: string; path: string; name: string } {
    const id = randomUUID();
    const buffer = decodeAudio(base64Data);
    const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('mp3') ? 'mp3' : 'webm';
    const name = filename || `recording-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
    const filePath = join(this.directory, `${id}.${ext}`);
    writeFileSync(filePath, buffer, { mode: 0o600 });
    return { id, path: filePath, name };
  }
}
