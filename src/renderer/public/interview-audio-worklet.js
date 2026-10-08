// Chromium resamples each independent source through its 16 kHz AudioContext.
// Credits bound the port queue even if the renderer or inference process stalls.
class InterviewAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(1600);
    this.offset = 0;
    this.sequence = 0;
    this.credits = 2;
    this.port.onmessage = () => { this.credits = Math.min(2, this.credits + 1); };
  }
  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] || 0;
      this.buffer[this.offset++] = Math.max(-1, Math.min(1, value / channels.length));
      if (this.offset === 1600) {
        if (this.credits > 0) {
          this.credits--;
          this.port.postMessage({ samples: this.buffer, sequence: this.sequence }, [this.buffer.buffer]);
          this.buffer = new Float32Array(1600);
        }
        this.sequence++; this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('interview-audio', InterviewAudioProcessor);
