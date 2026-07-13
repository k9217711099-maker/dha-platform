'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useCart } from '../lib/cart-context';

interface Msg {
  role: 'user' | 'ai' | 'staff';
  text: string;
}

const GREETING: Msg = {
  role: 'ai',
  text: 'Здравствуйте! Я AI-администратор D Hotels & Apartments 🙂 Помогу подобрать номер, рассчитать цену и оформить бронь. Чем могу помочь?',
};

/**
 * Плавающий чат с AI-администратором (гостевой агент, POST /ai/guest/message).
 * Доступен всем, включая анонимных гостей. Ответ приходит синхронно; сложные
 * вопросы агент эскалирует администратору на стороне backend.
 */
export function ChatWidget() {
  const cart = useCart();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  // Сколько ответов оператора (staff) уже показано — курсор опроса без завязки на часы.
  const staffShown = useRef(0);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open, busy]);

  // После эскалации опрашиваем тред и подкладываем новые ответы оператора (STAFF).
  useEffect(() => {
    if (!open || !escalated || !conversationId) return;
    let alive = true;
    async function poll() {
      try {
        const thread = await api.aiGuestConversation(conversationId!);
        if (!alive) return;
        const staff = thread.filter((m) => m.role === 'staff');
        if (staff.length > staffShown.current) {
          const fresh = staff.slice(staffShown.current).map((m) => ({ role: 'staff' as const, text: m.text }));
          staffShown.current = staff.length;
          setMessages((s) => [...s, ...fresh]);
        }
      } catch {
        /* сеть моргнула — повторим на следующем тике */
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [open, escalated, conversationId]);

  async function send() {
    const q = text.trim();
    if (!q || busy) return;
    setMessages((s) => [...s, { role: 'user', text: q }]);
    setText('');
    setBusy(true);
    try {
      const res = await api.aiGuestMessage(q, conversationId);
      setConversationId(res.conversationId);
      setMessages((s) => [...s, { role: 'ai', text: res.reply }]);
      if (res.escalated) setEscalated(true);
    } catch {
      setMessages((s) => [
        ...s,
        { role: 'ai', text: 'Извините, не получилось ответить. Попробуйте ещё раз или чуть позже.' },
      ]);
    } finally {
      setBusy(false);
    }
  }

  const bottom = cart.count > 0 ? 'bottom-24' : 'bottom-6';

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`fixed right-6 ${bottom} z-40 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white shadow-xl transition hover:opacity-90`}
        aria-label="Открыть чат с AI-администратором"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
        </svg>
      </button>
    );
  }

  return (
    <div
      className={`fixed right-6 ${bottom} z-40 flex h-[460px] w-[min(92vw,360px)] flex-col overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-2xl`}
    >
      <div className="flex items-center justify-between bg-ink px-4 py-3 text-white">
        <span className="text-sm">AI-администратор</span>
        <button onClick={() => setOpen(false)} className="text-xl leading-none hover:opacity-80" aria-label="Свернуть чат">
          ×
        </button>
      </div>

      {escalated && (
        <div className="bg-beige/60 px-4 py-1.5 text-center text-[11px] text-dark-gray">
          Вопрос передан администратору — ответит здесь же
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[80%]">
              {m.role === 'staff' && (
                <div className="mb-0.5 px-1 text-[11px] font-medium text-dark-gray">Администратор</div>
              )}
              <div
                className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'bg-ink text-white'
                    : m.role === 'staff'
                      ? 'border border-ink/15 bg-white text-ink'
                      : 'bg-beige text-ink'
                }`}
              >
                {m.text}
              </div>
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-beige px-3 py-2 text-sm text-dark-gray">…</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex items-center gap-2 border-t border-ink/10 p-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void send()}
          placeholder="Сообщение…"
          className="flex-1 rounded-lg border border-ink/20 px-3 py-2 text-sm focus:border-ink/40 focus:outline-none"
        />
        <button
          onClick={() => void send()}
          disabled={busy || !text.trim()}
          className="rounded-lg bg-ink px-3 py-2 text-sm text-white disabled:opacity-40"
          aria-label="Отправить"
        >
          ›
        </button>
      </div>
    </div>
  );
}
