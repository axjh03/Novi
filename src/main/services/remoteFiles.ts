import { app } from 'electron';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import type { FileCommand, FileItem, FileResponse } from '../../shared/types';
import { assertRemoteInterviewAccess } from './interviewPrivacy';

// Pure Node.js CRC32 calculation
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf: Buffer): number {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

// Convert MS-DOS date and time
function dosDateTime(date: Date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const d = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: d };
}

// Pure Node.js Zip Archiver
function createZipBuffer(dirPath: string): Buffer {
  interface ZipEntry {
    relativePath: string;
    uncompressed: Buffer;
    compressed: Buffer;
    crc: number;
    offset: number;
    time: number;
    date: number;
  }

  const entries: ZipEntry[] = [];
  function walk(currentDir: string, relativePrefix = '') {
    const files = readdirSync(currentDir, { withFileTypes: true });
    for (const f of files) {
      const fullPath = join(currentDir, f.name);
      const relPath = relativePrefix ? `${relativePrefix}/${f.name}` : f.name;
      try {
        if (f.isDirectory()) {
          walk(fullPath, relPath);
        } else if (f.isFile()) {
          const content = readFileSync(fullPath);
          const stat = statSync(fullPath);
          const { time, date } = dosDateTime(stat.mtime);
          const compressed = deflateRawSync(content);
          entries.push({
            relativePath: relPath.replace(/\\/g, '/'),
            uncompressed: content,
            compressed,
            crc: crc32(content),
            offset: 0,
            time,
            date,
          });
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  walk(dirPath);

  const localParts: Buffer[] = [];
  let currentOffset = 0;

  for (const entry of entries) {
    entry.offset = currentOffset;
    const nameBuf = Buffer.from(entry.relativePath, 'utf-8');
    const header = Buffer.alloc(30);

    header.writeUInt32LE(0x04034b50, 0); // signature
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0, 6); // general flags
    header.writeUInt16LE(8, 8); // compression: deflate
    header.writeUInt16LE(entry.time, 10);
    header.writeUInt16LE(entry.date, 12);
    header.writeUInt32LE(entry.crc, 14);
    header.writeUInt32LE(entry.compressed.length, 18);
    header.writeUInt32LE(entry.uncompressed.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28); // extra field length

    localParts.push(header, nameBuf, entry.compressed);
    currentOffset += 30 + nameBuf.length + entry.compressed.length;
  }

  const centralOffset = currentOffset;
  const centralParts: Buffer[] = [];

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.relativePath, 'utf-8');
    const header = Buffer.alloc(46);

    header.writeUInt32LE(0x02014b50, 0); // signature
    header.writeUInt16LE(20, 4); // version made by
    header.writeUInt16LE(20, 6); // version needed
    header.writeUInt16LE(0, 8); // flags
    header.writeUInt16LE(8, 10); // compression
    header.writeUInt16LE(entry.time, 12);
    header.writeUInt16LE(entry.date, 14);
    header.writeUInt32LE(entry.crc, 16);
    header.writeUInt32LE(entry.compressed.length, 20);
    header.writeUInt32LE(entry.uncompressed.length, 24);
    header.writeUInt16LE(nameBuf.length, 28);
    header.writeUInt16LE(0, 30); // extra length
    header.writeUInt16LE(0, 32); // comment length
    header.writeUInt16LE(0, 34); // disk start
    header.writeUInt16LE(0, 36); // internal attributes
    header.writeUInt32LE(0, 38); // external attributes
    header.writeUInt32LE(entry.offset, 42); // local header offset

    centralParts.push(header, nameBuf);
    currentOffset += 46 + nameBuf.length;
  }

  const centralSize = currentOffset - centralOffset;
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0); // end of central dir signature
  endRecord.writeUInt16LE(0, 4); // disk number
  endRecord.writeUInt16LE(0, 6); // disk start
  endRecord.writeUInt16LE(entries.length, 8); // entries on disk
  endRecord.writeUInt16LE(entries.length, 10); // total entries
  endRecord.writeUInt32LE(centralSize, 12);
  endRecord.writeUInt32LE(centralOffset, 16);
  endRecord.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, ...centralParts, endRecord]);
}

export class RemoteFileService {
  private active = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private baseUrl = '';
  private token = '';

  constructor(
    private getBaseUrl: () => string,
    private getToken: () => string,
  ) {}

  start() {
    this.active = true;
    this.scheduleNext(1000);
  }

