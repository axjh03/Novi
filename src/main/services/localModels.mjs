import { cpus, freemem, totalmem, platform, arch, release, availableParallelism } from 'node:os';
import { mkdir, lstat, statfs, readFile, open, rename, unlink, realpath, copyFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { MODEL_REGISTRY, modelById, selectModels } from './localModelRegistry.mjs';

const MiB = 1024 ** 2;
const execFileAsync = promisify(execFile);
const STATES = new Set(['NOT_INSTALLED', 'DOWNLOADING', 'DOWNLOADED', 'VERIFYING', 'READY', 'CORRUPTED', 'FAILED', 'DISABLED']);
const exists = async path => { try { return await lstat(path); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
function safeFile(info) { if (info && (!info.isFile() || info.isSymbolicLink())) throw new Error('Model storage contains an unsafe file.'); }
async function removeFile(path) { safeFile(await exists(path)); await unlink(path).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
async function readMetadata(path) {
  const info = await exists(path); safeFile(info);
  if (!info) return null;
  if (info.size > 2 * MiB) return {};
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error instanceof SyntaxError) return {}; throw error; }
}
async function writeJSON(path, value) {
  safeFile(await exists(path));
  safeFile(await exists(`${path}.tmp`));
  const file = await open(`${path}.tmp`, 'w', 0o600);
  try { await file.writeFile(JSON.stringify(value, null, 2)); await file.sync(); } finally { await file.close(); }
  await rename(`${path}.tmp`, path);
}
async function directory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Model storage must be a real directory.');
  return path;
}
async function freeDisk(path) { const s = await statfs(path); return s.bavail * s.bsize; }

export async function availableSystemMemory() {
  try {
    if (platform() === 'linux') {
      const meminfo = await readFile('/proc/meminfo', 'utf8');
      const available = meminfo.match(/^MemAvailable:\s+(\d+)\s+kB/im);
      if (available) return Number(available[1]) * 1024;
    }
    if (platform() === 'darwin') {
      const { stdout } = await execFileAsync('/usr/bin/vm_stat', [], { timeout: 1500 });
      const pageSize = Number(stdout.match(/page size of (\d+) bytes/i)?.[1]);
      const pages = [...stdout.matchAll(/Pages (free|inactive|speculative|purgeable):\s+(\d+)/gi)];
      if (pageSize && pages.length) return pages.reduce((sum, page) => sum + Number(page[2]), 0) * pageSize;
    }
  } catch { /* Fall back to Node's portable estimate. */ }
  return freemem();
}

export async function detectHardware(directoryPath, gpuInfo = {}) {
  const gpuDevices = Array.isArray(gpuInfo?.gpuDevice) ? gpuInfo.gpuDevice.filter(g => g && typeof g === 'object') : [];
  const cpu = cpus()[0]?.model || 'Unknown CPU';
  const apple = platform() === 'darwin' && arch() === 'arm64' && /Apple/i.test(cpu);
  return {
    platform: platform(), release: release(), arch: arch(), cpu,
    cores: availableParallelism(), totalMemory: totalmem(), availableMemory: await availableSystemMemory(),
    processMemory: process.memoryUsage().rss,
    diskFree: await freeDisk(directoryPath).catch(() => null),
    unifiedMemory: apple ? true : null,
    gpus: gpuDevices.map(g => ({ name: typeof g.deviceString === 'string' && g.deviceString ? g.deviceString : 'GPU (name unavailable)', vendorId: Number.isInteger(g.vendorId) ? g.vendorId : null, memoryBytes: null })),
    accelerators: ['Metal', 'CUDA', 'ROCm'].map(name => ({ name, status: 'unverified', reason: 'GPU discovery does not verify an inference backend. Native runtime probing is not installed yet.' })),
  };
}

// Only publisher-controlled metadata and its HTTPS weight CDN are reachable.
// No credentials, interview data, or renderer-supplied URL enters this function.
export function modelDownloadURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !(url.hostname === 'huggingface.co' || url.hostname.endsWith('.huggingface.co') || url.hostname.endsWith('.hf.co'))) {
    throw new Error('Untrusted model download destination.');
  }
  return url.href;
}

