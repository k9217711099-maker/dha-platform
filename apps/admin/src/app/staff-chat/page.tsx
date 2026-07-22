'use client';

import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Card } from '@dha/ui';
import {
  adminApi,
  fileUrl,
  staffStreamUrl,
  type StaffAttachment,
  type StaffChatListItem,
  type StaffColleague,
  type StaffDepartment,
  type StaffChatMedia,
  type StaffGlobalSearchResult,
  type StaffFolder,
  type StaffMessage,
  type StaffMember,
  type StaffMessagesResponse,
  type StaffPin,
  type StaffPublicProfile,
  type StaffSavedMessageItem,
  type StaffSearchResult,
} from '../../lib/api';
import { useAdminMe, useRequireAdmin } from '../../lib/use-admin';
import { EmojiPicker } from './EmojiPicker';

const initials = (s: string) => (s || '?').trim().slice(0, 2).toUpperCase();
const EMOJIS = ['👍', '❤️', '😂', '🎉', '✅', '🙏'];

/** Нормализация для умного поиска (§6): нижний регистр, ё→е. */
const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
/** Умное совпадение: подстрока либо последовательность символов (fuzzy), без учёта регистра. */
function fuzzy(query: string, text: string): boolean {
  const nq = norm(query).trim();
  const nt = norm(text);
  if (!nq) return false;
  if (nt.includes(nq)) return true;
  let i = 0;
  for (const ch of nt) { if (ch === nq[i]) i++; if (i === nq.length) return true; }
  return false;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

/** Выбирает поддерживаемый браузером mime для записи голосового. */
function pickAudioMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  return cands.find((c) => MediaRecorder.isTypeSupported(c)) ?? '';
}
function audioExt(mime: string): string {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

/** Короткий сигнал через Web Audio (без ассета). Требует прошлого user-жеста. */
function beep(): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.05;
    osc.start();
    setTimeout(() => {
      osc.stop();
      void ctx.close();
    }, 150);
  } catch {
    /* звук не критичен */
  }
}
/** Запрашивает разрешение на браузерные уведомления (в ответ на жест пользователя). */
function askNotify(): void {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    void Notification.requestPermission().catch(() => undefined);
  }
}

/** Подсвечивает @упоминания в тексте (по именам упомянутых участников). */
function renderText(text: string, mentions: { id: string; name: string }[]): ReactNode {
  if (!mentions.length) return text;
  const names = [...new Set(mentions.map((m) => m.name))].sort((a, b) => b.length - a.length);
  const esc = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`@(?:${esc.join('|')})`, 'g');
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <span key={i++} className="rounded bg-primary-50 px-0.5 font-medium text-primary-700">
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function NotifyItem({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-slate-50 ${active ? 'text-primary-700' : 'text-slate-600'}`}
    >
      {label}
      {active && <span>✓</span>}
    </button>
  );
}

function AttachmentView({ a, mine }: { a: StaffAttachment; mine: boolean }) {
  const href = fileUrl(a.url);
  if (a.kind === 'IMAGE') {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={href} alt={a.name} className="max-h-52 max-w-full rounded-lg" />
      </a>
    );
  }
  if (a.kind === 'VIDEO') return <video src={href} controls className="max-h-56 max-w-full rounded-lg" />;
  if (a.kind === 'VOICE') return <audio src={href} controls className="w-52 max-w-full" />;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      download
      className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ${mine ? 'border-white/30 text-white' : 'border-ink/10 text-slate-600'}`}
    >
      <span>📄</span>
      <span className="min-w-0">
        <span className="block truncate">{a.name}</span>
        <span className="opacity-70">{fmtSize(a.size)}</span>
      </span>
    </a>
  );
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit' });
}

