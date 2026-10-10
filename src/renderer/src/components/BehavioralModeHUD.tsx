import { Eye } from 'lucide-react';
import type { BehavioralFramework } from '../../../shared/types';

interface Props {
  showFramework?: boolean;
  framework: BehavioralFramework;
  onSelectFramework: (framework: BehavioralFramework) => void;
  isEyeTrackingActive?: boolean;
  onToggleEyeTracking?: () => void;
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
  showFramework = true,
  framework,
  onSelectFramework,
  isEyeTrackingActive = false,
  onToggleEyeTracking,
}: Props) {
  const activeDef = FRAMEWORKS.find((f) => f.id === framework) || FRAMEWORKS[0];

  return (
    <div className="behavioral-copilot-bar">
        {showFramework && <label className="behavioral-framework-picker">Framework
          <select aria-label="Interview framework" value={framework} title={activeDef.description}
            onChange={(event) => onSelectFramework(event.target.value as BehavioralFramework)}>
            {FRAMEWORKS.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>}

        <div className="behavioral-bar-actions">
          {/* Eye Tracker & Screen HUD Toggle */}
          {onToggleEyeTracking && (
            <button
              type="button"
              className={`eye-tracker-hud-btn ${isEyeTrackingActive ? 'active' : ''}`}
              onClick={onToggleEyeTracking}
              title={
                isEyeTrackingActive
                  ? 'Eye Tracker & Answer HUD are ON. Interview answers follow your gaze.'
                  : 'Turn on Eye Tracker & Answer HUD for hands-free interview assistance'
              }
            >
              <Eye size={12} color={isEyeTrackingActive ? '#68d391' : 'var(--muted)'} />
              <span>{isEyeTrackingActive ? 'Eye Tracker HUD: ON' : 'Eye Tracker HUD: OFF'}</span>
            </button>
          )}


        </div>
    </div>
  );
}
