import type { Storage } from './storage';
import type { CredentialStore } from './credentials';
import { activeConnection } from '../../shared/providers';
import { UserError } from './validation';
import { decodeAudio } from './audio';

export class AudioTranscriptionService {
  constructor(private storage: Storage, private credentials: CredentialStore) {}

  async transcribe(base64Audio: string, mimeType = 'audio/webm'): Promise<{ text: string }> {
    const user = this.storage.current();
    if (!user) throw new UserError('Sign in to transcribe audio.');

    // 1. Clean the base64 string
    const cleanBase64 = decodeAudio(base64Audio).toString('base64');

    // 2. Determine connection to use for STT
    const active = user.settings.activeConnectionId
      ? user.settings.connections.find((c) => c.id === user.settings.activeConnectionId)
      : activeConnection(user.settings);

    let selectedConnection = active;
    let selectedKey = '';
    try {
      if (selectedConnection) selectedKey = this.credentials.get(user.id, selectedConnection);
    } catch {
      selectedKey = '';
    }

    // If active connection has no key or is not Gemini/OpenAI, look for any available Gemini or OpenAI connection
    if (
      !selectedKey ||
      (selectedConnection?.provider !== 'gemini' &&
        selectedConnection?.provider !== 'openai' &&
        selectedConnection?.provider !== 'compatible')
    ) {
      const fallback = user.settings.connections.find(
        (c) => (c.provider === 'gemini' || c.provider === 'openai') && this.credentials.has(user.id, c)
      );
      if (fallback) {
        selectedConnection = fallback;
        try {
          selectedKey = this.credentials.get(user.id, fallback);
        } catch {
          selectedKey = '';
        }
      }
    }

    if (!selectedConnection || !selectedKey) {
      throw new UserError('To transcribe audio into text, configure an API key for Google Gemini or OpenAI in Settings.');
    }

    const provider = selectedConnection.provider;

    if (provider === 'gemini') {
      return this.transcribeWithGemini(cleanBase64, mimeType, selectedKey, selectedConnection.model);
    } else if (provider === 'openai' || provider === 'compatible') {
      return this.transcribeWithOpenAI(cleanBase64, mimeType, selectedKey, selectedConnection.baseUrl);
    }

    throw new UserError('Active provider does not support audio transcription. Please add a Gemini or OpenAI connection.');
  }

  private async transcribeWithGemini(cleanBase64: string, mimeType: string, apiKey: string, model: string): Promise<{ text: string }> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.replace(/^models\//, ''))}:generateContent`;
    const response = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: cleanBase64,
                },
              },
              {
                text: 'Transcribe the spoken audio verbatim in the language it was spoken. Output ONLY the raw transcribed text. Do NOT add quotes, markdown formatting, prefixes, explanations, or timestamps. If no speech is detected, output nothing.',
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new UserError(`Gemini transcription error (${response.status}): ${errText.slice(0, 120)}`);
    }

    const data: any = await response.json();
    const candidate = data.candidates?.[0];
    const text = (candidate?.content?.parts || [])
      .map((p: any) => p.text || '')
      .join('')
      .trim();

    return { text };
  }

  private async transcribeWithOpenAI(
    cleanBase64: string,
    mimeType: string,
    apiKey: string,
    baseUrl = 'https://api.openai.com/v1'
  ): Promise<{ text: string }> {
    const buffer = Buffer.from(cleanBase64, 'base64');
    const form = new FormData();
    const blob = new Blob([buffer], { type: mimeType });
    form.append('file', blob, mimeType === 'audio/wav' ? 'audio.wav' : 'audio.webm');
    form.append('model', 'whisper-1');

    const cleanBase = baseUrl.replace(/\/+$/, '');
    const url = cleanBase.includes('/audio/transcriptions') ? cleanBase : `${cleanBase}/audio/transcriptions`;

    const response = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new UserError(`Whisper transcription error (${response.status}): ${errText.slice(0, 120)}`);
    }

    const data: any = await response.json();
    const text = (data.text || '').trim();
    return { text };
  }
}
