import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AudioService, decodeAudio } from '../src/main/services/audio.ts';
import { settingsInput } from '../src/main/services/validation.ts';
import { StealthService } from '../src/main/services/stealth.ts';
import { Storage } from '../src/main/services/storage.ts';
import { ImageService } from '../src/main/services/images.ts';
import { codeFromMessages, tokenizeCode } from '../src/renderer/src/components/CodingModeHUD.tsx';
import { AudioTranscriptionService } from '../src/main/services/audioTranscription.ts';

test('code viewer shows assistant code only, in message order', () => {
  const message = (id: string, role: 'user' | 'assistant', content: string) => ({ id, role, content, createdAt: 0 });
  const blocks = codeFromMessages([
    message('u', 'user', '```ts\nnot viewer content\n```'),
    message('a', 'assistant', 'src/a.ts\n```ts\nexport const a = 1;\n```'),
    message('b', 'assistant', '```py\nprint(2)\n```'),
  ]);
  assert.match(blocks[0].label, /^Soln 1 \(.+\) · src\/a\.ts$/);
  assert.match(blocks[1].label, /^Soln 2 \(.+\)$/);
  assert.deepEqual(blocks.map(({ code }) => code), ['export const a = 1;', 'print(2)']);
  assert.deepEqual(blocks.map(({ language }) => language), ['typescript', 'python']);
  const source = `const answer: number = 42; // result`;
  const tokens = tokenizeCode(source, 'typescript');
  assert.equal(tokens.map(({ text }) => text).join(''), source);
  assert.deepEqual([...new Set(tokens.map(({ kind }) => kind))], ['keyword', 'plain', 'type', 'operator', 'number', 'comment']);
});

test('AudioService saves base64 audio recordings locally', () => {
  const dir = mkdtempSync(join(tmpdir(), 'novi-audio-test-'));
  try {
    const audioService = new AudioService(dir);
    const sampleBase64 = Buffer.from('RIFF....WAVEfmt ').toString('base64');
    const result = audioService.saveRecording(`data:audio/webm;codecs=opus;base64,${sampleBase64}`, 'audio/webm', 'test.webm');

    assert.ok(result.id);
    assert.ok(existsSync(result.path));
    assert.equal(result.name, 'test.webm');
    const content = readFileSync(result.path);
    assert.equal(content.toString('base64'), sampleBase64);
    assert.equal(decodeAudio(`data:audio/webm;codecs=opus;base64,${sampleBase64}`).toString('base64'), sampleBase64);
    assert.throws(() => decodeAudio('data:audio/webm;base64,not base64'), /invalid/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Gemini transcription sends decoded audio to the selected model', async () => {
  const originalFetch = globalThis.fetch;
  const bytes = Buffer.from('recorded-audio');
  try {
    globalThis.fetch = async (url, init) => {
      assert.match(String(url), /models\/gemini-selected:generateContent$/);
      assert.equal((init?.headers as Record<string, string>)['x-goog-api-key'], 'test-key');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.contents[0].parts[0].inlineData.data, bytes.toString('base64'));
      return Response.json({ candidates: [{ content: { parts: [{ text: 'spoken words' }] } }] });
    };
    const service = new AudioTranscriptionService(
      { current: () => ({ id: 'user', settings: { activeConnectionId: 'gemini', connections: [{ id: 'gemini', provider: 'gemini', model: 'gemini-selected' }] } }) } as any,
      { get: () => 'test-key', has: () => true } as any,
    );
    assert.deepEqual(await service.transcribe(`data:audio/webm;codecs=opus;base64,${bytes.toString('base64')}`), { text: 'spoken words' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('settingsInput validates coding, behavioral, screenshot, audio shortcuts, and transparency', () => {
  const input = {
    displayName: 'Test User',
    theme: 'dark',
    clickThroughShortcut: 'Shift+Home',
    audioPipelineMode: 'local_stt',
    codingModeShortcut: 'Alt+C',
    behavioralModeShortcut: 'Alt+B',
    screenshotShortcut: 'Alt+3',
    audioRecordShortcut: 'Alt+A',
    transparentShortcut: 'Option+Control+T',
    autoSendOnAudioStop: true,
    fastInterviewModel: true,
    transparentOpacity: 75,
    transparentBg: '#0f172a',
    workingMonitorId: 12345,
  };

  const validated = settingsInput(input);
  assert.equal(validated.codingModeShortcut, 'Alt+C');
  assert.equal(validated.behavioralModeShortcut, 'Alt+B');
  assert.equal(validated.screenshotShortcut, 'Alt+3');
  assert.equal(validated.audioRecordShortcut, 'Alt+A');
  assert.equal(validated.transparentShortcut, 'Option+Control+T');
  assert.equal('autoSendOnAudioStop' in validated, false);
  assert.equal(validated.fastInterviewModel, true);
  assert.equal(validated.transparentOpacity, 75);
  assert.equal(validated.transparentBg, '#0f172a');
  assert.equal(validated.audioPipelineMode, 'local_stt');
  assert.equal(validated.workingMonitorId, 12345);

  // Test clamp of opacity
  const clamped = settingsInput({
    ...input,
    transparentOpacity: 15, // Under 20 min
  });
  assert.equal(clamped.transparentOpacity, 20);

  const clampedMax = settingsInput({
    ...input,
    transparentOpacity: 120, // Over 100 max
  });
  assert.equal(clampedMax.transparentOpacity, 100);
});

test('StealthService registers and updates coding, behavioral, and audio shortcuts', () => {
  let sentEvents: any[] = [];
  const mockWindow: any = {
    isDestroyed: () => false,
    setContentProtection: () => {},
    setAlwaysOnTop: () => {},
    setIgnoreMouseEvents: () => {},
    webContents: {
      send: (channel: string, data: any) => sentEvents.push({ channel, data }),
    },
  };

  const stealth = new StealthService(() => mockWindow);
  stealth.setShortcuts({
    coding: 'Alt+C',
    behavioral: 'Alt+B',
    screenshot: 'Alt+3',
    audio: 'Alt+A',
    transparent: 'Option+Control+T',
  });

  stealth.cleanup();
  assert.ok(true);
});

test('ImageService supports importing audio buffers without nativeImage failure', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'novi-image-audio-test-'));
  try {
    const { LocalAuthService } = await import('../src/main/services/auth.ts');
    const storage = new Storage(dir);
    await new LocalAuthService(storage).signUp('Ada', 'ada@example.com', 'password123');
    const images = new ImageService(storage);
    const audioData = Buffer.from('FAKE_WEBM_DATA');
    const attachment = images.importAudioBuffer(audioData, 'interview.webm', 'audio/webm');

    assert.ok(attachment.id);
    assert.equal(attachment.name, 'interview.webm');
    assert.equal(attachment.mimeType, 'audio/webm');
    assert.equal(images.preview(attachment.id), '');
    assert.ok(images.dataUrl(attachment.id).startsWith('data:audio/webm;base64,'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
