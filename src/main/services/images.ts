import { nativeImage } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { ImageAttachment } from '../../shared/types';
import { Storage } from './storage';
import { UserError } from './validation';

const MAX_SIZE = 8 * 1024 * 1024;
export function imageMime(bytes: Buffer): string | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
export class ImageService {
  private pending = new Map<string, { userId: string; image: ImageAttachment }>();
  private directory: string;
  constructor(private storage: Storage) {
    this.directory = join(storage.directory, 'images');
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.prune();
  }
  import(paths: unknown): ImageAttachment[] {
    const user = this.storage.current();
    if (!Array.isArray(paths) || !paths.length || paths.some((path) => typeof path !== 'string')) throw new UserError('Choose one or more images.');
    if (this.pending.size + paths.length > 60) throw new UserError('Too many unused attachments. Sign out and back in to clear them.');
    // Validate the whole selection before creating any local copies.
    const files = paths.map((path: string) => {
      if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extname(path).toLowerCase())) throw new UserError('Only PNG, JPG, JPEG, and WEBP images are supported.');
      const stat = statSync(path);
      if (!stat.isFile() || stat.size > MAX_SIZE) throw new UserError('Each image must be 8 MB or smaller.');
      const bytes = readFileSync(path);
      const mimeType = imageMime(bytes);
      if (!mimeType || bytes.length > MAX_SIZE) throw new UserError('That file is not a supported image.');
      const image = nativeImage.createFromBuffer(bytes);
      if (image.isEmpty()) throw new UserError('That image could not be opened.');
      const size = image.getSize();
      if (size.width * size.height > 40_000_000) throw new UserError('Images must be under 40 megapixels.');
      return { bytes, mimeType, name: basename(path), previewUrl: image.resize({ width: Math.min(size.width, 320) }).toDataURL() };
    });
    return files.map(({ bytes, ...file }) => {
      const image = { id: randomUUID(), ...file };
      writeFileSync(join(this.directory, image.id), bytes, { mode: 0o600 });
      this.pending.set(image.id, { userId: user.id, image });
      return image;
    });
  }
  importBuffer(bytes: Buffer, name = 'Screenshot.png'): ImageAttachment {
    const user = this.storage.current();
    if (this.pending.size >= 60) throw new UserError('Too many unused attachments. Sign out and back in to clear them.');
    const mimeType = imageMime(bytes) || 'image/png';
    const image = nativeImage.createFromBuffer(bytes);
    if (image.isEmpty()) throw new UserError('That image could not be opened.');
    const size = image.getSize();
    const attachment: ImageAttachment = {
      id: randomUUID(),
      name,
      mimeType,
      previewUrl: image.resize({ width: Math.min(size.width, 320) }).toDataURL()
    };
    writeFileSync(join(this.directory, attachment.id), bytes, { mode: 0o600 });
    this.pending.set(attachment.id, { userId: user.id, image: attachment });
    return attachment;
  }
  importAudioBuffer(bytes: Buffer, name = 'audio-recording.webm', mimeType = 'audio/webm'): ImageAttachment {
    const user = this.storage.current();
    if (this.pending.size >= 60) throw new UserError('Too many unused attachments. Sign out and back in to clear them.');
    const attachment: ImageAttachment = {
      id: randomUUID(),
      name,
      mimeType,
      previewUrl: '',
    };
    writeFileSync(join(this.directory, attachment.id), bytes, { mode: 0o600 });
    this.pending.set(attachment.id, { userId: user.id, image: attachment });
    return attachment;
  }
  resolve(id: string): ImageAttachment {
    const user = this.storage.current();
    const pending = this.pending.get(id);
    const image = pending?.userId === user.id ? pending.image : this.storage.conversations.flatMap((c) => c.messages.flatMap((m) => m.images || [])).find((item) => item.id === id);
    if (!image || !/^[\da-f-]{36}$/.test(image.id)) throw new UserError('This image is no longer available. Attach it again.');
    return { id: image.id, name: image.name, mimeType: image.mimeType };
  }
  dataUrl(id: string): string {
    const image = this.resolve(id);
    try { return `data:${image.mimeType};base64,${readFileSync(join(this.directory, image.id)).toString('base64')}`; }
    catch { throw new UserError('A saved image is missing. Start a new chat and attach it again.'); }
  }
  preview(id: string): string {
    const image = this.resolve(id);
    if (image.mimeType.startsWith('audio/')) return '';
    const img = nativeImage.createFromDataURL(this.dataUrl(id));
    return img.resize({ width: Math.min(img.getSize().width, 320) }).toDataURL();
  }
  clearPending() { this.pending.clear(); this.prune(); }
  commit(ids: string[]) { for (const id of ids) this.pending.delete(id); }
  prune() {
    const used = new Set(this.storage.data.accounts.flatMap((user) => user.conversations.flatMap((c) => c.messages.flatMap((m) => m.images?.map((i) => i.id) || []))));
    for (const conversation of this.storage.sessionConversations || []) {
      for (const message of conversation.messages) for (const image of message.images || []) used.add(image.id);
    }
    for (const file of readdirSync(this.directory)) {
      if (/^[\da-f-]{36}$/.test(file) && !used.has(file) && !this.pending.has(file)) unlinkSync(join(this.directory, file));
    }
  }
}
