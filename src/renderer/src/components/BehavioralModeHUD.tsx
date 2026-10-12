import type { BehavioralFramework } from '../../../shared/types';

interface Props {
  framework: BehavioralFramework;
  onSelectFramework: (framework: BehavioralFramework) => void;
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

// Eye tracking and its answer HUD are controlled from the eye-tracking buttons in the tray.
export function BehavioralModeHUD({ framework, onSelectFramework }: Props) {
  const activeDef = FRAMEWORKS.find((f) => f.id === framework) || FRAMEWORKS[0];

  return (
    <div className="behavioral-copilot-bar">
      <label className="behavioral-framework-picker">
        <select aria-label="Interview framework" value={framework} title={`Answer framework: ${activeDef.description}`}
          onChange={(event) => onSelectFramework(event.target.value as BehavioralFramework)}>
          {FRAMEWORKS.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
    </div>
  );
}