export default function StaffChatPage() {
  const ready = useRequireAdmin();
  const me = useAdminMe();
  const [chats, setChats] = useState<StaffChatListItem[]>([]);
  const [colleagues, setColleagues] = useState<StaffColleague[]>([]);
  const [departments, setDepartments] = useState<StaffDepartment[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [data, setData] = useState<StaffMessagesResponse | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<StaffMessage | null>(null);
  const [editing, setEditing] = useState<StaffMessage | null>(null);
  // Файл, выбранный/перетащенный, но ещё не отправленный: показываем превью + даём
  // добавить подпись, отправляем по кнопке (#9 — интуитивно, как в мессенджерах).
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  // Полный набор эмодзи (§3): расширенный пикер реакции + пикер в поле ввода.
  const [fullPickerFor, setFullPickerFor] = useState<string | null>(null);
  const [composerEmoji, setComposerEmoji] = useState(false);
  // Профиль коллеги из карточки чата (§4).
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [pins, setPins] = useState<StaffPin[]>([]);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [results, setResults] = useState<StaffSearchResult[]>([]);
  const [folders, setFolders] = useState<StaffFolder[]>([]);
  const [activeTab, setActiveTab] = useState<string>('all'); // 'all' | 'saved' | folderId
  const [savedList, setSavedList] = useState<StaffSavedMessageItem[]>([]);
  const [editMembers, setEditMembers] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  // Карточка чата (§5): медиа/файлы/ссылки/закреплённые/избранные/общие чаты.
  const [cardOpen, setCardOpen] = useState(false);
  const [media, setMedia] = useState<StaffChatMedia | null>(null);
  const [common, setCommon] = useState<{ id: string; title: string }[]>([]);
  // Глобальный поиск по всем чатам (§9).
  const [globalQ, setGlobalQ] = useState('');
  const [globalResults, setGlobalResults] = useState<StaffGlobalSearchResult[]>([]);
  const [chatMembers, setChatMembers] = useState<StaffMember[]>([]);
  const [pendingMentions, setPendingMentions] = useState<StaffMember[]>([]);
  const [onlineOverride, setOnlineOverride] = useState<Record<string, boolean>>({});
  const [typingBy, setTypingBy] = useState<Record<string, number>>({});
  const [dragOver, setDragOver] = useState(false); // перетаскивание файла на область чата (#10)
  const endRef = useRef<HTMLDivElement>(null);
  const lastTyping = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelRecRef = useRef(false);
  const selectedRef = useRef<string | null>(null);
  const meIdRef = useRef<string | undefined>(undefined);
  const chatsRef = useRef<StaffChatListItem[]>([]);
  const nameMapRef = useRef<Map<string, string>>(new Map());

  const nameMap = useMemo(() => {
    const m = new Map<string, string>();
    if (me) m.set(me.id, 'Вы');
    for (const c of colleagues) m.set(c.id, c.name);
    return m;
  }, [me, colleagues]);
  const nameOf = (id: string) => nameMap.get(id) ?? 'Сотрудник';

  const loadChats = useCallback(async () => {
    try {
      setChats(await adminApi.staffChats());
    } catch {
      /* повтор на следующем тике */
    }
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    try {
      setData(await adminApi.staffMessages(id));
    } catch {
      /* повтор */
    }
  }, []);

  // Список чатов + presence-heartbeat. Опрос — как fallback (realtime идёт через SSE).
  useEffect(() => {
    if (!ready) return;
    void loadChats();
    const t = setInterval(() => void loadChats(), 20_000);
    return () => clearInterval(t);
  }, [ready, loadChats]);

  // Realtime через SSE: сообщения, «печатает», presence.
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  useEffect(() => {
    meIdRef.current = me?.id;
  }, [me]);
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);
  useEffect(() => {
    nameMapRef.current = nameMap;
  }, [nameMap]);
  useEffect(() => {
    if (!ready) return;
    const url = staffStreamUrl();
    if (!url || typeof EventSource === 'undefined') return;
    const es = new EventSource(url);
    es.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data) as {
          kind: string;
          chatId?: string;
          userId?: string;
          online?: boolean;
          senderId?: string;
          mentionIds?: string[];
          preview?: string;
        };
        if (d.kind === 'message') {
          void loadChats();
          const openHere = !!d.chatId && d.chatId === selectedRef.current;
          if (openHere && d.chatId) {
            void loadMessages(d.chatId);
            void adminApi.staffRead(d.chatId);
          }
          const fromOther = !!d.senderId && d.senderId !== meIdRef.current;
          const mentioned = !!d.mentionIds?.includes(meIdRef.current ?? '');
          const focusedHere = openHere && (typeof document === 'undefined' || !document.hidden);
          if (fromOther && !focusedHere && d.chatId) {
            const c = chatsRef.current.find((x) => x.id === d.chatId);
            const mode = c?.muted ? 'NONE' : (c?.notifyMode ?? 'ALL');
            if (mode === 'ALL' || (mode === 'MENTIONS' && mentioned)) {
              beep();
              if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                const who = d.senderId ? (nameMapRef.current.get(d.senderId) ?? 'Сотрудник') : 'Сотрудник';
                const title = mentioned ? `Упоминание · ${c?.title ?? 'Чат'}` : (c?.title ?? 'Новое сообщение');
                const chatId = d.chatId;
                try {
                  const n = new Notification(title, { body: `${who}: ${d.preview ?? ''}`, tag: chatId });
                  n.onclick = () => {
                    window.focus();
                    setSelected(chatId);
                    n.close();
                  };
                } catch {
                  /* уведомление не критично */
                }
              }
            }
          }
        } else if (d.kind === 'typing') {
          const uid = d.userId;
          if (uid && uid !== meIdRef.current && d.chatId === selectedRef.current) {
            setTypingBy((s) => ({ ...s, [uid]: Date.now() + 5_000 }));
          }
        } else if (d.kind === 'presence') {
          const uid = d.userId;
          if (uid) setOnlineOverride((s) => ({ ...s, [uid]: !!d.online }));
        }
      } catch {
        /* некорректное событие — игнорируем */
      }
    };
    return () => es.close();
  }, [ready, loadChats, loadMessages]);

  // Просрочка индикатора «печатает» (5 c без нового пинга).
  useEffect(() => {
    const t = setInterval(() => {
      setTypingBy((s) => {
        const now = Date.now();
        const next: Record<string, number> = {};
        let changed = false;
        for (const [k, v] of Object.entries(s)) {
          if (v > now) next[k] = v;
          else changed = true;
        }
        return changed ? next : s;
      });
    }, 1_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (ready) adminApi.staffColleagues().then(setColleagues).catch(() => undefined);
    if (ready) adminApi.staffDepartments().then(setDepartments).catch(() => undefined);
  }, [ready]);

  const loadFolders = useCallback(async () => {
    try {
      setFolders(await adminApi.staffFolders());
    } catch {
      /* повтор при следующем действии */
    }
  }, []);
  useEffect(() => {
    if (ready) void loadFolders();
  }, [ready, loadFolders]);

  // Избранное грузим, когда открыта вкладка «★».
  useEffect(() => {
    if (activeTab !== 'saved') return;
    let alive = true;
    const run = () => adminApi.staffSaved().then((s) => alive && setSavedList(s)).catch(() => undefined);
    void run();
    const t = setInterval(run, 8_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [activeTab]);

  useEffect(() => setEditMembers(false), [activeTab]);

  // Сброс поля/ответа/редактирования/поиска/закрепа при смене чата.
  useEffect(() => {
    setReplyTo(null);
    setEditing(null);
    setPickerFor(null);
    setFullPickerFor(null);
    setComposerEmoji(false);
    setText('');
    setPins([]);
    setPinsOpen(false);
    setShowSearch(false);
    setSearchQ('');
    setResults([]);
    setNotifyOpen(false);
    setPendingMentions([]);
    setTypingBy({});
    setPendingFile(null); // сбрасываем выбранный, но не отправленный файл (#9)
    setPendingPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [selected]);

  // Участники чата — для @упоминаний.
  useEffect(() => {
    if (!selected) {
      setChatMembers([]);
      return;
    }
    adminApi.staffMembers(selected).then(setChatMembers).catch(() => undefined);
  }, [selected]);

  // Поиск по чату (дебаунс 300 мс).
  useEffect(() => {
    if (!selected || !showSearch) return;
    const q = searchQ.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      adminApi.staffSearch(selected, q).then(setResults).catch(() => undefined);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ, selected, showSearch]);

  // Глобальный поиск по всем чатам (§9, дебаунс 300 мс).
  useEffect(() => {
    const q = globalQ.trim();
    if (q.length < 2) { setGlobalResults([]); return; }
    const t = setTimeout(() => { adminApi.staffSearchAll(q).then(setGlobalResults).catch(() => setGlobalResults([])); }, 300);
    return () => clearTimeout(t);
  }, [globalQ]);

  // Карточка чата (§5): загрузка медиа/общих чатов при открытии/смене чата.
  useEffect(() => {
    if (!cardOpen || !selected) return;
    void adminApi.staffChatMedia(selected).then(setMedia).catch(() => setMedia(null));
    void adminApi.staffChatCommon(selected).then(setCommon).catch(() => setCommon([]));
    void adminApi.staffPins(selected).then(setPins).catch(() => undefined);
    void adminApi.staffSaved().then(setSavedList).catch(() => undefined);
  }, [cardOpen, selected]);
  useEffect(() => { setCardOpen(false); }, [selected]); // при смене чата карточку закрываем

  // Сообщения выбранного чата + отметка «прочитано» (опрос каждые 3.5 c).
  useEffect(() => {
    if (!selected) {
      setData(null);
      return;
    }
    let alive = true;
    const run = async () => {
      await loadMessages(selected);
      if (!alive) return;
      await adminApi.staffRead(selected).catch(() => undefined);
      adminApi
        .staffPins(selected)
        .then((p) => alive && setPins(p))
        .catch(() => undefined);
    };
    void run();
    // Опрос — fallback (сообщения/typing идут через SSE); держит markRead и pins.
    const t = setInterval(() => void run(), 8_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [selected, loadMessages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data?.messages.length]);

  function onType(v: string) {
    setText(v);
    const now = Date.now();
    if (selected && now - lastTyping.current > 3_000) {
      lastTyping.current = now;
      void adminApi.staffTyping(selected).catch(() => undefined);
    }
  }

  async function send() {
    // Есть выбранный файл → отправляем его с подписью (а не текстовое сообщение).
    if (pendingFile) return void sendPending();
    const t = text.trim();
    if (!t || !selected || busy) return;
    askNotify();
    setBusy(true);
    try {
      if (editing) {
        await adminApi.staffEditMessage(selected, editing.id, t);
        setEditing(null);
      } else {
        const mentionIds = pendingMentions.filter((m) => text.includes('@' + m.name)).map((m) => m.id);
        await adminApi.staffSend(selected, t, replyTo?.id, mentionIds.length ? mentionIds : undefined);
        setReplyTo(null);
        setPendingMentions([]);
      }
      setText('');
      await loadMessages(selected);
      await loadChats();
    } finally {
      setBusy(false);
    }
  }

  /** Выбрать файл для отправки (превью + подпись), но пока не отправлять (#9). */
  function stageFile(file: File | null | undefined) {
    if (!file || !selected) return;
    setPendingFile(file);
    setPendingPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    });
  }

  /** Снять выбранный файл (× / после отправки / смена чата). */
  function clearPending() {
    setPendingPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPendingFile(null);
  }

  /** Отправить выбранный файл с подписью (text) в текущий чат. */
  async function sendPending() {
    if (!pendingFile || !selected || uploading) return;
    const file = pendingFile;
    setUploading(true);
    try {
      await adminApi.staffSendAttachment(selected, file, text.trim() || undefined);
      clearPending();
      setText('');
      await loadMessages(selected);
      await loadChats();
    } finally {
      setUploading(false);
    }
  }

  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    stageFile(file);
  }

  // Перетаскивание файла на область чата (#10): подсветка зоны + выбор при отпускании.
  function onDragOver(e: DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    if (!dragOver) setDragOver(true);
  }
  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    // Игнорируем переходы между вложенными элементами — гасим, только покидая всю зону.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragOver(false);
  }
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) stageFile(file);
  }

  async function startRecording() {
    if (!selected || recording || uploading) return;
    const chatId = selected;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickAudioMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      cancelRecRef.current = false;
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = rec.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        if (cancelRecRef.current || blob.size === 0) return;
        const file = new File([blob], `voice-${Date.now()}.${audioExt(type)}`, { type });
        setUploading(true);
        try {
          await adminApi.staffSendAttachment(chatId, file);
          await loadMessages(chatId);
          await loadChats();
        } finally {
          setUploading(false);
        }
      };
      mediaRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      /* нет доступа к микрофону — тихо игнорируем */
    }
  }
  function stopRecording() {
    mediaRef.current?.stop();
    setRecording(false);
  }
  function cancelRecording() {
    cancelRecRef.current = true;
    mediaRef.current?.stop();
    setRecording(false);
  }

  async function react(messageId: string, emoji: string) {
    if (!selected) return;
    setPickerFor(null);
    await adminApi.staffReact(selected, messageId, emoji).catch(() => undefined);
    await loadMessages(selected);
  }
  function startReply(m: StaffMessage) {
    setEditing(null);
    setReplyTo(m);
  }
  function startEdit(m: StaffMessage) {
    setReplyTo(null);
    setEditing(m);
    setText(m.text);
  }
  function cancelCompose() {
    setReplyTo(null);
    setEditing(null);
    setText('');
  }
  async function del(messageId: string) {
    if (!selected) return;
    await adminApi.staffDeleteMessage(selected, messageId).catch(() => undefined);
    await loadMessages(selected);
  }
  async function togglePin(messageId: string) {
    if (!selected) return;
    await adminApi.staffPin(selected, messageId).catch(() => undefined);
    await loadMessages(selected);
    adminApi.staffPins(selected).then(setPins).catch(() => undefined);
  }
  async function toggleSave(messageId: string) {
    if (!selected) return;
    await adminApi.staffSave(selected, messageId).catch(() => undefined);
    await loadMessages(selected);
  }
  async function setNotify(body: { mode?: 'ALL' | 'MENTIONS' | 'NONE'; muteHours?: number }) {
    if (!selected) return;
    setNotifyOpen(false);
    await adminApi.staffNotify(selected, body).catch(() => undefined);
    await loadChats();
  }
  async function createFolder() {
    const name = window.prompt('Название папки')?.trim();
    if (!name) return;
    const f = await adminApi.staffCreateFolder(name).catch(() => null);
    await loadFolders();
    if (f) setActiveTab(f.id);
  }
  async function renameFolder(f: StaffFolder) {
    const name = window.prompt('Переименовать папку', f.name)?.trim();
    if (!name || name === f.name) return;
    await adminApi.staffUpdateFolder(f.id, { name }).catch(() => undefined);
    await loadFolders();
  }
  async function removeFolder(f: StaffFolder) {
    if (!window.confirm(`Удалить папку «${f.name}»?`)) return;
    await adminApi.staffDeleteFolder(f.id).catch(() => undefined);
    setActiveTab('all');
    await loadFolders();
  }
  async function toggleChatInFolder(f: StaffFolder, chatId: string) {
    const chatIds = f.chatIds.includes(chatId)
      ? f.chatIds.filter((c) => c !== chatId)
      : [...f.chatIds, chatId];
    await adminApi.staffUpdateFolder(f.id, { chatIds }).catch(() => undefined);
    await loadFolders();
  }

  async function startDm(userId: string) {
    const { id } = await adminApi.staffCreateDm(userId);
    setShowNew(false);
    await loadChats();
    setSelected(id);
  }

  async function createGroup() {
    if (!groupTitle.trim() || groupMembers.length === 0 || busy) return;
    setBusy(true);
    try {
      const { id } = await adminApi.staffCreateGroup(groupTitle.trim(), groupMembers);
      setShowNew(false);
      setGroupMode(false);
      setGroupTitle('');
      setGroupMembers([]);
      await loadChats();
      setSelected(id);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  const chat = chats.find((c) => c.id === selected) ?? null;
  const chatOnline = (c: StaffChatListItem) =>
    c.otherUserId != null && (onlineOverride[c.otherUserId] ?? c.online);
  const headerOnline = chat ? chatOnline(chat) : false;
  const typingNow = Date.now();
  const typingIds = [
    ...new Set([
      ...(data?.typingUserIds ?? []),
      ...Object.keys(typingBy).filter((id) => (typingBy[id] ?? 0) > typingNow),
    ]),
  ].filter((id) => id !== me?.id);
  const typingNames = typingIds.map(nameOf);
  const mentionQuery = (() => {
    const at = text.lastIndexOf('@');
    if (at === -1) return null;
    const after = text.slice(at + 1);
    if (/\s/.test(after)) return null;
    return { at, query: after.toLowerCase() };
  })();
  const mentionOptions = mentionQuery
    ? chatMembers
        .filter((m) => m.id !== me?.id && m.name.toLowerCase().includes(mentionQuery.query))
        .slice(0, 6)
    : [];
  const insertMention = (m: StaffMember) => {
    if (!mentionQuery) return;
    setText(text.slice(0, mentionQuery.at) + '@' + m.name + ' ');
    setPendingMentions((s) => (s.some((x) => x.id === m.id) ? s : [...s, m]));
  };
  const activeFolder = folders.find((f) => f.id === activeTab) ?? null;
  const visibleChats = activeFolder ? chats.filter((c) => activeFolder.chatIds.includes(c.id)) : chats;
  // Умный поиск (§6): чаты по названию/собеседнику + сотрудники без открытого DM (текст — с сервера).
  const gq = globalQ.trim();
  const chatMatches = gq ? chats.filter((c) => fuzzy(gq, c.title ?? 'Группа')) : [];
  const colleagueMatches = gq
    ? colleagues.filter((c) => fuzzy(gq, c.name) && !chats.some((ch) => ch.kind === 'DM' && ch.otherUserId === c.id))
    : [];
  const tabCls = (id: string) =>
    `rounded-md px-2 py-0.5 text-xs transition ${activeTab === id ? 'bg-primary-50 text-primary-700' : 'text-slate-500 hover:text-ink'}`;

  const chatButton = (c: StaffChatListItem) => (
    <button
      key={c.id}
      onClick={() => {
        askNotify();
        setSelected(c.id);
      }}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition ${
        selected === c.id ? 'bg-primary-50 ring-1 ring-primary-100' : 'hover:bg-slate-50'
      }`}
    >
      <span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
        {c.avatarUrl ? (
          <img src={fileUrl(c.avatarUrl)} alt="" className="h-full w-full object-cover" />
        ) : (
          initials(c.title ?? (c.kind === 'GROUP' ? 'Гр' : '?'))
        )}
        {c.kind === 'DM' && chatOnline(c) && (
          <span className="absolute -bottom-0 -right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-ink">
            {c.title ?? 'Группа'}
            {c.kind === 'GROUP' && (
              <span className="ml-1 text-[11px] font-normal text-slate-400">· {c.memberCount}</span>
            )}
            {c.muted && <span className="ml-1 text-slate-300">🔕</span>}
          </span>
          {c.lastMessage && (
            <span className="shrink-0 text-[10px] text-slate-400">{shortTime(c.lastMessage.createdAt)}</span>
          )}
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-slate-400">
            {c.lastMessage ? c.lastMessage.text : 'Нет сообщений'}
          </span>
          {c.unread > 0 && (
            <span
              className={`grid h-4 min-w-4 shrink-0 place-items-center rounded-full px-1 text-[10px] font-semibold text-white ${c.muted ? 'bg-slate-300' : 'bg-primary'}`}
            >
              {c.unread}
            </span>
          )}
        </span>
      </span>
    </button>
  );

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden px-8 py-5">
      <div className="mb-3 shrink-0">
        <h1 className="text-2xl font-light text-ink">Мессенджер</h1>
        <p className="truncate text-xs text-dark-gray">Внутренние чаты сотрудников — личные и групповые (§2).</p>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_1fr]">
        {/* Левая панель: чаты / новый чат */}
        <Card className="flex min-h-0 flex-col overflow-hidden p-2">
          <div className="flex items-center justify-between px-2 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Чаты</span>
            <button
              onClick={() => setShowNew((v) => !v)}
              className="rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-white transition hover:opacity-90"
            >
              {showNew ? 'Отмена' : '+ Новый'}
            </button>
          </div>

          {/* Умный поиск (§6/§9): чаты по названию и собеседнику, сотрудники, текст сообщений */}
          {!showNew && (
            <div className="relative px-1 pb-1">
              <input value={globalQ} onChange={(e) => setGlobalQ(e.target.value)} placeholder="Поиск: чаты, люди, сообщения…" className="w-full rounded-lg border border-ink/15 px-3 py-1.5 pr-7 text-sm focus:border-primary focus:outline-none" />
              {globalQ ? <button type="button" onClick={() => setGlobalQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-ink" title="Очистить">×</button> : null}
            </div>
          )}

          {!showNew && (
            <div className="mb-1 flex flex-wrap items-center gap-1 px-1">
              <button onClick={() => setActiveTab('all')} className={tabCls('all')}>
                Все
              </button>
              {folders.map((f) => (
                <button key={f.id} onClick={() => setActiveTab(f.id)} className={tabCls(f.id)}>
                  {f.name}
                </button>
              ))}
              <button onClick={() => setActiveTab('saved')} className={tabCls('saved')} title="Избранное">
                ★
              </button>
              <button
                onClick={() => void createFolder()}
                title="Новая папка"
                className="rounded-md px-1.5 py-0.5 text-xs text-slate-400 hover:text-ink"
              >
                +
              </button>
            </div>
          )}

          {showNew ? (
            <div className="flex-1 overflow-y-auto px-1">
              <div className="mb-2 flex gap-1 px-1">
                <button
                  onClick={() => setGroupMode(false)}
                  className={`rounded-md px-2.5 py-1 text-xs transition ${!groupMode ? 'bg-primary-50 text-primary-700' : 'text-slate-500 hover:text-ink'}`}
                >
                  Личный
                </button>
                <button
                  onClick={() => setGroupMode(true)}
                  className={`rounded-md px-2.5 py-1 text-xs transition ${groupMode ? 'bg-primary-50 text-primary-700' : 'text-slate-500 hover:text-ink'}`}
                >
                  Группа
                </button>
              </div>

              {groupMode && (
                <div className="mb-2 px-1">
                  <input
                    value={groupTitle}
                    onChange={(e) => setGroupTitle(e.target.value)}
                    placeholder="Название группы"
                    className="mb-2 w-full rounded-lg border border-ink/15 px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                  />
                  {/* Быстрый набор по отделу — параллель к назначению задачи на отдел (§2). */}
                  {departments.length > 0 && (
                    <div className="mb-1">
                      <p className="mb-1 text-[11px] text-slate-400">Добавить весь отдел:</p>
                      <div className="flex flex-wrap gap-1">
                        {departments.map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => {
                              setGroupMembers((s) => [...new Set([...s, ...d.memberIds])]);
                              setGroupTitle((t) => t.trim() || d.name);
                            }}
                            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition hover:shadow-sm"
                            style={{ borderColor: `${d.color}66`, color: d.color }}
                            title={`Добавить ${d.memberIds.length} сотр.`}
                          >
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                            {d.name}
                            <span className="text-slate-400">+{d.memberIds.length}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-0.5">
                {colleagues.map((c) =>
                  groupMode ? (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={groupMembers.includes(c.id)}
                        onChange={(e) =>
                          setGroupMembers((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))
                        }
                      />
                      <span className="flex-1 text-slate-700">{c.name}</span>
                      {c.online && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
                    </label>
                  ) : (
                    <button
                      key={c.id}
                      onClick={() => void startDm(c.id)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-slate-50"
                    >
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-500">
                        {initials(c.name)}
                      </span>
                      <span className="flex-1 text-slate-700">{c.name}</span>
                      {c.online && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
                    </button>
                  ),
                )}
                {colleagues.length === 0 && (
                  <p className="px-2 py-4 text-center text-xs text-slate-400">Нет других сотрудников.</p>
                )}
              </div>

              {groupMode && (
                <div className="mt-2 px-1">
                  <button
                    onClick={() => void createGroup()}
                    disabled={busy || !groupTitle.trim() || groupMembers.length === 0}
                    className="w-full rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
                  >
                    Создать группу ({groupMembers.length})
                  </button>
                </div>
              )}
            </div>
          ) : gq ? (
            /* Результаты умного поиска (§6): чаты / сотрудники / сообщения */
            <div className="flex-1 space-y-2 overflow-y-auto px-1">
              {chatMatches.length > 0 && (
                <div>
                  <p className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Чаты</p>
                  <div className="space-y-0.5">{chatMatches.map((c) => chatButton(c))}</div>
                </div>
              )}
              {colleagueMatches.length > 0 && (
                <div>
                  <p className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Сотрудники</p>
                  <div className="space-y-0.5">
                    {colleagueMatches.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { void startDm(c.id); setGlobalQ(''); }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-slate-50"
                      >
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-500">{initials(c.name)}</span>
                        <span className="flex-1 text-slate-700">{c.name}</span>
                        {c.online && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
                        <span className="text-[10px] text-slate-400">написать</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {gq.length >= 2 && globalResults.length > 0 && (
                <div>
                  <p className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Сообщения</p>
                  <div className="space-y-0.5">
                    {globalResults.map((r) => (
                      <button key={r.id} onClick={() => { setSelected(r.chatId); setGlobalQ(''); }} className="block w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-50">
                        <span className="text-[11px] font-medium text-primary">{r.chatTitle}</span>
                        <p className="truncate text-sm text-slate-700">{r.text}</p>
                        <span className="text-[10px] text-slate-400">{nameOf(r.senderId)} · {shortTime(r.createdAt)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {chatMatches.length === 0 && colleagueMatches.length === 0 && (gq.length < 2 || globalResults.length === 0) && (
                <p className="px-2 py-6 text-center text-sm text-slate-400">Ничего не найдено.</p>
              )}
            </div>
          ) : activeTab === 'saved' ? (
            <div className="flex-1 space-y-0.5 overflow-y-auto">
              {savedList.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-slate-400">Нет сохранённых сообщений.</p>
              ) : (
                savedList.map((sm) => (
                  <button
                    key={sm.id}
                    onClick={() => {
                      setActiveTab('all');
                      setSelected(sm.chatId);
                    }}
                    className="block w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-50"
                  >
                    <span className="text-[11px] text-slate-400">
                      {nameOf(sm.senderId)} · {shortTime(sm.createdAt)}
                    </span>
                    <p className="truncate text-sm text-slate-700">{sm.text}</p>
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="flex-1 space-y-0.5 overflow-y-auto">
              {activeFolder && (
                <div className="mb-1 flex items-center justify-between px-1 text-[11px] text-slate-400">
                  <button onClick={() => setEditMembers((v) => !v)} className="hover:text-ink">
                    {editMembers ? 'Готово' : 'Изменить состав'}
                  </button>
                  <span className="flex gap-2">
                    <button
                      onClick={() => void renameFolder(activeFolder)}
                      className="hover:text-ink"
                      title="Переименовать"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => void removeFolder(activeFolder)}
                      className="hover:text-rose-600"
                      title="Удалить папку"
                    >
                      🗑
                    </button>
                  </span>
                </div>
              )}
              {editMembers && activeFolder ? (
                chats.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={activeFolder.chatIds.includes(c.id)}
                      onChange={() => void toggleChatInFolder(activeFolder, c.id)}
                    />
                    <span className="flex-1 truncate text-slate-700">{c.title ?? 'Группа'}</span>
                  </label>
                ))
              ) : visibleChats.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-slate-400">
                  {activeFolder ? 'В папке нет чатов — «Изменить состав».' : 'Чатов пока нет. Нажмите «+ Новый».'}
                </p>
              ) : (
                visibleChats.map((c) => chatButton(c))
              )}
            </div>
          )}
        </Card>

        {/* Правая панель: диалог */}
        <Card className="flex min-h-0 flex-col p-0">
          {!chat ? (
            <div className="grid flex-1 place-items-center text-sm text-slate-400">Выберите чат слева</div>
          ) : (
            <div
              className="relative flex flex-1 flex-col"
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              {dragOver && (
                <div className="pointer-events-none absolute inset-0 z-30 m-2 grid place-items-center rounded-2xl border-2 border-dashed border-primary bg-primary-50/85 text-sm font-medium text-primary-700">
                  Отпустите файл, чтобы отправить
                </div>
              )}
              <div className="flex items-center gap-3 border-b border-ink/[0.06] px-5 py-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                  {initials(chat.title ?? 'Гр')}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{chat.title ?? 'Группа'}</p>
                  <p className="text-xs text-slate-400">
                    {chat.kind === 'DM'
                      ? headerOnline
                        ? 'в сети'
                        : 'не в сети'
                      : `участников: ${chat.memberCount}`}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {showSearch && (
                    <input
                      value={searchQ}
                      onChange={(e) => setSearchQ(e.target.value)}
                      autoFocus
                      placeholder="Поиск в чате…"
                      className="w-44 rounded-lg border border-ink/15 px-2.5 py-1 text-sm focus:border-primary focus:outline-none"
                    />
                  )}
                  <button
                    onClick={() => {
                      setShowSearch((v) => !v);
                      setSearchQ('');
                      setResults([]);
                    }}
                    title="Поиск по чату"
                    className="rounded-lg border border-ink/10 px-2 py-1 text-sm text-slate-500 transition hover:bg-slate-50"
                  >
                    🔍
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setNotifyOpen((v) => !v)}
                      title="Уведомления"
                      className="rounded-lg border border-ink/10 px-2 py-1 text-sm text-slate-500 transition hover:bg-slate-50"
                    >
                      {chat.muted ? '🔕' : '🔔'}
                    </button>
                    {notifyOpen && (
                      <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-ink/10 bg-white py-1 text-sm shadow-lg">
                        <NotifyItem
                          active={chat.notifyMode === 'ALL' && !chat.muted}
                          onClick={() => void setNotify({ mode: 'ALL' })}
                          label="Все сообщения"
                        />
                        <NotifyItem
                          active={chat.notifyMode === 'MENTIONS'}
                          onClick={() => void setNotify({ mode: 'MENTIONS' })}
                          label="Только упоминания"
                        />
                        <NotifyItem
                          active={chat.notifyMode === 'NONE'}
                          onClick={() => void setNotify({ mode: 'NONE' })}
                          label="Выключить"
                        />
                        <div className="my-1 border-t border-ink/[0.06]" />
                        <button
                          onClick={() => void setNotify({ muteHours: 8 })}
                          className="block w-full px-3 py-1.5 text-left text-slate-600 hover:bg-slate-50"
                        >
                          Заглушить на 8 часов
                        </button>
                        {chat.muted && (
                          <button
                            onClick={() => void setNotify({ mode: 'ALL' })}
                            className="block w-full px-3 py-1.5 text-left text-slate-600 hover:bg-slate-50"
                          >
                            Включить уведомления
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Карточка чата (§5): медиа/файлы/ссылки/закреплённые/избранные/общие */}
                  <button onClick={() => setCardOpen(true)} title="Карточка чата" className="rounded-lg border border-ink/10 px-2 py-1 text-sm text-slate-500 transition hover:bg-slate-50">ℹ️</button>
                </div>
              </div>

              {showSearch && searchQ.trim().length >= 2 && (
                <div className="border-b border-ink/[0.06] bg-white px-3 py-2">
                  <p className="mb-1 px-1 text-[11px] text-slate-400">Найдено: {results.length}</p>
                  <div className="max-h-48 space-y-0.5 overflow-y-auto">
                    {results.map((r) => (
                      <div key={r.id} className="rounded-lg px-2 py-1 hover:bg-slate-50">
                        <span className="text-[11px] text-slate-400">
                          {nameOf(r.senderId)} · {shortTime(r.createdAt)}
                        </span>
                        <p className="truncate text-sm text-slate-700">{r.text}</p>
                      </div>
                    ))}
                    {results.length === 0 && (
                      <p className="px-2 py-2 text-xs text-slate-400">Ничего не найдено.</p>
                    )}
                  </div>
                </div>
              )}

              {pins.length > 0 && (
                <div className="border-b border-ink/[0.06] bg-amber-50/50 px-4 py-1.5">
                  <button
                    onClick={() => setPinsOpen((v) => !v)}
                    className="flex w-full items-center gap-2 text-left text-xs text-slate-600"
                  >
                    <span>📌</span>
                    <span className="min-w-0 flex-1 truncate">{pins[0]?.text}</span>
                    {pins.length > 1 && <span className="shrink-0 text-slate-400">+{pins.length - 1}</span>}
                  </button>
                  {pinsOpen && (
                    <div className="mt-1 space-y-1">
                      {pins.map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-2 rounded px-1 py-0.5 text-xs">
                          <span className="min-w-0 flex-1 truncate text-slate-600">
                            <span className="text-slate-400">{nameOf(p.senderId)}:</span> {p.text}
                          </span>
                          <button
                            onClick={() => void togglePin(p.id)}
                            title="Открепить"
                            className="shrink-0 text-slate-400 hover:text-rose-600"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex-1 space-y-1.5 overflow-y-auto px-5 py-4">
                {data?.messages.map((m) => {
                  const mine = m.senderId === me?.id;
                  const actions = !m.deleted ? (
                    <div className="flex shrink-0 items-center gap-0.5 self-center opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={() => setPickerFor((p) => (p === m.id ? null : m.id))}
                        title="Реакция"
                        className="rounded px-1 text-slate-400 hover:text-ink"
                      >
                        🙂
                      </button>
                      <button
                        onClick={() => startReply(m)}
                        title="Ответить"
                        className="rounded px-1 text-slate-400 hover:text-ink"
                      >
                        ↩
                      </button>
                      <button
                        onClick={() => void togglePin(m.id)}
                        title={m.pinned ? 'Открепить' : 'Закрепить'}
                        className={`rounded px-1 hover:text-ink ${m.pinned ? 'text-amber-500' : 'text-slate-400'}`}
                      >
                        📌
                      </button>
                      <button
                        onClick={() => void toggleSave(m.id)}
                        title={m.saved ? 'Убрать из избранного' : 'В избранное'}
                        className={`rounded px-1 hover:text-ink ${m.saved ? 'text-amber-500' : 'text-slate-400'}`}
                      >
                        {m.saved ? '★' : '☆'}
                      </button>
                      {mine && (
                        <>
                          <button
                            onClick={() => startEdit(m)}
                            title="Изменить"
                            className="rounded px-1 text-slate-400 hover:text-ink"
                          >
                            ✎
                          </button>
                          <button
                            onClick={() => void del(m.id)}
                            title="Удалить"
                            className="rounded px-1 text-slate-400 hover:text-rose-600"
                          >
                            🗑
                          </button>
                        </>
                      )}
                    </div>
                  ) : null;
                  return (
                    <div key={m.id} className={`group flex items-end gap-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                      {mine && actions}
                      <div className="max-w-[72%]">
                        {!mine && chat.kind === 'GROUP' && (
                          <div className="mb-0.5 px-1 text-[10px] text-slate-400">{nameOf(m.senderId)}</div>
                        )}
                        <div className="relative">
                          <div
                            className={`whitespace-pre-wrap rounded-2xl px-3 py-1.5 text-sm ${
                              mine
                                ? 'bg-primary text-white'
                                : m.mentionsMe
                                  ? 'bg-primary-50 text-ink ring-1 ring-primary-100'
                                  : 'bg-slate-100 text-ink'
                            }`}
                          >
                            {m.replyTo && (
                              <div
                                className={`mb-1 border-l-2 pl-2 text-xs ${mine ? 'border-white/40 text-white/70' : 'border-slate-300 text-slate-500'}`}
                              >
                                <span className="font-medium">{nameOf(m.replyTo.senderId)}</span>: {m.replyTo.text}
                              </div>
                            )}
                            {m.attachments.length > 0 && (
                              <div className="mb-1 space-y-1">
                                {m.attachments.map((a) => (
                                  <AttachmentView key={a.id} a={a} mine={mine} />
                                ))}
                              </div>
                            )}
                            {m.deleted ? (
                              <span className="italic opacity-70">сообщение удалено</span>
                            ) : (
                              renderText(m.text, m.mentions)
                            )}
                            <span className={`ml-2 align-bottom text-[9px] ${mine ? 'text-white/60' : 'text-slate-400'}`}>
                              {m.pinned && !m.deleted ? '📌 ' : ''}
                              {m.edited && !m.deleted ? 'изм. ' : ''}
                              {shortTime(m.createdAt)}
                              {mine && chat.kind === 'DM' && !m.deleted ? (m.read ? ' ✓✓' : ' ✓') : ''}
                            </span>
                          </div>
                          {pickerFor === m.id && (
                            <div
                              className={`absolute z-10 mt-1 flex gap-1 rounded-full border border-ink/10 bg-white px-2 py-1 shadow-lg ${mine ? 'right-0' : 'left-0'}`}
                            >
                              {EMOJIS.map((e) => (
                                <button
                                  key={e}
                                  onClick={() => void react(m.id, e)}
                                  className="text-base transition hover:scale-125"
                                >
                                  {e}
                                </button>
                              ))}
                              <button
                                onClick={() => { setPickerFor(null); setFullPickerFor(m.id); }}
                                title="Все эмодзи"
                                className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-sm text-slate-500 transition hover:bg-slate-200"
                              >
                                ＋
                              </button>
                            </div>
                          )}
                          {fullPickerFor === m.id && (
                            <EmojiPicker
                              className={`absolute mt-1 ${mine ? 'right-0' : 'left-0'}`}
                              onPick={(e) => { setFullPickerFor(null); void react(m.id, e); }}
                              onClose={() => setFullPickerFor(null)}
                            />
                          )}
                          {m.reactions.length > 0 && (
                            <div className={`mt-1 flex flex-wrap gap-1 ${mine ? 'justify-end' : ''}`}>
                              {m.reactions.map((r) => (
                                <button
                                  key={r.emoji}
                                  onClick={() => void react(m.id, r.emoji)}
                                  className={`flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] transition ${
                                    r.mine
                                      ? 'border-primary/40 bg-primary-50 text-primary-700'
                                      : 'border-ink/10 bg-white text-slate-500 hover:bg-slate-50'
                                  }`}
                                >
                                  <span>{r.emoji}</span>
                                  <span>{r.count}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {!mine && actions}
                    </div>
                  );
                })}
                {(!data || data.messages.length === 0) && (
                  <p className="py-6 text-center text-xs text-slate-400">Сообщений пока нет — напишите первым.</p>
                )}
                <div ref={endRef} />
              </div>

              <div className="h-4 px-5 text-[11px] text-slate-400">
                {typingNames.length > 0 &&
                  `${typingNames.join(', ')} печат${typingNames.length > 1 ? 'ают' : 'ает'}…`}
              </div>

              {mentionOptions.length > 0 && (
                <div className="mx-4 mb-1 max-h-40 overflow-y-auto rounded-lg border border-ink/10 bg-white shadow-lg">
                  {mentionOptions.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => insertMention(m)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500">
                        {initials(m.name)}
                      </span>
                      <span className="text-slate-700">{m.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {(replyTo || editing) && (
                <div className="flex items-center justify-between gap-2 border-t border-ink/[0.06] bg-slate-50/60 px-4 py-1.5 text-xs text-slate-500">
                  <span className="min-w-0 truncate">
                    {editing ? (
                      'Редактирование сообщения'
                    ) : (
                      <>
                        Ответ <span className="text-slate-400">{nameOf(replyTo!.senderId)}</span>:{' '}
                        {replyTo!.text.slice(0, 60)}
                      </>
                    )}
                  </span>
                  <button onClick={cancelCompose} className="shrink-0 text-slate-400 hover:text-ink">
                    ✕
                  </button>
                </div>
              )}

              {pendingFile && (
                <div className="flex items-center gap-3 border-t border-ink/[0.06] bg-slate-50/60 px-4 py-2">
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
                        : `${Math.round(pendingFile.size / 1024)} КБ · добавьте подпись и нажмите «Отправить»`}
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

              <div className="flex items-end gap-2 border-t border-ink/[0.06] px-4 py-3">
                <input ref={fileRef} type="file" className="hidden" onChange={(e) => void onPickFile(e)} />
                {recording ? (
                  <div className="flex flex-1 items-center gap-3 py-1">
                    <button
                      onClick={cancelRecording}
                      title="Отмена"
                      className="rounded-lg border border-ink/10 px-2.5 py-2 text-sm text-slate-500 transition hover:bg-slate-50"
                    >
                      ✕
                    </button>
                    <span className="flex items-center gap-1.5 text-sm text-rose-600">
                      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" /> Идёт запись…
                    </span>
                    <button
                      onClick={stopRecording}
                      className="ml-auto rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                    >
                      Отправить
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      title="Прикрепить файл"
                      className="rounded-lg border border-ink/10 px-2.5 py-2 text-sm text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      {uploading ? '…' : '📎'}
                    </button>
                    <button
                      onClick={() => void startRecording()}
                      disabled={uploading}
                      title="Записать голосовое"
                      className="rounded-lg border border-ink/10 px-2.5 py-2 text-sm text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      🎤
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setComposerEmoji((v) => !v)}
                        title="Эмодзи"
                        className="rounded-lg border border-ink/10 px-2.5 py-2 text-sm text-slate-500 transition hover:bg-slate-50"
                      >
                        🙂
                      </button>
                      {composerEmoji && (
                        <EmojiPicker
                          className="absolute bottom-full left-0 mb-2"
                          onPick={(e) => setText((t) => t + e)}
                          onClose={() => setComposerEmoji(false)}
                        />
                      )}
                    </div>
                    <textarea
                      value={text}
                      onChange={(e) => onType(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                      rows={1}
                      placeholder={
                        editing
                          ? 'Изменить сообщение…'
                          : pendingFile
                            ? 'Подпись к файлу… (необязательно)'
                            : 'Сообщение… (Enter — отправить)'
                      }
                      className="max-h-32 flex-1 resize-none rounded-lg border border-ink/15 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    />
                    <button
                      onClick={() => void send()}
                      disabled={busy || uploading || (!text.trim() && !pendingFile)}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
                    >
                      {editing ? 'Сохранить' : uploading ? 'Отправка…' : 'Отправить'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Карточка чата (§5): участники/медиа/файлы/ссылки/закреплённые/избранные/общие */}
      {cardOpen && chat ? (
        <ChatCard
          chat={chat}
          media={media}
          common={common}
          pins={pins}
          saved={savedList.filter((s) => s.chatId === selected)}
          members={chatMembers}
          meId={me?.id}
          nameOf={nameOf}
          onOpenMessage={() => setCardOpen(false)}
          onGoChat={(id) => { setSelected(id); setCardOpen(false); }}
          onOpenProfile={(id) => setProfileUserId(id)}
          onClose={() => setCardOpen(false)}
        />
      ) : null}

      {/* Профиль сотрудника (§4): открывается из карточки чата */}
      {profileUserId ? <EmployeeProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} /> : null}
    </main>
  );
}

/** Карточка чата (§5): боковая панель — участники, медиа, файлы, ссылки, закреплённые, избранные, общие чаты. */
function ChatCard({ chat, media, common, pins, saved, members, meId, nameOf, onGoChat, onOpenProfile, onClose }: {
  chat: StaffChatListItem;
  media: StaffChatMedia | null;
  common: { id: string; title: string }[];
  pins: StaffPin[];
  saved: StaffSavedMessageItem[];
  members: StaffMember[];
  meId?: string;
  nameOf: (id: string) => string;
  onOpenMessage: () => void;
  onGoChat: (id: string) => void;
  onOpenProfile: (userId: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'members' | 'media' | 'files' | 'links' | 'pins' | 'saved' | 'common'>('members');
  const TABS: [typeof tab, string, number][] = [
    ['members', 'Участники', members.length],
    ['media', 'Медиа', (media?.images.length ?? 0) + (media?.videos.length ?? 0)],
    ['files', 'Файлы', media?.files.length ?? 0],
    ['links', 'Ссылки', media?.links.length ?? 0],
    ['pins', 'Закреп', pins.length],
    ['saved', 'Избранное', saved.length],
    ...(chat.kind === 'DM' ? [['common', 'Общие чаты', common.length] as [typeof tab, string, number]] : []),
  ];
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/20" />
      <div className="absolute right-0 top-0 flex h-full w-[420px] max-w-[92vw] flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <div>
            <h2 className="text-lg font-medium text-ink">{chat.title ?? 'Чат'}</h2>
            <p className="text-xs text-dark-gray">{chat.kind === 'DM' ? 'Личный диалог' : `Групповой чат · ${chat.memberCount} уч.`}</p>
          </div>
          <div className="flex items-center gap-2">
            {chat.kind === 'DM' && chat.otherUserId ? (
              <button type="button" onClick={() => onOpenProfile(chat.otherUserId!)} className="rounded-lg border border-ink/10 px-2.5 py-1 text-xs text-primary transition hover:bg-primary-50">Профиль</button>
            ) : null}
            <button type="button" onClick={onClose} className="rounded-md p-1.5 text-ink/50 hover:bg-ink/5 hover:text-ink">✕</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1 border-b border-ink/10 px-3 py-2">
          {TABS.map(([k, label, n]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-md px-2.5 py-1 text-xs transition ${tab === k ? 'bg-primary-50 font-medium text-primary-700' : 'text-slate-500 hover:text-ink'}`}>{label}{n > 0 ? ` ${n}` : ''}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'members' ? (
            members.length ? (
              <div className="space-y-1">
                {members.map((m) => (
                  <button key={m.id} type="button" onClick={() => onOpenProfile(m.id)} title="Открыть профиль" className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-50">
                    <span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-100 text-[11px] font-semibold text-slate-500">
                      {m.avatarUrl ? <img src={fileUrl(m.avatarUrl)} alt="" className="h-full w-full object-cover" /> : initials(m.name)}
                      {m.online && <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{m.name}{m.id === meId ? <span className="ml-1 text-xs text-slate-400">(вы)</span> : null}</span>
                    <span className="shrink-0 text-xs text-primary">профиль ›</span>
                  </button>
                ))}
              </div>
            ) : <Empty text="Участники не загрузились" />
          ) : null}
          {tab === 'media' ? (
            (media?.images.length || media?.videos.length) ? (
              <div className="grid grid-cols-3 gap-1.5">
                {media.images.map((m) => <a key={m.id} href={fileUrl(m.url)} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-lg bg-slate-100"><img src={fileUrl(m.url)} alt={m.name} className="h-full w-full object-cover" /></a>)}
                {media.videos.map((m) => <a key={m.id} href={fileUrl(m.url)} target="_blank" rel="noreferrer" className="grid aspect-square place-items-center rounded-lg bg-slate-800 text-white">▶</a>)}
              </div>
            ) : <Empty text="Медиа нет" />
          ) : null}
          {tab === 'files' ? (
            media?.files.length ? <div className="space-y-1.5">{media.files.map((m) => <a key={m.id} href={fileUrl(m.url)} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-ink/10 px-3 py-2 text-sm hover:bg-slate-50"><span>📎</span><span className="min-w-0 flex-1 truncate">{m.name}</span><span className="shrink-0 text-[11px] text-slate-400">{Math.round(m.size / 1024)} КБ</span></a>)}</div> : <Empty text="Файлов нет" />
          ) : null}
          {tab === 'links' ? (
            media?.links.length ? <div className="space-y-1.5">{media.links.map((l, i) => <a key={i} href={l.url} target="_blank" rel="noreferrer" className="block truncate rounded-lg border border-ink/10 px-3 py-2 text-sm text-primary hover:bg-slate-50">{l.url}</a>)}</div> : <Empty text="Ссылок нет" />
          ) : null}
          {tab === 'pins' ? (
            pins.length ? <div className="space-y-1.5">{pins.map((pn) => <div key={pn.id} className="rounded-lg border border-ink/10 px-3 py-2"><span className="text-[11px] text-slate-400">{nameOf(pn.senderId)}</span><p className="text-sm text-slate-700">{pn.text}</p></div>)}</div> : <Empty text="Нет закреплённых" />
          ) : null}
          {tab === 'saved' ? (
            saved.length ? <div className="space-y-1.5">{saved.map((sm) => <div key={sm.id} className="rounded-lg border border-ink/10 px-3 py-2"><span className="text-[11px] text-slate-400">{nameOf(sm.senderId)}</span><p className="text-sm text-slate-700">{sm.text}</p></div>)}</div> : <Empty text="Нет избранного" />
          ) : null}
          {tab === 'common' ? (
            common.length ? <div className="space-y-1.5">{common.map((c) => <button key={c.id} type="button" onClick={() => onGoChat(c.id)} className="flex w-full items-center gap-2 rounded-lg border border-ink/10 px-3 py-2 text-left text-sm hover:bg-slate-50"><span>👥</span>{c.title}</button>)}</div> : <Empty text="Общих чатов нет" />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-slate-400">{text}</p>;
}

/** Профиль сотрудника (§4): открывается по клику на участника в карточке чата. Только «витринные» поля. */
function EmployeeProfileModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [p, setP] = useState<StaffPublicProfile | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    adminApi.staffUserProfile(userId).then(setP).catch(() => setFailed(true));
  }, [userId]);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium text-ink">Профиль сотрудника</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-ink/50 hover:bg-ink/5 hover:text-ink">✕</button>
        </div>
        {failed ? <p className="py-6 text-center text-sm text-slate-400">Профиль недоступен.</p> : !p ? (
          <p className="py-6 text-center text-sm text-slate-400">Загрузка…</p>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-4">
              <span className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-primary-100 text-lg font-bold text-primary-700">
                {p.avatarUrl ? <img src={fileUrl(p.avatarUrl)} alt="" className="h-full w-full object-cover" /> : initials(p.name)}
                {p.online && <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-400" />}
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-medium text-ink">{p.name}{!p.active ? <span className="ml-1.5 rounded bg-slate-100 px-1 text-[10px] text-slate-500">неактивен</span> : null}</p>
                <p className="text-xs text-dark-gray">{[p.positionName, p.roleName].filter(Boolean).join(' · ') || '—'}</p>
                <p className="text-[11px] text-slate-400">{p.online ? 'в сети' : 'не в сети'}{p.groupNames.length ? ` · ${p.groupNames.join(', ')}` : ''}</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <p className="flex justify-between gap-3"><span className="text-dark-gray">Email</span><a href={`mailto:${p.email}`} className="text-primary hover:underline">{p.email}</a></p>
              {p.phone ? <p className="flex justify-between gap-3"><span className="text-dark-gray">Телефон</span><a href={`tel:${p.phone}`} className="text-primary hover:underline">{p.phone}</a></p> : null}
              {p.birthday ? <p className="flex justify-between gap-3"><span className="text-dark-gray">День рождения</span><span className="text-ink">{new Date(p.birthday).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</span></p> : null}
              {p.hobby ? <p className="flex justify-between gap-3"><span className="text-dark-gray">Хобби</span><span className="text-right text-ink">{p.hobby}</span></p> : null}
              {p.about ? (
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">О себе</p>
                  <p className="whitespace-pre-line text-sm text-ink">{p.about}</p>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
