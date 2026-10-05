import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioPipelineMode, ImageAttachment } from '../../../shared/types';
import { errorText, unwrap } from '../services/api';

interface Options {
  pipelineMode: AudioPipelineMode;
  attachRawAudio: boolean;
  onTranscribed: (text: string) => void;
  onAudioAttached: (attachment: ImageAttachment) => void;
}

export function useAudioRecording(options: Options) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [isRecording, setIsRecording] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const contextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameRef = useRef<number | null>(null);

  const release = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    streamsRef.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    streamsRef.current = [];
    if (contextRef.current) void contextRef.current.close().catch(() => {});
    contextRef.current = null;
    timerRef.current = null;
    frameRef.current = null;
    setAudioLevel(0);
  }, []);

  const startRecording = useCallback(async () => {
    if (isStarting || isRecording || isProcessing) return;
    setIsStarting(true);
    setError('');
    setRecordingSeconds(0);
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const audioTracks = display.getAudioTracks();
      if (!audioTracks.length) {
        display.getTracks().forEach((track) => track.stop());
        throw new Error('System audio is unavailable. Enable system audio sharing and try again.');
      }
      display.getVideoTracks().forEach((track) => track.stop());
      const recordingStream = new MediaStream([audioTracks[0]]);
      streamsRef.current = [recordingStream];

      const context = new AudioContext();
      contextRef.current = context;
      await context.resume();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(recordingStream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      let lastMeterUpdate = 0;
      const updateMeter = (now: number) => {
        if (!contextRef.current) return;
        if (now - lastMeterUpdate >= 80) {
          analyser.getByteTimeDomainData(samples);
          const rms = Math.sqrt(samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / samples.length);
          setAudioLevel(Math.min(100, Math.max(0, Math.round((rms - 0.005) * 700))));
          lastMeterUpdate = now;
        }
        frameRef.current = requestAnimationFrame(updateMeter);
      };
      frameRef.current = requestAnimationFrame(updateMeter);

      const recorder = new MediaRecorder(recordingStream);
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { setError('Recording stopped unexpectedly. Try again.'); release(); setIsRecording(false); };
      recorder.onstop = async () => {
        setIsProcessing(true);
        try {
          const mimeType = (recorder.mimeType || 'audio/webm').split(';')[0];
          const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
          if (!blob.size) throw new Error('No system audio was captured. Play some audio and try again.');
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error('Could not read the recording.'));
            reader.readAsDataURL(blob);
          });
          const filename = `System-Audio-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
          await unwrap(window.novi.saveAudioRecording({ base64, mimeType, filename }));
          if (optionsRef.current.pipelineMode === 'live_stream' && optionsRef.current.attachRawAudio) {
            const attachment = await unwrap(window.novi.attachAudioRecording({ base64, mimeType, filename }));
            optionsRef.current.onAudioAttached(attachment);
          } else {
            const result = await unwrap(window.novi.transcribeAudio({ base64, mimeType }));
            if (!result.text.trim()) throw new Error('No speech was detected in the recording.');
            optionsRef.current.onTranscribed(result.text.trim());
          }
        } catch (cause) {
          setError(errorText(cause));
        } finally {
          setIsProcessing(false);
          recorderRef.current = null;
        }
      };
      recorder.start(250);
      setIsRecording(true);
      timerRef.current = setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
    } catch (cause) {
      setError(errorText(cause));
      release();
      setIsRecording(false);
    } finally {
      setIsStarting(false);
    }
  }, [isStarting, isRecording, isProcessing, release]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    release();
    setIsRecording(false);
  }, [release]);

  const toggleRecording = useCallback(() => {
    if (isRecording) stopRecording();
    else void startRecording();
  }, [isRecording, startRecording, stopRecording]);

  useEffect(() => () => { if (recorderRef.current) recorderRef.current.onstop = null; release(); }, [release]);

  return { isRecording, isStarting, isProcessing, recordingSeconds, audioLevel, error, startRecording, stopRecording, toggleRecording };
}
