import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, readFile, writeFile, symlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ModelManager, modelDownloadURL, detectHardware } from '../src/main/services/localModels.mjs';
import { MODEL_REGISTRY, selectModels } from '../src/main/services/localModelRegistry.mjs';

const GiB = 1024 ** 3;
const bytes = Buffer.from('test model bytes, never interview content');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const model = { ...MODEL_REGISTRY[0], id: 'test-model', files: ['model.onnx'], estimatedBytes: bytes.length };
const manifest = { id: model.id, version: model.version, files: [{ name: 'model.onnx', size: bytes.length, sha256: sha256(bytes) }] };
const fixtureMetadata = () => Response.json({ sha: model.version, siblings: [{ rfilename: 'model.onnx', size: bytes.length, lfs: { size: bytes.length, sha256: sha256(bytes) } }] });

async function fixture(t, fetcher = async url => url.includes('/api/') ? fixtureMetadata() : new Response(bytes), options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'novi-local-model-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const events = [], logs = [];
  const manager = new ModelManager(dir, { registry: [model], fetcher, diskFree: async () => 10 * GiB, retryDelay: 0, onProgress: status => events.push(status), log: event => logs.push(event), ...options });
  t.after(() => manager.shutdown());
  const location = await manager.location(model);
  return { dir, location, manager, events, logs };
}

test('catalog has immutable publisher revisions, unique safe output names and documented licenses', () => {
  for (const entry of MODEL_REGISTRY) {
    assert.match(entry.version, /^[a-f0-9]{40}$/);
    assert.ok(['Apache-2.0', 'MIT', 'CC-BY-4.0'].includes(entry.license));
    assert.equal(new Set(entry.files.map(file => file.split('/').at(-1))).size, entry.files.length);
    for (const file of entry.files) assert.ok(!file.split('/').some(part => part === '..' || part === '.'));
  }
});

test('selector reserves system memory, prefers small on 8 GB, balanced on larger hardware', () => {
  const device = { platform: 'darwin', arch: 'arm64', totalMemory: 8 * GiB, availableMemory: 4 * GiB, cores: 8 };
  assert.deepEqual(selectModels(device).required, ['zipformer-en-small', 'silero-vad']);
  assert.deepEqual(selectModels({ ...device, totalMemory: 24 * GiB, availableMemory: 16 * GiB }).required, ['zipformer-en-balanced', 'silero-vad']);
  assert.deepEqual(selectModels({ ...device, availableMemory: GiB }).required, []);
  assert.deepEqual(selectModels({ ...device, arch: 'ia32' }).required, []);
});

test('download verifies, records SHA256 metadata, loads offline and locks deletion/duplicate loads', async t => {
  const { manager, location, dir, events, logs } = await fixture(t);
  const first = manager.download(model.id);
  assert.equal(manager.download(model.id), first);
  assert.equal((await first).state, 'READY');
  assert.deepEqual(await readFile(join(location, 'model.onnx')), bytes);
  const saved = JSON.parse(await readFile(join(location, 'model.json'), 'utf8'));
  assert.equal(saved.status, 'verified');
  assert.equal(saved.files[0].sha256, sha256(bytes));
  assert.ok(events.some(e => e.state === 'VERIFYING'));
  assert.ok(events.some(e => e.state === 'DOWNLOADED'));
  assert.ok(logs.every(log => !JSON.stringify(log).includes(bytes.toString())));
  const offline = new ModelManager(dir, { registry: [model], fetcher: () => { throw new Error('Unexpected network'); } });
  assert.equal((await offline.inspect(model)).state, 'READY');
  const lease = await offline.acquire(model.id);
  await assert.rejects(offline.acquire(model.id), /already loading/);
  await assert.rejects(offline.remove(model.id), /unload/);
  lease.release();
  const nextLease = await offline.acquire(model.id);
  lease.release();
  await assert.rejects(offline.acquire(model.id), /already loading/);
  nextLease.release();
  assert.equal((await offline.remove(model.id)).state, 'NOT_INSTALLED');
  await assert.rejects(access(join(location, 'model.onnx')));
});