  stop() {
    this.active = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private scheduleNext(ms: number) {
    if (!this.active) return;
    this.pollTimer = setTimeout(() => {
      void this.pollCycle();
    }, ms);
  }

  private resolvePath(inputPath?: string): string {
    if (!inputPath || inputPath === ':app_data' || inputPath === '') {
      return app.getPath('userData');
    }
    if (inputPath === ':home') return app.getPath('home');
    if (inputPath === ':documents') return app.getPath('documents');
    if (inputPath === ':downloads') return app.getPath('downloads');
    if (inputPath === ':desktop') return app.getPath('desktop');
    if (inputPath === ':root' && process.platform !== 'win32') return resolve('/');
    return resolve(inputPath);
  }

  private windowsDrives(): FileItem[] {
    const drives: FileItem[] = [];
    for (let code = 65; code <= 90; code++) {
      const drive = String.fromCharCode(code);
      const path = `${drive}:\\`;
      try {
        if (existsSync(path) && statSync(path).isDirectory()) {
          drives.push({ name: `Local Disk (${drive}:)`, isDir: true, size: 0, modifiedAt: 0, path });
        }
      } catch { /* Ignore unavailable or restricted volumes. */ }
    }
    return drives;
  }

  private async pollCycle() {
    if (!this.active) return;
    const token = this.getToken();
    const baseUrl = this.getBaseUrl();
    if (!token || !baseUrl) {
      this.scheduleNext(5000);
      return;
    }

    try {
      const res = await fetch(`${baseUrl}/file-explorer/poll`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) {
        this.scheduleNext(5000);
        return;
      }

      const json = await res.json() as { data: { command: FileCommand | null; active: boolean } };
      const { command, active } = json.data || {};

      if (command) {
        await this.handleCommand(command, baseUrl, token);
        this.scheduleNext(500); // Quick check for consecutive commands
        return;
      }

      // If admin has modal open, poll faster; otherwise sleep longer
      this.scheduleNext(active ? 1500 : 5000);
    } catch {
      this.scheduleNext(6000);
    }
  }

  private async handleCommand(cmd: FileCommand, baseUrl: string, token: string) {
    let response: FileResponse = { commandId: cmd.id };

    try {
      if (cmd.action === 'list_dir' && cmd.path === ':root' && process.platform === 'win32') {
        response.items = this.windowsDrives();
        response.currentPath = ':root';
      } else {
        const targetPath = this.resolvePath(cmd.path);
        if (existsSync(targetPath)) assertRemoteInterviewAccess(targetPath, join(app.getPath('userData'), 'interviews'), cmd.action === 'zip_folder');

        if (!existsSync(targetPath)) {
          response.error = `Path does not exist: ${targetPath}`;
        } else if (cmd.action === 'list_dir') {
          const stat = statSync(targetPath);
          if (!stat.isDirectory()) {
            response.error = `Target is not a directory: ${targetPath}`;
          } else {
            const dirEntries = readdirSync(targetPath, { withFileTypes: true });
            const items: FileItem[] = [];

            for (const d of dirEntries) {
              try {
                const fullP = join(targetPath, d.name);
                assertRemoteInterviewAccess(fullP, join(app.getPath('userData'), 'interviews'));
                const st = statSync(fullP);
                items.push({
                  name: d.name,
                  isDir: d.isDirectory(),
                  size: d.isDirectory() ? 0 : st.size,
                  modifiedAt: Math.round(st.mtimeMs),
                  path: fullP,
                });
              } catch {
                // Skip inaccessible items
              }
            }

            items.sort((a, b) => {
              if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
              return a.name.localeCompare(b.name);
            });

            response.items = items;
            response.currentPath = targetPath;
          }
        } else if (cmd.action === 'read_file') {
          const fileBuf = readFileSync(targetPath);
          response.base64Data = fileBuf.toString('base64');
          response.filename = basename(targetPath);
          response.mimeType = 'application/octet-stream';
        } else if (cmd.action === 'zip_folder') {
          const zipBuf = createZipBuffer(targetPath);
          response.base64Data = zipBuf.toString('base64');
          response.filename = `${basename(targetPath) || 'folder'}.zip`;
          response.mimeType = 'application/zip';
        }
      }
    } catch (err: any) {
      response.error = err?.message || 'Failed to process file command';
    }

    try {
      await fetch(`${baseUrl}/file-explorer/respond`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(response),
        signal: AbortSignal.timeout(30000),
      });
    } catch (sendErr) {
      console.warn('[RemoteFiles] Failed to respond to command:', sendErr);
    }
  }
}
