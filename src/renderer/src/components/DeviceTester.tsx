import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Mic, Play, Square, RotateCcw, Volume2, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';

export function DeviceTester() {
  // Audio state
  const [audioState, setAudioState] = useState<'idle' | 'recording' | 'recorded' | 'playing'>('idle');
  const [timeLeft, setTimeLeft] = useState(10);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraLabel, setCameraLabel] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);

  // Clean up all audio resources on unmount
  useEffect(() => {
    return () => {
      stopAudioStreams();
      stopCameraStreams();
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  function stopAudioStreams() {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
      audioStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { audioContextRef.current.close(); } catch { /* ignore */ }
      audioContextRef.current = null;
    }
    if (audioElementRef.current) {
      audioElementRef.current.pause();
    }
  }

  function stopCameraStreams() {
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(t => t.stop());
      videoStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  // --- AUDIO TEST LOGIC ---
  async function startAudioTest() {
    setAudioError('');
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    audioChunksRef.current = [];
    setTimeLeft(10);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      // Setup Web Audio Analyser for volume visualization
      try {
        const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        analyserRef.current = analyser;

        const pcmData = new Uint8Array(analyser.frequencyBinCount);
        const updateMeter = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(pcmData);
          let sum = 0;
          for (let i = 0; i < pcmData.length; i++) sum += pcmData[i];
          const avg = sum / pcmData.length;
          setVolumeLevel(Math.min(100, Math.round((avg / 128) * 100)));
          animFrameRef.current = requestAnimationFrame(updateMeter);
        };
        animFrameRef.current = requestAnimationFrame(updateMeter);
      } catch (e) {
        console.warn('Audio visualization not supported:', e);
      }

      // Setup MediaRecorder
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setAudioState('recorded');
        setVolumeLevel(0);
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      };

      recorder.start();
      setAudioState('recording');

      // 10 second countdown
      let remaining = 10;
      timerIntervalRef.current = setInterval(() => {
        remaining -= 1;
        setTimeLeft(remaining);
        if (remaining <= 0) {
          stopAudioRecording();
        }
      }, 1000);
    } catch (err) {
      setAudioError((err as Error).message || 'Microphone access denied or unavailable.');
      setAudioState('idle');
    }
  }

  function stopAudioRecording() {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
      audioStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { audioContextRef.current.close(); } catch { /* ignore */ }
    }
  }

  function playAudio() {
    if (!audioUrl) return;
    if (!audioElementRef.current) {
      audioElementRef.current = new Audio(audioUrl);
      audioElementRef.current.onended = () => setAudioState('recorded');
    } else {
      audioElementRef.current.src = audioUrl;
    }
    audioElementRef.current.play();
    setAudioState('playing');
  }

  function stopPlayback() {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
    }
    setAudioState('recorded');
  }

  function discardAudio() {
    stopAudioStreams();
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setAudioState('idle');
    setTimeLeft(10);
    setVolumeLevel(0);
  }

  // --- CAMERA TEST LOGIC ---
  async function toggleCamera() {
    setCameraError('');
    if (cameraActive) {
      stopCameraStreams();
      setCameraActive(false);
      setCameraLabel('');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      videoStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      const track = stream.getVideoTracks()[0];
      setCameraLabel(track?.label || 'Default Camera');
      setCameraActive(true);
    } catch (err) {
      setCameraError((err as Error).message || 'Camera access denied or unavailable.');
      setCameraActive(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* 10-Second Audio Sound Test */}
      <section className="settings-section">
        <div>
          <h2>Audio sound test</h2>
          <p>Test input sound for 10s and play back.</p>
        </div>
        <div className="settings-fields" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            background: 'var(--card, #fff)',
            border: '1px solid var(--border, #e5e5e5)',
            borderRadius: 12,
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: audioState === 'recording' ? '#fee2e2' : 'var(--subtle, #f0f0f0)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: audioState === 'recording' ? '#dc2626' : 'var(--ink, #222)'
                }}>
                  <Mic size={18} />
                </div>
                <div>
                  <strong style={{ fontSize: 14 }}>10-Second Voice & Audio Check</strong>
                  <div style={{ fontSize: 12, color: 'var(--muted, #666)' }}>
                    {audioState === 'idle' && 'Click Start to record 10 seconds of sound to verify your microphone.'}
                    {audioState === 'recording' && `Recording audio sound... (${timeLeft}s remaining)`}
                    {audioState === 'recorded' && 'Recording complete! Listen to verify clarity.'}
                    {audioState === 'playing' && 'Playing back recorded sound...'}
                  </div>
                </div>
              </div>

              {audioState === 'recording' && (
                <div style={{
                  fontSize: 18, fontWeight: 700, fontFamily: 'monospace',
                  color: '#dc2626', display: 'flex', alignItems: 'center', gap: 6
                }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: '#dc2626', animation: 'pulse 1s infinite'
                  }} />
                  0:0{timeLeft}
                </div>
              )}
            </div>

            {/* Live Volume Meter when recording */}
            {audioState === 'recording' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
                  <span>Input level</span>
                  <span>{volumeLevel}%</span>
                </div>
                <div style={{ height: 8, background: 'var(--subtle, #eee)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.max(5, volumeLevel)}%`,
                    background: volumeLevel > 60 ? '#16a34a' : '#2563eb',
                    borderRadius: 4,
                    transition: 'width 80ms ease-out'
                  }} />
                </div>
              </div>
            )}

            {/* Controls */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {audioState === 'idle' && (
                <button
                  type="button"
                  className="primary"
                  onClick={() => void startAudioTest()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                  <Mic size={15} /> Start 10s Audio Test
                </button>
              )}

              {audioState === 'recording' && (
                <button
                  type="button"
                  className="danger-button"
                  onClick={stopAudioRecording}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                  <Square size={14} /> Stop & Review Early
                </button>
              )}

              {(audioState === 'recorded' || audioState === 'playing') && (
                <>
                  {audioState === 'playing' ? (
                    <button
                      type="button"
                      className="primary"
                      onClick={stopPlayback}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                    >
                      <Square size={14} /> Stop Playback
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="primary"
                      onClick={playAudio}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                    >
                      <Play size={15} /> Play Back Sound
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-button"
                    onClick={discardAudio}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <RotateCcw size={14} /> Test Again
                  </button>
                </>
              )}
            </div>

            {audioError && (
              <div className="error" role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <AlertCircle size={15} /> {audioError}
              </div>
            )}

            {/* In-Memory Guarantee Notice */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              fontSize: 11,
              color: 'var(--muted, #666)',
              background: 'var(--subtle, #fafafa)',
              border: '1px solid var(--border, #eee)',
              borderRadius: 8,
              padding: '10px 12px',
              marginTop: 4,
            }}>
              <ShieldCheck size={16} color="#16a34a" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong>In-memory only:</strong> Audio recordings are held strictly in temporary browser memory for testing. Nothing is ever saved to your disk or uploaded to any server. When you exit the app or click Test Again, the audio is instantly and permanently destroyed.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Camera Live Test */}
      <section className="settings-section">
        <div>
          <h2>Camera test</h2>
          <p>Preview video framing and device detection.</p>
        </div>
        <div className="settings-fields" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            background: 'var(--card, #fff)',
            border: '1px solid var(--border, #e5e5e5)',
            borderRadius: 12,
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: cameraActive ? '#dcfce7' : 'var(--subtle, #f0f0f0)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: cameraActive ? '#16a34a' : 'var(--ink, #222)'
                }}>
                  <Camera size={18} />
                </div>
                <div>
                  <strong style={{ fontSize: 14 }}>Camera Preview</strong>
                  <div style={{ fontSize: 12, color: 'var(--muted, #666)' }}>
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
