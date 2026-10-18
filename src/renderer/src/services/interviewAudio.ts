import type { AudioSource, InterviewFrame, InterviewMode } from '../../../shared/interview';
import { DeviceError, currentPlatform, deviceError, type Platform } from './deviceErrors';

/**
 * Opens the two kinds of audio Novi listens to: system audio (what the computer is playing, such as
 * the other person on a call) and the microphone.
 *
 * System audio, when no specific input is given (sessions and Get ready never give one), comes from a
 * screen share: Novi's main process answers the request itself with the first screen plus
 * `audio: 'loopback'` (src/main/main.ts), so no picker appears on Windows or Linux with X11. Windows
 * records the speakers through WASAPI loopback; Linux records the speakers' "monitor" through
 * PulseAudio or PipeWire. Each operating system gets a subclass with its own `systemHelp`, the
 * sentence shown when that screen share arrives without any sound track.
 */
export class AudioCaptureProvider {
  /**
   * Shown when the system audio capture opened but carried no sound track. It must never point to a
   * setting that sessions don't use (sessions ignore the inputs picked in Settings › Audio & Camera).
   * Each subclass below replaces this generic text with advice for its operating system.
   */
  readonly systemHelp: string = 'System audio is unavailable on this computer. Check your sound output, then retry.';
  async system(deviceId: string): Promise<MediaStream> {
    if (deviceId) return navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    if (!stream.getAudioTracks().length) { stream.getTracks().forEach(track => track.stop()); throw new Error(this.systemHelp); }
    return stream;
  }
  microphone(deviceId: string) {
    return navigator.mediaDevices.getUserMedia({ video: false, audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), echoCancellation: true, noiseSuppression: true } });
  }
}
/** macOS: uses an installed loopback device (BlackHole and similar) when one is found, otherwise the screen share. */
export class MacAudioCapture extends AudioCaptureProvider {
  override readonly systemHelp = 'System audio is unavailable. Allow Novi in macOS Privacy & Security audio/screen recording settings, then restart Novi. Older macOS versions may require a BlackHole loopback input configured in Audio MIDI Setup.';
  override async system(deviceId: string): Promise<MediaStream> {
    if (deviceId) return super.system(deviceId);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const loopback = devices.find(d => d.kind === 'audioinput' && /blackhole|loopback|soundflower|stereo mix|virtual/i.test(d.label));
      if (loopback) return super.system(loopback.deviceId);
    } catch { /* ignore */ }
    return super.system('');
  }
}
/** Windows: WASAPI loopback records whatever plays on the default sound output, so a missing track usually means there is no working output. */
export class WindowsAudioCapture extends AudioCaptureProvider { override readonly systemHelp = 'System audio is unavailable. Check that Windows has a working sound output, such as speakers or headphones, then retry.'; }
/** Linux: Chromium records the default output's monitor through PulseAudio or PipeWire (checked on PipeWire 1.0), so a missing track means neither is running. */
export class LinuxAudioCapture extends AudioCaptureProvider { override readonly systemHelp = 'System audio is unavailable. Novi records your computer’s sound through PulseAudio or PipeWire. Check that one of them is running, then retry.'; }

/**
 * The audio capture for this operating system. Used by listening, Get ready and the Settings audio
 * test, so all three give the same advice when system audio has no sound.
 *
 * @param platform the operating system; defaults to the current one (tests pass it explicitly).
 */
export function captureProvider(platform: Platform = currentPlatform()): AudioCaptureProvider {
  return platform === 'mac' ? new MacAudioCapture() : platform === 'windows' ? new WindowsAudioCapture() : new LinuxAudioCapture();
}

export class InterviewAudio {
  private releases: Array<() => void> = [];
  private pending = new Set<Promise<unknown>>();
  private cancelled = false;
  constructor(private onFrame: (frame: InterviewFrame) => Promise<unknown>, private onWarning: (message: string) => void) {}

  async start(sessionId: string, startedAt: number, mode: InterviewMode, microphoneId: string, systemId: string, onlySources?: AudioSource[]) {
    const provider = captureProvider();
    if (systemId && microphoneId === systemId && mode !== 'interviewer') throw new Error('Choose different inputs for system audio and your microphone.');
    let count = 0;
    const errors: string[] = [], details: string[] = [];
    const sources: AudioSource[] = onlySources || (mode === 'interviewer' ? ['system'] : ['system', 'microphone']);
    for (const source of sources) {
      if (this.cancelled) break;
      let stream: MediaStream | undefined, context: AudioContext | undefined;
      try {
        // Only the browser's own capture errors are reworded; Novi's messages (loopback help, 16 kHz) pass through.
        stream = await (source === 'system' ? provider.system(systemId) : provider.microphone(microphoneId))
          .catch((cause: unknown) => { throw cause instanceof DOMException ? deviceError(source, cause) : cause; });
        if (this.cancelled) { stream.getTracks().forEach(track => track.stop()); break; }
        context = new AudioContext({ sampleRate: 16000 });
        if (context.sampleRate !== 16000) throw new Error('This audio device cannot provide 16 kHz audio. Select another input.');
        await context.audioWorklet.addModule(new URL('./interview-audio-worklet.js', window.location.href).href);
        if (this.cancelled) { stream.getTracks().forEach(track => track.stop()); await context.close(); break; }
        const node = new AudioWorkletNode(context, 'interview-audio');
        const input = context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
        const silent = context.createGain(); silent.gain.value = 0;
        input.connect(node).connect(silent).connect(context.destination);
        const offset = Date.now() - startedAt;
        node.port.onmessage = ({ data }: MessageEvent<{ samples: Float32Array; sequence: number }>) => {
          if (this.cancelled) return;
          const request = this.onFrame({ sessionId, source, sequence: data.sequence, startTime: offset + data.sequence * 100, samples: data.samples })
            .catch(() => { this.onWarning('Audio processing stopped. Completed segments remain saved.'); this.close(); })
            .finally(() => { this.pending.delete(request); node.port.postMessage('credit'); });
          this.pending.add(request);
        };
        stream.getAudioTracks().forEach(track => { track.onended = () => this.onWarning(`${source === 'system' ? 'System audio' : 'Microphone'} disconnected. Other available inputs continue.`); });
        const capturedStream = stream, capturedContext = context;
        await context.resume();
        if (this.cancelled) { capturedStream.getTracks().forEach(track => track.stop()); await capturedContext.close(); break; }
        this.releases.push(() => { node.port.onmessage = null; node.disconnect(); input.disconnect(); silent.disconnect(); capturedStream.getTracks().forEach(track => { track.onended = null; track.stop(); }); void capturedContext.close().catch(() => {}); });
        count++;
      } catch (cause) {
        stream?.getTracks().forEach(track => track.stop());
        if (context && context.state !== 'closed') await context.close();
        const msg = `${source === 'system' ? 'System audio' : 'Microphone'}: ${cause instanceof Error ? cause.message : 'Capture unavailable.'}`;
        errors.push(msg);
        if (cause instanceof DeviceError && cause.details) details.push(cause.details);
        this.onWarning(msg);
      }
    }
    if (!count) throw new DeviceError(errors.length ? errors.join('; ') : 'No interview audio input is available. Check permissions and input selection.', details.join('; '));
  }
  close() { this.cancelled = true; this.releases.splice(0).forEach(release => release()); }
  async stop() { this.close(); await Promise.allSettled([...this.pending]); }
}
