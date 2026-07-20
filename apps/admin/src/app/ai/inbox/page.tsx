'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '@dha/ui';
import {
  adminApi,
  type GuestConversationRow,
  type InboxOperator,
  type InboxThread,
} from '../../../lib/api';
import { useAdminMe, useRequireAdmin } from '../../../lib/use-admin';

const CHANNEL_RU: Record<string, string> = {
  WEB: 'Сайт',
  APP: 'Приложение',
  TELEGRAM: 'Telegram',
  TELEGRAM_DIRECT: 'Telegram (директ)',
  MAX: 'MAX',
  WHATSAPP: 'WhatsApp',
  UMNICO: 'Умнико',
  ADMIN: 'Админка',
};
const STATUS_RU: Record<string, { label: string; cls: string }> = {
  BOT: { label: 'AI ведёт', cls: 'bg-sky-50 text-sky-700' },
  ESCALATED: { label: 'эскалация', cls: 'bg-amber-50 text-amber-700' },
  CLOSED: { label: 'закрыт', cls: 'bg-slate-100 text-slate-500' },
};
const shortId = (id: string) => id.slice(0, 8);
const guestLabel = (name: string | null, id: string | null) =>
  name || (id ? `гость ${shortId(id)}` : 'аноним');
const operatorLabel = (name: string | null, id: string | null) =>
  name || (id ? `оператор ${shortId(id)}` : '');

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'только что';
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  return `${Math.floor(s / 86400)} дн назад`;
}

/**
 * Тело сообщения: маркеры `[img]<url>` (напр. картинки из Umnico) рисуем как <img>,
 * остальное — как текст. Клик по картинке открывает оригинал в новой вкладке.
 */
