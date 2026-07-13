'use client';

import { useEffect, useState } from 'react';
import { adminApi, type NotifTemplateScenario } from '../../../lib/api';
import { useRequireAdmin } from '../../../lib/use-admin';

const fieldCls = 'w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm';
const CHANNEL_LABEL: Record<string, string> = { '*': 'Все каналы', PUSH: 'Push', SMS: 'SMS', EMAIL: 'Email', TELEGRAM: 'Telegram' };

/** Подстановка {var} из примера — живой предпросмотр (клиентская копия substitute из API). */
const substitute = (tpl: string, sample: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) => (sample[k] === undefined ? '' : String(sample[k])));

/**
 * Реестр шаблонов уведомлений (CHECK-IN-TZ §5.2): встроенные тексты сценариев +
 * переопределения на канал. Переменные — чипами, предпросмотр на примере данных.
 */
export default function NotificationTemplatesPage() {
  const ready = useRequireAdmin();
  const [items, setItems] = useState<NotifTemplateScenario[]>([]);
  const [err, setErr] = useState('');

  const load = () => adminApi.notifTemplates().then(setItems).catch((e) => setErr(e instanceof Error ? e.message : 'Ошибка'));
  useEffect(() => { if (ready) void load(); }, [ready]);

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <h1 className="mb-1 text-3xl font-light text-ink">Шаблоны уведомлений</h1>
      <p className="mb-6 max-w-3xl text-sm text-dark-gray">
        Тексты сценариев для гостя (push/SMS/email/Telegram). Пустое переопределение — используется встроенный текст.
        Переменные вида {'{property}'} подставляются автоматически; предпросмотр — на примере данных.
      </p>
      {err ? <p className="mb-4 text-sm text-red-600">{err}</p> : null}
      <div className="space-y-4">
        {items.map((s) => <ScenarioCard key={s.scenario} s={s} onChanged={load} />)}
      </div>
    </main>
  );
}

function ScenarioCard({ s, onChanged }: { s: NotifTemplateScenario; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState('*');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // При выборе канала подставляем существующее переопределение или дефолт.
  useEffect(() => {
    const o = s.overrides.find((x) => x.channel === channel);
    setTitle(o?.title ?? s.defaultText.title);
    setBody(o?.body ?? s.defaultText.body);
  }, [channel, s]);

  const overridden = (ch: string) => s.overrides.some((o) => o.channel === ch);

  const save = async () => {
    setBusy(true); setErr('');
    try { await adminApi.saveNotifTemplate(s.scenario, { channel, title, body }); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); } finally { setBusy(false); }
  };
  const reset = async () => {
    setBusy(true); setErr('');
    try { await adminApi.resetNotifTemplate(s.scenario, channel); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-ink/10 p-4">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{s.label} <span className="text-xs font-normal text-dark-gray">· {s.scenario}</span></p>
          <p className="mt-0.5 truncate text-xs text-dark-gray">{s.defaultText.title}: {s.defaultText.body}</p>
        </div>
        <span className="flex-none text-xs text-dark-gray">
          {s.overrides.length > 0 ? <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-600">изменён</span> : 'по умолчанию'}
        </span>
      </button>

      {open ? (
        <div className="mt-4 space-y-3 border-t border-ink/10 pt-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {Object.keys(CHANNEL_LABEL).map((ch) => (
              <button key={ch} type="button" onClick={() => setChannel(ch)}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${channel === ch ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-ink/15 text-dark-gray hover:border-ink/30'}`}>
                {CHANNEL_LABEL[ch]}{overridden(ch) ? ' •' : ''}
              </button>
            ))}
          </div>

          <label className="block text-xs text-dark-gray">Заголовок
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={`mt-1 ${fieldCls}`} />
          </label>
          <label className="block text-xs text-dark-gray">Текст
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className={`mt-1 ${fieldCls}`} />
          </label>

          {s.vars.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-dark-gray">
              Переменные:
              {s.vars.map((v) => (
                <button key={v} type="button" onClick={() => setBody((b) => `${b}{${v}}`)}
                  className="rounded border border-ink/15 px-1.5 py-0.5 font-mono text-[11px] text-ink hover:bg-ink/5">
                  {'{'}{v}{'}'}
                </button>
              ))}
            </div>
          ) : null}

          {/* Живой предпросмотр на примере данных */}
          <div className="rounded-lg bg-ink/5 p-3 text-sm">
            <p className="font-medium text-ink">{substitute(title, s.sample)}</p>
            <p className="text-dark-gray">{substitute(body, s.sample)}</p>
          </div>

          {err ? <p className="text-sm text-rose-600">{err}</p> : null}
          <div className="flex gap-2">
            <button type="button" onClick={() => void save()} disabled={busy} className="rounded-md bg-ink px-3 py-1.5 text-xs text-beige disabled:opacity-40">Сохранить</button>
            {overridden(channel) ? (
              <button type="button" onClick={() => void reset()} disabled={busy} className="rounded-md border border-ink/20 px-3 py-1.5 text-xs text-ink">Вернуть встроенный</button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