async function request(fetcher, url, options) {
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetcher(modelDownloadURL(url), { ...options, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location) throw new Error('Model server returned an invalid redirect.');
    url = new URL(location, url).href;
  }
  throw new Error('Too many model download redirects.');
}

async function digestFile(path, expected, signal) {
  const info = await exists(path);
  safeFile(info);
  if (!info || info.size !== expected.size) return null;
  const sha256 = createHash('sha256');
  const sourceHash = expected.sha256 ? null : createHash('sha1').update(`blob ${info.size}\0`);
  for await (const chunk of createReadStream(path, { signal })) { sha256.update(chunk); sourceHash?.update(chunk); }
  const hash = sha256.digest('hex');
  return (expected.sha256 ? hash === expected.sha256 : sourceHash.digest('hex') === expected.gitBlob) ? hash : null;
}

export class ModelManager {
  constructor(userData, { registry = MODEL_REGISTRY, bundledRoot, fetcher = globalThis.fetch, diskFree = freeDisk, onProgress = () => {}, log = () => {}, retryDelay = 500 } = {}) {
    this.root = join(userData, 'models');
    this.bundledRoot = bundledRoot;
    this.registry = registry;
    this.fetcher = fetcher;
    this.diskFree = diskFree;
    this.onProgress = onProgress;
    this.log = log;
    this.retryDelay = retryDelay;
    this.jobs = new Map();
    this.status = new Map();
    this.progressSamples = new Map();
    this.leases = new Set();
    this.preparing = null;
    this.scanning = null;
  }

  async prepare() {
    this.preparing ||= (async () => {
      await directory(this.root);
      this.root = await realpath(this.root);
      for (const type of ['asr', 'vad', 'diarization', 'llm']) await directory(join(this.root, type));
    })().catch(error => { this.preparing = null; throw error; });
    await this.preparing;
  }

  async location(model) {
    await this.prepare();
    const dir = await directory(join(this.root, model.type, model.id));
    const target = await directory(join(dir, model.version));
    // Keep removed models removed; an interrupted first copy can safely resume.
    if (this.bundledRoot && !await exists(join(target, 'bundle-imported.json')) && !await exists(join(target, 'model.json'))) {
      const source = join(this.bundledRoot, model.type, model.id, model.version);
      const metadata = await readMetadata(join(source, 'model.json'));
      if (metadata) {
        if (!this.validManifest(metadata, model) || metadata.status !== 'verified') throw new Error('Bundled model metadata is invalid. Reinstall Novi.');
        const total = metadata.files.reduce((sum, file) => sum + file.size, 0);
        if (await this.diskFree(target) < total + 256 * MiB) throw new Error('Not enough disk space to install bundled speech models.');
        for (const file of metadata.files) {
          const path = join(source, basename(file.name));
          if (!await digestFile(path, file)) throw new Error('Bundled model checksum failed. Reinstall Novi.');
          const destination = join(target, basename(file.name));
          safeFile(await exists(destination));
          await copyFile(path, destination);
        }
        await writeJSON(join(target, 'model.json'), metadata);
        await writeJSON(join(target, 'bundle-imported.json'), { version: model.version });
      }
    }
    return target;
  }

  update(id, state, downloadedBytes = 0, totalBytes = 0, error) {
    if (!STATES.has(state)) throw new Error('Invalid model state.');
    const now = Date.now(), sample = this.progressSamples.get(id);
    const instantaneous = state === 'DOWNLOADING' && sample?.state === state
      ? Math.max(0, downloadedBytes - sample.bytes) * 1000 / Math.max(1, now - sample.at) : 0;
    const speedBytesPerSecond = state === 'DOWNLOADING'
      ? Math.round((sample?.state === state ? sample.speed * 0.7 : 0) + instantaneous * 0.3) : 0;
    this.progressSamples.set(id, { state, bytes: downloadedBytes, at: now, speed: speedBytesPerSecond });
    const status = { id, state, downloadedBytes, totalBytes, speedBytesPerSecond, ...(error ? { error } : {}) };
    const previous = this.status.get(id);
    this.status.set(id, status);
    this.onProgress(status);
    if (previous?.state !== state) this.log({ event: 'model_state', modelId: id, state });
    return status;
  }