function MessageBody({ text }: { text: string }) {
  const parts = text.split(/(\[img\]\S+)/g).filter((p) => p !== '');
  return (
    <>
      {parts.map((p, i) => {
        const img = p.match(/^\[img\](\S+)$/);
        if (img) {
          return (
            <a key={i} href={img[1]} target="_blank" rel="noreferrer" className="block">
              <img src={img[1]} alt="вложение" className="mt-1 max-h-64 max-w-full rounded-lg object-contain" />
            </a>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

export default function InboxPage() {
  const ready = useRequireAdmin();
  const me = useAdminMe();
  const [mode, setMode] = useState<'escalated' | 'all'>('escalated');
  const [list, setList] = useState<GuestConversationRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<InboxThread | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [operators, setOperators] = useState<InboxOperator[]>([]);
  const [showDelegate, setShowDelegate] = useState(false);
  const [delegateTo, setDelegateTo] = useState('');
  const [delegateNote, setDelegateNote] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    try {
      const rows = mode === 'all' ? await adminApi.inboxAll() : await adminApi.inboxList();
      setList(rows);
      setSelected((cur) => cur ?? rows[0]?.id ?? null); // авто-выбор первого, если ничего не выбрано
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Не удалось загрузить очередь');
    }
  }, [mode]);

  const loadThread = useCallback(async (id: string) => {
    try {
      setThread(await adminApi.inboxThread(id));
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Не удалось загрузить диалог');
    }
  }, []);

  // Очередь: начальная загрузка + опрос каждые 10 c (появляются новые эскалации).
  useEffect(() => {
    if (!ready) return;
    void loadList();
    const t = setInterval(() => void loadList(), 10_000);
    return () => clearInterval(t);
  }, [ready, loadList]);

  // Список сотрудников для делегирования (загружаем один раз).
  useEffect(() => {
    if (ready) adminApi.inboxOperators().then(setOperators).catch(() => undefined);
  }, [ready]);

  // Выбранный диалог: опрос каждые 5 c (гость может дописывать, пока оператор думает).
  useEffect(() => {
    setShowDelegate(false);
    setRenaming(false);
    if (!selected) {
      setThread(null);
      return;
    }
    void loadThread(selected);
    // Открыли диалог → backend отметит прочитанным; локально гасим «непрочитано» сразу (#1).
    setList((rows) => rows.map((r) => (r.id === selected ? { ...r, unread: false } : r)));
    const t = setInterval(() => void loadThread(selected), 5_000);
    return () => clearInterval(t);
  }, [selected, loadThread]);

  // Прокручиваем ТОЛЬКО контейнер сообщений вниз (не весь экран через scrollIntoView —
  // из-за него страница «уходила вниз» при открытии диалога).
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread?.messages.length, selected]);

  async function send() {
    const text = reply.trim();
    if (!text || !selected || busy) return;
    setBusy(true);
    setNote(null);
    try {
      await adminApi.inboxReply(selected, text);
      setReply('');
      await loadThread(selected);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Не удалось отправить');
    } finally {
      setBusy(false);
    }
  }

  async function assign() {
    if (!selected || busy) return;
    setBusy(true);
    setNote(null);
    try {
      await adminApi.inboxAssign(selected);
      await Promise.all([loadThread(selected), loadList()]);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    if (!selected || busy) return;
    setBusy(true);
    setNote(null);
    try {
      await adminApi.inboxClose(selected);
      setSelected(null);
      setThread(null);
      await loadList();
      setNote('Диалог закрыт.');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function delegate() {
    if (!selected || !delegateTo || busy) return;
    setBusy(true);
    setNote(null);
    try {
      await adminApi.inboxDelegate(selected, delegateTo, delegateNote.trim() || undefined);
      setShowDelegate(false);
      setDelegateTo('');
      setDelegateNote('');
      await Promise.all([loadThread(selected), loadList()]);
      setNote('Диалог передан.');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Не удалось передать');
    } finally {
      setBusy(false);
    }
  }

  async function saveTitle() {
    if (!selected || busy) return;
    setBusy(true);
    setNote(null);
    try {
      await adminApi.inboxRename(selected, titleDraft.trim());
      setRenaming(false);
      await Promise.all([loadThread(selected), loadList()]);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Не удалось переименовать');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  const conv = thread?.conversation;
  const mineAssigned = Boolean(conv?.operatorId && me && conv.operatorId === me.id);

  return (
    <main className="px-8 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light text-ink">
            {mode === 'all' ? 'Все диалоги гостей' : 'Лента эскалаций'}
          </h1>
          <p className="mt-1 text-sm text-dark-gray">
            {mode === 'all'
              ? 'Все переписки гостей с AI-администратором — для наблюдения. Можно вмешаться: «Взять себе» и ответить.'
              : 'Диалоги, переданные AI-администратором человеку. Ответ уходит гостю в его канал (§4.7).'}
          </p>
        </div>
        <div className="flex shrink-0 rounded-lg border border-ink/10 p-0.5 text-sm">
          <button
            onClick={() => {
              setMode('escalated');
              setSelected(null);
            }}
            className={`rounded-md px-3 py-1.5 transition ${
              mode === 'escalated' ? 'bg-primary text-white' : 'text-slate-500 hover:text-ink'
            }`}
          >
            Эскалированные
          </button>
          <button
            onClick={() => {
              setMode('all');
              setSelected(null);
            }}
            className={`rounded-md px-3 py-1.5 transition ${
              mode === 'all' ? 'bg-primary text-white' : 'text-slate-500 hover:text-ink'
            }`}
          >
            Все диалоги
          </button>
        </div>
      </div>

      {note && (
        <div className="mb-4 rounded-lg border border-primary-100 bg-primary-50 px-4 py-2 text-sm text-primary-700">
          {note}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Очередь */}
        <Card className="p-2">
          <p className="px-2 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            {mode === 'all' ? 'Диалоги' : 'Очередь'} · {list.length}
          </p>
          {list.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-slate-400">
              {mode === 'all' ? 'Диалогов пока нет' : 'Нет открытых эскалаций 🎉'}
            </p>
          ) : (
            <div className="space-y-1">
              {list.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left transition ${
                    selected === c.id ? 'bg-primary-50 ring-1 ring-primary-100' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {c.unread && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" title="Непрочитанное сообщение" />
                      )}
                      <span className={`truncate text-sm text-ink ${c.unread ? 'font-semibold' : 'font-medium'}`}>
                        {c.title || `Диалог ${shortId(c.id)}`}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                      {CHANNEL_RU[c.channel] ?? c.channel}
                    </span>
                  </div>
                  {c.lastMessage && (
                    <p className={`mt-0.5 truncate text-[11px] ${c.unread ? 'font-medium text-ink' : 'text-slate-500'}`}>
                      {c.lastRole === 'user' ? '👤 ' : c.lastRole === 'staff' ? '🧑‍💼 ' : '🤖 '}
                      {c.lastMessage.replace(/\[img\]\S+/g, '📷 фото')}
                    </p>
                  )}
                  <div className="mt-0.5 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{guestLabel(c.guestName, c.guestId)}</span>
                    <span>{timeAgo(c.lastAt ?? c.updatedAt)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    {(() => {
                      const st = mode === 'all' && c.status ? STATUS_RU[c.status] : undefined;
                      return st ? (
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${st.cls}`}>
                          {st.label}
                        </span>
                      ) : null;
                    })()}
                    {c.operatorId && (
                      <span className="inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
                        взят
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Диалог */}
        <Card className="flex h-[70vh] flex-col p-0">
          {!conv ? (
            <div className="grid flex-1 place-items-center text-sm text-slate-400">Выберите диалог слева</div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-ink/[0.06] px-5 py-3">
                <div className="min-w-0">
                  {renaming ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={titleDraft}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void saveTitle();
                          if (e.key === 'Escape') setRenaming(false);
                        }}
                        placeholder={`Диалог ${shortId(conv.id)}`}
                        maxLength={120}
                        className="w-56 rounded-lg border border-ink/15 px-2 py-1 text-sm focus:border-primary focus:outline-none"
                      />
                      <button
                        onClick={() => void saveTitle()}
                        disabled={busy}
                        className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
                      >
                        OK
                      </button>
                      <button
                        onClick={() => setRenaming(false)}
                        className="rounded-md px-2 py-1 text-xs text-slate-500 hover:text-ink"
                      >
                        Отмена
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-medium text-ink">
                        {conv.title || `Диалог ${shortId(conv.id)}`}
                        <span className="ml-1.5 font-normal text-slate-400">
                          · {CHANNEL_RU[conv.channel] ?? conv.channel}
                        </span>
                      </p>
                      <button
                        onClick={() => {
                          setTitleDraft(conv.title ?? '');
                          setRenaming(true);
                        }}
                        title="Переименовать диалог"
                        className="shrink-0 rounded p-0.5 text-slate-300 transition hover:text-slate-600"
                      >
                        ✎
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-slate-400">
                    {guestLabel(conv.guestName, conv.guestId)}
                    {conv.guestPhone ? ` · ${conv.guestPhone}` : ''}
                    {conv.operatorId
                      ? ` · ${mineAssigned ? 'у вас' : operatorLabel(conv.operatorName, conv.operatorId)}`
                      : ' · не взят'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!mineAssigned && (
                    <button
                      onClick={() => void assign()}
                      disabled={busy}
                      className="rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      Взять себе
                    </button>
                  )}
                  <button
                    onClick={() => setShowDelegate((v) => !v)}
                    disabled={busy}
                    className="rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    Передать
                  </button>
                  <button
                    onClick={() => void close()}
                    disabled={busy}
                    className="rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                  >
                    Закрыть
                  </button>
                </div>
              </div>

              {showDelegate && (
                <div className="flex flex-wrap items-center gap-2 border-b border-ink/[0.06] bg-slate-50/60 px-5 py-3">
                  <select
                    value={delegateTo}
                    onChange={(e) => setDelegateTo(e.target.value)}
                    className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                  >
                    <option value="">Кому передать…</option>
                    {operators
                      .filter((o) => o.id !== me?.id)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name} · {o.role}
                        </option>
                      ))}
                  </select>
                  <input
                    value={delegateNote}
                    onChange={(e) => setDelegateNote(e.target.value)}
                    placeholder="Комментарий для коллеги (необязательно)"
                    className="min-w-0 flex-1 rounded-lg border border-ink/15 px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                  />
                  <button
                    onClick={() => void delegate()}
                    disabled={busy || !delegateTo}
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
                  >
                    Передать
                  </button>
                  <button
                    onClick={() => setShowDelegate(false)}
                    className="rounded-lg px-2 py-1.5 text-sm text-slate-500 transition hover:text-ink"
                  >
                    Отмена
                  </button>
                </div>
              )}

              <div ref={messagesRef} className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
                {thread?.messages.map((m, i) =>
                  m.role === 'system' ? (
                    <div key={i} className="flex justify-center">
                      <div className="rounded-full bg-slate-100 px-3 py-1 text-center text-[11px] text-slate-500">
                        {m.text}
                      </div>
                    </div>
                  ) : (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                      <div className="max-w-[75%]">
                        {m.role === 'ai' && (
                          <div className="mb-0.5 text-right text-[10px] text-slate-400">AI</div>
                        )}
                        <div
                          className={`overflow-hidden whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                            m.role === 'user'
                              ? 'bg-slate-100 text-ink'
                              : m.role === 'staff'
                                ? 'bg-primary text-white'
                                : 'border border-ink/10 bg-white text-slate-500'
                          }`}
                        >
                          <MessageBody text={m.text} />
                        </div>
                      </div>
                    </div>
                  ),
                )}
                <div ref={endRef} />
              </div>

              <div className="flex items-end gap-2 border-t border-ink/[0.06] px-4 py-3">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={1}
                  placeholder="Ответ гостю… (Enter — отправить, Shift+Enter — перенос)"
                  className="max-h-32 flex-1 resize-none rounded-lg border border-ink/15 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
                <button
                  onClick={() => void send()}
                  disabled={busy || !reply.trim()}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
                >
                  Отправить
                </button>
              </div>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
