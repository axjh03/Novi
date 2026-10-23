import { debug } from './debug';
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
    return debug.run('smart-placement', async () => {
      this.lastAttempt = Date.now();
      const controller = new AbortController(); this.controller = controller;
      let timeout: AbortSignal | undefined;
      this.update({ busy: true, error: '', reason: '' });
      try {
        debug.event('Capturing desktop for placement');
        const capture = await this.deps.capture();
        controller.signal.throwIfAborted();
        const before = await this.deps.sample();
        timeout = AbortSignal.timeout(30_000);
        debug.event('Analyzing available space', { width: capture.area.width, height: capture.area.height });
        const analysisSignal = AbortSignal.any([controller.signal, timeout]);
        analysisSignal.throwIfAborted();
        const raw = await this.deps.analyze(capture, analysisSignal);
        analysisSignal.throwIfAborted();
        const after = await this.deps.sample();
        controller.signal.throwIfAborted();
        if (before.key !== after.key || changedScreenFraction(before.pixels, after.pixels) > 0.25) {
          debug.event('Kept current placement', { reason: 'screen-changed' });
          this.update({ reason: 'Your screen changed during analysis. Kept the current placement; try AutoDetect again once the screen settles.' });
        } else {
          let result: { confidence: number; reason: string };
          try {
            result = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
            if (!result || Array.isArray(result) || !Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1 || typeof result.reason !== 'string') throw new Error();
          } catch {
            debug.event('Invalid layout response', {}, 'error');
            throw new Error('The selected AI model did not return a usable layout. Try again with a model that supports images.');
          }
          const reason = result.reason.replace(/\s+/g, ' ').trim().slice(0, 240);
          if (result.confidence < 0.65) {
            debug.event('Kept current placement', { reason: 'no-clear-space', confidence: result.confidence });
            this.update({ reason: `No clearly better space found. ${reason || 'The model could not identify an unused area.'} Kept the current placement.` });
          } else {
            let bounds: WindowArea;
            try { bounds = windowLayoutBounds(capture.area, result); }
            catch {
              debug.event('Invalid layout coordinates', {}, 'error');
              throw new Error('The AI returned invalid window coordinates. Kept the current placement; try again with a model that supports images.');
            }
            if (bounds.width < Math.min(320, capture.area.width) || bounds.height < Math.min(240, capture.area.height)) {
              debug.event('Kept current placement', { reason: 'too-small', width: bounds.width, height: bounds.height });
              this.update({ reason: 'The suggested space is too small for a readable window (at least 320 × 240). Kept the current placement.' });
            } else if (bounds.width * bounds.height > capture.area.width * capture.area.height * 0.4) {
              debug.event('Kept current placement', { reason: 'too-large' });
              this.update({ reason: 'The suggested window would cover more than 40% of your screen. Kept the current placement to avoid covering your work.' });
            } else {
              this.deps.apply(bounds, capture);
              debug.event('Window placement applied', { confidence: result.confidence, width: bounds.width, height: bounds.height });
              this.update({ reason: reason || 'Moved Novi into an unused area.' });
            }
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          debug.event('AutoDetect failed', { error: timeout?.aborted ? 'analysis-timeout' : error instanceof Error ? error.name : 'unknown' }, 'error');
          this.update({ error: timeout?.aborted ? 'Layout analysis timed out after 30 seconds. Try again with a faster model that supports images.' : error instanceof Error ? error.message : 'AutoDetect could not analyze this screen. Check your selected AI model and screen recording access.' });
        }
      } finally { if (this.controller === controller) this.controller = null; this.update({ busy: false }); }
      return this.snapshot();
    });
  }
  dispose() { this.setEnabled(false); }
}
