import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Mic, Play, Square, RotateCcw, Radio, ShieldCheck, AlertCircle, Sliders } from 'lucide-react';

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

  // Enumerate devices
  const refreshDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      const videoInputs = devices.filter(d => d.kind === 'videoinput');

      setMics(audioInputs);
      setCams(videoInputs);

      if (audioInputs.length > 0 && !selectedMicId) setSelectedMicId(audioInputs[0].deviceId);
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
      if (micAudioUrl) URL.revokeObjectURL(micAudioUrl);
      if (sysAudioUrl) URL.revokeObjectURL(sysAudioUrl);
    };
  }, [micAudioUrl, sysAudioUrl]);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* 1. Microphone Input Test */}
      <section className="settings-section">
        <div>
          <h2>Microphone sound test</h2>
          <p>Choose your microphone and record 10s or 20s to verify input sound.</p>
        </div>
        <div className="settings-fields" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="device-card">
            {/* Device Selector Row */}
            <div className="device-select-row">
              <label htmlFor="mic-select-dropdown">
                <Sliders size={14} /> Select Microphone
              </label>
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
                  <strong style={{ fontSize: 14 }}>{micDuration}-Second Voice & Audio Check</strong>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {micState === 'idle' && `Click Start to record ${micDuration} seconds of voice sound.`}
                    {micState === 'recording' && `Recording microphone... (${micTimeLeft}s remaining)`}
                    {micState === 'recorded' && 'Microphone recording complete! Listen to verify clarity.'}
                    {micState === 'playing' && 'Playing back recorded microphone sound...'}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
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
                    <Mic size={15} /> Start {micDuration}s Audio Test
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
                  <Square size={14} /> Stop & Review Early
                </button>
              )}

              {(micState === 'recorded' || micState === 'playing') && (
                <>
                  {micState === 'playing' ? (
                    <button type="button" className="primary" onClick={stopMicPlayback} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Square size={14} /> Stop Playback
                    </button>
                  ) : (
                    <button type="button" className="primary" onClick={playMicAudio} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Play size={15} /> Play Back Sound
                    </button>
                  )}
                  <button type="button" className="text-button" onClick={discardMicAudio} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <RotateCcw size={14} /> Test Again
                  </button>
                </>
              )}
            </div>

            {micError && (
              <div className="error" role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={15} /> {micError}
              </div>
            )}

            <div className="device-info-badge">
              <ShieldCheck size={16} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong>In-memory only:</strong> Microphone recordings are held strictly in temporary memory. Nothing is saved to disk or uploaded.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. System Audio IN (Desktop / Call Audio Loopback Capture) Test */}
      <section className="settings-section">
        <div>
          <h2>System audio IN test (Desktop & Call audio)</h2>
          <p>Verify that Novi can listen to audio playing from your PC (e.g. call partner voice, videos, or system sound).</p>
        </div>
        <div className="settings-fields" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                  <strong style={{ fontSize: 14 }}>{sysDuration}-Second System Audio Capture Test</strong>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {sysState === 'idle' && `Click Start to test capturing sound coming from your PC / call partner.`}
                    {sysState === 'recording' && `Listening to System Audio IN... (${sysTimeLeft}s remaining)`}
                    {sysState === 'recorded' && 'System audio capture complete! Listen to verify.'}
                    {sysState === 'playing' && 'Playing back recorded system sound...'}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
                  <span>System Audio IN level</span>
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
                    <Radio size={15} /> Start {sysDuration}s System Audio Test
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
                  <Square size={14} /> Stop & Review Early
                </button>
              )}

              {(sysState === 'recorded' || sysState === 'playing') && (
                <>
                  {sysState === 'playing' ? (
                    <button type="button" className="primary" onClick={stopSysPlayback} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Square size={14} /> Stop Playback
                    </button>
                  ) : (
                    <button type="button" className="primary" onClick={playSysAudio} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Play size={15} /> Play Back System Sound
                    </button>
                  )}
                  <button type="button" className="text-button" onClick={discardSysAudio} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <RotateCcw size={14} /> Test Again
                  </button>
                </>
              )}
            </div>

            {sysError && (
              <div className="error" role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={15} /> {sysError}
              </div>
            )}

            <div className="device-info-badge">
              <ShieldCheck size={16} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong>System Audio IN:</strong> Captures internal audio output (such as YouTube, media, or call partners). Held in temporary memory for test review.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Camera Live Test */}
      <section className="settings-section">
        <div>
          <h2>Camera test</h2>
          <p>Select camera device and preview video framing.</p>
        </div>
        <div className="settings-fields" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="device-card">
            {/* Camera Select Row */}
            <div className="device-select-row">
              <label htmlFor="cam-select-dropdown">
                <Sliders size={14} /> Select Camera
              </label>
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
                  <strong style={{ fontSize: 14 }}>Camera Preview</strong>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {cameraActive ? `Active: ${cameraLabel}` : 'Check your video feed and camera orientation.'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className={cameraActive ? 'danger-button' : 'primary'}
                onClick={() => void toggleCamera()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                {cameraActive ? <><CameraOff size={15} /> Stop Camera</> : <><Camera size={15} /> Test Camera</>}
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

            <small style={{ color: 'var(--muted)' }}>
              Hardware indicator LED will automatically turn off as soon as the test stops or when leaving Settings.
            </small>
          </div>
        </div>
      </section>
    </div>
  );
}
