import { useEffect, useMemo, useRef, useState } from 'react';
import type { Conversation, SendInput } from '../../../shared/types';
import { errorText, unwrap } from '../services/api';

import { useAppMode } from '../context/AppModeContext';

export function useChat(initial: Conversation[]) {
  const { appMode, behavioralFramework, answerStyle } = useAppMode();
  const [conversations, setConversations] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const sent = useRef<number | null>(null);
  const firstWord = useRef(false);
  useEffect(() => {
    setConversations(initial);
    setSelectedId((id) => initial.some((conversation) => conversation.id === id) ? id : null);
  }, [initial]);
  useEffect(() => {
    // Streamed text arrives a few characters at a time. Rendering (and re-parsing the markdown) per
    // token is the main cost of a long answer, so tokens are buffered and applied ~30 times a second.
    // A timer, not an animation frame: frames stop while the main window is hidden behind the decks.
    let pending = new Map<string, { conversationId: string; messageId: string; text: string }>();
    let timer = 0;
    const flush = () => {
      window.clearTimeout(timer); timer = 0;
      if (!pending.size) return;
      const batch = pending; pending = new Map();
      setConversations((items) => items.map((c) => {
        let messages: typeof c.messages | null = null;
        for (const delta of batch.values()) {
          if (delta.conversationId !== c.id) continue;
          messages = (messages ?? c.messages).map((m) => m.id === delta.messageId ? { ...m, content: m.content + delta.text } : m);
        }
        return messages ? { ...c, messages } : c;
      }));
    };
    const unsubscribe = window.novi.onChat((event) => {
      if (event.type !== 'delta') flush();
      if (event.type === 'progress') {
        // Progress only updates the message; it never starts or finishes a request.
        setConversations((items) => items.map((c) => c.id !== event.conversationId ? c : { ...c, messages: c.messages.map((m) => m.id === event.messageId ? { ...m, localCoding: event.localCoding } : m) }));
      } else if (event.type === 'delta') {
        if (sent.current !== null && !firstWord.current && /[\p{L}\p{N}]/u.test(event.text)) {
          firstWord.current = true;
          console.info('[Novi latency]', { stage: 'ui-first-word', milliseconds: performance.now() - sent.current });
        }
        const key = `${event.conversationId}\u0000${event.messageId}`;
        const queued = pending.get(key);
        if (queued) queued.text += event.text;
        else pending.set(key, { conversationId: event.conversationId, messageId: event.messageId, text: event.text });
        if (!timer) timer = window.setTimeout(flush, 32);
      } else {
        setConversations((items) => [event.conversation, ...items.filter((c) => c.id !== event.conversation.id)]);
        if (event.type === 'started') { setBusy(true); setSelectedId(event.conversation.id); setActiveId(event.conversation.id); }
        else { setBusy(false); setActiveId(null); }
      }
    });
    return () => { window.clearTimeout(timer); unsubscribe(); };
  }, []);
  const sorted = useMemo(() => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt), [conversations]);
  async function send(input: Omit<SendInput, 'conversationId'>): Promise<boolean> {
    setError(''); setBusy(true);
    sent.current = performance.now(); firstWord.current = false;
    try {
      await unwrap(window.novi.send({ ...input, appMode, behavioralFramework, ...(answerStyle ? { answerStyle } : {}), conversationId: selectedId, sentAt: Date.now() }));
      return true;
    }
    catch (error) { setError(errorText(error)); return false; }
    finally { sent.current = null; setBusy(false); setActiveId(null); }
  }
  async function rename(id: string, title: string) {
    try {
      const conversation = await unwrap(window.novi.renameConversation(id, title));
      setConversations(items => items.map(item => item.id === id ? conversation : item));
      return true;
    } catch (error) { setError(errorText(error)); return false; }
  }
  async function remove(id: string) {
    try { await unwrap(window.novi.deleteConversation(id)); setConversations((items) => items.filter((item) => item.id !== id)); if (id === selectedId) setSelectedId(null); }
    catch (error) { setError(errorText(error)); }
  }
  return {
    conversations: sorted,
    selected: conversations.find((item) => item.id === selectedId), selectedId, setSelectedId,
    busy, activeId, error, setError, send, remove, rename,
    clear: () => { setConversations([]); setSelectedId(null); },
  };
}
