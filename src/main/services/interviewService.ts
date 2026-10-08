import { utilityProcess, type UtilityProcess } from 'electron';
import { totalmem } from 'node:os';
import type { Storage } from './storage';
import type { ModelManager } from './localModels.mjs';
import { availableSystemMemory, detectHardware } from './localModels.mjs';
import { InterviewStore } from './interviewStore';
import { validateFrame } from './interviewEngine';
import { object, UserError } from './validation';
import type { InterviewEvent, InterviewSession, InterviewStart } from '../../shared/interview';

type Lease = Awaited<ReturnType<ModelManager['acquire']>>;
export class InterviewService {
  readonly store: InterviewStore;
  private worker?: UtilityProcess;
  private session?: InterviewSession;
  private owner = '';
  private windowId = 0;
  private busy = false;
  private stopping?: Promise<InterviewSession | null>;
  private leases: Lease[] = [];
  private nextRequest = 0;
  private pending = new Map<number, { resolve: (value: boolean) => void; timer: ReturnType<typeof setTimeout> }>();
  private monitor?: ReturnType<typeof setInterval>;
  private dropped = 0;
  private lastMetric = 0;
  private lastWarning = 0;
  private generation = 0;
  private sequences = new Map<string, number>();
  get active() { return this.busy || Boolean(this.session); }

  constructor(private storage: Storage, private models: ModelManager, private workerPath: string,
    private emit: (windowId: number, event: InterviewEvent) => void) { this.store = new InterviewStore(storage.directory); }

