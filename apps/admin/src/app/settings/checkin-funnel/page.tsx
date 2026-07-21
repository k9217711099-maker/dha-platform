'use client';

import { useEffect, useState } from 'react';
import {
  adminApi,
  type CheckinFunnel,
  type FunnelDictionary,
  type FunnelStageConfig,
  type FunnelStagePatch,
  type OpsGroup,
  type PmsProperty,
} from '../../../lib/api';
import { useRequireAdmin } from '../../../lib/use-admin';

const fieldCls = 'w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm';

/**
 * Конструктор воронки заселения (CHECK-IN-TZ §2.3): этапы и условия редактируются
 * данными — порядок, вкл/выкл, условия-шлюзы из словаря, каналы коммуникации,
 * тексты «как это работает» для гостя и заметки сотруднику.
 */
export default function CheckinFunnelPage() {
  const ready = useRequireAdmin();
  const [funnels, setFunnels] = useState<CheckinFunnel[]>([]);
  const [dict, setDict] = useState<FunnelDictionary | null>(null);
  const [properties, setProperties] = useState<PmsProperty[]>([]);
  const [groups, setGroups] = useState<OpsGroup[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const load = () =>
    adminApi.funnels().then((fs) => {
      setFunnels(fs);
      setSelectedId((cur) => cur ?? fs[0]?.id ?? null);
    }).catch((e) => setErr(e instanceof Error ? e.message : 'Ошибка загрузки'));

  useEffect(() => {
    if (!ready) return;
    void load();
    void adminApi.funnelDictionary().then(setDict).catch(() => undefined);
    void adminApi.pmsProperties().then(setProperties).catch(() => undefined);
    void adminApi.opsGroups().then(setGroups).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const selected = funnels.find((f) => f.id === selectedId) ?? null;
  const applyUpdated = (f: CheckinFunnel) => setFunnels((prev) => prev.map((x) => (x.id === f.id ? f : x)));

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <h1 className="mb-1 text-3xl font-light text-ink">Заселение · Конструктор воронки</h1>
      <p className="mb-6 max-w-3xl text-sm text-dark-gray">
        Этапы и условия автоматизированного заселения — от брони до открытия замка. Одна воронка на сеть
        (default) + переопределения по объектам. Условия выбираются из словаря шлюзов; каналы — из
        подключённых средств связи. Тексты «как это работает» гость видит на каждом шаге.
      </p>
      {err ? <p className="mb-4 text-sm text-red-600">{err}</p> : null}

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Список воронок */}
        <div className="space-y-3">
          {funnels.map((f) => (
            <button key={f.id} type="button" onClick={() => setSelectedId(f.id)}
              className={`block w-full rounded-xl border p-3 text-left transition ${f.id === selectedId ? 'border-indigo-400 bg-indigo-50/60' : 'border-ink/10 hover:border-ink/25'}`}>
              <p className="text-sm font-medium text-ink">{f.name}</p>
              <p className="mt-0.5 text-xs text-dark-gray">
                {f.isDefault ? 'По умолчанию (сеть)' : f.propertyId ? `Объект: ${properties.find((p) => p.id === f.propertyId)?.name ?? '…'}` : 'Сетевая'}
                {!f.active ? ' · выключена' : ''}
              </p>
            </button>
          ))}
          <NewFunnelForm properties={properties} onCreated={(f) => { setFunnels((p) => [...p, f]); setSelectedId(f.id); }} />
        </div>

        {/* Редактор выбранной воронки */}
        <div className="lg:col-span-3">
          {selected && dict ? (
            <FunnelEditor funnel={selected} dict={dict} properties={properties} groups={groups}
              onChanged={applyUpdated}
              onDeleted={() => { setFunnels((p) => p.filter((x) => x.id !== selected.id)); setSelectedId(null); void load(); }} />
          ) : (
            <p className="text-sm text-dark-gray">Выберите воронку слева.</p>
          )}
        </div>
      </div>
    </main>
  );
}

function NewFunnelForm({ properties, onCreated }: { properties: PmsProperty[]; onCreated: (f: CheckinFunnel) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="w-full rounded-xl border border-dashed border-ink/25 p-3 text-sm text-dark-gray hover:border-ink/40 hover:text-ink">+ Новая воронка</button>;
  }
  const create = () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    void adminApi.createFunnel({ name: name.trim(), propertyId: propertyId || undefined })
      .then((f) => { onCreated(f); setOpen(false); setName(''); setPropertyId(''); })
      .finally(() => setBusy(false));
  };
  return (
    <div className="space-y-2 rounded-xl border border-ink/10 p-3">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название" className={fieldCls} />
      <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={fieldCls}>
        <option value="">Вся сеть</option>
        {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <div className="flex gap-2">
        <button type="button" onClick={create} disabled={busy || !name.trim()} className="rounded-md bg-ink px-3 py-1.5 text-xs text-beige disabled:opacity-40">Создать</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-ink/20 px-3 py-1.5 text-xs text-ink">Отмена</button>
      </div>
    </div>
  );
}

function FunnelEditor({ funnel, dict, properties, groups, onChanged, onDeleted }: {
  funnel: CheckinFunnel; dict: FunnelDictionary; properties: PmsProperty[]; groups: OpsGroup[];
  onChanged: (f: CheckinFunnel) => void; onDeleted: () => void;
}) {
  const [name, setName] = useState(funnel.name);
  const [description, setDescription] = useState(funnel.description ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { setName(funnel.name); setDescription(funnel.description ?? ''); setErr(''); }, [funnel.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<CheckinFunnel>) => {
    setBusy(true); setErr('');
    try { onChanged(await fn()); } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); } finally { setBusy(false); }
  };

  const saveMeta = () => run(() => adminApi.updateFunnel(funnel.id, {
    name, description: description || undefined, active: funnel.active, propertyId: funnel.propertyId ?? undefined,
  }));

  const move = (idx: number, dir: -1 | 1) => {
    const ids = funnel.stages.map((s) => s.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    const [a, b] = [ids[idx]!, ids[j]!];
    ids[idx] = b; ids[j] = a;
    void run(() => adminApi.reorderFunnelStages(funnel.id, ids));
  };

  /** Patch этапа; при отказе по защищённому шлюзу — confirm + force (§2.3). */
  const patchStage = async (stageId: string, body: FunnelStagePatch) => {
    setBusy(true); setErr('');
    try {
      onChanged(await adminApi.updateFunnelStage(funnel.id, stageId, body));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка';
      if (msg.includes('force') && confirm(`${msg}\n\nОтключить всё равно?`)) {
        try { onChanged(await adminApi.updateFunnelStage(funnel.id, stageId, { ...body, force: true })); }
        catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Ошибка'); }
      } else setErr(msg);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      {/* Свойства воронки */}
      <div className="rounded-xl border border-ink/10 p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-dark-gray">Воронка</p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-dark-gray">
              <input type="checkbox" checked={funnel.active}
                onChange={(e) => run(() => adminApi.updateFunnel(funnel.id, { name, description: description || undefined, active: e.target.checked, propertyId: funnel.propertyId ?? undefined }))} />
              Активна
            </label>
            {!funnel.isDefault ? (
              <button type="button" disabled={busy}
                onClick={() => { if (confirm('Удалить воронку?')) void adminApi.deleteFunnel(funnel.id).then(onDeleted).catch((e) => setErr(e instanceof Error ? e.message : 'Ошибка')); }}
                className="text-xs text-rose-600 hover:underline">Удалить</button>
            ) : null}
          </div>
        </div>
        <div className="space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className={fieldCls} />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={fieldCls}
            placeholder="Как устроено заселение (markdown, видно сотрудникам)…" />
          {funnel.propertyId ? <p className="text-xs text-dark-gray">Переопределение для: {properties.find((p) => p.id === funnel.propertyId)?.name ?? funnel.propertyId}</p> : null}
          {name !== funnel.name || description !== (funnel.description ?? '') ? (
            <button type="button" onClick={saveMeta} disabled={busy} className="rounded-md bg-ink px-3 py-1.5 text-xs text-beige disabled:opacity-40">Сохранить</button>
          ) : null}
        </div>
        {err ? <p className="mt-2 text-sm text-rose-600">{err}</p> : null}
      </div>

      {/* Как читать конструктор — модель воронки */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-xs leading-relaxed text-dark-gray">
        <p className="mb-1.5 text-sm font-medium text-ink">Как работает воронка</p>
        <p>Бронь проходит этапы <b>по порядку сверху вниз</b>. Каждый этап — это <b>условие</b>:</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          <li><b>Пока условие не выполнено</b> — бронь «стоит» на этапе, гостю по расписанию уходят <b>напоминания</b>.</li>
          <li><b>Как только условие выполнено</b> — бронь <b>переходит на следующий этап</b>, а напоминания этого этапа сами прекращаются.</li>
          <li><b>Обязательный (блокирующий) этап</b> — пока не выполнен, цифровой ключ гостю не выдаётся.</li>
          <li>На последнем этапе «Готовность и ключ», когда все условия зелёные, ключ <b>выдаётся автоматически</b>, затем — авто-заезд (если включён у объекта).</li>
        </ul>
        <p className="mt-2">На каждом этапе можно настроить <b>действия</b> (раскройте этап): ② уведомления гостю, ④ задача в отдел, ⑤ разовый шаблон, ⑥ смена статуса брони на шахматке.</p>
      </div>

      {/* Этапы */}
      {funnel.stages.map((s, i) => (
        <StageCard key={s.id} stage={s} dict={dict} groups={groups} busy={busy}
          first={i === 0} last={i === funnel.stages.length - 1}
          onMove={(dir) => move(i, dir)}
          onPatch={(body) => void patchStage(s.id, body)}
          onDelete={s.key === 'custom' ? () => { if (confirm('Удалить этап?')) void run(() => adminApi.deleteFunnelStage(funnel.id, s.id)); } : undefined} />
      ))}

      <button type="button" disabled={busy}
        onClick={() => void run(() => adminApi.createFunnelStage(funnel.id, { key: 'custom', title: 'Новый этап', required: false, conditions: [], channels: [] }))}
        className="w-full rounded-xl border border-dashed border-ink/25 p-3 text-sm text-dark-gray hover:border-ink/40 hover:text-ink">
        + Добавить свой этап
      </button>
    </div>
  );
}

function StageCard({ stage, dict, groups, busy, first, last, onMove, onPatch, onDelete }: {
  stage: FunnelStageConfig; dict: FunnelDictionary; groups: OpsGroup[]; busy: boolean; first: boolean; last: boolean;
  onMove: (dir: -1 | 1) => void; onPatch: (body: FunnelStagePatch) => void; onDelete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(stage.title);
  const [guestDescription, setGuestDescription] = useState(stage.guestDescription ?? '');
  const [staffNote, setStaffNote] = useState(stage.staffNote ?? '');
  const [reminders, setReminders] = useState((stage.reminderPolicy ?? []).map((r) => r.offsetHours).join(', '));
  const [pre, setPre] = useState(String((stage.timing?.preCheckinMinutes as number | undefined) ?? 30));
  const [post, setPost] = useState(String((stage.timing?.postCheckoutMinutes as number | undefined) ?? 30));
  const [taskOn, setTaskOn] = useState(Boolean(stage.staffTask?.enabled));
  const [taskGroup, setTaskGroup] = useState(stage.staffTask?.groupId ?? '');
  const [taskOffset, setTaskOffset] = useState(stage.staffTask?.offsetHours != null ? String(stage.staffTask.offsetHours) : '');
  const [taskTitle, setTaskTitle] = useState(stage.staffTask?.title ?? '');
  const [sendOn, setSendOn] = useState(Boolean(stage.sendTemplate?.enabled));
  const [sendTpl, setSendTpl] = useState(stage.sendTemplate?.templateKey ?? '');
  const [sendOffset, setSendOffset] = useState(stage.sendTemplate?.offsetHours != null ? String(stage.sendTemplate.offsetHours) : '');
  const [statusOn, setStatusOn] = useState(Boolean(stage.setStatus?.enabled));
  const [statusValue, setStatusValue] = useState<'CHECKED_IN' | 'NO_SHOW' | 'CANCELLED'>(stage.setStatus?.status ?? 'CHECKED_IN');
  const [statusReqMet, setStatusReqMet] = useState(stage.setStatus?.requireConditionMet !== false);
  const [statusOffset, setStatusOffset] = useState(stage.setStatus?.offsetHours != null ? String(stage.setStatus.offsetHours) : '');
  useEffect(() => {
    setTitle(stage.title); setGuestDescription(stage.guestDescription ?? ''); setStaffNote(stage.staffNote ?? '');
    setReminders((stage.reminderPolicy ?? []).map((r) => r.offsetHours).join(', '));
    setPre(String((stage.timing?.preCheckinMinutes as number | undefined) ?? 30));
    setPost(String((stage.timing?.postCheckoutMinutes as number | undefined) ?? 30));
    setTaskOn(Boolean(stage.staffTask?.enabled));
    setTaskGroup(stage.staffTask?.groupId ?? '');
    setTaskOffset(stage.staffTask?.offsetHours != null ? String(stage.staffTask.offsetHours) : '');
    setTaskTitle(stage.staffTask?.title ?? '');
    setSendOn(Boolean(stage.sendTemplate?.enabled));
    setSendTpl(stage.sendTemplate?.templateKey ?? '');
    setSendOffset(stage.sendTemplate?.offsetHours != null ? String(stage.sendTemplate.offsetHours) : '');
    setStatusOn(Boolean(stage.setStatus?.enabled));
    setStatusValue(stage.setStatus?.status ?? 'CHECKED_IN');
    setStatusReqMet(stage.setStatus?.requireConditionMet !== false);
    setStatusOffset(stage.setStatus?.offsetHours != null ? String(stage.setStatus.offsetHours) : '');
  }, [stage]);

  const stageLabel = dict.stageKeys.find((k) => k.key === stage.key)?.label ?? stage.key;
  const template = dict.templates.find((t) => t.key === stage.notificationTemplateKey);
  const isProtected = dict.protectedStageKeys.includes(stage.key) || stage.key === 'key_issue';
  const hasCondition = (t: string) => stage.conditions.some((c) => c.type === t);
  const toggleCondition = (t: string) =>
    onPatch({ conditions: hasCondition(t) ? stage.conditions.filter((c) => c.type !== t) : [...stage.conditions, { type: t }] });
  const toggleChannel = (k: string) =>
    onPatch({ channels: stage.channels.includes(k) ? stage.channels.filter((c) => c !== k) : [...stage.channels, k] });

  const saveTexts = () => {
    const offsets = reminders.split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n !== 0);
    const off = taskOffset.trim() === '' ? null : Number(taskOffset);
    const sOff = sendOffset.trim() === '' ? null : Number(sendOffset);
    const stOff = statusOffset.trim() === '' ? null : Number(statusOffset);
    onPatch({
      title,
      guestDescription: guestDescription || undefined,
      staffNote: staffNote || undefined,
      reminderPolicy: offsets.map((offsetHours) => ({ offsetHours })),
      staffTask: taskOn
        ? { enabled: true, groupId: taskGroup || null, offsetHours: Number.isFinite(off) ? off : null, title: taskTitle || null }
        : { enabled: false },
      sendTemplate: sendOn && sendTpl
        ? { enabled: true, templateKey: sendTpl, offsetHours: Number.isFinite(sOff) ? sOff : null }
        : { enabled: false },
      setStatus: statusOn
        ? { enabled: true, status: statusValue, requireConditionMet: statusReqMet, offsetHours: Number.isFinite(stOff) ? stOff : null }
        : { enabled: false },
      ...(stage.key === 'key_issue' ? { timing: { preCheckinMinutes: Number(pre) || 30, postCheckoutMinutes: Number(post) || 30 } } : {}),
    });
  };

  return (
    <div className={`rounded-xl border p-4 ${stage.enabled ? 'border-ink/10' : 'border-ink/10 opacity-60'}`}>
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => setOpen(!open)} className="flex min-w-0 items-center gap-2 text-left">
          <span className={`inline-flex h-5 w-5 flex-none items-center justify-center rounded-full text-[10px] font-bold ${stage.enabled ? 'bg-indigo-100 text-indigo-700' : 'bg-ink/10 text-dark-gray'}`}>{stage.order + 1}</span>
          <span className="truncate text-sm font-medium text-ink">{stage.title}</span>
          <span className="flex-none text-xs text-dark-gray">· {stageLabel}{isProtected ? ' 🔒' : ''}{!stage.required ? ' · необязательный' : ''}</span>
        </button>
        <div className="flex flex-none items-center gap-1.5">
          <button type="button" onClick={() => onMove(-1)} disabled={busy || first} className="rounded border border-ink/15 px-1.5 text-xs text-ink disabled:opacity-30">↑</button>
          <button type="button" onClick={() => onMove(1)} disabled={busy || last} className="rounded border border-ink/15 px-1.5 text-xs text-ink disabled:opacity-30">↓</button>
          <label className="ml-1 flex items-center gap-1 text-xs text-dark-gray">
            <input type="checkbox" checked={stage.enabled} disabled={busy} onChange={(e) => onPatch({ enabled: e.target.checked })} /> вкл
          </label>
          {onDelete ? <button type="button" onClick={onDelete} disabled={busy} className="text-xs text-rose-600 hover:underline">удалить</button> : null}
        </div>
      </div>

      {open ? (
        <div className="mt-4 space-y-4 border-t border-ink/10 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-dark-gray">Название этапа
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={`mt-1 ${fieldCls}`} />
            </label>
            <label className="flex items-end gap-1.5 pb-2 text-xs text-dark-gray">
              <input type="checkbox" checked={stage.required} disabled={busy} onChange={(e) => onPatch({ required: e.target.checked })} />
              Обязательный (блокирующий): пока не выполнен — ключ не выдаётся
            </label>
          </div>

          {/* ① Условие: пока не выполнено — бронь стоит здесь */}
          <section className="rounded-lg border border-ink/10 p-3">
            <p className="text-xs font-semibold text-ink">① Условие этапа</p>
            <p className="mb-2 mt-0.5 text-[11px] leading-relaxed text-dark-gray">
              Что должно выполниться, чтобы бронь ушла дальше. <b>Пока не выполнено</b> — бронь «стоит» на этом этапе (и идут напоминания ниже).
            </p>
            <div className="flex flex-wrap gap-1.5">
              {dict.conditions.map((c) => (
                <button key={c.type} type="button" disabled={busy} onClick={() => toggleCondition(c.type)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition ${hasCondition(c.type) ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-ink/15 text-dark-gray hover:border-ink/30'}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </section>

          {/* ② Пока бронь на этапе — что шлём гостю */}
          <section className="space-y-3 rounded-lg border border-ink/10 p-3">
            <div>
              <p className="text-xs font-semibold text-ink">② Пока бронь на этапе — уведомления гостю</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-dark-gray">Приглашение уходит <b>один раз</b> при постановке на этап; напоминания повторяются, <b>пока условие не выполнено</b>, и сами прекращаются, когда выполнено.</p>
            </div>

            <label className="block text-xs text-dark-gray">Приглашение при входе на этап (шаблон, отправляется один раз)
              <select value={stage.notificationTemplateKey ?? ''} disabled={busy}
                onChange={(e) => onPatch({ notificationTemplateKey: e.target.value || undefined })}
                className={`mt-1 ${fieldCls}`}>
                <option value="">— без уведомления —</option>
                {dict.templates.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </label>
            {template ? (
              <div className="rounded-lg bg-ink/5 p-2.5 text-xs">
                <p className="font-medium text-ink">{template.preview.title}</p>
                <p className="text-dark-gray">{template.preview.body}</p>
                <p className="mt-1 text-[10px] text-dark-gray">Текст редактируется в «Шаблоны уведомлений»</p>
              </div>
            ) : null}

            <label className="block text-xs text-dark-gray">Напоминания, пока условие не выполнено — часов до заезда (через запятую, минус = до заезда: −24, −3)
              <input value={reminders} onChange={(e) => setReminders(e.target.value)} className={`mt-1 ${fieldCls}`} placeholder="-24, -3" />
            </label>

            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-dark-gray">Каналы (для приглашения и напоминаний)</p>
              <div className="flex flex-wrap gap-1.5">
                {dict.channels.filter((c) => c.active !== false || stage.channels.includes(c.key)).map((c) => {
                  const on = stage.channels.includes(c.key);
                  const inactive = c.active === false;
                  return (
                    <button key={c.key} type="button" disabled={busy} onClick={() => toggleChannel(c.key)}
                      title={inactive ? 'Канал не настроен/не подключён — подключите в «AI и коммуникации → Настройки»' : undefined}
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${on ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : inactive ? 'border-ink/10 text-ink/30' : 'border-ink/15 text-dark-gray hover:border-ink/30'}`}>
                      {c.label}{inactive ? ' ·⃠' : ''}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-dark-gray">Показаны только подключённые каналы. Каналы Umnico (WhatsApp/Telegram) пишут гостю <b>первым по номеру телефона</b>; если гостя нет в канале — в воронке появится пометка-задача, а анкету держите на SMS/Email. «Написать первым» идёт через личный аккаунт и может привести к блокировке номера (правила мессенджеров).</p>
              {dict.umnico && dict.umnico.count === 0 ? (
                <p className="mt-1 text-[11px] text-amber-600">
                  {dict.umnico.tokenSet
                    ? 'Каналы Umnico не найдены: токен задан, но интеграция вернула 0 каналов. Проверьте активные каналы и права токена (AI → Интеграции → Umnico → «Проверить подключение»).'
                    : 'Каналы Umnico недоступны: не задан API-токен. Подключите в AI → Интеграции → Umnico.'}
                </p>
              ) : dict.umnico ? (
                <p className="mt-1 text-[11px] text-emerald-600">Umnico подключён: каналов — {dict.umnico.count}.</p>
              ) : null}
            </div>
          </section>

          {/* ③ Когда условие выполнено */}
          <section className="rounded-lg border border-ink/10 p-3">
            <p className="text-xs font-semibold text-ink">③ Когда условие выполнено</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-dark-gray">
              {stage.key === 'key_issue'
                ? 'Все условия зелёные → цифровой ключ выдаётся автоматически, затем — авто-заезд (если у объекта включён самозаезд).'
                : 'Бронь переходит на следующий этап воронки, напоминания этого этапа прекращаются.'}
            </p>
            {stage.key === 'key_issue' ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="block text-xs text-dark-gray">Ключ активен за, мин до заезда
                  <input value={pre} onChange={(e) => setPre(e.target.value)} className={`mt-1 ${fieldCls}`} />
                </label>
                <label className="block text-xs text-dark-gray">и ещё, мин после выезда
                  <input value={post} onChange={(e) => setPost(e.target.value)} className={`mt-1 ${fieldCls}`} />
                </label>
              </div>
            ) : null}
          </section>

          {/* ④ Задача сотруднику (в отдел), пока этап не пройден */}
          <section className="space-y-2 rounded-lg border border-ink/10 p-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-ink">
              <input type="checkbox" checked={taskOn} onChange={(e) => setTaskOn(e.target.checked)} />
              ④ Поставить задачу сотруднику (пока этап не пройден)
            </label>
            <p className="text-[11px] leading-relaxed text-dark-gray">Создаёт задачу в отдел, если условие этапа не выполнено к указанному сроку. Одна задача на бронь (не дублируется). Сохраняется по кнопке «Сохранить этап».</p>
            {taskOn ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-xs text-dark-gray">Отдел-получатель
                  <select value={taskGroup} onChange={(e) => setTaskGroup(e.target.value)} className={`mt-1 ${fieldCls}`}>
                    <option value="">— без отдела (по правам) —</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </label>
                <label className="block text-xs text-dark-gray">Когда, часов до заезда (пусто — сразу; напр. −2)
                  <input value={taskOffset} onChange={(e) => setTaskOffset(e.target.value)} className={`mt-1 ${fieldCls}`} placeholder="сразу при постановке на этап" />
                </label>
                <label className="block text-xs text-dark-gray sm:col-span-2">Заголовок задачи (необязательно)
                  <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} className={`mt-1 ${fieldCls}`} placeholder={`Заселение: ${stage.title}`} />
                </label>
              </div>
            ) : null}
          </section>

          {/* ⑤ Отправить шаблон разово */}
          <section className="space-y-2 rounded-lg border border-ink/10 p-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-ink">
              <input type="checkbox" checked={sendOn} onChange={(e) => setSendOn(e.target.checked)} />
              ⑤ Отправить шаблон разово
            </label>
            <p className="text-[11px] leading-relaxed text-dark-gray">Разовое сообщение гостю на этом этапе (независимо от условия) — одно на бронь. Каналы берутся из блока ②. Это отдельно от приглашения и напоминаний.</p>
            {sendOn ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-xs text-dark-gray">Шаблон
                  <select value={sendTpl} onChange={(e) => setSendTpl(e.target.value)} className={`mt-1 ${fieldCls}`}>
                    <option value="">— выберите шаблон —</option>
                    {dict.templates.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </label>
                <label className="block text-xs text-dark-gray">Когда, часов до заезда (пусто — сразу; напр. −24)
                  <input value={sendOffset} onChange={(e) => setSendOffset(e.target.value)} className={`mt-1 ${fieldCls}`} placeholder="сразу при постановке на этап" />
                </label>
              </div>
            ) : null}
          </section>

          {/* ⑥ Сменить статус брони на шахматке */}
          <section className="space-y-2 rounded-lg border border-ink/10 p-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-ink">
              <input type="checkbox" checked={statusOn} onChange={(e) => setStatusOn(e.target.checked)} />
              ⑥ Сменить статус брони на шахматке
            </label>
            <p className="text-[11px] leading-relaxed text-dark-gray">Автоматически меняет статус брони. «Заехал» — когда условие этапа выполнено; «Незаезд»/«Отмена» — если условие НЕ выполнено к дедлайну. Срабатывает только из статуса «Подтверждена», один раз на бронь. <b>Ответственно: меняет бронь на шахматке.</b></p>
            {statusOn ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-xs text-dark-gray">Новый статус
                  <select value={statusValue} onChange={(e) => setStatusValue(e.target.value as 'CHECKED_IN' | 'NO_SHOW' | 'CANCELLED')} className={`mt-1 ${fieldCls}`}>
                    <option value="CHECKED_IN">Заехал</option>
                    <option value="NO_SHOW">Незаезд</option>
                    <option value="CANCELLED">Отменена</option>
                  </select>
                </label>
                <label className="block text-xs text-dark-gray">Когда менять
                  <select value={statusReqMet ? 'met' : 'deadline'} onChange={(e) => setStatusReqMet(e.target.value === 'met')} className={`mt-1 ${fieldCls}`}>
                    <option value="met">когда условие этапа выполнено</option>
                    <option value="deadline">по дедлайну, если НЕ выполнено</option>
                  </select>
                </label>
                {!statusReqMet ? (
                  <label className="block text-xs text-dark-gray sm:col-span-2">Дедлайн, часов относительно заезда (обязательно; напр. 2 = через 2 ч после заезда, −1 = за час до)
                    <input value={statusOffset} onChange={(e) => setStatusOffset(e.target.value)} className={`mt-1 ${fieldCls}`} placeholder="напр. 2" />
                  </label>
                ) : (
                  <p className="text-[11px] text-dark-gray sm:col-span-2">Совет: «Заехал» надёжнее всего на этапе выдачи ключа (условие = номер назначен + окно открыто).</p>
                )}
              </div>
            ) : null}
          </section>

          <label className="block text-xs text-dark-gray">Текст для гостя — «как это работает» (виден в портале на этом шаге)
            <textarea value={guestDescription} onChange={(e) => setGuestDescription(e.target.value)} rows={2} className={`mt-1 ${fieldCls}`} />
          </label>
          <label className="block text-xs text-dark-gray">Заметка для сотрудника
            <textarea value={staffNote} onChange={(e) => setStaffNote(e.target.value)} rows={2} className={`mt-1 ${fieldCls}`} />
          </label>

          <button type="button" onClick={saveTexts} disabled={busy} className="rounded-md bg-ink px-3 py-1.5 text-xs text-beige disabled:opacity-40">
            Сохранить этап
          </button>
        </div>
      ) : null}
    </div>
  );
}
