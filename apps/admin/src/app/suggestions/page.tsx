'use client';

import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '@dha/ui';
import { adminApi, fileUrl, type Suggestion } from '../../lib/api';
import { useAdminMe, useRequireAdmin } from '../../lib/use-admin';

/** Разделы системы для привязки идеи. */
const SECTIONS = [
  'Шахматка',
  'Бронирования',
  'Тарифы и ограничения',
  'Заезды и заселение',
  'Гости и лояльность',
  'Диалоги с гостями',
  'Мессенджер сотрудников',
  'Задачи',
  'Уборка',
  'Склад',
  'Финансы',
  'База знаний',
  'Диск и карты',
  'Замки и ключи',
  'Аналитика',
  'Настройки',
  'Мобильное приложение',
  'Сайт и бронирование',
  'Другое',
];

const STATUS: Record<Suggestion['status'], { label: string; cls: string }> = {
  NEW: { label: 'Новое', cls: 'bg-sky-50 text-sky-700' },
  PLANNED: { label: 'Запланировано', cls: 'bg-indigo-50 text-indigo-700' },
  IN_PROGRESS: { label: 'В работе', cls: 'bg-amber-50 text-amber-700' },
  DONE: { label: 'Готово', cls: 'bg-emerald-50 text-emerald-700' },
  REJECTED: { label: 'Отклонено', cls: 'bg-slate-100 text-slate-500' },
};
const STATUS_ORDER: Suggestion['status'][] = ['NEW', 'PLANNED', 'IN_PROGRESS', 'DONE', 'REJECTED'];

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  return new Date(iso).toLocaleDateString('ru');
}

export default function SuggestionsPage() {
  const ready = useRequireAdmin();
  const me = useAdminMe();
  const [list, setList] = useState<Suggestion[]>([]);
  const [section, setSection] = useState(SECTIONS[0]!);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Suggestion['status']>('all');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    adminApi.suggestionsList().then(setList).catch(() => setNote('Не удалось загрузить список'));
  }, []);
  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(e.target.files ?? []).slice(0, 10));
  };

  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setNote(null);
    try {
      await adminApi.createSuggestion({ section, text: text.trim() }, files);
      setText('');
      setFiles([]);
      if (fileRef.current) fileRef.current.value = '';
      load();
      setNote('Идея добавлена. Спасибо!');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Не удалось отправить');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: Suggestion['status']) {
    setList((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
    await adminApi.setSuggestionStatus(id, status).catch(() => load());
  }
  async function remove(id: string) {
    setList((rows) => rows.filter((r) => r.id !== id));
    await adminApi.deleteSuggestion(id).catch(() => load());
  }

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  const shown = filter === 'all' ? list : list.filter((s) => s.status === filter);

  return (
    <main className="px-8 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-light text-ink">Идеи и пожелания</h1>
        <p className="mt-1 text-sm text-dark-gray">
          Предложите улучшение системы: выберите раздел, опишите идею и приложите скриншоты.
        </p>
      </div>

      {note && (
        <div className="mb-4 rounded-lg border border-primary-100 bg-primary-50 px-4 py-2 text-sm text-primary-700">{note}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Форма новой идеи */}
        <Card className="h-fit space-y-3">
          <h2 className="text-lg text-ink">Новая идея</h2>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-dark-gray">Раздел</span>
            <select value={section} onChange={(e) => setSection(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm">
              {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-dark-gray">Описание</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Что улучшить и зачем…" className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </label>
          <div>
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPick} className="hidden" />
            <button type="button" onClick={() => fileRef.current?.click()} className="rounded-md border border-dashed border-ink/25 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
              📎 Прикрепить скрины{files.length ? ` · ${files.length}` : ''}
            </button>
            {files.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <span key={i} className="max-w-[140px] truncate rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{f.name}</span>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={() => void submit()} disabled={busy || !text.trim()} className="w-full rounded-md bg-ink px-4 py-2 text-sm text-beige disabled:opacity-40">
            {busy ? 'Отправка…' : 'Отправить'}
          </button>
        </Card>

        {/* Список идей */}
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5 text-xs">
            <button onClick={() => setFilter('all')} className={`rounded-md px-2.5 py-1 ${filter === 'all' ? 'bg-primary text-white' : 'border border-ink/10 text-slate-500 hover:bg-slate-50'}`}>Все · {list.length}</button>
            {STATUS_ORDER.map((st) => {
              const n = list.filter((s) => s.status === st).length;
              return <button key={st} onClick={() => setFilter(st)} className={`rounded-md px-2.5 py-1 ${filter === st ? 'bg-primary text-white' : 'border border-ink/10 text-slate-500 hover:bg-slate-50'}`}>{STATUS[st].label} · {n}</button>;
            })}
          </div>

          {shown.length === 0 ? (
            <Card><p className="py-6 text-center text-sm text-slate-400">Идей пока нет — будьте первым 🙂</p></Card>
          ) : (
            shown.map((s) => {
              const mine = me?.id === s.authorId;
              return (
                <Card key={s.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 text-[11px] text-ink">{s.section}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS[s.status].cls}`}>{STATUS[s.status].label}</span>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-400">{s.authorName} · {timeAgo(s.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm text-ink">{s.text}</p>
                  {s.screenshots.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {s.screenshots.map((u, i) => (
                        <a key={i} href={fileUrl(u)} target="_blank" rel="noreferrer" className="block h-20 w-20 overflow-hidden rounded-lg border border-ink/10">
                          <img src={fileUrl(u)} alt="скрин" className="h-full w-full object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 border-t border-ink/[0.06] pt-2">
                    <select value={s.status} onChange={(e) => void setStatus(s.id, e.target.value as Suggestion['status'])} className="rounded-md border border-ink/15 bg-white px-2 py-1 text-xs">
                      {STATUS_ORDER.map((st) => <option key={st} value={st}>{STATUS[st].label}</option>)}
                    </select>
                    {mine ? <button onClick={() => void remove(s.id)} className="text-xs text-slate-400 hover:text-rose-600">Удалить</button> : null}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
