'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card } from '@dha/ui';
import {
  adminApi, type CleaningRule, type CleaningStandard, type CleaningType, type OpsAutomation,
  type OpsChecklist, type OpsGroup, type OpsPmRule, type OpsSlaPolicy, type OpsStaff, type OpsTag,
  type OpsTasksMode, type OpsWriteoffList, type PmsRatePlan, type PmsRoomOption, type OpsZone, type OpsSection, type WhItem,
} from '../../../lib/api';
import { useAdminMe, useRequireAdmin } from '../../../lib/use-admin';
import { CONDITION_RU, SEVERITY_RU, STATUS } from '../shared';

const selectCls = 'rounded-md border border-ink/20 bg-white px-3 py-2 text-sm';
const inputCls = 'rounded-md border border-ink/20 px-3 py-2 text-sm';

const TABS = [
  ['types', 'Типы уборок'],
  ['standards', 'Нормативы'],
  ['rules', 'Правила'],
  ['sla', 'SLA'],
  ['pm', 'ППР'],
  ['tags', 'Теги'],
  ['automation', 'Автоматизация'],
  ['zones', 'Зоны и секции'],
  ['writeoff', 'Списание'],
  ['staff', 'Смены'],
] as const;
type Tab = (typeof TABS)[number][0];

/** Настройки модуля «Задачи и Уборка» (§6.1–6.2, §8, §4.5–4.7, §7, §10). */
export default function OpsSettingsPage() {
  const ready = useRequireAdmin();
  const me = useAdminMe();
  const canSettings = me?.permissions.includes('ops_settings') ?? false;
  const [tab, setTab] = useState<Tab>('types');
  const [mode, setMode] = useState<OpsTasksMode>('simple');
  const [types, setTypes] = useState<CleaningType[]>([]);
  const [standards, setStandards] = useState<CleaningStandard[]>([]);
  const [rules, setRules] = useState<CleaningRule[]>([]);
  const [tags, setTags] = useState<OpsTag[]>([]);
  const [automation, setAutomation] = useState<OpsAutomation[]>([]);
  const [sla, setSla] = useState<OpsSlaPolicy[]>([]);
  const [pmRules, setPmRules] = useState<OpsPmRule[]>([]);
  const [groups, setGroups] = useState<OpsGroup[]>([]);
  const [checklists, setChecklists] = useState<OpsChecklist[]>([]);
  const [zones, setZones] = useState<OpsZone[]>([]);
  const [sections, setSections] = useState<OpsSection[]>([]);
  const [staff, setStaff] = useState<OpsStaff[]>([]);
  const [options, setOptions] = useState<PmsRoomOption[]>([]);
  const [writeoffLists, setWriteoffLists] = useState<OpsWriteoffList[]>([]);
  const [whItems, setWhItems] = useState<WhItem[]>([]);
  const [ratePlans, setRatePlans] = useState<PmsRatePlan[]>([]);
  const [error, setError] = useState('');

  const load = () => {
    void adminApi.opsCleaningTypes().then(setTypes).catch(() => undefined);
    void adminApi.opsStandards().then(setStandards).catch(() => undefined);
    void adminApi.opsRules().then(setRules).catch(() => undefined);
    void adminApi.opsTags().then(setTags).catch(() => undefined);
    void adminApi.opsAutomation().then(setAutomation).catch(() => undefined);
    void adminApi.opsSla().then(setSla).catch(() => undefined);
    void adminApi.opsPmRules().then(setPmRules).catch(() => undefined);
    void adminApi.opsGroups().then(setGroups).catch(() => undefined);
    void adminApi.opsChecklists().then(setChecklists).catch(() => undefined);
    void adminApi.opsZones().then(setZones).catch(() => undefined);
    void adminApi.opsSections().then(setSections).catch(() => undefined);
    void adminApi.opsStaff().then(setStaff).catch(() => undefined);
    void adminApi.pmsRoomOptions().then(setOptions).catch(() => undefined);
    void adminApi.opsWriteoffLists().then(setWriteoffLists).catch(() => undefined);
    void adminApi.whItems().then(setWhItems).catch(() => undefined);
    void adminApi.pmsRatePlans().then(setRatePlans).catch(() => undefined);
  };
  useEffect(() => { if (ready) load(); }, [ready]);
  useEffect(() => { void adminApi.opsTasksMode().then((r) => setMode(r.mode)).catch(() => undefined); }, []);

  const run = (fn: () => Promise<unknown>) => { setError(''); void fn().then(load).catch((e) => setError(e instanceof Error ? e.message : 'Ошибка')); };
  const roomTypes = useMemo(() => options.flatMap((p) => p.roomTypes.map((rt) => ({ ...rt, property: p.name }))), [options]);

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <h1 className="mb-1 text-3xl font-light text-ink">Операции · Настройки</h1>
      <p className="mb-5 text-sm text-dark-gray">Типы и правила уборок, нормативы, SLA, ППР-циклы, теги, автоматизация. Планировщик и шаблоны задач — в разделе «Задачи».</p>

      {/* Тумблер режима модуля задач (workflow-ТЗ §10): на уровне сети, переключает только интерфейс */}
      <Card className="mb-5 !p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">Режим модуля задач</p>
            <p className="mt-0.5 max-w-xl text-xs text-dark-gray">
              {mode === 'advanced'
                ? '«Продвинутый»: «Мой день» без отложенных, отложенные с причиной блокера, напоминания за 7 и 2 дня до срока, «Свободные в отделе» отдельной секцией.'
                : '«Обычный»: как сейчас, единый список задач. Продвинутые дэшборды и блокеры скрыты (данные сохраняются в любом режиме).'}
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            {(['simple', 'advanced'] as const).map((m) => (
              <button key={m} type="button" disabled={!canSettings}
                onClick={() => run(() => adminApi.opsSetTasksMode(m).then((r) => setMode(r.mode)))}
                className={`rounded-md px-3.5 py-1.5 transition disabled:cursor-not-allowed disabled:opacity-50 ${mode === m ? 'bg-white font-medium text-ink shadow-sm' : 'text-slate-500 hover:text-ink'}`}>
                {m === 'simple' ? 'Обычный' : 'Продвинутый'}
              </button>
            ))}
          </div>
        </div>
        {!canSettings ? <p className="mt-2 text-xs text-slate-400">Переключение доступно роли с правом настроек операций.</p> : null}
      </Card>

      <div className="mb-5 flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 text-sm" style={{ width: 'fit-content' }}>
        {TABS.map(([v, l]) => (
          <button key={v} type="button" onClick={() => setTab(v)} className={`rounded-md px-3.5 py-1.5 transition ${tab === v ? 'bg-white font-medium text-ink shadow-sm' : 'text-slate-500 hover:text-ink'}`}>{l}</button>
        ))}
      </div>
      {error ? <p className="mb-3 text-sm text-rose-600">{error}</p> : null}

      {tab === 'types' ? <TypesTab types={types} checklists={checklists} onRun={run} /> : null}
      {tab === 'standards' ? <StandardsTab types={types} standards={standards} roomTypes={roomTypes} onRun={run} /> : null}
      {tab === 'rules' ? <RulesTab types={types} rules={rules} roomTypes={roomTypes} ratePlans={ratePlans} onRun={run} /> : null}
      {tab === 'sla' ? <SlaTab sla={sla} onRun={run} /> : null}
      {tab === 'pm' ? <PmTab rules={pmRules} options={options} roomTypes={roomTypes} checklists={checklists} groups={groups} tags={tags} onRun={run} /> : null}
      {tab === 'tags' ? <TagsTab tags={tags} onRun={run} /> : null}
      {tab === 'automation' ? <AutomationTab automation={automation} staff={staff} tags={tags} onRun={run} /> : null}
      {tab === 'zones' ? <ZonesTab zones={zones} sections={sections} options={options} onRun={run} /> : null}
      {tab === 'writeoff' ? <WriteoffListsTab lists={writeoffLists} types={types} items={whItems} onRun={run} /> : null}
      {tab === 'staff' ? <StaffTab staff={staff} onRun={run} /> : null}
    </main>
  );
}

