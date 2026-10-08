import type { InterviewEngine } from './services/interviewEngine';
import type { InterviewEvent, InterviewFrame } from '../shared/interview';
import { createSpeechEngine, type SpeechRuntimeOptions } from './services/localSpeechRuntime';

const port = process.parentPort;
let engine: InterviewEngine | undefined;
let messages = Promise.resolve();
port.on('message', ({ data }: { data: SpeechRuntimeOptions & { type: string; frame: InterviewFrame; requestId: number } }) => {
  messages = messages.then(() => handle(data)).catch(() => port.postMessage({ type: 'failed', message: 'Local speech processing failed. Saved transcript segments are preserved.' }));
});
async function handle(data: SpeechRuntimeOptions & { type: string; frame: InterviewFrame; requestId: number }) {
  try {
    if (data.type === 'init') {
      engine = await createSpeechEngine(data, (event: InterviewEvent) => port.postMessage({ type: 'event', event }));
      port.postMessage({ type: 'ready' });
    } else if (data.type === 'frame' && engine) {
      const start = performance.now(); await engine.frame(data.frame);
      port.postMessage({ type: 'ack', requestId: data.requestId, processingMs: performance.now() - start, memoryBytes: process.memoryUsage().rss });
    } else if (data.type === 'disable-optional') {
      engine?.disableOptional();
    } else if (data.type === 'stop') {
      await engine?.stop(); engine = undefined; port.postMessage({ type: 'stopped' });
    }
  } catch {
    // Native diagnostics can include private content; only send a fixed category.
    port.postMessage({ type: 'failed', message: 'Local speech processing failed. Saved transcript segments are preserved.' });
  }
}
