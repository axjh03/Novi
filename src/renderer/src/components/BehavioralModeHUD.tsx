import { Volume2, Zap } from 'lucide-react';
import type { BehavioralFramework } from '../../../shared/types';
import { AudioMeter } from './AudioMeter';

interface Props {
  framework: BehavioralFramework;
  onSelectFramework: (framework: BehavioralFramework) => void;
  isRecordingAudio: boolean;
  audioLevel: number;
  isAudioStarting: boolean;
  isAudioProcessing: boolean;
  recordingSeconds: number;
  onToggleRecording: () => void;
  fastModelActive: boolean;
  onToggleFastModel: () => void;
  fastModelName: string;
  busy: boolean;
}

const FRAMEWORKS: {
  id: BehavioralFramework;
  label: string;
  description: string;
}[] = [
  {
    id: 'smart',
    label: 'SMART Auto',
    description: 'Analyzes the interviewer question and automatically chooses the best framework (STAR, CAR, or PAR).',
  },
  {
    id: 'star',
    label: 'STAR Method',
    description: 'Classic behavioral: Situation context, Task ownership, Actions taken, and quantified measurable Results.',
  },
  {
    id: 'car',
    label: 'CAR Method',
    description: 'Punchy & concise: high-level Context, decisive Actions taken, and tangible business Results.',
  },
  {
    id: 'par',
    label: 'PAR Method',
    description: 'Technical focus: Problem statement, Engineering Action executed, and final Resolution.',
  },
  {
    id: 'soar',
    label: 'SOAR Method',
    description: 'Grit & resilience focus: Situation, Roadblock/Obstacle overcome, Action taken, and Results.',
  },
];

export function BehavioralModeHUD({
  framework,
  onSelectFramework,
  isRecordingAudio,
  audioLevel,
  isAudioStarting,
  isAudioProcessing,
  recordingSeconds,
  onToggleRecording,
  fastModelActive,
  onToggleFastModel,
  fastModelName,
  busy,
}: Props) {
  const activeDef = FRAMEWORKS.find((f) => f.id === framework) || FRAMEWORKS[0];

  return (
    <div className="behavioral-copilot-bar">
        <label className="behavioral-framework-picker">Framework
          <select aria-label="Interview framework" value={framework} title={activeDef.description}
            onChange={(event) => onSelectFramework(event.target.value as BehavioralFramework)}>
            {FRAMEWORKS.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>

        <div className="behavioral-bar-actions">
          {/* Fast Interview Model Toggle */}
          <button
            type="button"
            className={`fast-model-pill ${fastModelActive ? 'active' : ''}`}
            onClick={onToggleFastModel}
            disabled={busy}
            title={
              fastModelActive
                ? `Fast Interview Model is ON (${fastModelName}). Lowest latency spoken replies.`
                : 'Enable Fast Interview Model for ~300ms ultra-low latency response'
            }
          >
            <Zap size={12} color={fastModelActive ? '#f59e0b' : 'var(--muted)'} />
            <span>{fastModelActive ? `Fast: ${fastModelName}` : 'Fast Model: OFF'}</span>
          </button>

          {/* Live System Audio Listening Pill */}
          <button
            type="button"
            className={`listen-toggle-btn ${isRecordingAudio ? 'active-stop' : 'start-btn'}`}
            onClick={onToggleRecording}
            disabled={isAudioStarting || isAudioProcessing}
            title="Capture system audio (Alt+A / Option+A)"
          >
            <Volume2 size={12} />
            <span>
              {isRecordingAudio
                ? `Listening (${Math.floor(recordingSeconds / 60)}:${(recordingSeconds % 60).toString().padStart(2, '0')})`
                : isAudioStarting ? 'Starting…' : isAudioProcessing ? 'Processing…' : 'System audio'}
            </span>
            {isRecordingAudio && <AudioMeter level={audioLevel} />}
          </button>
        </div>
    </div>
  );
}