  async manifest(model, dir, signal) {
    const path = join(dir, 'download.json');
    const cached = await readMetadata(path);
    if (this.validManifest(cached, model)) return cached;
    const response = await request(this.fetcher, `https://huggingface.co/api/models/${model.repository}/revision/${model.version}?blobs=true`, { signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
    if (!response.ok) { await response.body?.cancel(); throw new Error('Could not read model metadata from the publisher.'); }
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 2 * MiB) throw new Error('Model metadata is too large.');
      chunks.push(chunk);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (data.sha !== model.version || !Array.isArray(data.siblings)) throw new Error('Publisher model revision does not match the registry.');
    const manifest = {
      id: model.id, version: model.version,
      files: model.files.map(name => {
        const item = data.siblings.find(f => f.rfilename === name);
        return { name, size: item?.lfs?.size ?? item?.size, ...(item?.lfs ? { sha256: item.lfs.sha256 } : { gitBlob: item?.blobId }) };
      }),
    };
    if (!this.validManifest(manifest, model)) throw new Error('Publisher did not supply valid sizes and checksums for all model files.');
    await writeJSON(path, manifest);
    return manifest;
  }

  validManifest(manifest, model) {
    return manifest?.id === model.id && manifest.version === model.version &&
      Array.isArray(manifest.files) && manifest.files.length === model.files.length &&
      manifest.files.every((file, i) => file && file.name === model.files[i] &&
        Number.isSafeInteger(file.size) && file.size > 0 && file.size <= 8 * 1024 ** 3 &&
        (/^[a-f0-9]{64}$/.test(file.sha256 || '') || /^[a-f0-9]{40}$/.test(file.gitBlob || '')));
  }

  // One job per model, including verification/removal. Serialized downloads
  // avoid two different models both reserving the same free disk space.
  download(id) {
    const model = modelById(id, this.registry);
    if (this.jobs.has(id)) return this.jobs.get(id).promise;
    if (this.leases.has(id)) return Promise.reject(new Error('Unload this model before downloading it.'));
    if (this.jobs.size) return Promise.reject(new Error('Wait for the current model operation to finish.'));
    const controller = new AbortController();
    const promise = Promise.resolve().then(() => this.install(model, controller.signal)).finally(() => this.jobs.delete(id));
    this.jobs.set(id, { promise, controller });
    return promise;
  }

  cancel(id) { modelById(id, this.registry); this.jobs.get(id)?.controller.abort(); }

  async install(model, signal) {
    let downloaded = 0; let total = model.estimatedBytes;
    this.update(model.id, 'DOWNLOADING', downloaded, total);
    try {
      const dir = await this.location(model);
      const manifest = await this.manifest(model, dir, signal);
      total = manifest.files.reduce((sum, f) => sum + f.size, 0);
      let required = 0;
      for (const f of manifest.files) {
        const part = await exists(join(dir, `${basename(f.name)}.part`)); safeFile(part);
        const done = await exists(join(dir, basename(f.name))); safeFile(done);
        // Leave room to replace a corrupt complete file as well as retaining partials.
        required += Math.max(0, f.size - Math.min(part?.size || 0, f.size));
      }
      if (await this.diskFree(dir) < required + 256 * MiB) throw new Error('Not enough disk space. Free space and resume this download.');
      const verified = [];
      for (const file of manifest.files) {
        signal.throwIfAborted();
        const path = join(dir, basename(file.name));
        this.update(model.id, 'VERIFYING', downloaded, total);
        let hash = await digestFile(path, file, signal);
        if (!hash) {
          await removeFile(path);
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await this.downloadFile(model, file, path, signal, bytes => this.update(model.id, 'DOWNLOADING', downloaded + bytes, total));
              this.update(model.id, 'DOWNLOADED', downloaded + file.size, total);
              this.update(model.id, 'VERIFYING', downloaded + file.size, total);
              hash = await digestFile(`${path}.part`, file, signal);
              if (!hash) {
                this.update(model.id, 'CORRUPTED', downloaded, total);
                await removeFile(`${path}.part`);
                throw new Error('Model checksum verification failed. The corrupt download was removed.');
              }
              await rename(`${path}.part`, path);
              break;
            } catch (error) {
              signal.throwIfAborted();
              if (attempt === 2) throw error;
              this.log({ event: 'model_download_retry', modelId: model.id, attempt: attempt + 1 });
              await delay(this.retryDelay * (attempt + 1), undefined, { signal });
            }
          }
        }
        verified.push({ ...file, sha256: hash });
        downloaded += file.size;
      }
      await writeJSON(join(dir, 'model.json'), { id: model.id, version: model.version, type: model.type, license: model.license, sizeBytes: total, status: 'verified', files: verified });
      return this.update(model.id, 'READY', total, total);
    } catch (error) {
      const message = signal.aborted ? 'Download paused. Resume to continue from saved bytes.'
        : error.code === 'ENOSPC' ? 'Disk is full. Free space and resume this download.'
        : error instanceof Error && /^(Not enough|Model checksum|Publisher|Could not read|Untrusted|Model storage)/.test(error.message) ? error.message
        : 'Model download failed. Check your connection and available disk space, then resume.';
      this.update(model.id, 'FAILED', downloaded, total, message);
      throw new Error(message);
    }
  }

  async downloadFile(model, file, path, signal, progress) {
    const partial = `${path}.part`;
    const info = await exists(partial); safeFile(info);
    let offset = info?.size || 0;
    if (offset > file.size) { await removeFile(partial); offset = 0; }
    if (offset === file.size) return;
    const timeout = new AbortController();
    let timer;
    const touch = () => { clearTimeout(timer); timer = setTimeout(() => timeout.abort(), 30_000); timer.unref?.(); };
    touch();
    let handle;
    try {
      const url = `https://huggingface.co/${model.repository}/resolve/${model.version}/${file.name}`;
      const response = await request(this.fetcher, url, { signal: AbortSignal.any([signal, timeout.signal]), headers: { 'Accept-Encoding': 'identity', ...(offset ? { Range: `bytes=${offset}-` } : {}) } });
      if (response.status === 416) { await response.body?.cancel(); await removeFile(partial); throw new Error('Restart partial download.'); }
      if (response.status !== 200 && response.status !== 206) { await response.body?.cancel(); throw new Error('Model download server is unavailable.'); }
      if (response.status === 206 && response.headers.get('content-range') !== `bytes ${offset}-${file.size - 1}/${file.size}`) {
        await response.body?.cancel(); throw new Error('Invalid model download range.');
      }
      // A server may ignore Range. Truncate instead of appending the entire file.
      if (response.status === 200) offset = 0;
      handle = await open(partial, offset ? 'a' : 'w', 0o600);
      let lastReport = 0, diskCheck = offset;
      for await (const chunk of response.body) {
        touch(); signal.throwIfAborted();
        if (offset + chunk.length > file.size) throw new Error('Model download exceeds expected size.');
        await handle.writeFile(chunk);
        offset += chunk.length;
        if (offset - diskCheck >= 8 * MiB) {
          if (await this.diskFree(this.root) < 128 * MiB) throw new Error('Not enough disk space. Free space and resume this download.');
          diskCheck = offset;
        }
        if (Date.now() - lastReport >= 150) { progress(offset); lastReport = Date.now(); }
      }
      if (offset !== file.size) throw new Error('Incomplete model download.');
      await handle.sync(); progress(offset);
    } finally { clearTimeout(timer); await handle?.close(); }
  }

  async inspect(model) {
    if (this.jobs.has(model.id)) return this.status.get(model.id) || { id: model.id, state: 'VERIFYING', downloadedBytes: 0, totalBytes: model.estimatedBytes };
    const cached = this.status.get(model.id);
    if (cached) return cached;
    const dir = await this.location(model);
    const metadata = await readMetadata(join(dir, 'model.json'));
    if (!metadata) {
      let partial = 0;
      for (const file of model.files) {
        for (const name of [basename(file), `${basename(file)}.part`]) {
          const info = await exists(join(dir, name)); safeFile(info); partial += info?.size || 0;
        }
      }
      return { id: model.id, state: partial ? 'FAILED' : 'NOT_INSTALLED', downloadedBytes: partial, totalBytes: model.estimatedBytes,
        ...(partial ? { error: 'Interrupted installation. Resume to verify and finish the saved download.' } : {}) };
    }
    let valid = this.validManifest(metadata, model) && metadata.status === 'verified';
    if (valid) for (const file of metadata.files) {
      if (!await digestFile(join(dir, basename(file.name)), file)) { valid = false; break; }
    }
    const total = valid ? metadata.files.reduce((n, f) => n + f.size, 0) : model.estimatedBytes;
    return this.update(model.id, valid ? 'READY' : 'CORRUPTED', valid ? total : 0, total, valid ? undefined : 'Installed files failed verification. Download again to repair.');
  }

  snapshot(device, preferredASR = 'auto') {
    // React StrictMode and multiple windows may request setup simultaneously.
    this.scanning ||= this.buildSnapshot(device, preferredASR).finally(() => { this.scanning = null; });
    return this.scanning;
  }

  async buildSnapshot(device, preferredASR = 'auto') {
    const selection = selectModels(device, this.registry);
    const models = [];
    for (const model of this.registry) models.push({ ...model, ...await this.inspect(model), recommended: selection.required.includes(model.id), reason: selection.reasons[model.id], memoryWarning: selection.memoryWarnings[model.id] });
    await writeJSON(join(this.root, 'device-profile.json'), device);
    for (const model of models) Object.assign(model, this.status.get(model.id));
    return {
      device, directory: this.root, models, selectedASR: preferredASR,
      requiredDownloadBytes: models.filter(m => m.recommended && m.state !== 'READY').reduce((n, m) => n + m.totalBytes, 0),
      estimatedRequiredRamBytes: models.filter(m => m.recommended).reduce((n, m) => n + m.estimatedRamBytes, 0),
      features: [
        { name: 'Local model downloads', state: 'supported', reason: 'Verified, resumable downloads; installed models load without network access.' },
        { name: 'Live transcription and source separation', state: models.some(m => m.type === 'asr' && m.state === 'READY' && !m.reason) ? 'supported' : 'limited', reason: 'CPU streaming recognition with separate system/microphone inputs. Requires an installed speech model and working audio capture permissions.' },
        { name: 'Multiple interviewer detection', state: 'limited', reason: 'Optional Lite speaker model labels completed system-audio turns. Requires additional memory; overlapping speech and within-turn speaker changes are not separated.' },
        { name: 'Local interview analysis', state: 'unavailable', reason: 'Optional local LLM runtime is not integrated yet. Downloading weights alone does not enable inference.' },
      ],
    };
  }

  async remove(id) {
    const model = modelById(id, this.registry);
    if (this.jobs.size || this.leases.has(id)) throw new Error('Wait for model operations to finish and unload this model before deleting it.');
    const controller = new AbortController();
    const promise = (async () => {
      const dir = await this.location(model);
      // Delete only catalog-owned files. Never recursively remove a renderer path.
      if (this.bundledRoot) await writeJSON(join(dir, 'bundle-imported.json'), { version: model.version });
      for (const name of [...model.files.flatMap(f => [basename(f), `${basename(f)}.part`]), 'model.json', 'model.json.tmp', 'download.json', 'download.json.tmp']) await removeFile(join(dir, name));
      return this.update(id, 'NOT_INSTALLED', 0, model.estimatedBytes);
    })().finally(() => this.jobs.delete(id));
    this.jobs.set(id, { controller, promise });
    return promise;
  }

  async acquire(id) {
    const model = modelById(id, this.registry);
    if (this.jobs.size || this.leases.has(id)) throw new Error('This model is already loading or another model operation is in progress.');
    this.leases.add(id);
    try {
      // Rehash before handing files to native code; never rely on stale UI state.
      this.status.delete(id);
      const state = await this.inspect(model);
      if (state.state !== 'READY') throw new Error('Install and verify this model before loading it.');
      const dir = await this.location(model);
      let released = false;
      return { directory: dir, files: Object.fromEntries(model.files.map(name => [name, join(dir, basename(name))])), release: () => {
        if (!released) { released = true; this.leases.delete(id); }
      } };
    } catch (error) { this.leases.delete(id); throw error; }
  }

  async shutdown() {
    for (const job of this.jobs.values()) job.controller.abort();
    await Promise.allSettled([...this.jobs.values()].map(job => job.promise));
  }
}
