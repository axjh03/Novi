import { GraduationCap } from 'lucide-react';
import { practiceStepNumber, type PracticeState } from '../services/practice';

const SOURCE_NAMES: Record<string, string> = { system: 'system audio', microphone: 'your microphone', both: 'system audio or your microphone' };

/** The practice run's instructions, shown in the tray above the message box. */
export function PracticeCoach({ state, voiced, listenKey, onTypeInstead, onRemove, onEnd }: {
  state: PracticeState; voiced: boolean; listenKey: string;
  onTypeInstead: () => void; onRemove: () => void; onEnd: () => void;
}) {
  const number = practiceStepNumber(state.step);
  const source = SOURCE_NAMES[localStorage.getItem('novi_listening_source') || 'system'] || 'system audio';
  let text: string;
  switch (state.step) {
    case 'listen': text = `Press ${listenKey} or the microphone button to start listening. Novi then plays a sample interviewer question.`; break;
    case 'asking': text = `Listening… the interviewer is asking a question. When it finishes, press ${listenKey} to stop.`; break;
    case 'heard': text = voiced
      ? `Press ${listenKey} to stop listening.`
      : `This computer has no voice to read the question aloud, so here it is: “${state.question}” Press ${listenKey} to stop listening.`; break;
    case 'send': text = state.failed
      ? 'That didn’t send. Check the message below, then press Enter to try again.'
      : state.filled
        ? voiced && !state.typed ? `Novi didn’t hear it through ${source}, so the question is typed in for you. Press Enter to send. Check System audio in Get ready later.` : 'The question is typed in for you. Press Enter to send.'
        : 'Check the question in the message box, then press Enter to send.'; break;
    case 'answer': text = 'Novi is answering in the panel on the right. Glance there to read it.'; break;
    case 'done': text = `That’s the whole loop: ${listenKey} to listen, ${listenKey} to stop, Enter to send, then read the panel.`; break;
    default: return null;
  }
  return <section className="practice-coach" aria-label="Practice run">
    <GraduationCap size={16} aria-hidden="true" />
    <p role="status"><strong>{number ? `Practice · step ${number} of 3` : state.step === 'done' ? 'Practice done' : 'Practice'}</strong>{text}</p>
    <div className="practice-actions">
      {state.step === 'listen' && <button type="button" className="text-button" onClick={onTypeInstead}>Type it instead</button>}
      {state.step === 'done'
        ? <><button type="button" className="text-button" onClick={onRemove}>Remove practice chat</button><button type="button" className="secondary" onClick={onEnd}>Done</button></>
        : <button type="button" className="text-button" onClick={onEnd}>End practice</button>}
    </div>
  </section>;
}
