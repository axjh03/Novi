import type { AudioSource, InterviewFrame, InterviewMode } from '../../../shared/interview';

export class AudioCaptureProvider {
  protected systemHelp = 'Choose a system loopback input or enable system audio sharing.';
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
export class MacAudioCapture extends AudioCaptureProvider { protected systemHelp = 'System audio is unavailable. Grant screen/audio capture permission, or select a BlackHole loopback input configured in Audio MIDI Setup.'; }
export class WindowsAudioCapture extends AudioCaptureProvider { protected systemHelp = 'WASAPI loopback is unavailable. Check system audio sharing or select an enabled loopback input.'; }
export class LinuxAudioCapture extends AudioCaptureProvider { protected systemHelp = 'System audio is unavailable. Select a PipeWire/PulseAudio monitor input or route playback to a loopback input using your sound controls.'; }

export class InterviewAudio {
  private releases: Array<() => void> = [];
  private pending = new Set<Promise<unknown>>();
  private cancelled = false;
  constructor(private onFrame: (frame: InterviewFrame) => Promise<unknown>, private onWarning: (message: string) => void) {}

  async start(sessionId: string, startedAt: number, mode: InterviewMode, microphoneId: string, systemId: string, onlySources?: AudioSource[]) {
    const provider = /Mac/.test(navigator.platform) ? new MacAudioCapture() : /Win/.test(navigator.platform) ? new WindowsAudioCapture() : new LinuxAudioCapture();
    if (systemId && microphoneId === systemId && mode !== 'interviewer') throw new Error('Choose different inputs for system audio and your microphone.');
    let count = 0;
    const sources: AudioSource[] = onlySources || (mode === 'interviewer' ? ['system'] : ['system', 'microphone']);
    for (const source of sources) {
      if (this.cancelled) break;
      let stream: MediaStream | undefined, context: AudioContext | undefined;
      try {
        stream = await (source === 'system' ? provider.system(systemId) : provider.microphone(microphoneId));
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
        this.onWarning(`${source === 'system' ? 'System audio' : 'Microphone'}: ${cause instanceof Error ? cause.message : 'Capture unavailable.'}`);
      }
    }
    if (!count) throw new Error('No interview audio input is available. Check permissions and input selection.');
  }
  close() { this.cancelled = true; this.releases.splice(0).forEach(release => release()); }
  async stop() { this.close(); await Promise.allSettled([...this.pending]); }
}
