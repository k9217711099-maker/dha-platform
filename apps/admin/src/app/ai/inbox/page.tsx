'use client';

import { type ChangeEvent, type DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '@dha/ui';
import {
  adminApi,
  type GuestConversationRow,
  type InboxOperator,
  type InboxTemplate,
  type InboxThread,
  type UmnicoReachChannel,
} from '../../../lib/api';
import { useAdminMe, useRequireAdmin } from '../../../lib/use-admin';
import { EmojiPicker } from '../../staff-chat/EmojiPicker';

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
/** Подканалы Umnico → русские подписи (#14: откуда пишет гость). */
const SUBCHANNEL_RU: Record<string, string> = {
  whatsapp: 'WhatsApp',
  whatsappV2: 'WhatsApp',
  telebot: 'Telegram',
  telegram: 'Telegram',
  telegramV2: 'Telegram',
  instagramV3: 'Instagram',
  fb_messenger: 'Messenger',
  viber: 'Viber',
  vk: 'ВКонтакте',
  avito: 'Avito',
  ok: 'Одноклассники',
};
/** Подпись канала диалога: базовый канал + подканал Umnico («Умнико · Telegram»). */
const channelLabel = (channel: string, subChannel?: string | null): string => {
  const base = CHANNEL_RU[channel] ?? channel;
  if (!subChannel) return base;
  const sub = SUBCHANNEL_RU[subChannel] ?? subChannel;
  return `${base} · ${sub}`;
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

/** Инициалы для аватара-заглушки, когда фото профиля нет. */
function initials(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '👤';
}
/** Аватар гостя: фото из канала (Umnico), иначе — инициалы на цветном фоне. */
function Avatar({ name, url, size = 40 }: { name: string | null; url?: string | null; size?: number }) {
  const s = { width: size, height: size };
  if (url) {
    return <img src={url} alt="" style={s} className="shrink-0 rounded-full object-cover" />;
  }
  return (
    <span
      style={s}
      className="grid shrink-0 place-items-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700"
    >
      {initials(name)}
    </span>
  );
}

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
  const [query, setQuery] = useState(''); // умный поиск по диалогам (#8)
  const [showNewDialog, setShowNewDialog] = useState(false); // «написать гостю первым» (#9)
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
  // Инструменты ответа (#5): эмодзи, цитата, быстрые шаблоны «/».
  const [showEmoji, setShowEmoji] = useState(false);
  const [quoted, setQuoted] = useState<{ role: string; text: string } | null>(null);
  const [templates, setTemplates] = useState<InboxTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showTplManager, setShowTplManager] = useState(false);
  // Вложение гостю (#5/#10): выбранный файл + превью + статус загрузки + drag-over.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  // Список сотрудников для делегирования + быстрые шаблоны ответа (загружаем один раз).
  useEffect(() => {
    if (!ready) return;
    adminApi.inboxOperators().then(setOperators).catch(() => undefined);
    adminApi.inboxTemplates().then(setTemplates).catch(() => undefined);
  }, [ready]);

  // Выбранный диалог: опрос каждые 5 c (гость может дописывать, пока оператор думает).
  useEffect(() => {
    setShowDelegate(false);
    setRenaming(false);
    setQuoted(null);
    setShowEmoji(false);
    setShowTemplates(false);
    setPendingFile(null);
    setPendingPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
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

  function quotePrefix() {
    // Цитата (#5): процитированный фрагмент перед текстом (кросс-канально — обычным текстом).
    return quoted ? `«${quoted.text.replace(/\s+/g, ' ').slice(0, 160)}»\n\n` : '';
  }

  async function send() {
    if (pendingFile) return void sendAttachment();
    const body = reply.trim();
    if (!body || !selected || busy) return;
    setBusy(true);
    setNote(null);
    try {
      await adminApi.inboxReply(selected, quotePrefix() + body);
      setReply('');
      setQuoted(null);
      setShowTemplates(false);
      await loadThread(selected);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Не удалось отправить');
    } finally {
      setBusy(false);
    }
  }

  /** Выбрать файл для отправки гостю (превью + подпись, отправка по кнопке — #5/#10). */
  function stageFile(file: File | null | undefined) {
    if (!file || !selected) return;
    setPendingFile(file);
    setPendingPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    });
  }
  function clearPending() {
    setPendingPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPendingFile(null);
  }
  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    stageFile(file);
  }
  function onDragOver(e: DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    if (!dragOver) setDragOver(true);
  }
  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragOver(false);
  }
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    stageFile(e.dataTransfer.files?.[0]);
  }

  /** Отправить выбранный файл гостю с подписью (текст ответа + цитата). */
  async function sendAttachment() {
    if (!pendingFile || !selected || uploading) return;
    const caption = (quotePrefix() + reply.trim()).trim();
    setUploading(true);
    setNote(null);
    try {
      await adminApi.inboxSendAttachment(selected, pendingFile, caption || undefined);
      clearPending();
      setReply('');
      setQuoted(null);
      setShowTemplates(false);
      await loadThread(selected);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Не удалось отправить файл');
    } finally {
      setUploading(false);
    }
  }

  /** Ввод в поле ответа: «/» в начале открывает быстрые шаблоны (#5). */
  function onReplyChange(v: string) {
    setReply(v);
    setShowTemplates(v.startsWith('/'));
  }

  /** Список шаблонов под текущий «/запрос». */
  function matchedTemplates(): InboxTemplate[] {
    if (!reply.startsWith('/')) return [];
    const q = reply.slice(1).trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) => t.title.toLowerCase().includes(q) || t.text.toLowerCase().includes(q),
    );
  }

  /** Вставить шаблон в поле ответа (заменяет «/запрос»). */
  function pickTemplate(t: InboxTemplate) {
    setReply(t.text);
    setShowTemplates(false);
    replyRef.current?.focus();
  }

  /** Вставить эмодзи в позицию курсора поля ответа. */
  function insertEmoji(e: string) {
    const el = replyRef.current;
    if (!el) {
      setReply((r) => r + e);
      return;
    }
    const start = el.selectionStart ?? reply.length;
    const end = el.selectionEnd ?? reply.length;
    setReply(reply.slice(0, start) + e + reply.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + e.length;
      el.setSelectionRange(pos, pos);
    });
  }

  /** Процитировать сообщение в ответе (#5). */
  function quoteMessage(m: { role: string; text: string }) {
    setQuoted({ role: m.role, text: m.text.replace(/\[img\]\S+/g, '📷 фото') });
    replyRef.current?.focus();
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

  // Умный поиск по диалогам (#8): имя/телефон/название/текст последнего/канал.
  const q = query.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, '');
  const shown = !q
    ? list
    : list.filter((c) => {
        const hay = [
          c.guestName,
          c.title,
          c.lastMessage,
          channelLabel(c.channel, c.subChannel),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        const phoneHit = qDigits.length >= 3 && (c.guestPhone ?? '').replace(/\D/g, '').includes(qDigits);
        return hay.includes(q) || phoneHit;
      });

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden px-8 py-5">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-light text-ink">
            {mode === 'all' ? 'Все диалоги гостей' : 'Диалоги с гостями'}
          </h1>
          <p className="truncate text-xs text-dark-gray">
            {mode === 'all'
              ? 'Все переписки гостей с AI-администратором — можно вмешаться: «Взять себе» и ответить.'
              : 'Диалоги, переданные AI-администратором человеку. Ответ уходит гостю в его канал.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setShowNewDialog(true)}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90"
            title="Начать диалог: написать гостю первым по номеру телефона"
          >
            ✍ Написать первым
          </button>
          <div className="flex rounded-lg border border-ink/10 p-0.5 text-sm">
            <button
              onClick={() => {
                setMode('escalated');
                setSelected(null);
              }}
              className={`rounded-md px-3 py-1.5 transition ${
                mode === 'escalated' ? 'bg-primary text-white' : 'text-slate-500 hover:text-ink'
              }`}
            >
              Требуют ответа
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
      </div>

      {note && (
        <div className="mb-3 shrink-0 rounded-lg border border-primary-100 bg-primary-50 px-4 py-2 text-sm text-primary-700">
          {note}
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_1fr]">
        {/* Очередь */}
        <Card className="flex min-h-0 flex-col overflow-hidden p-2">
          <div className="shrink-0 px-1 pb-1.5 pt-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="🔍 Поиск: имя, телефон, текст, канал…"
              className="w-full rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <p className="shrink-0 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
            {mode === 'all' ? 'Диалоги' : 'Очередь'} · {shown.length}{query ? ` из ${list.length}` : ''}
          </p>
          {shown.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-slate-400">
              {query ? 'Ничего не найдено' : mode === 'all' ? 'Диалогов пока нет' : 'Нет открытых диалогов 🎉'}
            </p>
          ) : (
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              {shown.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                  className={`flex w-full gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                    selected === c.id ? 'bg-primary-50 ring-1 ring-primary-100' : 'hover:bg-slate-50'
                  }`}
                >
                  <Avatar name={c.guestName} url={c.avatar} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {c.unread && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" title="Непрочитанное сообщение" />
                        )}
                        <span className={`truncate text-sm text-ink ${c.unread ? 'font-semibold' : 'font-medium'}`}>
                          {c.title || guestLabel(c.guestName, c.guestId) || `Диалог ${shortId(c.id)}`}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                        {channelLabel(c.channel, c.subChannel)}
                      </span>
                    </div>
                    {c.lastMessage && (
                      <p className={`mt-0.5 truncate text-[11px] ${c.unread ? 'font-medium text-ink' : 'text-slate-500'}`}>
                        {c.lastRole === 'user' ? '👤 ' : c.lastRole === 'staff' ? '🧑‍💼 ' : '🤖 '}
                        {c.lastMessage.replace(/\[img\]\S+/g, '📷 фото')}
                      </p>
                    )}
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                      <span className="truncate">
                        {guestLabel(c.guestName, c.guestId)}
                        {c.guestPhone ? ` · ${c.guestPhone}` : ''}
                      </span>
                      <span className="shrink-0">{timeAgo(c.lastAt ?? c.updatedAt)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 empty:hidden">
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
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Диалог */}
        <Card className="flex h-full min-h-0 min-w-0 flex-col p-0">
          {!conv ? (
            <div className="grid flex-1 place-items-center text-sm text-slate-400">Выберите диалог слева</div>
          ) : (
            <div
              className="relative flex flex-1 flex-col"
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              {dragOver && (
                <div className="pointer-events-none absolute inset-0 z-30 m-2 grid place-items-center rounded-2xl border-2 border-dashed border-primary bg-primary-50/85 text-sm font-medium text-primary-700">
                  Отпустите файл, чтобы отправить гостю
                </div>
              )}
              <div className="flex items-center justify-between gap-3 border-b border-ink/[0.06] px-5 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={conv.guestName} url={conv.avatar} size={40} />
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
                          · {channelLabel(conv.channel, conv.subChannel)}
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
                    <div
                      key={i}
                      className={`group flex min-w-0 items-center gap-1 ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}
                    >
                      {m.role !== 'user' && (
                        <button
                          onClick={() => quoteMessage(m)}
                          title="Ответить с цитатой"
                          className="shrink-0 px-1 text-slate-300 opacity-0 transition hover:text-slate-600 group-hover:opacity-100"
                        >
                          ↩
                        </button>
                      )}
                      <div className="min-w-0 max-w-[75%]">
                        {m.role === 'ai' && (
                          <div className="mb-0.5 text-right text-[10px] text-slate-400">AI</div>
                        )}
                        <div
                          className={`overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-2xl px-3 py-2 text-sm ${
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
                      {m.role === 'user' && (
                        <button
                          onClick={() => quoteMessage(m)}
                          title="Ответить с цитатой"
                          className="shrink-0 px-1 text-slate-300 opacity-0 transition hover:text-slate-600 group-hover:opacity-100"
                        >
                          ↩
                        </button>
                      )}
                    </div>
                  ),
                )}
                <div ref={endRef} />
              </div>

              <div className="relative border-t border-ink/[0.06]">
                {quoted && (
                  <div className="flex items-start gap-2 border-b border-ink/[0.06] bg-slate-50/70 px-4 py-1.5 text-xs text-slate-500">
                    <span className="mt-0.5 shrink-0 text-slate-400">↩</span>
                    <span className="min-w-0 flex-1">
                      <span className="text-slate-400">
                        {quoted.role === 'user' ? 'Гость' : quoted.role === 'ai' ? 'AI' : 'Оператор'}:{' '}
                      </span>
                      <span className="line-clamp-2 break-words">{quoted.text.slice(0, 200)}</span>
                    </span>
                    <button onClick={() => setQuoted(null)} className="shrink-0 text-slate-400 hover:text-ink">
                      ✕
                    </button>
                  </div>
                )}

                {showTemplates && (
                  <div className="absolute bottom-full left-3 right-3 z-20 mb-2 max-h-64 overflow-y-auto rounded-xl border border-ink/10 bg-white p-1 shadow-2xl">
                    <div className="flex items-center justify-between px-2 py-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Быстрые ответы
                      </span>
                      <button
                        onClick={() => {
                          setShowTemplates(false);
                          setShowTplManager(true);
                        }}
                        className="text-[11px] text-primary hover:underline"
                      >
                        Настроить
                      </button>
                    </div>
                    {matchedTemplates().length === 0 ? (
                      <p className="px-2 py-3 text-center text-xs text-slate-400">
                        {templates.length === 0 ? 'Шаблонов пока нет — «Настроить»' : 'Ничего не найдено'}
                      </p>
                    ) : (
                      matchedTemplates().map((t) => (
                        <button
                          key={t.id}
                          onClick={() => pickTemplate(t)}
                          className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
                        >
                          {t.title && <span className="text-sm font-medium text-ink">{t.title}</span>}
                          <span className="block truncate text-xs text-slate-500">{t.text}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}

                {pendingFile && (
                  <div className="flex items-center gap-3 border-b border-ink/[0.06] bg-slate-50/70 px-4 py-2">
                    {pendingPreview ? (
                      <img src={pendingPreview} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-slate-200 text-2xl">
                        📎
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{pendingFile.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {uploading
                          ? 'Отправка…'
                          : `${Math.round(pendingFile.size / 1024)} КБ · подпись — по желанию, «Отправить» — гостю`}
                      </p>
                    </div>
                    <button
                      onClick={clearPending}
                      disabled={uploading}
                      title="Убрать файл"
                      className="shrink-0 text-slate-400 transition hover:text-rose-600 disabled:opacity-40"
                    >
                      ✕
                    </button>
                  </div>
                )}

                <div className="flex items-end gap-2 px-4 py-3">
                  <input ref={fileRef} type="file" className="hidden" onChange={onPickFile} />
                  <div className="relative">
                    <button
                      onClick={() => setShowEmoji((v) => !v)}
                      title="Эмодзи"
                      className="rounded-lg border border-ink/10 px-2.5 py-2 text-sm text-slate-500 transition hover:bg-slate-50"
                    >
                      🙂
                    </button>
                    {showEmoji && (
                      <EmojiPicker
                        className="absolute bottom-full left-0 mb-2"
                        onPick={(e) => insertEmoji(e)}
                        onClose={() => setShowEmoji(false)}
                      />
                    )}
                  </div>
                  <button
                    onClick={() => setShowTplManager(true)}
                    title="Быстрые ответы («/»)"
                    className="rounded-lg border border-ink/10 px-2.5 py-2 text-sm text-slate-500 transition hover:bg-slate-50"
                  >
                    /
                  </button>
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    title="Прикрепить файл/фото"
                    className="rounded-lg border border-ink/10 px-2.5 py-2 text-sm text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    📎
                  </button>
                  <textarea
                    ref={replyRef}
                    value={reply}
                    onChange={(e) => onReplyChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setShowTemplates(false);
                        setShowEmoji(false);
                        return;
                      }
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (showTemplates) {
                          const first = matchedTemplates()[0];
                          if (first) pickTemplate(first);
                          return;
                        }
                        void send();
                      }
                    }}
                    rows={1}
                    placeholder={
                      pendingFile
                        ? 'Подпись к файлу… (необязательно)'
                        : 'Ответ гостю… («/» — быстрые ответы, Enter — отправить)'
                    }
                    className="max-h-32 flex-1 resize-none rounded-lg border border-ink/15 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                  <button
                    onClick={() => void send()}
                    disabled={busy || uploading || (!reply.trim() && !pendingFile)}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
                  >
                    {uploading ? 'Отправка…' : 'Отправить'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {showTplManager && (
        <TemplateManager
          initial={templates}
          onClose={() => setShowTplManager(false)}
          onSaved={setTemplates}
        />
      )}

      {showNewDialog && (
        <NewDialogModal
          onClose={() => setShowNewDialog(false)}
          onSent={(conversationId) => {
            setShowNewDialog(false);
            setMode('escalated');
            void loadList();
            if (conversationId) setSelected(conversationId);
            setNote('Сообщение отправлено гостю — диалог создан.');
          }}
        />
      )}
    </main>
  );
}

/** Модалка «Написать гостю первым» (#9): телефон + подключённый канал Umnico + текст → reachOut. */
function NewDialogModal({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: (conversationId?: string) => void;
}) {
  const [channels, setChannels] = useState<UmnicoReachChannel[] | null>(null);
  const [saId, setSaId] = useState<number | null>(null);
  const [phone, setPhone] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .umnicoReachChannels()
      .then((cs) => {
        const active = cs.filter((c) => !c.status || /open|active|connect|1/i.test(c.status));
        setChannels(active.length ? active : cs);
        setSaId((p) => p ?? (active[0]?.id ?? cs[0]?.id ?? null));
      })
      .catch(() => setChannels([]));
  }, []);

  async function send() {
    const t = text.trim();
    if (!t || !saId || phone.replace(/\D/g, '').length < 10) {
      setErr('Укажите телефон (от 10 цифр), выберите канал и напишите сообщение.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await adminApi.umnicoReachOut({ phone, saId, text: t });
      if (r.ok) onSent(r.conversationId);
      else setErr(`Не удалось отправить: ${r.error ?? 'ошибка'}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка отправки');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-medium text-ink">Написать гостю первым</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-ink">✕</button>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Гостю уходит первое сообщение по номеру телефона через подключённый канал Umnico. История появится в диалогах.
        </p>
        {err && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</div>}
        <label className="mb-2 block text-sm">
          <span className="mb-1 block text-xs text-slate-500">Телефон гостя</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="+7 900 000-00-00"
            className="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        <label className="mb-2 block text-sm">
          <span className="mb-1 block text-xs text-slate-500">Канал</span>
          {channels === null ? (
            <p className="text-xs text-slate-400">Загрузка каналов…</p>
          ) : channels.length === 0 ? (
            <p className="text-xs text-slate-400">Нет подключённых каналов Umnico — подключите в «AI → Настройки и каналы».</p>
          ) : (
            <select
              value={saId ?? ''}
              onChange={(e) => setSaId(Number(e.target.value))}
              className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm"
            >
              {channels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          )}
        </label>
        <label className="mb-2 block text-sm">
          <span className="mb-1 block text-xs text-slate-500">Сообщение</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Здравствуйте! …"
            className="w-full resize-none rounded-lg border border-ink/15 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        <p className="mb-3 text-[11px] leading-tight text-slate-400">
          Личные аккаунты мессенджеров могут блокировать за рассылки — используйте официальные каналы.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:text-ink">Отмена</button>
          <button
            onClick={() => void send()}
            disabled={busy || !text.trim() || !saId}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {busy ? 'Отправка…' : 'Отправить'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Модалка управления быстрыми ответами (#5): добавить/изменить/удалить, сохранение — полная замена. */
function TemplateManager({
  initial,
  onClose,
  onSaved,
}: {
  initial: InboxTemplate[];
  onClose: () => void;
  onSaved: (list: InboxTemplate[]) => void;
}) {
  const [rows, setRows] = useState<{ id?: string; title: string; text: string }[]>(
    initial.length
      ? initial.map((t) => ({ id: t.id, title: t.title, text: t.text }))
      : [{ title: '', text: '' }],
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const update = (i: number, patch: Partial<{ title: string; text: string }>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const saved = await adminApi.inboxSaveTemplates(rows.filter((r) => r.text.trim()));
      onSaved(saved);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-medium text-ink">Быстрые ответы</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-ink">
            ✕
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Вставляются в поле ответа по «/». Название — для быстрого поиска.
        </p>
        {err && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</div>}
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="rounded-xl border border-ink/10 p-3">
              <div className="mb-2 flex items-center gap-2">
                <input
                  value={row.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                  placeholder="Название (напр. «Приветствие»)"
                  maxLength={80}
                  className="flex-1 rounded-lg border border-ink/15 px-2 py-1 text-sm focus:border-primary focus:outline-none"
                />
                <button
                  onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}
                  title="Удалить"
                  className="shrink-0 rounded-lg px-2 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  🗑
                </button>
              </div>
              <textarea
                value={row.text}
                onChange={(e) => update(i, { text: e.target.value })}
                placeholder="Текст ответа…"
                rows={2}
                maxLength={4000}
                className="w-full resize-none rounded-lg border border-ink/15 px-2 py-1 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          ))}
        </div>
        <button
          onClick={() => setRows((r) => [...r, { title: '', text: '' }])}
          className="mt-3 w-full rounded-lg border border-dashed border-ink/20 py-2 text-sm text-slate-500 hover:bg-slate-50"
        >
          + Добавить ответ
        </button>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:text-ink">
            Отмена
          </button>
          <button
            onClick={() => void save()}
            disabled={busy}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {busy ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