test('interrupted download survives restart and resumes the exact verified range', async t => {
  let requestedRange;
  const { manager, location, dir } = await fixture(t, async (url, options) => {
    assert.ok(!url.includes('/api/'), 'manifest must be reused offline from prior attempt');
    requestedRange = options.headers.Range;
    return new Response(bytes.subarray(5), { status: 206, headers: { 'Content-Range': `bytes 5-${bytes.length - 1}/${bytes.length}` } });
  });
  await writeFile(join(location, 'download.json'), JSON.stringify(manifest));
  await writeFile(join(location, 'model.onnx.part'), bytes.subarray(0, 5));
  const restarted = new ModelManager(dir, { registry: [model] });
  assert.equal((await restarted.inspect(model)).state, 'FAILED');
  assert.equal((await manager.download(model.id)).state, 'READY');
  assert.equal(requestedRange, 'bytes=5-');
});

test('server ignoring Range replaces the partial rather than appending duplicate bytes', async t => {
  const { manager, location } = await fixture(t);
  await writeFile(join(location, 'download.json'), JSON.stringify(manifest));
  await writeFile(join(location, 'model.onnx.part'), bytes.subarray(0, 5));
  await manager.download(model.id);
  assert.deepEqual(await readFile(join(location, 'model.onnx')), bytes);
});

test('bad checksums delete corrupt bytes and retry without ever claiming READY', async t => {
  let requests = 0;
  const { manager, location, events } = await fixture(t, async url => {
    if (url.includes('/api/')) return fixtureMetadata();
    requests++;
    return new Response(Buffer.alloc(bytes.length));
  });
  await assert.rejects(manager.download(model.id), /checksum/);
  assert.equal(requests, 3);
  assert.ok(events.some(e => e.state === 'CORRUPTED'));
  assert.ok(!events.some(e => e.state === 'READY'));
  await assert.rejects(access(join(location, 'model.onnx.part')));
  await assert.rejects(access(join(location, 'model.json')));
});

test('acquire detects post-install corruption even after a cached READY status', async t => {
  const { manager, location } = await fixture(t);
  await manager.download(model.id);
  await writeFile(join(location, 'model.onnx'), Buffer.alloc(bytes.length));
  await assert.rejects(manager.acquire(model.id), /verify/);
  assert.equal(manager.status.get(model.id).state, 'CORRUPTED');
});

test('disk admission stops before downloading weights', async t => {
  let weightRequests = 0;
  const { manager } = await fixture(t, async url => {
    if (url.includes('/api/')) return fixtureMetadata();
    weightRequests++;
    return new Response(bytes);
  }, { diskFree: async () => 1 });
  await assert.rejects(manager.download(model.id), /disk space/);
  assert.equal(weightRequests, 0);
});

test('publisher metadata requires exact revision and complete integrity information', async t => {
  const { manager } = await fixture(t, async () => Response.json({ sha: 'wrong-revision', siblings: [] }));
  await assert.rejects(manager.download(model.id), /revision/);
});

test('malformed saved manifests are reported as corrupt without losing files', async t => {
  const { manager, location } = await fixture(t);
  await writeFile(join(location, 'model.json'), JSON.stringify({ ...manifest, files: [null], status: 'verified' }));
  await writeFile(join(location, 'model.onnx'), bytes);
  assert.equal((await manager.inspect(model)).state, 'CORRUPTED');
  assert.deepEqual(await readFile(join(location, 'model.onnx')), bytes);
});

test('small Git-managed tokenizer files are checked by source blob hash and stored with SHA256', async t => {
  const gitBlob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  const { manager, location } = await fixture(t, async url => url.includes('/api/')
    ? Response.json({ sha: model.version, siblings: [{ rfilename: 'model.onnx', size: bytes.length, blobId: gitBlob }] }) : new Response(bytes));
  await manager.download(model.id);
  assert.equal(JSON.parse(await readFile(join(location, 'model.json'), 'utf8')).files[0].sha256, sha256(bytes));
});

test('URL allowlist rejects cloud inference, credentials, plaintext, private IPs, and deceptive suffixes', () => {
  for (const url of ['https://api.openai.com/v1', 'http://huggingface.co/file', 'https://huggingface.co.evil.test/file', 'https://127.0.0.1/file', 'https://user:pass@huggingface.co/file', 'https://huggingface.co:8443/file']) assert.throws(() => modelDownloadURL(url));
  assert.equal(modelDownloadURL('https://cas-bridge.xethub.hf.co/file'), 'https://cas-bridge.xethub.hf.co/file');
});

