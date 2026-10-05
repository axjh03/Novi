import {
  Volume2,
  Zap,
  Sparkles,
  Award,
  Target,
  Rocket,
  Wrench,
  Compass,
} from 'lucide-react';
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
  icon: typeof Sparkles;
  hint: string;
  description: string;
}[] = [
  {
    id: 'smart',
    label: 'SMART Auto',
    icon: Sparkles,
    hint: 'AI Auto-Select',
    description: 'Analyzes the interviewer question and automatically chooses the best framework (STAR, CAR, or PAR).',
  },
  {
    id: 'star',
    label: 'STAR Method',
    icon: Target,
    hint: 'Situation • Task • Action • Result',
    description: 'Classic behavioral: Situation context, Task ownership, Actions taken, and quantified measurable Results.',
  },
  {
    id: 'car',
    label: 'CAR Method',
    icon: Rocket,
    hint: 'Context • Action • Result',
    description: 'Punchy & concise: high-level Context, decisive Actions taken, and tangible business Results.',
  },
  {
    id: 'par',
    label: 'PAR Method',
    icon: Wrench,
    hint: 'Problem • Action • Resolution',
    description: 'Technical focus: Problem statement, Engineering Action executed, and final Resolution.',
  },
  {
    id: 'soar',
    label: 'SOAR Method',
    icon: Compass,
    hint: 'Situation • Obstacle • Action • Result',
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
      <div className="behavioral-bar-main">
        {/* Badge & Label */}
        <div className="behavioral-bar-tag">
          <Award size={14} className="behavioral-bar-icon" />
          <span>Behavioral Mode</span>
        </div>

        {/* Framework Selector Tabs */}
        <div className="behavioral-framework-tabs" role="tablist" aria-label="Behavioral Frameworks">
          {FRAMEWORKS.map((f) => {
            const Icon = f.icon;
            const isSelected = f.id === framework;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`framework-pill-btn ${isSelected ? 'active' : ''} ${f.id === 'smart' ? 'smart-pill' : ''}`}
                onClick={() => onSelectFramework(f.id)}
                title={`${f.label} (${f.hint}) - ${f.description}`}
              >
                <Icon size={12} />
                <span>{f.label}</span>
                {f.id === 'smart' && <span className="smart-indicator">AI</span>}
              </button>
            );
          })}
        </div>

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

      {/* Dynamic Framework Guidance Subtitle */}
      <div className="behavioral-bar-sub">
        <span className="behavioral-sub-hint">
          <strong>{activeDef.label}:</strong> {activeDef.hint} — {activeDef.description}
        </span>
      </div>

    </div>
  );
}
