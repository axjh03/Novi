import { useEffect, useRef, useState } from 'react';
import type { Conversation, SendInput } from '../../../shared/types';
import { errorText, unwrap } from '../services/api';

import { useAppMode } from '../context/AppModeContext';

export function useChat(initial: Conversation[]) {
  const { appMode, behavioralFramework } = useAppMode();
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
  useEffect(() => window.novi.onChat((event) => {
    if (event.type === 'delta') {
      if (sent.current !== null && !firstWord.current && /[\p{L}\p{N}]/u.test(event.text)) {
        firstWord.current = true;
        console.info('[Novi latency]', { stage: 'ui-first-word', milliseconds: performance.now() - sent.current });
      }
      setConversations((items) => items.map((c) => c.id !== event.conversationId ? c : { ...c, messages: c.messages.map((m) => m.id === event.messageId ? { ...m, content: m.content + event.text } : m) }));
    } else {
      setConversations((items) => [event.conversation, ...items.filter((c) => c.id !== event.conversation.id)]);
      if (event.type === 'started') { setBusy(true); setSelectedId(event.conversation.id); setActiveId(event.conversation.id); }
      else { setBusy(false); setActiveId(null); }
    }
  }), []);
  async function send(input: Omit<SendInput, 'conversationId'>): Promise<boolean> {
    setError(''); setBusy(true);
    sent.current = performance.now(); firstWord.current = false;
    try {
      await unwrap(window.novi.send({ ...input, appMode, behavioralFramework, conversationId: selectedId, sentAt: Date.now() }));
      return true;
    }
    catch (error) { setError(errorText(error)); return false; }
    finally { sent.current = null; setBusy(false); setActiveId(null); }
  }
  async function remove(id: string) {
    try { await unwrap(window.novi.deleteConversation(id)); setConversations((items) => items.filter((item) => item.id !== id)); if (id === selectedId) setSelectedId(null); }
    catch (error) { setError(errorText(error)); }
  }
  return {
    conversations: [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    selected: conversations.find((item) => item.id === selectedId), selectedId, setSelectedId,
    busy, activeId, error, setError, send, remove,
    clear: () => { setConversations([]); setSelectedId(null); },
  };
}