function TypesTab({ types, checklists, onRun }: { types: CleaningType[]; checklists: OpsChecklist[]; onRun: (fn: () => Promise<unknown>) => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#0ea5e9');
  return (
    <Card>
      <p className="mb-3 text-sm font-medium text-ink">Типы уборок (§6.1): пресеты можно переименовать, чек-лист вешается на каждый тип.</p>
      <div className="space-y-2">
        {types.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink/10 px-3 py-2">
            <input type="color" value={t.color} onChange={(e) => onRun(() => adminApi.opsSaveCleaningType({ color: e.target.value }, t.id))} className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0" />
            <input defaultValue={t.name} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== t.name) onRun(() => adminApi.opsSaveCleaningType({ name: e.target.value.trim() }, t.id)); }} className={`${inputCls} w-44`} />
            <select value={t.checklistId ?? ''} onChange={(e) => onRun(() => adminApi.opsSaveCleaningType({ checklistId: e.target.value || null }, t.id))} className={selectCls}>
              <option value="">Без чек-листа</option>
              {checklists.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-dark-gray"><input type="checkbox" checked={t.checklistBeforeStart} onChange={(e) => onRun(() => adminApi.opsSaveCleaningType({ checklistBeforeStart: e.target.checked }, t.id))} />чек-лист перед началом</label>
            <label className="flex items-center gap-1.5 text-xs text-dark-gray"><input type="checkbox" checked={t.forResidential} onChange={(e) => onRun(() => adminApi.opsSaveCleaningType({ forResidential: e.target.checked }, t.id))} />жилые</label>
            {!t.presetKey ? <button type="button" className="ml-auto text-xs text-rose-500 hover:underline" onClick={() => onRun(() => adminApi.opsSaveCleaningType({ archived: true }, t.id))}>В архив</button> : null}
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Новый тип («Генеральная»…)" className={`${inputCls} w-56`} />
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-10 cursor-pointer rounded-md border border-ink/20" />
        <Button disabled={!name.trim()} onClick={() => { onRun(() => adminApi.opsSaveCleaningType({ name: name.trim(), color })); setName(''); }}>Добавить</Button>
      </div>
    </Card>
  );
}

