import { AUTO_DETECT_SHORTCUT, changedScreenFraction, windowLayoutBounds, type SmartPlacementState, type WindowArea } from '../../shared/windowLayout';

interface Capture { image: string; area: WindowArea; bounds: WindowArea; owner: string }
interface Dependencies {
  capture: () => Promise<Capture>;
  sample: () => Promise<{ pixels: Uint8Array; key: string }>;
  analyze: (capture: Capture, signal: AbortSignal) => Promise<string>;
  apply: (bounds: WindowArea, capture: Capture) => void;
  changed?: (state: SmartPlacementState) => void;
}

export class SmartPlacementService {
  private state: SmartPlacementState = { enabled: false, busy: false, error: '', reason: '', shortcut: AUTO_DETECT_SHORTCUT, shortcutRegistered: false };
  private timer: ReturnType<typeof setInterval> | null = null;
  private controller: AbortController | null = null;
  private baseline: Uint8Array | null = null;
  private previous: Uint8Array | null = null;
  private sampleKey = '';
  private lastAttempt = 0;
  private sampling = false;
  constructor(private deps: Dependencies) {}
  snapshot() { return { ...this.state }; }
  private update(patch: Partial<SmartPlacementState>) { Object.assign(this.state, patch); this.deps.changed?.(this.snapshot()); return this.snapshot(); }
  setShortcutRegistered(registered: boolean) { this.update({ shortcutRegistered: registered }); }
  setEnabled(enabled: boolean) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.baseline = this.previous = null;
    this.sampleKey = '';
    if (enabled) { this.timer = setInterval(() => { void this.check(); }, 5000); this.timer.unref(); }
    else this.controller?.abort();
    return this.update({ enabled, error: '' });
  }
  pause() { this.lastAttempt = Date.now(); this.baseline = this.previous = null; this.controller?.abort(); }
  async check() {
    if (!this.state.enabled || this.state.busy || this.sampling || Date.now() - this.lastAttempt < 30_000) return;
    this.sampling = true;
    try {
      const sample = await this.deps.sample();
      if (!this.state.enabled) return;
      if (!this.baseline || this.sampleKey !== sample.key) { this.baseline = sample.pixels; this.sampleKey = sample.key; }
      const stable = this.previous && changedScreenFraction(this.previous, sample.pixels) < 0.08;
      const changed = changedScreenFraction(this.baseline, sample.pixels) > 0.25;
      this.previous = sample.pixels;
      if (stable && changed) {
        this.baseline = sample.pixels;
        const result = await this.detect();
        if (result.error) { this.setEnabled(false); this.update({ error: result.error }); }
      }
    } catch (error) { this.setEnabled(false); this.update({ error: error instanceof Error ? error.message : 'Screen sampling failed.' }); }
    finally { this.sampling = false; }
  }
  async detect() {
    if (this.state.busy) return this.snapshot();
    this.lastAttempt = Date.now();
    const controller = new AbortController(); this.controller = controller;
    this.update({ busy: true, error: '', reason: '' });
    try {
      const capture = await this.deps.capture();
      controller.signal.throwIfAborted();
      const before = await this.deps.sample();
      const raw = await this.deps.analyze(capture, AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]));
      controller.signal.throwIfAborted();
      const after = await this.deps.sample();
      controller.signal.throwIfAborted();
      if (before.key !== after.key || changedScreenFraction(before.pixels, after.pixels) > 0.25) {
        this.update({ reason: 'Your screen changed during analysis. Kept the current placement; try AutoDetect again.' });
      } else {
        const result = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
        const bounds = windowLayoutBounds(capture.area, result);
        if (!Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1 || typeof result.reason !== 'string') throw new Error('The model did not return a valid placement. Choose a model with image support and try again.');
        if (result.confidence < 0.65) this.update({ reason: 'No clearly better space found. Kept the current placement.' });
        else {
          if (bounds.width < Math.min(320, capture.area.width) || bounds.height < Math.min(240, capture.area.height)) throw new Error('The suggested space is too small for a readable window. Kept the current placement.');
          if (bounds.width * bounds.height > capture.area.width * capture.area.height * 0.4) throw new Error('The suggested window would cover too much of your screen. Kept the current placement.');
          this.deps.apply(bounds, capture);
          this.update({ reason: result.reason.slice(0, 240) });
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) this.update({ error: error instanceof Error ? error.message : 'AutoDetect could not find a placement.' });
    } finally { if (this.controller === controller) this.controller = null; this.update({ busy: false }); }
    return this.snapshot();
  }
  dispose() { this.setEnabled(false); }
}
