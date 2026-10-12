import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { AppMode } from '../../../shared/types';
import { PRACTICE_IDLE, PRACTICE_QUESTIONS, practiceReducer } from '../services/practice';

// Prefer an English voice on this computer; network voices cannot load in Novi.
function chooseVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const english = synth.getVoices().filter((voice) => /^en([-_]|$)/i.test(voice.lang));
  return english.find((voice) => voice.localService) || english[0] || null;
}

// Voices can load a moment after startup; wait up to a second for them.
function findVoice(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice | null> {
  if (synth.getVoices().length) return Promise.resolve(chooseVoice(synth));
  return new Promise((resolve) => {
    const done = () => { window.clearTimeout(timer); synth.removeEventListener('voiceschanged', done); resolve(chooseVoice(synth)); };
    const timer = window.setTimeout(done, 1000);
    synth.addEventListener('voiceschanged', done);
  });
}

/** A guided rehearsal of the real loop: listen, hear a sample question, stop, send, read the answer. */
export function usePracticeRun({ appMode, chatBusy, chatError, conversationId }: { appMode: AppMode; chatBusy: boolean; chatError: string; conversationId: string | null }) {
  const [state, dispatch] = useReducer(practiceReducer, PRACTICE_IDLE);
  // Whether the question was read aloud; false when this computer has no voice to read it.
  const [voiced, setVoiced] = useState(true);
  const [prefill, setPrefill] = useState<{ id: number; text: string } | undefined>();

  // Read the question once listening has started.
  useEffect(() => {
    if (state.step !== 'asking') return;
    const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
    let cancelled = false;
    // A short pause lets audio capture settle before the question begins.
    const timer = window.setTimeout(() => {
      void (synth ? findVoice(synth) : Promise.resolve(null)).then((voice) => {
        if (cancelled) return;
        if (!synth || !voice) { setVoiced(false); dispatch({ type: 'spoken' }); return; }
        const utterance = new SpeechSynthesisUtterance(state.question);
        utterance.voice = voice;
        utterance.lang = voice.lang;
        utterance.rate = 0.95;
        utterance.onend = utterance.onerror = () => { if (!cancelled) dispatch({ type: 'spoken' }); };
        setVoiced(true);
        synth.cancel();
        synth.speak(utterance);
      });
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); synth?.cancel(); };
  }, [state.step, state.question]);

  // Nothing was heard: put the question in the message box so the loop can finish.
  // Cleared after the send step, so a message box opened later (another conversation) starts empty.
  useEffect(() => {
    if (state.step === 'send' && state.filled) setPrefill((current) => ({ id: (current?.id ?? 0) + 1, text: state.question }));
    else if (state.step !== 'send') setPrefill(undefined);
  }, [state.step, state.filled, state.question]);

  // A send starts the answer step; its end (with or without an error) finishes it.
  const wasBusy = useRef(chatBusy);
  useEffect(() => {
    const was = wasBusy.current;
    wasBusy.current = chatBusy;
    if (chatBusy && !was) dispatch({ type: 'send-started' });
    else if (!chatBusy && was) dispatch({ type: 'send-finished', ok: !chatError, conversationId });
  }, [chatBusy]);

  const onListeningChange = useCallback((active: boolean, heard: string) => dispatch({ type: 'listening', active, heard }), []);
  const start = useCallback(() => { setVoiced(true); dispatch({ type: 'start', question: PRACTICE_QUESTIONS[appMode] }); }, [appMode]);
  const typeInstead = useCallback(() => dispatch({ type: 'type-instead' }), []);
  const cancel = useCallback(() => dispatch({ type: 'cancel' }), []);

  return { state, voiced, prefill, active: state.step !== 'idle', start, typeInstead, cancel, onListeningChange };
}