function StandardsTab({ types, standards, roomTypes, onRun }: { types: CleaningType[]; standards: CleaningStandard[]; roomTypes: { id: string; name: string; property: string }[]; onRun: (fn: () => Promise<unknown>) => void }) {
  const value = (ct: string, rt: string | null) => standards.find((s) => s.cleaningTypeId === ct && s.roomTypeId === rt)?.minutes ?? '';
  return (
    <Card className="overflow-x-auto">
      <p className="mb-3 text-sm font-medium text-ink">Нормативы времени, мин (§6.1): тип уборки × категория. Пустая колонка «По умолчанию» — для всех категорий.</p>
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="py-2 pr-3">Тип уборки</th>
            <th className="py-2 pr-3">По умолчанию</th>
            {roomTypes.map((rt) => <th key={rt.id} className="py-2 pr-3">{rt.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {types.map((t) => (
            <tr key={t.id} className="border-t border-ink/5">
              <td className="py-2 pr-3 text-ink"><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />{t.name}</td>
              {[null, ...roomTypes.map((rt) => rt.id)].map((rtId) => (
                <td key={rtId ?? 'default'} className="py-1.5 pr-3">
                  <input
                    type="number" min={1} defaultValue={value(t.id, rtId)} placeholder="—"
                    onBlur={(e) => { const v = Number(e.target.value); if (v > 0 && v !== value(t.id, rtId)) onRun(() => adminApi.opsSaveStandard({ cleaningTypeId: t.id, roomTypeId: rtId ?? undefined, minutes: v })); }}
                    className={`${inputCls} w-20`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function RulesTab({ types, rules, roomTypes, ratePlans, onRun }: { types: CleaningType[]; rules: CleaningRule[]; roomTypes: { id: string; name: string; property: string }[]; ratePlans: PmsRatePlan[]; onRun: (fn: () => Promise<unknown>) => void }) {
  const [condition, setCondition] = useState('TODAY_CHECKOUT');
  const [typeId, setTypeId] = useState('');
  const [roomTypeId, setRoomTypeId] = useState('');
  const [nights, setNights] = useState('');
  const [ratePlanId, setRatePlanId] = useState('');
  const [promo, setPromo] = useState('');
  const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? '?';
  return (
    <Card>
      <p className="mb-3 text-sm font-medium text-ink">Правила автосоздания уборок (§6.2): состояние номера → тип. При пересечении побеждает более специфичное. Генерация — ночью или кнопкой в «Плане уборок».</p>
      <div className="space-y-2">
        {rules.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink/10 px-3 py-2 text-sm">
            <label className="relative inline-flex cursor-pointer items-center" title={r.enabled ? 'Включено' : 'Выключено'}>
              <input type="checkbox" checked={r.enabled} onChange={(e) => onRun(() => adminApi.opsSaveRule({ enabled: e.target.checked }, r.id))} className="peer sr-only" />
              <span className="h-5 w-9 rounded-full bg-slate-200 transition peer-checked:bg-emerald-400 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4" />
            </label>
            <span className="text-ink">{CONDITION_RU[r.condition]}</span>
            {r.roomTypeId ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{roomTypes.find((rt) => rt.id === r.roomTypeId)?.name ?? 'категория'}</span> : null}
            {r.minStayNights ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">каждые {r.minStayNights} ноч.</span> : null}
            {r.ratePlanId ? <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700">тариф: {ratePlans.find((p) => p.id === r.ratePlanId)?.name ?? '?'}</span> : null}
            {r.promoCode ? <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700">промокод: {r.promoCode}</span> : null}
            <span className="text-slate-400">→</span>
            <span className="font-medium text-ink">{typeName(r.cleaningTypeId)}</span>
            <button type="button" className="ml-auto text-xs text-rose-500 hover:underline" onClick={() => onRun(() => adminApi.opsDeleteRule(r.id))}>Удалить</button>
          </div>
        ))}
        {rules.length === 0 ? <p className="text-sm text-slate-400">Правил нет — уборки создаются только вручную и при выезде.</p> : null}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <select value={condition} onChange={(e) => setCondition(e.target.value)} className={selectCls}>
          {Object.entries(CONDITION_RU).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)} className={selectCls}>
          <option value="">Все категории</option>
          {roomTypes.map((rt) => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
        </select>
        {condition === 'OCCUPIED' ? <input type="number" min={1} value={nights} onChange={(e) => setNights(e.target.value)} placeholder="каждые N ночей" className={`${inputCls} w-36`} /> : null}
        <select value={ratePlanId} onChange={(e) => setRatePlanId(e.target.value)} className={selectCls} title="Спецпредложение: только брони этого тарифа">
          <option value="">Любой тариф</option>
          {ratePlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="Промокод (необяз.)" className={`${inputCls} w-36`} title="Только брони с этим промокодом" />
        <span className="text-slate-400">→</span>
        <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className={selectCls}>
          <option value="">Тип уборки…</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <Button disabled={!typeId} onClick={() => { onRun(() => adminApi.opsSaveRule({ condition, cleaningTypeId: typeId, roomTypeId: roomTypeId || undefined, minStayNights: nights ? Number(nights) : undefined, ratePlanId: ratePlanId || undefined, promoCode: promo.trim() || undefined })); setNights(''); setPromo(''); setRatePlanId(''); }}>Добавить правило</Button>
      </div>
    </Card>
  );
}

function TagsTab({ tags, onRun }: { tags: OpsTag[]; onRun: (fn: () => Promise<unknown>) => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  return (
    <Card>
      <p className="mb-3 text-sm font-medium text-ink">Теги задач (§8.2): для фильтров и отчётов.</p>
      <div className="flex flex-wrap gap-2">
        {tags.map((t) => (
          <span key={t.id} className="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm" style={{ backgroundColor: `${t.color}22`, color: t.color }}>
            {t.name}
            <button type="button" title="В архив" onClick={() => onRun(() => adminApi.opsUpdateTag(t.id, { archived: true }))} className="opacity-60 hover:opacity-100">×</button>
          </span>
        ))}
        {tags.length === 0 ? <p className="text-sm text-slate-400">Тегов нет.</p> : null}
      </div>
      <div className="mt-3 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="VIP, Поломка…" className={`${inputCls} w-48`} />
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-10 cursor-pointer rounded-md border border-ink/20" />
        <Button disabled={!name.trim()} onClick={() => { onRun(() => adminApi.opsCreateTag({ name: name.trim(), color })); setName(''); }}>Добавить</Button>
      </div>
    </Card>
  );
}


function AutomationTab({ automation, staff, tags, onRun }: { automation: OpsAutomation[]; staff: OpsStaff[]; tags: OpsTag[]; onRun: (fn: () => Promise<unknown>) => void }) {
  const [type, setType] = useState<'REMIND' | 'ESCALATE'>('REMIND');
  const [name, setName] = useState('');
  const [status, setStatus] = useState('NEW');
  const [after, setAfter] = useState('30');
  const [repeat, setRepeat] = useState('5');
  const [notifyTo, setNotifyTo] = useState('');
  const [notifyTarget, setNotifyTarget] = useState<'USER' | 'GROUP_HEAD' | 'SUPERVISOR' | 'CREATOR'>('GROUP_HEAD');
  // Условия (LQA): критичность / тег / только гостевые заявки.
  const [sevF, setSevF] = useState('');
  const [tagF, setTagF] = useState('');
  const [guestOnly, setGuestOnly] = useState(false);

  const TYPE_OPTIONS = [
    {
      value: 'REMIND',
      label: 'Напоминание исполнителю',
      hint: 'Напоминает сотруднику, что задача висит в том же статусе дольше N минут. Можно настроить повтор.',
    },
    {
      value: 'ESCALATE',
      label: 'Уведомить руководителя',
      hint: 'Если задача висит в статусе дольше N минут — руководитель получает уведомление и добавляется в наблюдатели (задача не переназначается). Кого уведомить, выбирается ниже.',
    },
  ] as const;
  const NOTIFY_TARGET: Record<string, string> = {
    GROUP_HEAD: 'Руководитель отдела задачи',
    SUPERVISOR: 'Супервайзер задачи',
    CREATOR: 'Постановщик задачи',
    USER: 'Конкретный сотрудник',
  };

  return (
    <Card>
      <p className="mb-1 text-sm font-medium text-ink">Автоматизация (§8.1)</p>
      <p className="mb-4 text-xs text-slate-500">Настройте правила, которые срабатывают автоматически при зависании задачи в статусе.</p>
      <div className="space-y-2">
        {automation.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink/10 px-3 py-2 text-sm">
            <label className="relative inline-flex cursor-pointer items-center">
              <input type="checkbox" checked={a.enabled} onChange={(e) => onRun(() => adminApi.opsSaveAutomation({ enabled: e.target.checked }, a.id))} className="peer sr-only" />
              <span className="h-5 w-9 rounded-full bg-slate-200 transition peer-checked:bg-emerald-400 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4" />
            </label>
            <span className={`rounded-full px-2 py-0.5 text-xs ${a.type === 'REMIND' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
              {a.type === 'REMIND' ? 'Напоминание' : 'Уведомление руководителя'}
            </span>
            <span className="text-ink">{a.name}</span>
            <span className="text-xs text-slate-400">
              статус «{STATUS[a.status].label}» дольше {a.afterMinutes} мин
              {a.type === 'REMIND' && a.repeatMinutes ? ` · повтор каждые ${a.repeatMinutes} мин` : ''}
              {a.type === 'ESCALATE' ? ` · уведомить: ${a.notifyTarget === 'USER' ? (staff.find((s) => s.id === a.escalateToUserId)?.name ?? '?') : NOTIFY_TARGET[a.notifyTarget]}` : ''}
              {a.severity ? ` · критичность: ${SEVERITY_RU[a.severity]}` : ''}
              {a.tagId ? ` · тег: ${tags.find((t) => t.id === a.tagId)?.name ?? '?'}` : ''}
              {a.guestOnly ? ' · только гостевые' : ''}
            </span>
            <button type="button" className="ml-auto text-xs text-rose-500 hover:underline" onClick={() => onRun(() => adminApi.opsDeleteAutomation(a.id))}>Удалить</button>
          </div>
        ))}
        {automation.length === 0 ? <p className="text-sm text-slate-400">Правил нет. Добавьте первое ниже.</p> : null}
      </div>

      {/* Форма добавления */}
      <div className="mt-4 rounded-lg border border-dashed border-ink/15 p-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value} type="button"
              onClick={() => setType(opt.value)}
              className={`rounded-lg border p-3 text-left transition ${type === opt.value ? 'border-indigo-300 bg-indigo-50' : 'border-ink/10 hover:border-ink/20'}`}
            >
              <p className={`font-medium text-sm ${type === opt.value ? 'text-indigo-700' : 'text-ink'}`}>{opt.label}</p>
              <p className="mt-0.5 text-xs text-slate-500">{opt.hint}</p>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название правила" className={`${inputCls} w-48`} />
          <div>
            <p className="mb-1 text-xs text-slate-500">Когда статус</p>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
              {Object.entries(STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-500">Дольше (мин)</p>
            <input type="number" min={1} value={after} onChange={(e) => setAfter(e.target.value)} className={`${inputCls} w-24`} />
          </div>
          {type === 'REMIND' ? (
            <div>
              <p className="mb-1 text-xs text-slate-500">Повтор (мин)</p>
              <input type="number" min={1} value={repeat} onChange={(e) => setRepeat(e.target.value)} className={`${inputCls} w-24`} />
            </div>
          ) : (
            <>
              <div>
                <p className="mb-1 text-xs text-slate-500">Кого уведомить</p>
                <select value={notifyTarget} onChange={(e) => setNotifyTarget(e.target.value as typeof notifyTarget)} className={selectCls}>
                  {Object.entries(NOTIFY_TARGET).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              {notifyTarget === 'USER' ? (
                <div>
                  <p className="mb-1 text-xs text-slate-500">Сотрудник</p>
                  <select value={notifyTo} onChange={(e) => setNotifyTo(e.target.value)} className={selectCls}>
                    <option value="">Выберите…</option>
                    {staff.map((s) => <option key={s.id} value={s.id}>{s.name ?? s.email}</option>)}
                  </select>
                </div>
              ) : null}
            </>
          )}
          <div>
            <p className="mb-1 text-xs text-slate-500">Критичность (условие)</p>
            <select value={sevF} onChange={(e) => setSevF(e.target.value)} className={selectCls}>
              <option value="">Любая</option>
              {Object.entries(SEVERITY_RU).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-500">Тег (условие)</p>
            <select value={tagF} onChange={(e) => setTagF(e.target.value)} className={selectCls}>
              <option value="">Любой</option>
              {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-600 cursor-pointer" title="Срабатывать только на задачах с флагом «Заявка гостя»">
            <input type="checkbox" checked={guestOnly} onChange={(e) => setGuestOnly(e.target.checked)} />только гостевые
          </label>
          <Button
            disabled={!name.trim() || (type === 'ESCALATE' && notifyTarget === 'USER' && !notifyTo)}
            onClick={() => { onRun(() => adminApi.opsSaveAutomation({ type, name: name.trim(), status, afterMinutes: Number(after) || 30, repeatMinutes: type === 'REMIND' && repeat ? Number(repeat) : undefined, notifyTarget: type === 'ESCALATE' ? notifyTarget : undefined, escalateToUserId: type === 'ESCALATE' && notifyTarget === 'USER' ? notifyTo : undefined, severity: sevF || undefined, tagId: tagF || undefined, guestOnly: guestOnly || undefined })); setName(''); setSevF(''); setTagF(''); setGuestOnly(false); }}
          >Добавить правило</Button>
        </div>
      </div>
    </Card>
  );
}

/** SLA-матрица (LQA): критичность × источник → нормативы принятия/выполнения. Пусто — не проставлять. */
function SlaTab({ sla, onRun }: { sla: OpsSlaPolicy[]; onRun: (fn: () => Promise<unknown>) => void }) {
  const SEV: ('CRITICAL' | 'MAJOR' | 'MINOR')[] = ['CRITICAL', 'MAJOR', 'MINOR'];
  const cell = (severity: string, guest: boolean) => sla.find((p) => p.severity === severity && p.guestRequest === guest);
  const save = (severity: string, guest: boolean, field: 'acceptMinutes' | 'dueMinutes', raw: string) => {
    const v = raw.trim() === '' ? null : Math.max(1, Number(raw));
    const cur = cell(severity, guest);
    if ((cur?.[field] ?? null) === v) return;
    onRun(() => adminApi.opsSaveSla({ severity, guestRequest: guest, acceptMinutes: cur?.acceptMinutes ?? null, dueMinutes: cur?.dueMinutes ?? null, [field]: v }));
  };
  const block = (guest: boolean) => (
    <Card>
      <p className="mb-1 text-sm font-medium text-ink">{guest ? 'Заявки от гостей' : 'Внутренние заявки'}</p>
      <p className="mb-3 text-xs text-slate-500">{guest ? 'Задачи с флагом «Заявка гостя» — жёсткие нормативы (LQA).' : 'Обычные задачи без флага гостя.'}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="py-2 pr-3">Критичность</th>
            <th className="py-2 pr-3">Принять (мин)</th>
            <th className="py-2 pr-3">Выполнить (мин)</th>
          </tr>
        </thead>
        <tbody>
          {SEV.map((s) => {
            const p = cell(s, guest);
            return (
              <tr key={s} className="border-t border-ink/5">
                <td className="py-2 pr-3 text-ink">{SEVERITY_RU[s]}</td>
                <td className="py-1.5 pr-3"><input type="number" min={1} defaultValue={p?.acceptMinutes ?? ''} placeholder="—" onBlur={(e) => save(s, guest, 'acceptMinutes', e.target.value)} className={`${inputCls} w-24`} /></td>
                <td className="py-1.5 pr-3"><input type="number" min={1} defaultValue={p?.dueMinutes ?? ''} placeholder="—" onBlur={(e) => save(s, guest, 'dueMinutes', e.target.value)} className={`${inputCls} w-24`} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
  return (
    <div className="space-y-4">
      <p className="text-sm text-dark-gray">SLA-матрица: при создании заявки без сроков «Принять до» и «Срок выполнения» проставятся автоматически по критичности и источнику. Контроль нарушений — правила во вкладке «Автоматизация» (напоминание/уведомить руководителя, с условием по критичности и «только гостевые»).</p>
      <div className="grid gap-4 lg:grid-cols-2">{block(true)}{block(false)}</div>
    </div>
  );
}

/** ППР-циклы (LQA): каждый номер проходит профилактику по чек-листу раз в period дней, порциями perDay в день. */
function PmTab({ rules, options, roomTypes, checklists, groups, tags, onRun }: {
  rules: OpsPmRule[];
  options: PmsRoomOption[];
  roomTypes: { id: string; name: string; property: string }[];
  checklists: OpsChecklist[];
  groups: OpsGroup[];
  tags: OpsTag[];
  onRun: (fn: () => Promise<unknown>) => void;
}) {
  const [name, setName] = useState('ППР номера');
  const [propertyId, setPropertyId] = useState('');
  const [roomTypeId, setRoomTypeId] = useState('');
  const [periodDays, setPeriodDays] = useState('90');
  const [perDay, setPerDay] = useState('2');
  const [checklistId, setChecklistId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [tagId, setTagId] = useState('');
  const [genMsg, setGenMsg] = useState('');
  const propName = (id: string | null) => (id ? options.find((o) => o.id === id)?.name ?? '?' : 'все объекты');
  return (
    <Card>
      <p className="mb-1 text-sm font-medium text-ink">ППР — планово-предупредительное обслуживание номерного фонда (LQA)</p>
      <p className="mb-3 text-xs text-slate-500">Каждый номер проходит профилактический осмотр по чек-листу раз в N дней. Задачи создаются порциями каждую ночь (и кнопкой «Сгенерировать»), в первую очередь — свободные сегодня номера и самая давняя профилактика.</p>
      <div className="space-y-2">
        {rules.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink/10 px-3 py-2 text-sm">
            <label className="relative inline-flex cursor-pointer items-center" title={r.enabled ? 'Включено' : 'Выключено'}>
              <input type="checkbox" checked={r.enabled} onChange={(e) => onRun(() => adminApi.opsSavePmRule({ enabled: e.target.checked }, r.id))} className="peer sr-only" />
              <span className="h-5 w-9 rounded-full bg-slate-200 transition peer-checked:bg-emerald-400 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4" />
            </label>
            <span className="font-medium text-ink">{r.name}</span>
            <span className="text-xs text-slate-400">{propName(r.propertyId)}{r.roomTypeId ? ` · ${roomTypes.find((rt) => rt.id === r.roomTypeId)?.name ?? 'категория'}` : ''} · раз в {r.periodDays} дн. · по {r.perDay}/день</span>
            {r.groupId ? <span className="rounded-full px-2 py-0.5 text-xs text-white" style={{ backgroundColor: groups.find((g) => g.id === r.groupId)?.color ?? '#64748b' }}>{groups.find((g) => g.id === r.groupId)?.name ?? 'отдел'}</span> : null}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600" title="Пройдено в текущем цикле / всего номеров; открытых задач сейчас">
              цикл: {r.stats.doneInCycle}/{r.stats.totalRooms} · открыто {r.stats.open}
            </span>
            {r.stats.dueRooms > 0 ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700" title={`Номеров, ожидающих профилактику (из них ни разу не проходили: ${r.stats.neverDone}). Текущим темпом очередь закроется за ~${r.stats.daysToClear ?? '—'} дн.`}>
                ждут: {r.stats.dueRooms}{r.stats.daysToClear != null ? ` (~${r.stats.daysToClear} дн.)` : ''}
              </span>
            ) : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">всё пройдено ✓</span>}
            <span className="ml-auto flex items-center gap-2">
              <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={() => { setGenMsg('…'); void adminApi.opsGeneratePm(r.id).then((x) => setGenMsg(`Создано задач: ${x.created}`)).catch((e) => setGenMsg(e instanceof Error ? e.message : 'Ошибка')); }}>Сгенерировать</button>
              <button type="button" className="text-xs text-rose-500 hover:underline" onClick={() => onRun(() => adminApi.opsDeletePmRule(r.id))}>Удалить</button>
            </span>
          </div>
        ))}
        {rules.length === 0 ? <p className="text-sm text-slate-400">ППР-циклов нет — добавьте первый ниже.</p> : null}
        {genMsg ? <p className="text-xs text-indigo-600">{genMsg}</p> : null}
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-ink/15 p-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название («ППР номера»)" className={`${inputCls} w-44`} />
        <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={selectCls}>
          <option value="">Все объекты</option>
          {options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)} className={selectCls}>
          <option value="">Все категории</option>
          {roomTypes.map((rt) => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">раз в
          <input type="number" min={1} value={periodDays} onChange={(e) => setPeriodDays(e.target.value)} className={`${inputCls} w-20`} />дн.
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">по
          <input type="number" min={1} value={perDay} onChange={(e) => setPerDay(e.target.value)} className={`${inputCls} w-16`} />/день
        </label>
        <select value={checklistId} onChange={(e) => setChecklistId(e.target.value)} className={selectCls}>
          <option value="">Без чек-листа</option>
          {checklists.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={selectCls}>
          <option value="">Отдел-исполнитель…</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select value={tagId} onChange={(e) => setTagId(e.target.value)} className={selectCls}>
          <option value="">Тег задач…</option>
          {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <Button
          disabled={!name.trim() || !Number(periodDays)}
          onClick={() => onRun(() => adminApi.opsSavePmRule({
            name: name.trim(), propertyId: propertyId || undefined, roomTypeId: roomTypeId || undefined,
            periodDays: Number(periodDays), perDay: Number(perDay) || 2,
            checklistId: checklistId || undefined, groupId: groupId || undefined, tagIds: tagId ? [tagId] : [],
          }))}
        >Добавить цикл</Button>
      </div>
    </Card>
  );
}

function ZonesTab({ zones, sections, options, onRun }: { zones: OpsZone[]; sections: OpsSection[]; options: PmsRoomOption[]; onRun: (fn: () => Promise<unknown>) => void }) {
  const [zoneName, setZoneName] = useState('');
  const [zoneProp, setZoneProp] = useState('');
  const [sectionName, setSectionName] = useState('');
  const [sectionProp, setSectionProp] = useState('');
  useEffect(() => { if (options[0]) { setZoneProp((v) => v || options[0]!.id); setSectionProp((v) => v || options[0]!.id); } }, [options]);
  const propName = (id: string) => options.find((o) => o.id === id)?.name ?? '';
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <p className="mb-3 text-sm font-medium text-ink">Нежилые зоны (§7): лобби, ресторан, коридоры — объекты задач и нежилых уборок.</p>
        <div className="space-y-1.5">
          {zones.map((z) => (
            <div key={z.id} className="flex items-center gap-2 rounded-lg border border-ink/10 px-3 py-2 text-sm">
              <span className="text-ink">{z.name}</span>
              <span className="text-xs text-slate-400">{propName(z.propertyId)}{z.floor ? ` · этаж ${z.floor}` : ''}</span>
              <button type="button" className="ml-auto text-xs text-rose-500 hover:underline" onClick={() => onRun(() => adminApi.opsUpdateZone(z.id, { active: false }))}>Скрыть</button>
            </div>
          ))}
          {zones.length === 0 ? <p className="text-sm text-slate-400">Зон нет.</p> : null}
        </div>
        <div className="mt-3 flex gap-2">
          <select value={zoneProp} onChange={(e) => setZoneProp(e.target.value)} className={selectCls}>{options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <input value={zoneName} onChange={(e) => setZoneName(e.target.value)} placeholder="Лобби…" className={`${inputCls} w-40`} />
          <Button disabled={!zoneName.trim() || !zoneProp} onClick={() => { onRun(() => adminApi.opsCreateZone({ propertyId: zoneProp, name: zoneName.trim() })); setZoneName(''); }}>Добавить</Button>
        </div>
      </Card>
      <Card>
        <p className="mb-3 text-sm font-medium text-ink">Секции (§7): группы номеров для распределения уборок («Крыло А»…). Привязка номера к секции — в карточке номера.</p>
        <div className="space-y-1.5">
          {sections.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg border border-ink/10 px-3 py-2 text-sm">
              <span className="text-ink">{s.name}</span>
              <span className="text-xs text-slate-400">{propName(s.propertyId)}</span>
            </div>
          ))}
          {sections.length === 0 ? <p className="text-sm text-slate-400">Секций нет.</p> : null}
        </div>
        <div className="mt-3 flex gap-2">
          <select value={sectionProp} onChange={(e) => setSectionProp(e.target.value)} className={selectCls}>{options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <input value={sectionName} onChange={(e) => setSectionName(e.target.value)} placeholder="Крыло А…" className={`${inputCls} w-40`} />
          <Button disabled={!sectionName.trim() || !sectionProp} onClick={() => { onRun(() => adminApi.opsCreateSection({ propertyId: sectionProp, name: sectionName.trim() })); setSectionName(''); }}>Добавить</Button>
        </div>
      </Card>
    </div>
  );
}

/** Листы списания расходников при уборках (§6.6): позиции склада + количество по умолчанию. */
function WriteoffListsTab({ lists, types, items, onRun }: { lists: OpsWriteoffList[]; types: CleaningType[]; items: WhItem[]; onRun: (fn: () => Promise<unknown>) => void }) {
  const [name, setName] = useState('');
  const [typeId, setTypeId] = useState('');
  const [rows, setRows] = useState<{ itemId: string; qty: number }[]>([]);
  const [q, setQ] = useState('');
  const itemName = (id: string) => items.find((i) => i.id === id)?.name ?? id;
  const found = q.trim() ? items.filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()) && !rows.some((r) => r.itemId === i.id)).slice(0, 6) : [];
  return (
    <Card>
      <p className="mb-3 text-sm font-medium text-ink">Листы списания (§6.6): что списывается при уборке. Лист с типом уборки подставляется в модалку «Списать расходники» автоматически.</p>
      {items.length === 0 ? <p className="mb-3 text-xs text-amber-600">Складская номенклатура недоступна (нужны права склада) — редактирование листов ограничено.</p> : null}
      <div className="space-y-2">
        {lists.map((l) => (
          <div key={l.id} className="rounded-lg border border-ink/10 px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium text-ink">{l.name}</span>
              {l.cleaningTypeId ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{types.find((t) => t.id === l.cleaningTypeId)?.name ?? 'тип'}</span> : <span className="text-xs text-slate-400">любой тип</span>}
              <button type="button" className="ml-auto text-xs text-rose-500 hover:underline" onClick={() => onRun(() => adminApi.opsDeleteWriteoffList(l.id))}>Удалить</button>
            </div>
            <p className="mt-1 text-xs text-slate-400">{l.items.map((i) => `${itemName(i.itemId)} ×${i.qty}`).join(' · ') || 'пусто'}</p>
          </div>
        ))}
        {lists.length === 0 ? <p className="text-sm text-slate-400">Листов нет.</p> : null}
      </div>
      <div className="mt-4 space-y-2 rounded-lg border border-dashed border-ink/15 p-3">
        <div className="flex flex-wrap gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название («Выездная — стандарт»)" className={`${inputCls} w-64`} />
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className={selectCls}>
            <option value="">Любой тип уборки</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.itemId} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-ink">{itemName(r.itemId)}</span>
              <input type="number" min={0} step="any" value={r.qty} onChange={(e) => setRows((x) => x.map((y) => (y.itemId === r.itemId ? { ...y, qty: Number(e.target.value) } : y)))} className={`${inputCls} w-20`} />
              <button type="button" onClick={() => setRows((x) => x.filter((y) => y.itemId !== r.itemId))} className="text-slate-400 hover:text-rose-600">×</button>
            </div>
          ))}
        </div>
        <div className="relative">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти позицию склада…" className={`${inputCls} w-full`} />
          {found.length ? (
            <div className="absolute inset-x-0 top-full z-10 mt-1 rounded-lg border border-ink/10 bg-white shadow-lg">
              {found.map((i) => (
                <button key={i.id} type="button" onClick={() => { setRows((r) => [...r, { itemId: i.id, qty: 1 }]); setQ(''); }} className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-slate-50">{i.name} <span className="text-xs text-slate-400">({i.unit})</span></button>
              ))}
            </div>
          ) : null}
        </div>
        <Button disabled={!name.trim() || rows.length === 0} onClick={() => { onRun(() => adminApi.opsSaveWriteoffList({ name: name.trim(), cleaningTypeId: typeId || undefined, items: rows.filter((r) => r.qty > 0) })); setName(''); setTypeId(''); setRows([]); }}>Добавить лист</Button>
      </div>
    </Card>
  );
}

function StaffTab({ staff, onRun }: { staff: OpsStaff[]; onRun: (fn: () => Promise<unknown>) => void }) {
  return (
    <Card>
      <p className="mb-3 text-sm font-medium text-ink">Смены (§10): не «в смене» — не получает задания и не участвует в автораспределении. Сотрудник включает смену сам на «Мои задачи», руководитель — здесь.</p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {staff.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-ink/10 px-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="truncate text-ink">{s.name ?? s.email}</p>
              <p className="text-xs text-slate-400">{s.roleKey ?? '—'}</p>
            </div>
            <button
              type="button"
              onClick={() => onRun(() => adminApi.opsDutyFor(s.id, !s.onDuty))}
              className={`shrink-0 rounded-full px-3 py-1 text-xs transition ${s.onDuty ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
            >{s.onDuty ? 'В смене' : 'Не в смене'}</button>
          </div>
        ))}
      </div>
    </Card>
  );
}
