import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Mic, Play, Square, RotateCcw, Radio, ShieldCheck, AlertCircle, FileText, Sparkles, Copy, Check, Loader2, Volume2 } from 'lucide-react';
import { errorText, unwrap } from '../services/api';

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the audio recording.'));
    reader.readAsDataURL(blob);
  });
}

async function runTranscription(blob: Blob, mimeType: string): Promise<string> {
  const base64 = await blobToBase64(blob);
  const result = await unwrap(window.novi.transcribeAudio({ base64, mimeType }));
  return result.text ? result.text.trim() : '';
}

export function DeviceTester() {
  // Device enumeration state
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [selectedCamId, setSelectedCamId] = useState<string>('');

  // 1. Microphone Input state
  const [micState, setMicState] = useState<'idle' | 'recording' | 'recorded' | 'playing'>('idle');
  const [micDuration, setMicDuration] = useState<number>(20);
  const [micTimeLeft, setMicTimeLeft] = useState<number>(20);
  const [micVolumeLevel, setMicVolumeLevel] = useState(0);
  const [micAudioUrl, setMicAudioUrl] = useState<string | null>(null);
  const [micError, setMicError] = useState('');
  const [micTranscript, setMicTranscript] = useState<string | null>(null);
  const [micTranscribing, setMicTranscribing] = useState(false);
  const [micTranscriptError, setMicTranscriptError] = useState('');

  const micRecorderRef = useRef<MediaRecorder | null>(null);
  const micChunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAudioCtxRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micAnimRef = useRef<number | null>(null);
  const micTimerRef = useRef<NodeJS.Timeout | null>(null);
  const micAudioElemRef = useRef<HTMLAudioElement | null>(null);

  // 2. System Audio IN (Desktop / Call Audio Loopback Capture) state
  const [sysState, setSysState] = useState<'idle' | 'recording' | 'recorded' | 'playing'>('idle');
  const [sysDuration, setSysDuration] = useState<number>(10);
  const [sysTimeLeft, setSysTimeLeft] = useState<number>(10);
  const [sysVolumeLevel, setSysVolumeLevel] = useState(0);
  const [sysAudioUrl, setSysAudioUrl] = useState<string | null>(null);
  const [sysError, setSysError] = useState('');
  const [sysTranscript, setSysTranscript] = useState<string | null>(null);
  const [sysTranscribing, setSysTranscribing] = useState(false);
  const [sysTranscriptError, setSysTranscriptError] = useState('');

  const sysRecorderRef = useRef<MediaRecorder | null>(null);
  const sysChunksRef = useRef<Blob[]>([]);
  const sysStreamRef = useRef<MediaStream | null>(null);
  const sysAudioCtxRef = useRef<AudioContext | null>(null);
  const sysAnalyserRef = useRef<AnalyserNode | null>(null);
  const sysAnimRef = useRef<number | null>(null);
  const sysTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sysAudioElemRef = useRef<HTMLAudioElement | null>(null);

  // 3. Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraLabel, setCameraLabel] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);

  // 4. Dedicated Audio Transcript Test state
  const [transSource, setTransSource] = useState<'mic' | 'system'>('mic');
  const [transMicId, setTransMicId] = useState<string>('');
  const [transDuration, setTransDuration] = useState<number>(10);
  const [transTimeLeft, setTransTimeLeft] = useState<number>(10);
  const [transState, setTransState] = useState<'idle' | 'recording' | 'recorded'>('idle');
  const [transVolumeLevel, setTransVolumeLevel] = useState(0);
  const [transAudioUrl, setTransAudioUrl] = useState<string | null>(null);
  const [transBlob, setTransBlob] = useState<Blob | null>(null);
  const [transText, setTransText] = useState<string | null>(null);
  const [transLoading, setTransLoading] = useState(false);
  const [transError, setTransError] = useState('');
  const [transPlaying, setTransPlaying] = useState(false);
  const [transCopied, setTransCopied] = useState(false);

  const transRecorderRef = useRef<MediaRecorder | null>(null);
  const transChunksRef = useRef<Blob[]>([]);
  const transStreamRef = useRef<MediaStream | null>(null);
  const transAudioCtxRef = useRef<AudioContext | null>(null);
  const transAnalyserRef = useRef<AnalyserNode | null>(null);
  const transAnimRef = useRef<number | null>(null);
  const transTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transAudioElemRef = useRef<HTMLAudioElement | null>(null);

  // Enumerate devices
  const refreshDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      const videoInputs = devices.filter(d => d.kind === 'videoinput');

      setMics(audioInputs);
      setCams(videoInputs);

      if (audioInputs.length > 0 && !selectedMicId) setSelectedMicId(audioInputs[0].deviceId);
      if (audioInputs.length > 0 && !transMicId) setTransMicId(audioInputs[0].deviceId);
      if (videoInputs.length > 0 && !selectedCamId) setSelectedCamId(videoInputs[0].deviceId);
    } catch (err) {
      console.warn('Device enumeration failed:', err);
    }
  };

  useEffect(() => {
    void refreshDevices();
    const handleDeviceChange = () => { void refreshDevices(); };
    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMicStreams();
      stopSysStreams();
      stopCameraStreams();
      stopTransStreams();
      if (micAudioUrl) URL.revokeObjectURL(micAudioUrl);
      if (sysAudioUrl) URL.revokeObjectURL(sysAudioUrl);
      if (transAudioUrl) URL.revokeObjectURL(transAudioUrl);
    };
  }, [micAudioUrl, sysAudioUrl, transAudioUrl]);

  function stopMicStreams() {
    if (micTimerRef.current) { clearInterval(micTimerRef.current); micTimerRef.current = null; }
    if (micAnimRef.current) { cancelAnimationFrame(micAnimRef.current); micAnimRef.current = null; }
    if (micRecorderRef.current && micRecorderRef.current.state === 'recording') {
      try { micRecorderRef.current.stop(); } catch { /* ignore */ }
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (micAudioCtxRef.current && micAudioCtxRef.current.state !== 'closed') {
      try { micAudioCtxRef.current.close(); } catch { /* ignore */ }
      micAudioCtxRef.current = null;
    }
    if (micAudioElemRef.current) micAudioElemRef.current.pause();
  }

  function stopSysStreams() {
    if (sysTimerRef.current) { clearInterval(sysTimerRef.current); sysTimerRef.current = null; }
    if (sysAnimRef.current) { cancelAnimationFrame(sysAnimRef.current); sysAnimRef.current = null; }
    if (sysRecorderRef.current && sysRecorderRef.current.state === 'recording') {
      try { sysRecorderRef.current.stop(); } catch { /* ignore */ }
    }
    if (sysStreamRef.current) {
      sysStreamRef.current.getTracks().forEach(t => t.stop());
      sysStreamRef.current = null;
    }
    if (sysAudioCtxRef.current && sysAudioCtxRef.current.state !== 'closed') {
      try { sysAudioCtxRef.current.close(); } catch { /* ignore */ }
      sysAudioCtxRef.current = null;
    }
    if (sysAudioElemRef.current) sysAudioElemRef.current.pause();
  }

  function stopCameraStreams() {
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(t => t.stop());
      videoStreamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  // --- 1. MICROPHONE INPUT TEST ---
  async function startMicTest() {
    setMicError('');
    if (micAudioUrl) { URL.revokeObjectURL(micAudioUrl); setMicAudioUrl(null); }
    micChunksRef.current = [];
    setMicTimeLeft(micDuration);

    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      micStreamRef.current = stream;

      try {
        const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        micAudioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        micAnalyserRef.current = analyser;

        const pcmData = new Uint8Array(analyser.frequencyBinCount);
        const updateMeter = () => {
          if (!micAnalyserRef.current) return;
          micAnalyserRef.current.getByteFrequencyData(pcmData);
          let sum = 0;
          for (let i = 0; i < pcmData.length; i++) sum += pcmData[i];
          const avg = sum / pcmData.length;
          setMicVolumeLevel(Math.min(100, Math.round((avg / 128) * 100)));
          micAnimRef.current = requestAnimationFrame(updateMeter);
        };
        micAnimRef.current = requestAnimationFrame(updateMeter);
      } catch (e) {
        console.warn('Mic visualization warning:', e);
      }

      const recorder = new MediaRecorder(stream);
      micRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) micChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(micChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setMicAudioUrl(url);
        setMicState('recorded');
        setMicVolumeLevel(0);
        if (micAnimRef.current) cancelAnimationFrame(micAnimRef.current);
      };

      recorder.start();
      setMicState('recording');

      let remaining = micDuration;
      micTimerRef.current = setInterval(() => {
        remaining -= 1;
        setMicTimeLeft(remaining);
        if (remaining <= 0) stopMicRecording();
      }, 1000);
    } catch (err) {
      setMicError((err as Error).message || 'Microphone access denied or unavailable.');
      setMicState('idle');
    }
  }

  function stopMicRecording() {
    if (micTimerRef.current) { clearInterval(micTimerRef.current); micTimerRef.current = null; }
    if (micRecorderRef.current && micRecorderRef.current.state === 'recording') micRecorderRef.current.stop();
    if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null; }
    if (micAudioCtxRef.current && micAudioCtxRef.current.state !== 'closed') {
      try { micAudioCtxRef.current.close(); } catch { /* ignore */ }
    }
  }

  function playMicAudio() {
    if (!micAudioUrl) return;
    if (!micAudioElemRef.current) {
      micAudioElemRef.current = new Audio(micAudioUrl);
      micAudioElemRef.current.onended = () => setMicState('recorded');
    } else {
      micAudioElemRef.current.src = micAudioUrl;
    }
    micAudioElemRef.current.play();
    setMicState('playing');
  }

  function stopMicPlayback() {
    if (micAudioElemRef.current) {
      micAudioElemRef.current.pause();
      micAudioElemRef.current.currentTime = 0;
    }
    setMicState('recorded');
  }

  function discardMicAudio() {
    stopMicStreams();
    if (micAudioUrl) { URL.revokeObjectURL(micAudioUrl); setMicAudioUrl(null); }
    setMicState('idle');
    setMicTimeLeft(micDuration);
    setMicVolumeLevel(0);
    setMicTranscript(null);
    setMicTranscriptError('');
    setMicTranscribing(false);
  }

  async function transcribeMicAudio() {
    if (micChunksRef.current.length === 0) return;
    setMicTranscribing(true);
    setMicTranscriptError('');
    setMicTranscript(null);
    try {
      const mimeType = (micRecorderRef.current?.mimeType || 'audio/webm').split(';')[0];
      const blob = new Blob(micChunksRef.current, { type: micRecorderRef.current?.mimeType || mimeType });
      const text = await runTranscription(blob, mimeType);
      setMicTranscript(text || '(No speech detected in recording)');
    } catch (err) {
      setMicTranscriptError(errorText(err));
    } finally {
      setMicTranscribing(false);
    }
  }

  // --- 2. SYSTEM AUDIO IN (DESKTOP / CALL AUDIO CAPTURE) TEST ---
  async function startSysTest() {
    setSysError('');
    if (sysAudioUrl) { URL.revokeObjectURL(sysAudioUrl); setSysAudioUrl(null); }
    sysChunksRef.current = [];
    setSysTimeLeft(sysDuration);

    try {
      // Capture system desktop audio stream via getDisplayMedia
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length === 0) {
        // Stop video track immediately if no audio was selected
        displayStream.getTracks().forEach(t => t.stop());
        throw new Error('System audio capture was not enabled. Please check "Share system audio" when prompted.');
      }

      // Stop unused video tracks so we only keep system audio
      displayStream.getVideoTracks().forEach(t => t.stop());

      // Create pure system audio stream
      const sysStream = new MediaStream([audioTracks[0]]);
      sysStreamRef.current = sysStream;

      // Web Audio Analyser for live system audio level
      try {
        const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        sysAudioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(sysStream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        sysAnalyserRef.current = analyser;

        const pcmData = new Uint8Array(analyser.frequencyBinCount);
        const updateMeter = () => {
          if (!sysAnalyserRef.current) return;
          sysAnalyserRef.current.getByteFrequencyData(pcmData);
          let sum = 0;
          for (let i = 0; i < pcmData.length; i++) sum += pcmData[i];
          const avg = sum / pcmData.length;
          setSysVolumeLevel(Math.min(100, Math.round((avg / 128) * 100)));
          sysAnimRef.current = requestAnimationFrame(updateMeter);
        };
        sysAnimRef.current = requestAnimationFrame(updateMeter);
      } catch (e) {
        console.warn('System audio visualization warning:', e);
      }

      const recorder = new MediaRecorder(sysStream);
      sysRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) sysChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(sysChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setSysAudioUrl(url);
        setSysState('recorded');
        setSysVolumeLevel(0);
        if (sysAnimRef.current) cancelAnimationFrame(sysAnimRef.current);
      };

      recorder.start();
      setSysState('recording');

      let remaining = sysDuration;
      sysTimerRef.current = setInterval(() => {
        remaining -= 1;
        setSysTimeLeft(remaining);
        if (remaining <= 0) stopSysRecording();
      }, 1000);
    } catch (err) {
      setSysError((err as Error).message || 'System audio capture denied or unavailable.');
      setSysState('idle');
    }
  }

  function stopSysRecording() {
    if (sysTimerRef.current) { clearInterval(sysTimerRef.current); sysTimerRef.current = null; }
    if (sysRecorderRef.current && sysRecorderRef.current.state === 'recording') sysRecorderRef.current.stop();
    if (sysStreamRef.current) { sysStreamRef.current.getTracks().forEach(t => t.stop()); sysStreamRef.current = null; }
    if (sysAudioCtxRef.current && sysAudioCtxRef.current.state !== 'closed') {
      try { sysAudioCtxRef.current.close(); } catch { /* ignore */ }
    }
  }

  function playSysAudio() {
    if (!sysAudioUrl) return;
    if (!sysAudioElemRef.current) {
      sysAudioElemRef.current = new Audio(sysAudioUrl);
      sysAudioElemRef.current.onended = () => setSysState('recorded');
    } else {
      sysAudioElemRef.current.src = sysAudioUrl;
    }
    sysAudioElemRef.current.play();
    setSysState('playing');
  }

  function stopSysPlayback() {
    if (sysAudioElemRef.current) {
      sysAudioElemRef.current.pause();
      sysAudioElemRef.current.currentTime = 0;
    }
    setSysState('recorded');
  }

  function discardSysAudio() {
    stopSysStreams();
    if (sysAudioUrl) { URL.revokeObjectURL(sysAudioUrl); setSysAudioUrl(null); }
    setSysState('idle');
    setSysTimeLeft(sysDuration);
    setSysVolumeLevel(0);
    setSysTranscript(null);
    setSysTranscriptError('');
    setSysTranscribing(false);
  }

  async function transcribeSysAudio() {
    if (sysChunksRef.current.length === 0) return;
    setSysTranscribing(true);
    setSysTranscriptError('');
    setSysTranscript(null);
    try {
      const mimeType = (sysRecorderRef.current?.mimeType || 'audio/webm').split(';')[0];
      const blob = new Blob(sysChunksRef.current, { type: sysRecorderRef.current?.mimeType || mimeType });
      const text = await runTranscription(blob, mimeType);
      setSysTranscript(text || '(No speech detected in recording)');
    } catch (err) {
      setSysTranscriptError(errorText(err));
    } finally {
      setSysTranscribing(false);
    }
  }

  // --- 3. CAMERA TEST ---
  async function toggleCamera() {
    setCameraError('');
    if (cameraActive) {
      stopCameraStreams();
      setCameraActive(false);
      setCameraLabel('');
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: selectedCamId ? { deviceId: { exact: selectedCamId }, width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 1280 }, height: { ideal: 720 } }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoStreamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      setCameraLabel(track?.label || 'Selected Camera');
      setCameraActive(true);
    } catch (err) {
      setCameraError((err as Error).message || 'Camera access denied or unavailable.');
      setCameraActive(false);
    }
  }

  useEffect(() => {
    if (cameraActive && videoRef.current && videoStreamRef.current) {
      videoRef.current.srcObject = videoStreamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraActive]);

  async function handleCamSelect(deviceId: string) {
    setSelectedCamId(deviceId);
    if (cameraActive) {
      stopCameraStreams();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        videoStreamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        setCameraLabel(track?.label || 'Selected Camera');
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      } catch (err) {
        setCameraError((err as Error).message || 'Camera access failed.');
        setCameraActive(false);
      }
    }
  }

  // --- 4. DEDICATED AUDIO TRANSCRIPT TEST ---
  function stopTransStreams() {
    if (transTimerRef.current) { clearInterval(transTimerRef.current); transTimerRef.current = null; }
    if (transAnimRef.current) { cancelAnimationFrame(transAnimRef.current); transAnimRef.current = null; }
    if (transRecorderRef.current && transRecorderRef.current.state === 'recording') {
      try { transRecorderRef.current.stop(); } catch { /* ignore */ }
    }
    if (transStreamRef.current) {
      transStreamRef.current.getTracks().forEach((t) => t.stop());
      transStreamRef.current = null;
    }
    if (transAudioCtxRef.current && transAudioCtxRef.current.state !== 'closed') {
      try { transAudioCtxRef.current.close(); } catch { /* ignore */ }
      transAudioCtxRef.current = null;
    }
    if (transAudioElemRef.current) transAudioElemRef.current.pause();
  }

  async function startTransTest() {
    setTransError('');
    setTransText(null);
    if (transAudioUrl) { URL.revokeObjectURL(transAudioUrl); setTransAudioUrl(null); }
    setTransBlob(null);
    transChunksRef.current = [];
    setTransTimeLeft(transDuration);

    try {
      let stream: MediaStream;
      if (transSource === 'mic') {
        const micId = transMicId || selectedMicId;
        const constraints: MediaStreamConstraints = {
          audio: micId ? { deviceId: { exact: micId } } : true,
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } else {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        const audioTracks = displayStream.getAudioTracks();
        if (audioTracks.length === 0) {
          displayStream.getTracks().forEach((t) => t.stop());
          throw new Error('System audio capture was not enabled. Please check "Share system audio" when prompted.');
        }
        displayStream.getVideoTracks().forEach((t) => t.stop());
        stream = new MediaStream([audioTracks[0]]);
      }

      transStreamRef.current = stream;

      try {
        const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        transAudioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        transAnalyserRef.current = analyser;

        const pcmData = new Uint8Array(analyser.frequencyBinCount);
        const updateMeter = () => {
          if (!transAnalyserRef.current) return;
          transAnalyserRef.current.getByteFrequencyData(pcmData);
          let sum = 0;
          for (let i = 0; i < pcmData.length; i++) sum += pcmData[i];
          const avg = sum / pcmData.length;
          setTransVolumeLevel(Math.min(100, Math.round((avg / 128) * 100)));
          transAnimRef.current = requestAnimationFrame(updateMeter);
        };
        transAnimRef.current = requestAnimationFrame(updateMeter);
      } catch (e) {
        console.warn('Trans audio meter warning:', e);
      }

      const recorder = new MediaRecorder(stream);
      transRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) transChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const mimeType = (recorder.mimeType || 'audio/webm').split(';')[0];
        const blob = new Blob(transChunksRef.current, { type: recorder.mimeType || mimeType });
        const url = URL.createObjectURL(blob);
        setTransAudioUrl(url);
        setTransBlob(blob);
        setTransState('recorded');
        setTransVolumeLevel(0);
        if (transAnimRef.current) cancelAnimationFrame(transAnimRef.current);

        setTransLoading(true);
        setTransError('');
        try {
          const text = await runTranscription(blob, mimeType);
          setTransText(text || '(No speech detected in recorded audio)');
        } catch (err) {
          setTransError(errorText(err));
        } finally {
          setTransLoading(false);
        }
      };

      recorder.start();
      setTransState('recording');

      let remaining = transDuration;
      transTimerRef.current = setInterval(() => {
        remaining -= 1;
        setTransTimeLeft(remaining);
        if (remaining <= 0) stopTransRecording();
      }, 1000);
    } catch (err) {
      setTransError((err as Error).message || 'Failed to start audio recording.');
      setTransState('idle');
    }
  }

  function stopTransRecording() {
    if (transTimerRef.current) { clearInterval(transTimerRef.current); transTimerRef.current = null; }
    if (transRecorderRef.current && transRecorderRef.current.state === 'recording') transRecorderRef.current.stop();
    if (transStreamRef.current) { transStreamRef.current.getTracks().forEach((t) => t.stop()); transStreamRef.current = null; }
    if (transAudioCtxRef.current && transAudioCtxRef.current.state !== 'closed') {
      try { transAudioCtxRef.current.close(); } catch { /* ignore */ }
    }
  }

  function playTransAudio() {
    if (!transAudioUrl) return;
    if (!transAudioElemRef.current) {
      transAudioElemRef.current = new Audio(transAudioUrl);
      transAudioElemRef.current.onended = () => setTransPlaying(false);
    } else {
      transAudioElemRef.current.src = transAudioUrl;
    }
    transAudioElemRef.current.play();
    setTransPlaying(true);
  }

  function stopTransPlayback() {
    if (transAudioElemRef.current) {
      transAudioElemRef.current.pause();
      transAudioElemRef.current.currentTime = 0;
    }
    setTransPlaying(false);
  }

  function discardTransAudio() {
    stopTransStreams();
    if (transAudioUrl) { URL.revokeObjectURL(transAudioUrl); setTransAudioUrl(null); }
    setTransBlob(null);
    setTransState('idle');
    setTransText(null);
    setTransError('');
    setTransPlaying(false);
    setTransTimeLeft(transDuration);
    setTransVolumeLevel(0);
  }

  async function retranscribeAudio() {
    if (!transBlob) return;
    setTransLoading(true);
    setTransError('');
    try {
      const mimeType = (transRecorderRef.current?.mimeType || 'audio/webm').split(';')[0];
      const text = await runTranscription(transBlob, mimeType);
      setTransText(text || '(No speech detected in recorded audio)');
    } catch (err) {
      setTransError(errorText(err));
    } finally {
      setTransLoading(false);
    }
  }

  function copyTranscriptText() {
    if (!transText) return;
    navigator.clipboard.writeText(transText).then(() => {
      setTransCopied(true);
      setTimeout(() => setTransCopied(false), 2000);
    });
  }

  return (
    <div className="device-tests">
      {/* 1. Microphone Input Test */}
      <section className="settings-section">
        <div>
          <h2>Microphone sound test</h2>
          <p>Record a short clip and play it back to hear how you sound.</p>
        </div>
        <div className="settings-fields">
          <div className="device-card">
            {/* Device Selector Row */}
            <div className="device-select-row">
              <label htmlFor="mic-select-dropdown">Microphone</label>
              <select
                id="mic-select-dropdown"
                className="device-select-control"
                value={selectedMicId}
                disabled={micState === 'recording'}
                onChange={(e) => setSelectedMicId(e.target.value)}
              >
                {mics.length === 0 ? (
                  <option value="">Default Microphone</option>
                ) : (
                  mics.map((mic, idx) => (
                    <option key={mic.deviceId || idx} value={mic.deviceId}>
                      {mic.label || `Microphone ${idx + 1}`}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Title & Status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: micState === 'recording' ? 'var(--error-bg)' : 'var(--panel)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: micState === 'recording' ? 'var(--danger)' : 'var(--text)'
                }}>
                  <Mic size={18} />
                </div>
                <div>
                  <strong style={{ fontSize: 14 }}>Microphone check</strong>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {micState === 'idle' && `Press Start and speak for ${micDuration} seconds.`}
                    {micState === 'recording' && `Recording… ${micTimeLeft}s left`}
                    {micState === 'recorded' && 'Done. Play it back to check how you sound.'}
                    {micState === 'playing' && 'Playing back…'}
                  </div>
                </div>
              </div>

              {micState === 'recording' && (
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--danger)', animation: 'pulse 1s infinite' }} />
                  0:{micTimeLeft < 10 ? `0${micTimeLeft}` : micTimeLeft}
                </div>
              )}
            </div>

            {/* Volume Meter */}
            {micState === 'recording' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)' }}>
                  <span>Input volume level</span>
                  <span>{micVolumeLevel}%</span>
                </div>
                <div style={{ height: 8, background: 'var(--panel)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.max(5, micVolumeLevel)}%`,
                    background: micVolumeLevel > 60 ? 'var(--accent)' : 'var(--button)',
                    borderRadius: 4,
                    transition: 'width 80ms ease-out'
                  }} />
                </div>
              </div>
            )}

            {/* Controls */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {micState === 'idle' && (
                <>
                  <button type="button" className="primary" onClick={() => void startMicTest()} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Mic size={15} /> Start {micDuration}s test
                  </button>

                  <div className="duration-pill-group">
                    <button
                      type="button"
                      className={`duration-pill-btn ${micDuration === 10 ? 'active' : ''}`}
                      onClick={() => { setMicDuration(10); setMicTimeLeft(10); }}
                    >
                      10s
                    </button>
                    <button
                      type="button"
                      className={`duration-pill-btn ${micDuration === 20 ? 'active' : ''}`}
                      onClick={() => { setMicDuration(20); setMicTimeLeft(20); }}
                    >
                      20s
                    </button>
                  </div>
                </>
              )}

              {micState === 'recording' && (
                <button type="button" className="danger-button" onClick={stopMicRecording} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Square size={14} /> Stop now
                </button>
              )}

              {(micState === 'recorded' || micState === 'playing') && (
                <>
                  {micState === 'playing' ? (
                    <button type="button" className="primary" onClick={stopMicPlayback} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Square size={14} /> Stop playback
                    </button>
                  ) : (
                    <button type="button" className="primary" onClick={playMicAudio} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Play size={15} /> Play back
                    </button>
                  )}
                  <button type="button" className="text-button" onClick={() => void transcribeMicAudio()} disabled={micTranscribing} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {micTranscribing ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} {micTranscribing ? 'Transcribing…' : 'Transcribe'}
                  </button>
                  <button type="button" className="text-button" onClick={discardMicAudio} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <RotateCcw size={14} /> Test again
                  </button>
                  <small className="device-note">Transcribe sends this recording to your AI provider. Otherwise it stays on this computer and isn’t saved.</small>
                </>
              )}
            </div>

            {micTranscript && (
              <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', fontSize: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--accent)', marginBottom: 6 }}>
                  <Sparkles size={14} /> Transcript
                </div>
                <div style={{ color: 'var(--text)', whiteSpace: 'pre-wrap' }}>"{micTranscript}"</div>
              </div>
            )}

            {micTranscriptError && (
              <div className="error" role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={15} /> {micTranscriptError}
              </div>
            )}

            {micError && (
              <div className="error" role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={15} /> {micError}
              </div>
            )}

          </div>
        </div>
      </section>

      {/* 2. System Audio IN (Desktop / Call Audio Loopback Capture) Test */}
      <section className="settings-section">
        <div>
          <h2>System audio test</h2>
          <p>Check that Novi can hear sound playing on your computer, like the other person on a call.</p>
        </div>
        <div className="settings-fields">
          <div className="device-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: sysState === 'recording' ? 'var(--error-bg)' : 'var(--panel)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: sysState === 'recording' ? 'var(--danger)' : 'var(--text)'
                }}>
                  <Radio size={18} />
                </div>
                <div>
                  <strong style={{ fontSize: 14 }}>System audio check</strong>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {sysState === 'idle' && `Play a video or call audio, then press Start.`}
                    {sysState === 'recording' && `Listening… ${sysTimeLeft}s left`}
                    {sysState === 'recorded' && 'Done. Play it back to check what Novi heard.'}
                    {sysState === 'playing' && 'Playing back…'}
                  </div>
                </div>
              </div>

              {sysState === 'recording' && (
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--danger)', animation: 'pulse 1s infinite' }} />
                  0:{sysTimeLeft < 10 ? `0${sysTimeLeft}` : sysTimeLeft}
                </div>
              )}
            </div>

            {/* Live System Volume Level */}
            {sysState === 'recording' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)' }}>
                  <span>System audio level</span>
                  <span>{sysVolumeLevel}%</span>
                </div>
                <div style={{ height: 8, background: 'var(--panel)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.max(5, sysVolumeLevel)}%`,
                    background: sysVolumeLevel > 60 ? 'var(--accent)' : 'var(--button)',
                    borderRadius: 4,
                    transition: 'width 80ms ease-out'
                  }} />
                </div>
              </div>
            )}

            {/* Controls */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {sysState === 'idle' && (
                <>
                  <button type="button" className="primary" onClick={() => void startSysTest()} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Radio size={15} /> Start {sysDuration}s test
                  </button>

                  <div className="duration-pill-group">
                    <button
                      type="button"
                      className={`duration-pill-btn ${sysDuration === 10 ? 'active' : ''}`}
                      onClick={() => { setSysDuration(10); setSysTimeLeft(10); }}
                    >
                      10s
                    </button>
                    <button
                      type="button"
                      className={`duration-pill-btn ${sysDuration === 20 ? 'active' : ''}`}
                      onClick={() => { setSysDuration(20); setSysTimeLeft(20); }}
                    >
                      20s
                    </button>
                  </div>
                </>
              )}

              {sysState === 'recording' && (
                <button type="button" className="danger-button" onClick={stopSysRecording} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Square size={14} /> Stop now
                </button>
              )}

              {(sysState === 'recorded' || sysState === 'playing') && (
                <>
                  {sysState === 'playing' ? (
                    <button type="button" className="primary" onClick={stopSysPlayback} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Square size={14} /> Stop playback
                    </button>
                  ) : (
                    <button type="button" className="primary" onClick={playSysAudio} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Play size={15} /> Play back
                    </button>
                  )}
                  <button type="button" className="text-button" onClick={() => void transcribeSysAudio()} disabled={sysTranscribing} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {sysTranscribing ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} {sysTranscribing ? 'Transcribing…' : 'Transcribe'}
                  </button>
                  <button type="button" className="text-button" onClick={discardSysAudio} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <RotateCcw size={14} /> Test again
                  </button>
                  <small className="device-note">Transcribe sends this recording to your AI provider. Otherwise it stays on this computer and isn’t saved.</small>
                </>
              )}
            </div>

            {sysTranscript && (
              <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', fontSize: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--accent)', marginBottom: 6 }}>
                  <Sparkles size={14} /> Transcript
                </div>
                <div style={{ color: 'var(--text)', whiteSpace: 'pre-wrap' }}>"{sysTranscript}"</div>
              </div>
            )}

            {sysTranscriptError && (
              <div className="error" role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={15} /> {sysTranscriptError}
              </div>
            )}

            {sysError && (
              <div className="error" role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={15} /> {sysError}
              </div>
            )}

          </div>
        </div>
      </section>

      {/* 3. Camera Live Test */}
      <section className="settings-section">
        <div>
          <h2>Camera test</h2>
          <p>Preview your camera before a session.</p>
        </div>
        <div className="settings-fields">
          <div className="device-card">
            {/* Camera Select Row */}
            <div className="device-select-row">
              <label htmlFor="cam-select-dropdown">Camera</label>
              <select
                id="cam-select-dropdown"
                className="device-select-control"
                value={selectedCamId}
                onChange={(e) => void handleCamSelect(e.target.value)}
              >
                {cams.length === 0 ? (
                  <option value="">Default Camera</option>
                ) : (
                  cams.map((cam, idx) => (
                    <option key={cam.deviceId || idx} value={cam.deviceId}>
                      {cam.label || `Camera ${idx + 1}`}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: cameraActive ? 'var(--selected)' : 'var(--panel)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: cameraActive ? 'var(--accent)' : 'var(--text)'
                }}>
                  <Camera size={18} />
                </div>
                <div>
                  <strong style={{ fontSize: 14 }}>Camera preview</strong>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {cameraActive ? `Showing ${cameraLabel}` : 'Check your framing and lighting.'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className={cameraActive ? 'danger-button' : 'primary'}
                onClick={() => void toggleCamera()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                {cameraActive ? <><CameraOff size={15} /> Stop camera</> : <><Camera size={15} /> Start camera</>}
              </button>
            </div>

            {/* Video Preview Frame */}
            {cameraActive && (
              <div style={{
                position: 'relative',
                borderRadius: 10,
                overflow: 'hidden',
                background: '#000',
                aspectRatio: '16/9',
                maxHeight: 280,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
                <div style={{
                  position: 'absolute',
                  top: 12,
                  left: 12,
                  background: 'rgba(0,0,0,0.65)',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  backdropFilter: 'blur(4px)',
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
                  LIVE PREVIEW
                </div>
              </div>
            )}

            {cameraError && (
              <div className="error" role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={15} /> {cameraError}
              </div>
            )}

          </div>
        </div>
      </section>

      {/* 4. Audio Transcription Live Test */}
      <section className="settings-section">
        <div>
          <h2>Audio transcription test</h2>
          <p>Record a few seconds and turn it into text with your API connection. For on-device transcription, use Local AI.</p>
        </div>
        <div className="settings-fields">
          <div className="device-card">
            {/* Audio Source Mode Selection */}
            <div className="device-select-row">
              <label>Source</label>
              <div className="duration-pill-group">
                <button
                  type="button"
                  className={`duration-pill-btn ${transSource === 'mic' ? 'active' : ''}`}
                  disabled={transState === 'recording'}
                  onClick={() => { setTransSource('mic'); discardTransAudio(); }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Mic size={13} /> Microphone
                </button>
                <button
                  type="button"
                  className={`duration-pill-btn ${transSource === 'system' ? 'active' : ''}`}
                  disabled={transState === 'recording'}
                  onClick={() => { setTransSource('system'); discardTransAudio(); }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Radio size={13} /> System audio
                </button>
              </div>
            </div>

            {/* If Microphone: Device Picker Dropdown */}
            {transSource === 'mic' && (
              <div className="device-select-row">
                <label htmlFor="trans-mic-select-dropdown">Microphone</label>
                <select
                  id="trans-mic-select-dropdown"
                  className="device-select-control"
                  value={transMicId || selectedMicId}
                  disabled={transState === 'recording'}
                  onChange={(e) => setTransMicId(e.target.value)}
                >
                  {mics.length === 0 ? (
                    <option value="">Default Microphone</option>
                  ) : (
                    mics.map((mic, idx) => (
                      <option key={mic.deviceId || idx} value={mic.deviceId}>
                        {mic.label || `Microphone ${idx + 1}`}
                      </option>
                    ))
                  )}
                </select>
              </div>
            )}

            {/* Header info & Timer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: transState === 'recording' ? 'var(--error-bg)' : 'var(--panel)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: transState === 'recording' ? 'var(--danger)' : 'var(--accent)'
                }}>
                  <Sparkles size={18} />
                </div>
                <div>
                  <strong style={{ fontSize: 14 }}>
                    {transSource === 'mic' ? 'Microphone transcription' : 'System audio transcription'}
                  </strong>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {transState === 'idle' && (transSource === 'mic' ? 'Speak a sentence to test speech recognition.' : 'Play a video or podcast to test system audio transcription.')}
                    {transState === 'recording' && `Recording… ${transTimeLeft}s left`}
                    {transState === 'recorded' && (transLoading ? 'Turning speech into text…' : 'Done.')}
                  </div>
                </div>
              </div>

              {transState === 'recording' && (
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--danger)', animation: 'pulse 1s infinite' }} />
                  0:{transTimeLeft < 10 ? `0${transTimeLeft}` : transTimeLeft}
                </div>
              )}
            </div>

            {/* Volume Meter */}
            {transState === 'recording' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)' }}>
                  <span>Input sound level</span>
                  <span>{transVolumeLevel}%</span>
                </div>
                <div style={{ height: 8, background: 'var(--panel)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.max(5, transVolumeLevel)}%`,
                    background: transVolumeLevel > 60 ? 'var(--accent)' : 'var(--button)',
                    borderRadius: 4,
                    transition: 'width 80ms ease-out'
                  }} />
                </div>
              </div>
            )}

            {/* Controls */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {transState === 'idle' && (
                <>
                  <button type="button" className="primary" onClick={() => void startTransTest()} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={15} /> Start {transDuration}s test
                  </button>

                  <div className="duration-pill-group">
                    <button
                      type="button"
                      className={`duration-pill-btn ${transDuration === 5 ? 'active' : ''}`}
                      onClick={() => { setTransDuration(5); setTransTimeLeft(5); }}
                    >
                      5s
                    </button>
                    <button
                      type="button"
                      className={`duration-pill-btn ${transDuration === 10 ? 'active' : ''}`}
                      onClick={() => { setTransDuration(10); setTransTimeLeft(10); }}
                    >
                      10s
                    </button>
                    <button
                      type="button"
                      className={`duration-pill-btn ${transDuration === 20 ? 'active' : ''}`}
                      onClick={() => { setTransDuration(20); setTransTimeLeft(20); }}
                    >
                      20s
                    </button>
                  </div>
                </>
              )}

              {transState === 'recording' && (
                <button type="button" className="danger-button" onClick={stopTransRecording} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Square size={14} /> Stop and transcribe
                </button>
              )}

              {transState === 'recorded' && (
                <>
                  {transPlaying ? (
                    <button type="button" className="primary" onClick={stopTransPlayback} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Square size={14} /> Stop playback
                    </button>
                  ) : (
                    <button type="button" className="primary" onClick={playTransAudio} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Play size={15} /> Play back
                    </button>
                  )}
                  <button type="button" className="text-button" onClick={() => void retranscribeAudio()} disabled={transLoading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {transLoading ? <Loader2 size={14} className="spin" /> : <RotateCcw size={14} />} {transLoading ? 'Transcribing…' : 'Re-transcribe'}
                  </button>
                  <button type="button" className="text-button" onClick={discardTransAudio} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <RotateCcw size={14} /> Test again
                  </button>
                </>
              )}
            </div>

            {/* Transcript Result Box */}
            {transLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'var(--panel)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13 }}>
                <Loader2 size={16} className="spin" color="var(--accent)" />
                <span>Transcribing with your API connection…</span>
              </div>
            )}

            {transText && !transLoading && (
              <div style={{
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>
                    <Check size={14} /> Transcript · {transSource === 'mic' ? 'Microphone' : 'System audio'}
                  </div>
                  <button
                    type="button"
                    className="text-button"
                    onClick={copyTranscriptText}
                    style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px' }}
                  >
                    {transCopied ? <><Check size={12} color="var(--accent)" /> Copied</> : <><Copy size={12} /> Copy</>}
                  </button>
                </div>
                <div style={{
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: 'var(--text)',
                  whiteSpace: 'pre-wrap',
                  background: 'var(--surface)',
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)'
                }}>
                  {transText}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 16 }}>
                  <span>Words: {transText.split(/\s+/).filter(Boolean).length}</span>
                  <span>Characters: {transText.length}</span>
                </div>
              </div>
            )}

            {transError && (
              <div className="error" role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={15} /> {transError}
              </div>
            )}

          </div>
        </div>
      </section>
    </div>
  );
}