test('redirect outside publisher CDN is rejected before the next request', async t => {
  const destinations = [];
  const { manager } = await fixture(t, async url => {
    destinations.push(url);
    return new Response(null, { status: 302, headers: { Location: 'https://evil.test/model' } });
  });
  await assert.rejects(manager.download(model.id), /Untrusted/);
  assert.equal(destinations.length, 1);
});

test('arbitrary model IDs and symlinked partials cannot read/write outside the model directory', async t => {
  const { manager, location, dir } = await fixture(t);
  assert.throws(() => manager.download('../data.json'), /Unknown/);
  await assert.rejects(manager.remove('../data.json'), /Unknown/);
  const target = join(dir, 'private.txt');
  await writeFile(target, 'keep me');
  await symlink(target, join(location, 'model.onnx.part'));
  await assert.rejects(manager.download(model.id), /unsafe file/);
  await assert.rejects(manager.remove(model.id), /unsafe file/);
  assert.equal(await readFile(target, 'utf8'), 'keep me');
});

test('malformed range is never appended and can be retried', async t => {
  const { manager, location } = await fixture(t, async () => new Response(bytes.subarray(5), { status: 206, headers: { 'Content-Range': `bytes 0-${bytes.length - 1}/${bytes.length}` } }));
  await writeFile(join(location, 'download.json'), JSON.stringify(manifest));
  await writeFile(join(location, 'model.onnx.part'), bytes.subarray(0, 5));
  await assert.rejects(manager.download(model.id), /download failed/);
  assert.deepEqual(await readFile(join(location, 'model.onnx.part')), bytes.subarray(0, 5));
});

test('cancellation preserves bytes and shutdown waits for the operation to release its lock', async t => {
  let started;
  const reachedFetch = new Promise(resolve => { started = resolve; });
  const { manager, location } = await fixture(t, async (url, options) => {
    if (url.includes('/api/')) return fixtureMetadata();
    started();
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  });
  await writeFile(join(location, 'download.json'), JSON.stringify(manifest));
  await writeFile(join(location, 'model.onnx.part'), bytes.subarray(0, 5));
  const job = manager.download(model.id);
  const rejected = assert.rejects(job, /paused/);
  await reachedFetch;
  manager.cancel(model.id);
  await manager.shutdown();
  await rejected;
  assert.equal(manager.jobs.size, 0);
  assert.deepEqual(await readFile(join(location, 'model.onnx.part')), bytes.subarray(0, 5));
});

test('hardware discovery returns actual memory/disk and does not invent GPU memory or acceleration', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'novi-hardware-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const device = await detectHardware(dir, { gpuDevice: [{ deviceString: 'Test GPU', vendorId: 1 }] });
  assert.ok(device.totalMemory > 0);
  assert.ok(device.cores > 0);
  assert.ok(device.diskFree > 0);
  assert.equal(device.gpus[0].memoryBytes, null);
  assert.ok(device.accelerators.every(a => a.status === 'unverified'));
  for (const info of [undefined, null, 42, {}, { gpuDevice: 'unavailable' }]) {
    assert.deepEqual((await detectHardware(dir, info)).gpus, []);
  }
  assert.deepEqual((await detectHardware(dir, { gpuDevice: [null, 42, { deviceString: 42, vendorId: 'unknown' }] })).gpus,
    [{ name: 'GPU (name unavailable)', vendorId: null, memoryBytes: null }]);
});

test('simultaneous setup requests share a scan and atomically save one hardware profile', async t => {
  const { manager, dir } = await fixture(t);
  const device = await detectHardware(dir);
  const first = manager.snapshot(device);
  const second = manager.snapshot(device);
  assert.equal(first, second);
  const result = await first;
  assert.equal(result.models.length, 1);
  assert.equal(result.models[0].state, 'NOT_INSTALLED');
  const saved = JSON.parse(await readFile(join(dir, 'models', 'device-profile.json'), 'utf8'));
  assert.equal(saved.totalMemory, device.totalMemory);
});