  async start(input: unknown, windowId: number) {
    if (this.busy || this.session || this.stopping) throw new UserError('Stop the current interview before starting another.');
    const value = object(input);
    if (!['interviewer', 'conversation', 'multiple'].includes(String(value.mode)) || typeof value.diarization !== 'boolean' ||
      typeof value.vadThreshold !== 'number' || !Number.isFinite(value.vadThreshold) || value.vadThreshold < 0.001 || value.vadThreshold > 0.05 || (value.useVad !== undefined && typeof value.useVad !== 'boolean')) throw new UserError('Invalid interview options.');
    const options = value as unknown as InterviewStart;
    if (options.speakerThreshold !== undefined && (!Number.isFinite(options.speakerThreshold) || options.speakerThreshold < 0.3 || options.speakerThreshold > 0.9)) throw new UserError('Speaker similarity must be between 0.3 and 0.9.');
    const owner = this.storage.current().id;
    this.busy = true; this.owner = owner; this.windowId = windowId;
    const generation = ++this.generation;
    try {
      const device = await detectHardware(this.storage.directory);
      const setup = await this.models.snapshot(device);
      if (generation !== this.generation) throw new UserError('Interview startup was cancelled.');
      const preferred = this.storage.current().settings.localASRModelId || 'auto';
      const candidates = setup.models.filter(model => model.type === 'asr' && model.state === 'READY' && !model.reason)
        .sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred) || Number(b.recommended) - Number(a.recommended) || a.estimatedRamBytes - b.estimatedRamBytes);
      if (preferred !== 'auto' && !candidates.some(model => model.id === preferred)) throw new UserError('Download the selected speech model in Local AI setup first, or choose Automatic.');
      if (!candidates.length) throw new UserError('Download a speech model in Local AI setup first.');
      const vad = options.useVad === false ? undefined : setup.models.find(model => model.type === 'vad' && model.state === 'READY' && !model.reason);
      const speakerModel = options.mode !== 'interviewer' && options.diarization ? setup.models.find(model => model.type === 'diarization' && model.state === 'READY' && !model.reason) : undefined;
      let loaded = false;
      for (const model of candidates) {
        if (this.storage.current().id !== owner) throw new UserError('Your account changed. Start the interview again.');
        if (device.availableMemory < model.estimatedRamBytes + 768 * 1024 ** 2) continue;
        const lease = await this.models.acquire(model.id);
        this.leases.push(lease);
        if (generation !== this.generation) throw new UserError('Interview startup was cancelled.');
        const session = this.store.create(owner, options.mode, model.id, model.version);
        this.session = session;
        try {
          let vadLease: Lease | undefined;
          let speakerLease: Lease | undefined;
          if (vad) try { vadLease = await this.models.acquire(vad.id); this.leases.push(vadLease); } catch { this.warn('Neural voice model unavailable. Lightweight detection remains active.'); }
          if (speakerModel && device.availableMemory > model.estimatedRamBytes + speakerModel.estimatedRamBytes + 1024 ** 3) {
            try { speakerLease = await this.models.acquire(speakerModel.id); this.leases.push(speakerLease); } catch { this.warn('Speaker model unavailable. Transcription continues without interviewer separation.'); }
          }
          try { await this.launch(session, lease, options.vadThreshold, vadLease?.files['onnx/model.onnx'], speakerLease && Object.values(speakerLease.files)[0], options.speakerThreshold); }
          catch (cause) {
            if ((!vadLease && !speakerLease) || generation !== this.generation) throw cause;
            const failedWorker = this.worker; this.worker = undefined; failedWorker?.kill();
            vadLease?.release(); speakerLease?.release(); speakerLease = undefined;
            await this.launch(session, lease, options.vadThreshold);
            this.warn('Optional voice/speaker models could not load. Transcription continues with lightweight voice detection and source labels.');
          }
          if (options.mode !== 'interviewer' && options.diarization) this.warn(speakerLease ? 'Lite speaker detection is active: labels update after each turn. Overlap and within-turn speaker changes are not separated.' : 'Interviewer separation is off. Install the speaker model and enable Lite speaker detection; sufficient free memory is required.');
          if (generation !== this.generation) throw new UserError('Interview startup was cancelled.');
          loaded = true; break;
        } catch {
          this.worker?.kill(); this.worker = undefined;
          for (const item of this.leases.splice(0)) item.release();
          session.status = 'interrupted'; this.store.metadata(owner, session); this.session = undefined;
          console.info(JSON.stringify({ scope: 'local-ai', event: 'asr_fallback', modelId: model.id, backend: 'cpu' }));
        }
      }
      if (!loaded || !this.session) throw new UserError('No installed speech model could start. Free memory or reinstall the lightweight speech model.');
      if (!vad) this.warn('Using lightweight voice detection. Install the VAD model for neural voice detection.');
      this.dropped = 0;
      this.sequences.clear();
      let optionalDisabled = false;
      let checkingMemory = false;
      this.monitor = setInterval(() => {
        if (checkingMemory) return;
        checkingMemory = true;
        void availableSystemMemory().then(available => {
          if (!optionalDisabled && available < 1024 ** 3) {
            optionalDisabled = true; this.worker?.postMessage({ type: 'disable-optional' });
            this.warn('Memory is low. Speaker detection and neural VAD are disabled; lightweight transcription continues.');
            console.info(JSON.stringify({ scope: 'local-ai', event: 'memory_pressure', action: 'disable_optional' }));
          }
          if (available < Math.max(384 * 1024 ** 2, totalmem() * 0.05)) {
            this.warn('Recording stopped to protect system memory. Completed segments were saved.');
            void this.stop(true);
          }
        }).finally(() => { checkingMemory = false; });
      }, 3000);
      return this.session;
    } finally {
      this.busy = false;
      if (!this.session) for (const lease of this.leases.splice(0)) lease.release();
    }
  }

  private launch(session: InterviewSession, lease: Lease, vadThreshold: number, vadFile?: string, speakerFile?: string, speakerThreshold?: number) {
    return new Promise<void>((resolve, reject) => {
      const worker = utilityProcess.fork(this.workerPath, [], { stdio: 'ignore', serviceName: 'Novi local speech' });
      this.worker = worker;
      let ready = false;
      const timeout = setTimeout(() => { worker.kill(); reject(new Error('Speech model load timed out.')); }, 60_000);
      worker.on('spawn', () => worker.postMessage({ type: 'init', sessionId: session.id, modelId: session.modelId, files: lease.files, vadFile, vadThreshold, speakerFile, speakerThreshold }));
      worker.on('message', (message: { type: string; event?: InterviewEvent; requestId?: number; processingMs?: number; memoryBytes?: number }) => {
        if (this.worker !== worker) return;
        if (message.type === 'ready') { ready = true; clearTimeout(timeout); console.info(JSON.stringify({ scope: 'local-ai', event: 'model_loaded', modelId: session.modelId, backend: 'cpu' })); resolve(); }
        else if (message.type === 'event' && message.event) this.accept(message.event);
        else if (message.type === 'ack' && typeof message.requestId === 'number') {
          const pending = this.pending.get(message.requestId);
          if (pending) { clearTimeout(pending.timer); this.pending.delete(message.requestId); pending.resolve(true); }
          if (Date.now() - this.lastMetric > 1000) {
            this.lastMetric = Date.now();
            this.emit(this.windowId, { type: 'metrics', sessionId: session.id, processingMs: message.processingMs || 0, queueDepth: this.pending.size, droppedFrames: this.dropped, memoryBytes: message.memoryBytes || 0 });
          }
          if ((message.processingMs || 0) > 150) this.warn('Speech processing is behind real time. Choose the lightweight model or use interviewer-only mode.');
        } else if (message.type === 'failed') {
          clearTimeout(timeout);
          if (!ready) reject(new Error('Speech model initialization failed.'));
          else { this.warn('Local speech processing failed. Completed segments are safe.'); void this.stop(true); }
        }
      });
      worker.on('exit', () => {
        clearTimeout(timeout);
        if (!ready) reject(new Error('Speech process exited during initialization.'));
        else if (this.worker === worker && !this.stopping) {
          this.warn('The speech process exited. Recover completed segments from interview history.');
          void this.stop(true);
        }
      });
      worker.on('error', () => {
        // Do not log native diagnostic reports: they can include process memory.
        clearTimeout(timeout);
        if (!ready) reject(new Error('Speech process could not initialize.'));
        else if (this.worker === worker && !this.stopping) {
          this.warn('The speech process failed. Completed transcript segments are saved.');
          void this.stop(true);
        }
      });
    });
  }

  private accept(event: InterviewEvent) {
    if (!this.session || ('sessionId' in event ? event.sessionId : event.segment.sessionId) !== this.session.id) return;
    try {
      if (event.type === 'transcript:final') {
        if (!Object.hasOwn(this.session.speakers, event.segment.speakerId)) {
          this.session.speakers[event.segment.speakerId] = event.segment.source === 'microphone' ? 'You' : `Interviewer ${event.segment.speakerId.split('_').at(-1)}`;
          this.store.metadata(this.owner, this.session);
          this.emit(this.windowId, { type: 'speaker:update', sessionId: this.session.id, speakers: this.session.speakers });
        }
        this.store.finalize(this.owner, event.segment); // Durable before notifying the renderer.
        this.session.segments.push(event.segment); this.session.updatedAt = Date.now();
        if (this.session.segments.length >= 10_000) { this.warn('Interview reached the segment limit. Start a new interview.'); void this.stop(); }
      }
      this.emit(this.windowId, event);
    } catch {
      this.warn('Could not save a transcript segment. Recording is stopping; check disk space.');
      void this.stop(true);
    }
  }

  frame(input: unknown, windowId: number): Promise<boolean> {
    const frame = validateFrame(input);
    if (!this.session || this.session.id !== frame.sessionId || this.windowId !== windowId || this.storage.current().id !== this.owner || this.stopping || !this.worker) throw new UserError('This interview is not recording.');
    if (this.session.mode === 'interviewer' && frame.source !== 'system') throw new UserError('Microphone is disabled in interviewer-only mode.');
    if (frame.startTime > Date.now() - this.session.startedAt + 2000) throw new UserError('Invalid audio timestamp.');
    const previous = this.sequences.get(frame.source) ?? -1;
    if (frame.sequence <= previous) throw new UserError('Out-of-order audio frame.');
    if (this.pending.size >= 4) { this.dropped++; this.warn('Audio queue is full; some audio was skipped to prevent growing delay.'); return Promise.resolve(false); }
    if (previous >= 0 && frame.sequence > previous + 1) { this.dropped += frame.sequence - previous - 1; this.warn('Audio frames were skipped to keep latency bounded. Try interviewer-only mode or close other applications.'); }
    this.sequences.set(frame.source, frame.sequence);
    const requestId = ++this.nextRequest;
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.pending.delete(requestId); resolve(false); this.warn('Speech processing stalled. Recording is stopping.'); void this.stop(true); }, 5000);
      this.pending.set(requestId, { resolve, timer });
      this.worker!.postMessage({ type: 'frame', frame, requestId });
    });
  }

  private warn(message: string) {
    if (!this.session || (Date.now() - this.lastWarning < 3000 && /behind real time|queue is full|frames were skipped/.test(message))) return;
    this.lastWarning = Date.now();
    this.emit(this.windowId, { type: 'warning', sessionId: this.session.id, message });
  }

  stop(interrupted = false): Promise<InterviewSession | null> {
    this.generation++;
    if (this.stopping) return this.stopping;
    this.stopping = this.finish(interrupted).finally(() => { this.stopping = undefined; });
    return this.stopping;
  }
  private async finish(interrupted: boolean) {
    clearInterval(this.monitor);
    const session = this.session, worker = this.worker;
    if (!session) return null;
    if (worker?.pid) await new Promise<void>(resolve => {
      const timer = setTimeout(() => { interrupted = true; worker.off('message', onMessage); resolve(); }, 3000);
      const onMessage = (message: { type: string }) => { if (message.type === 'stopped') { clearTimeout(timer); worker.off('message', onMessage); resolve(); } };
      worker.on('message', onMessage); worker.postMessage({ type: 'stop' });
    });
    this.worker = undefined; worker?.kill();
    console.info(JSON.stringify({ scope: 'local-ai', event: 'models_unloaded', modelId: session.modelId }));
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.resolve(false); }
    this.pending.clear();
    for (const lease of this.leases.splice(0)) lease.release();
    session.status = interrupted ? 'interrupted' : 'complete'; session.updatedAt = Date.now();
    this.session = undefined;
    this.store.metadata(this.owner, session);
    this.emit(this.windowId, { type: 'status', sessionId: session.id, status: session.status });
    return session;
  }
  assertOwner(windowId: number) {
    if (this.session && (this.windowId !== windowId || this.storage.current().id !== this.owner)) throw new UserError('This interview belongs to another session.');
  }
  list() { return this.store.list(this.storage.current().id); }
  read(id: string) { return this.store.read(this.storage.current().id, id); }
  rename(id: string, speakerId: string, name: string) {
    const owner = this.storage.current().id;
    const session = this.session?.id === id && this.owner === owner ? this.session : this.store.read(owner, id);
    if (!Object.hasOwn(session.speakers, speakerId)) throw new UserError('Unknown interview speaker.');
    session.speakers[speakerId] = name;
    this.store.metadata(owner, session);
    this.emit(this.windowId, { type: 'speaker:update', sessionId: id, speakers: session.speakers });
    return session;
  }
}
