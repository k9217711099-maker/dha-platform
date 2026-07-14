'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@dha/ui';
import {
  adminApi,
  ApiError,
  type CopilotPendingAction,
  type CopilotResult,
} from '../../../lib/api';
import { useRequireAdmin } from '../../../lib/use-admin';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

/** Человекочитаемое имя инструмента копилота. */
const TOOL_RU: Record<string, string> = {
  add_booking_note: 'Добавить примечание к брони',
  find_booking: 'Найти бронь',
  kb_search: 'Поиск в базе знаний',
};

function toolLabel(name: string): string {
  return TOOL_RU[name] ?? name;
}

export default function CopilotPage() {
  const ready = useRequireAdmin();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<CopilotPendingAction[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending]);

  if (!ready) return null;

  function applyResult(res: CopilotResult) {
    setConversationId(res.conversationId);
    if (res.reply) setMessages((m) => [...m, { role: 'assistant', text: res.reply }]);
    setPending(res.pending);
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    setBusy(true);
    try {
      const res = await adminApi.copilotMessage(text, conversationId);
      applyResult(res);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Не удалось отправить сообщение';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  /** Подтвердить/отклонить ВСЕ предложенные действия разом. */
  async function decide(allow: boolean) {
    if (!conversationId || busy) return;
    setError(null);
    setBusy(true);
    const decisions = pending.map((p) => ({ toolCallId: p.toolCallId, allow }));
    // Оптимистично покажем в ленте, что решил сотрудник.
    setMessages((m) => [
      ...m,
      { role: 'user', text: allow ? '✔️ Подтвердил действия' : '✖️ Отклонил действия' },
    ]);
    setPending([]);
    try {
      const res = await adminApi.copilotConfirm(conversationId, decisions);
      applyResult(res);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Не удалось отправить решение';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-slate-800">AI-копилот</h1>
        <p className="mt-1 text-sm text-slate-500">
          Помощник на DeepSeek: отвечает на вопросы и выполняет поручения строго в
          пределах ваших прав. Действия на изменение данных копилот сначала предлагает —
          выполняются только после вашего подтверждения.
        </p>
      </header>

      <Card className="flex h-[65vh] flex-col overflow-hidden p-0">
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="mt-8 text-center text-sm text-slate-400">
              Например: «найди бронь Иванова на завтра» или «добавь примечание к брони №… —
              гость просит поздний выезд».
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  m.role === 'user'
                    ? 'max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2 text-sm text-white'
                    : 'max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2 text-sm text-slate-800'
                }
              >
                {m.text}
              </div>
            </div>
          ))}

          {pending.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
              <div className="mb-2 text-sm font-medium text-amber-900">
                Копилот предлагает выполнить действия:
              </div>
              <ul className="mb-3 space-y-1 text-sm text-amber-900">
                {pending.map((p) => (
                  <li key={p.toolCallId} className="flex flex-col">
                    <span className="font-medium">• {toolLabel(p.name)}</span>
                    {Object.keys(p.args).length > 0 && (
                      <span className="ml-3 text-xs text-amber-700">
                        {Object.entries(p.args)
                          .map(([k, v]) => `${k}: ${String(v)}`)
                          .join(', ')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <button
                  onClick={() => decide(true)}
                  disabled={busy}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Подтвердить
                </button>
                <button
                  onClick={() => decide(false)}
                  disabled={busy}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Отклонить
                </button>
              </div>
            </div>
          )}

          {busy && <div className="text-center text-xs text-slate-400">копилот думает…</div>}
        </div>

        {error && (
          <div className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>
        )}

        <div className="border-t border-slate-100 p-3">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder="Спросите копилота… (Enter — отправить, Shift+Enter — перенос)"
              className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            />
            <button
              onClick={() => void send()}
              disabled={busy || !input.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Отправить
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
