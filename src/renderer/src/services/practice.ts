import type { AppMode } from '../../../shared/types';

// One realistic opening question per mode, read aloud as if an interviewer asked it.
export const PRACTICE_QUESTIONS: Record<AppMode, string> = {
  normal: 'Can you tell me a little about yourself?',
  recruiter: 'Tell me a little about yourself and why you are interested in this role.',
  coding: 'Given an array of integers and a target number, return the indices of the two numbers that add up to the target.',
  technical: 'What happens when you type a web address into your browser and press Enter?',
  'system-design': 'How would you design a URL shortening service, like the ones that turn long links into short ones?',
  behavioral: 'Tell me about a time you disagreed with a teammate. How did you handle it?',
  // Practice runs are offered outside Local Coding, which works on the user's own project instead.
  'local-coding': 'Walk me through how this project is organized.',
};

/**
 * idle → listen (start listening) → asking (question plays) → heard (stop listening)
 * → send (send it) → answer (Novi answers) → done.
 */
export type PracticeStep = 'idle' | 'listen' | 'asking' | 'heard' | 'send' | 'answer' | 'done';
export interface PracticeState {
  step: PracticeStep;
  question: string;
  /** The question was typed into the message box: nothing was heard, or the user chose to type it. */
  filled: boolean;
  /** The user chose Type it instead, so nothing was listened for. */
  typed: boolean;
  /** The last send failed; the message box holds the question again. */
  failed: boolean;
  conversationId: string | null;
}
export type PracticeEvent =
  | { type: 'start'; question: string }
  | { type: 'listening'; active: boolean; heard: string }
  | { type: 'spoken' }
  | { type: 'type-instead' }
  | { type: 'send-started' }
  | { type: 'send-finished'; ok: boolean; conversationId: string | null }
  | { type: 'cancel' };

export const PRACTICE_IDLE: PracticeState = { step: 'idle', question: '', filled: false, typed: false, failed: false, conversationId: null };

export function practiceReducer(state: PracticeState, event: PracticeEvent): PracticeState {
  if (event.type === 'cancel') return PRACTICE_IDLE;
  if (event.type === 'start') return { ...PRACTICE_IDLE, step: 'listen', question: event.question };
  const waiting = state.step === 'listen' || state.step === 'asking' || state.step === 'heard' || state.step === 'send';
  switch (event.type) {
    case 'listening':
      if (event.active && state.step === 'listen') return { ...state, step: 'asking' };
      if (!event.active && (state.step === 'asking' || state.step === 'heard')) return { ...state, step: 'send', filled: !event.heard.trim(), failed: false };
      return state;
    case 'spoken':
      return state.step === 'asking' ? { ...state, step: 'heard' } : state;
    case 'type-instead':
      return state.step === 'listen' ? { ...state, step: 'send', filled: true, typed: true, failed: false } : state;
    case 'send-started':
      return waiting ? { ...state, step: 'answer', failed: false } : state;
    case 'send-finished':
      if (state.step !== 'answer') return state;
      return event.ok ? { ...state, step: 'done', conversationId: event.conversationId } : { ...state, step: 'send', failed: true, filled: false };
  }
}

/** The coach's step number out of three, or null outside the guided steps. */
export function practiceStepNumber(step: PracticeStep): 1 | 2 | 3 | null {
  if (step === 'listen') return 1;
  if (step === 'asking' || step === 'heard') return 2;
  if (step === 'send') return 3;
  return null;
}
