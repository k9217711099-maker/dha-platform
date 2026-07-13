'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { Button, Input } from '@dha/ui';
import { adminApi, type Extra, type FinanceIntegration, type GuaranteeAudience, type LegalEntity, type PmsRatePlan, type RoomFundCategory } from '../../../lib/api';
import { DateRangePicker } from '../../../components/DateRangePicker';
import { useEsc } from '../../../lib/use-esc';

const fieldCls = 'w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm';
const labelCls = 'mb-1 block text-sm font-medium text-ink';

const ROUNDING: [string, string][] = [['NONE', 'Не округлять'], ['INTEGER', 'До целого'], ['TENS', 'До десятков'], ['FIFTIES', 'До полусотен'], ['HUNDREDS', 'До сотен']];
const BASE_OPTS: [string, string][] = [['current', 'текущих суток'], ['prev', 'предыдущих суток'], ['next', 'следующих суток']];
const PREPAY_METHODS = ['Ссылка на онлайн-оплату', 'Квитанция', 'Счёт', 'Другое'];
const DUE_TERMS = ['до 01:00 даты, следующей за датой создания брони', 'в течение 24 часов', 'до даты заезда', 'в день заезда'];

interface TState {
  name: string;
  priceMode: 'MANUAL' | 'DERIVED';
  parentRatePlanId: string;
  adjDir: 'discount' | 'markup';
  adjUnit: 'PERCENT' | 'FIXED';
  adjValue: string;
  priceRounding: string;
  restrictionMode: 'MANUAL' | 'COPY';
  restrictionMinNights: string;
  restrictionCategoryIds: string[];
  meals: { type: string; price: string }[];
  includedServices: { extraId: string; note: string }[];
  earlyLateMode: 'FIXED' | 'PERCENT' | 'HOURLY';
  earlyLateApplyMain: boolean;
  earlyPercent: string; earlyBase: string; latePercent: string; lateBase: string;
  freeCancelDays: string;
  rulePeriods: { from: string; to: string; freeCancelDays: string }[];
  cancellationComment: string;
  guaranteeType: 'NONE' | 'PREPAY';
  individual: GuaranteeAudience; company: GuaranteeAudience; agency: GuaranteeAudience;
  releaseOpenDays: string; releaseOpenHours: string; releaseCloseDays: string; releaseCloseHours: string;
  availableFrontDesk: boolean; availableBookingModule: boolean; availableOta: boolean; refundable: boolean;
}

const emptyAudience = (): GuaranteeAudience => ({ method: 'Ссылка на онлайн-оплату', stayPrepay: undefined, stayPrepayUnit: 'RUB', stayPrepayBase: 'FULL', extrasPrepay: false, dueTerm: DUE_TERMS[0], autoCancel: false, payKeeper: false, yookassa: false, buyers: 'all', showForOnline: false, description: '' });

function initState(plan?: PmsRatePlan | null): TState {
  const adjVal = plan?.adjustmentValue ?? null;
  const el = plan?.earlyLateConfig ?? undefined;
  const g = plan?.guaranteeConfig ?? undefined;
  return {
    name: plan?.name ?? '',
    priceMode: (plan?.priceMode as TState['priceMode']) ?? (plan?.parentRatePlanId ? 'DERIVED' : 'MANUAL'),
    parentRatePlanId: plan?.parentRatePlanId ?? '',
    adjDir: adjVal != null && adjVal < 0 ? 'discount' : 'markup',
    adjUnit: (plan?.adjustmentType as TState['adjUnit']) ?? 'PERCENT',
    adjValue: adjVal != null ? String(Math.abs(adjVal)) : '',
    priceRounding: plan?.priceRounding ?? 'NONE',
    restrictionMode: (plan?.restrictionMode as TState['restrictionMode']) ?? 'MANUAL',
    restrictionMinNights: plan?.defaultMinNights != null ? String(plan.defaultMinNights) : '',
    restrictionCategoryIds: plan?.restrictionCategoryIds ?? [],
    meals: plan?.meals?.map((m) => ({ type: m.type, price: String(m.price) })) ?? [],
    includedServices: plan?.includedServices?.map((s) => ({ extraId: s.extraId, note: s.note ?? '' })) ?? [],
    earlyLateMode: (plan?.earlyLateMode as TState['earlyLateMode']) ?? 'FIXED',
    earlyLateApplyMain: plan?.earlyLateApplyMain ?? false,
    earlyPercent: el?.early?.percent != null ? String(el.early.percent) : '', earlyBase: el?.early?.base ?? 'current',
    latePercent: el?.late?.percent != null ? String(el.late.percent) : '', lateBase: el?.late?.base ?? 'current',
    freeCancelDays: plan?.freeCancelDays != null ? String(plan.freeCancelDays) : '0',
    rulePeriods: plan?.rulePeriods?.map((p) => ({ from: p.from, to: p.to, freeCancelDays: p.freeCancelDays != null ? String(p.freeCancelDays) : '' })) ?? [],
    cancellationComment: plan?.cancellationComment ?? '',
    guaranteeType: (g?.type as TState['guaranteeType']) ?? (plan?.guaranteeType as TState['guaranteeType']) ?? 'NONE',
    individual: { ...emptyAudience(), ...(g?.individual ?? {}) },
    company: { ...emptyAudience(), ...(g?.company ?? {}) },
    agency: { ...emptyAudience(), ...(g?.agency ?? {}) },
    releaseOpenDays: plan?.releaseOpenDays != null ? String(plan.releaseOpenDays) : '0',
    releaseOpenHours: plan?.releaseOpenHours != null ? String(plan.releaseOpenHours) : '0',
    releaseCloseDays: plan?.releaseCloseDays != null ? String(plan.releaseCloseDays) : '0',
    releaseCloseHours: plan?.releaseCloseHours != null ? String(plan.releaseCloseHours) : '0',
    availableFrontDesk: plan?.availableFrontDesk ?? true,
    availableBookingModule: plan?.availableBookingModule ?? true,
    availableOta: plan?.availableOta ?? true,
    refundable: plan?.refundable ?? true,
  };
}

const genCode = (name: string) => (name.trim().replace(/[^0-9A-Za-zА-Яа-я]/g, '').slice(0, 6).toUpperCase() || 'RATE') + '-' + Date.now().toString(36).toUpperCase().slice(-4);

/** Полная форма тарифного плана (эталон Bnovo). Тариф сетевой — объект не выбирается. */
export function TariffForm({ plans, plan, onClose, onSaved, onError }: {
  plans: PmsRatePlan[]; plan?: PmsRatePlan | null;
  onClose: () => void; onSaved: () => void; onError: (m: string) => void;
}) {
  useEsc(onClose);
  const isEdit = Boolean(plan);
  const [s, setS] = useState<TState>(() => initState(plan));
  const [extras, setExtras] = useState<Extra[]>([]);
  const [cats, setCats] = useState<RoomFundCategory[]>([]);
  const [legalEntities, setLegalEntities] = useState<LegalEntity[]>([]);
  const [onlineInts, setOnlineInts] = useState<FinanceIntegration[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (patch: Partial<TState>) => setS((prev) => ({ ...prev, ...patch }));
  useEffect(() => {
    void adminApi.extras().then(setExtras).catch(() => setExtras([]));
    void adminApi.roomFundCategories().then(setCats).catch(() => setCats([]));
    void adminApi.financeLegalEntities().then(setLegalEntities).catch(() => setLegalEntities([]));
    void adminApi.financeIntegrations().then((all) => setOnlineInts(all.filter((i) => i.category === 'online'))).catch(() => setOnlineInts([]));
  }, []);

  const parents = plans.filter((p) => !p.parentRatePlanId && p.id !== plan?.id);

  async function save() {
    setErr('');
    if (!s.name.trim()) { setErr('Укажите название тарифа'); return; }
    if (s.priceMode === 'DERIVED' && !s.parentRatePlanId) { setErr('Выберите базовый тариф для автоматического расчёта цен'); return; }
    setSaving(true);
    const derived = s.priceMode === 'DERIVED';
    const adjustmentValue = derived ? (s.adjDir === 'discount' ? -Math.abs(Number(s.adjValue || 0)) : Math.abs(Number(s.adjValue || 0))) : undefined;
    const audienceOut = (a: GuaranteeAudience): GuaranteeAudience => ({ ...a, stayPrepay: a.stayPrepay });
    const config = {
      priceMode: s.priceMode,
      parentRatePlanId: derived ? s.parentRatePlanId : undefined,
      adjustmentType: derived ? s.adjUnit : undefined,
      adjustmentValue,
      priceRounding: s.priceRounding,
      restrictionMode: s.restrictionMode,
      defaultMinNights: s.restrictionMode === 'MANUAL' && s.restrictionMinNights.trim() ? Number(s.restrictionMinNights) : undefined,
      restrictionCategoryIds: s.restrictionMode === 'MANUAL' ? s.restrictionCategoryIds : [],
      meals: s.meals.filter((m) => m.type.trim()).map((m) => ({ type: m.type.trim(), price: Number(m.price || 0) })),
      includedServices: s.includedServices.filter((x) => x.extraId).map((x) => ({ extraId: x.extraId, note: x.note || undefined })),
      earlyLateMode: s.earlyLateMode,
      earlyLateApplyMain: s.earlyLateApplyMain,
      earlyLateConfig: s.earlyLateMode === 'PERCENT' ? { early: { percent: Number(s.earlyPercent || 0), base: s.earlyBase }, late: { percent: Number(s.latePercent || 0), base: s.lateBase } } : undefined,
      freeCancelDays: s.freeCancelDays === '' ? undefined : Number(s.freeCancelDays),
      rulePeriods: s.rulePeriods.filter((p) => p.from && p.to).map((p) => ({ from: p.from, to: p.to, freeCancelDays: p.freeCancelDays === '' ? undefined : Number(p.freeCancelDays) })),
      cancellationComment: s.cancellationComment || undefined,
      guaranteeType: s.guaranteeType,
      guaranteeConfig: { type: s.guaranteeType, individual: audienceOut(s.individual), company: audienceOut(s.company), agency: audienceOut(s.agency) },
      releaseOpenDays: Number(s.releaseOpenDays || 0),
      releaseOpenHours: Number(s.releaseOpenHours || 0),
      releaseCloseDays: Number(s.releaseCloseDays || 0),
      releaseCloseHours: Number(s.releaseCloseHours || 0),
      availableFrontDesk: s.availableFrontDesk,
      availableBookingModule: s.availableBookingModule,
      availableOta: s.availableOta,
      refundable: s.refundable,
    };
    try {
      if (isEdit && plan) await adminApi.pmsUpdateRatePlan(plan.id, { name: s.name.trim(), ...config });
      else await adminApi.pmsCreateRatePlan({ name: s.name.trim(), code: genCode(s.name), ...config });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); setSaving(false); onError(''); }
  }

  async function remove() {
    if (!plan || !confirm(`Удалить тариф «${plan.name}»? Действие необратимо.`)) return;
    setSaving(true); setErr('');
    try { await adminApi.pmsDeleteRatePlan(plan.id); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Не удалось удалить тариф'); setSaving(false); }
  }

  const setAud = (key: 'individual' | 'company' | 'agency', patch: Partial<GuaranteeAudience>) => set({ [key]: { ...s[key], ...patch } } as Partial<TState>);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-6" onClick={onClose}>
      <div className="my-4 w-full max-w-3xl rounded-xl border border-ink/10 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
          <h2 className="text-xl font-light text-ink">{isEdit ? 'Настройки тарифного плана' : 'Добавление нового тарифного плана'}</h2>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-ink/40 hover:text-ink">×</button>
        </div>

        <div className="max-h-[75vh] space-y-6 overflow-y-auto px-6 py-5">
          <Input id="tname" label="Название *" value={s.name} onChange={(e) => set({ name: e.target.value })} />
          <p className="-mt-4 text-xs text-dark-gray">Тариф создаётся для всей сети. Открывать/закрывать конкретные категории можно во вкладке «Массовое ограничение продаж» и в «Ценах и ограничениях».</p>

          <Field title="Цены в тарифе">
            <Radio checked={s.priceMode === 'MANUAL'} onChange={() => set({ priceMode: 'MANUAL' })} label="Буду указывать вручную" />
            <Radio checked={s.priceMode === 'DERIVED'} onChange={() => set({ priceMode: 'DERIVED' })} label="Рассчитывать автоматически" />
            {s.priceMode === 'DERIVED' ? (
              <div className="mt-2 grid gap-2 rounded-md bg-beige/30 p-3 sm:grid-cols-3">
                <label className="block"><span className="mb-1 block text-xs text-dark-gray">От тарифа</span>
                  <select value={s.parentRatePlanId} onChange={(e) => set({ parentRatePlanId: e.target.value })} className={fieldCls}>
                    <option value="">— выберите —</option>
                    {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label className="block"><span className="mb-1 block text-xs text-dark-gray">Тип</span>
                  <select value={s.adjDir} onChange={(e) => set({ adjDir: e.target.value as TState['adjDir'] })} className={fieldCls}><option value="discount">Скидка</option><option value="markup">Наценка</option></select>
                </label>
                <label className="block"><span className="mb-1 block text-xs text-dark-gray">Величина</span>
                  <div className="flex gap-1">
                    <input value={s.adjValue} onChange={(e) => set({ adjValue: e.target.value })} className={fieldCls} />
                    <select value={s.adjUnit} onChange={(e) => set({ adjUnit: e.target.value as TState['adjUnit'] })} className={`${fieldCls} w-20`}><option value="PERCENT">%</option><option value="FIXED">₽</option></select>
                  </div>
                </label>
              </div>
            ) : null}
          </Field>

          <Field title="Округление цен">
            <select value={s.priceRounding} onChange={(e) => set({ priceRounding: e.target.value })} className={`${fieldCls} sm:max-w-xs`}>
              {ROUNDING.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>

          <Field title="Ограничения">
            <Radio checked={s.restrictionMode === 'MANUAL'} onChange={() => set({ restrictionMode: 'MANUAL' })} label="Буду указывать вручную" />
            {s.restrictionMode === 'MANUAL' ? (
              <div className="ml-6 mt-1 space-y-2">
                <label className="block max-w-xs"><span className="mb-1 block text-xs text-dark-gray">Минимальное количество ночей</span>
                  <input value={s.restrictionMinNights} onChange={(e) => set({ restrictionMinNights: e.target.value })} className={fieldCls} placeholder="напр. 2" />
                </label>
                {s.restrictionMinNights.trim() ? (
                  <div>
                    <p className="mb-1 text-xs text-dark-gray">Категории, на которые действует (пусто — все)</p>
                    <div className="max-h-32 max-w-md overflow-y-auto rounded-md border border-ink/10 p-2">
                      {cats.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 py-0.5 text-sm text-ink">
                          <input type="checkbox" checked={s.restrictionCategoryIds.includes(c.id)} onChange={() => set({ restrictionCategoryIds: s.restrictionCategoryIds.includes(c.id) ? s.restrictionCategoryIds.filter((x) => x !== c.id) : [...s.restrictionCategoryIds, c.id] })} />
                          {c.property.name} · {c.name}
                        </label>
                      ))}
                      {cats.length === 0 ? <span className="text-xs text-dark-gray">Категорий нет.</span> : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            <Radio checked={s.restrictionMode === 'COPY'} onChange={() => set({ restrictionMode: 'COPY' })} label="Автоматически копировать" />
          </Field>

          <Field title="Питание">
            {s.meals.length === 0 ? <p className="text-sm text-dark-gray">Без питания</p> : null}
            {s.meals.map((m, i) => (
              <div key={i} className="mb-2 flex items-center gap-2">
                <select value={m.type} onChange={(e) => { const ex = extras.find((x) => x.name === e.target.value); set({ meals: s.meals.map((x, idx) => idx === i ? { type: e.target.value, price: ex ? String(ex.price) : x.price } : x) }); }} className={`${fieldCls} flex-1`}>
                  <option value="">Выбрать из доп. услуг…</option>
                  {extras.map((ex) => <option key={ex.id} value={ex.name}>{ex.name}</option>)}
                </select>
                <input value={m.price} onChange={(e) => set({ meals: s.meals.map((x, idx) => idx === i ? { ...x, price: e.target.value } : x) })} placeholder="₽" className={`${fieldCls} w-28`} />
                <button type="button" onClick={() => set({ meals: s.meals.filter((_, idx) => idx !== i) })} className="text-sm text-red-600">Удалить</button>
              </div>
            ))}
            <AddBtn label="Добавить питание" onClick={() => set({ meals: [...s.meals, { type: '', price: '' }] })} />
          </Field>

          <Field title="Включённые услуги">
            {s.includedServices.map((x, i) => (
              <div key={i} className="mb-2 flex items-center gap-2">
                <select value={x.extraId} onChange={(e) => set({ includedServices: s.includedServices.map((y, idx) => idx === i ? { ...y, extraId: e.target.value } : y) })} className={`${fieldCls} flex-1`}>
                  <option value="">Выбрать из доп. услуг…</option>
                  {extras.map((ex) => <option key={ex.id} value={ex.id}>{ex.name} · {ex.price.toLocaleString('ru')} ₽</option>)}
                </select>
                <input value={x.note} onChange={(e) => set({ includedServices: s.includedServices.map((y, idx) => idx === i ? { ...y, note: e.target.value } : y) })} placeholder="Входит" className={`${fieldCls} w-32`} />
                <button type="button" onClick={() => set({ includedServices: s.includedServices.filter((_, idx) => idx !== i) })} className="text-sm text-red-600">Удалить</button>
              </div>
            ))}
            <AddBtn label="Добавить услугу" onClick={() => set({ includedServices: [...s.includedServices, { extraId: '', note: '' }] })} />
          </Field>

          <Field title="Ранний заезд и поздний выезд">
            <Radio checked={s.earlyLateMode === 'FIXED'} onChange={() => set({ earlyLateMode: 'FIXED' })} label="Задавать фиксированную стоимость вручную при бронировании" />
            <Radio checked={s.earlyLateMode === 'PERCENT'} onChange={() => set({ earlyLateMode: 'PERCENT' })} label="Процент от суточной стоимости" />
            {s.earlyLateMode === 'PERCENT' ? (
              <div className="ml-6 mt-2 space-y-3 rounded-md bg-beige/30 p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-28 text-ink">Ранний заезд</span>
                  <input value={s.earlyPercent} onChange={(e) => set({ earlyPercent: e.target.value })} className={`${fieldCls} w-20`} /> %
                  <select value={s.earlyBase} onChange={(e) => set({ earlyBase: e.target.value })} className={`${fieldCls} w-44`}>{BASE_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-28 text-ink">Поздний выезд</span>
                  <input value={s.latePercent} onChange={(e) => set({ latePercent: e.target.value })} className={`${fieldCls} w-20`} /> %
                  <select value={s.lateBase} onChange={(e) => set({ lateBase: e.target.value })} className={`${fieldCls} w-44`}>{BASE_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                </div>
              </div>
            ) : null}
            <Radio checked={s.earlyLateMode === 'HOURLY'} onChange={() => set({ earlyLateMode: 'HOURLY' })} label="Почасовая доплата (1 час = стоимость суток / 24)" />
            <label className="ml-6 mt-1 flex items-center gap-2 text-sm text-dark-gray"><input type="checkbox" checked={s.earlyLateApplyMain} onChange={(e) => set({ earlyLateApplyMain: e.target.checked })} /> Применить тарификацию настроек основного тарифа</label>
          </Field>

          <Field title="Правила аннуляции">
            <div className="flex items-center gap-2 text-sm text-ink">
              Отмена без штрафа возможна за
              <input value={s.freeCancelDays} onChange={(e) => set({ freeCancelDays: e.target.value })} className={`${fieldCls} w-20`} />
              суток {s.freeCancelDays === '0' ? <span className="text-dark-gray">(бесплатная отмена в любое время)</span> : null}
            </div>
          </Field>

          <Field title="Периоды изменения правил">
            {s.rulePeriods.map((p, i) => (
              <div key={i} className="mb-2 flex flex-wrap items-center gap-2">
                <DateRangePicker from={p.from} to={p.to} className="w-64" onChange={(f, t) => set({ rulePeriods: s.rulePeriods.map((x, idx) => idx === i ? { ...x, from: f, to: t } : x) })} />
                <input value={p.freeCancelDays} onChange={(e) => set({ rulePeriods: s.rulePeriods.map((x, idx) => idx === i ? { ...x, freeCancelDays: e.target.value } : x) })} placeholder="суток без штрафа" className={`${fieldCls} w-40`} />
                <button type="button" onClick={() => set({ rulePeriods: s.rulePeriods.filter((_, idx) => idx !== i) })} className="text-sm text-red-600">Удалить</button>
              </div>
            ))}
            <AddBtn label="Добавить период" onClick={() => set({ rulePeriods: [...s.rulePeriods, { from: '', to: '', freeCancelDays: '' }] })} />
          </Field>

          <Field title="Дополнительный комментарий к правилам аннуляции">
            <textarea value={s.cancellationComment} onChange={(e) => set({ cancellationComment: e.target.value })} rows={2} className={fieldCls} />
          </Field>

          <Field title="Гарантия бронирования">
            <Radio checked={s.guaranteeType === 'NONE'} onChange={() => set({ guaranteeType: 'NONE' })} label="Без гарантии" />
            <Radio checked={s.guaranteeType === 'PREPAY'} onChange={() => set({ guaranteeType: 'PREPAY' })} label="Предоплата" />
            {s.guaranteeType === 'PREPAY' ? (
              <div className="mt-2 space-y-3">
                <AudienceBlock title="Физ. лицо" value={s.individual} onChange={(p) => setAud('individual', p)} legalEntities={legalEntities} onlineInts={onlineInts} />
                <AudienceBlock title="Компании" value={s.company} onChange={(p) => setAud('company', p)} buyers legalEntities={legalEntities} onlineInts={onlineInts} />
                <AudienceBlock title="Агентства" value={s.agency} onChange={(p) => setAud('agency', p)} buyers agency legalEntities={legalEntities} onlineInts={onlineInts} />
                <p className="rounded-md bg-primary-50 px-3 py-2 text-xs text-primary-700">
                  Автоматически будет создан счёт в карточке бронирования. Настройте <a href="/promocodes" target="_blank" rel="noreferrer" className="font-medium underline">промокоды для компаний</a>, чтобы они бронировали онлайн через модуль бронирования.
                </p>
              </div>
            ) : null}
          </Field>

          <Field title="Релиз-период" hint="За какое время до заезда тариф открывается/закрывается для продажи.">
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
              Тариф откроется за
              <input value={s.releaseOpenDays} onChange={(e) => set({ releaseOpenDays: e.target.value })} className={`${fieldCls} w-16`} /> дней
              <input value={s.releaseOpenHours} onChange={(e) => set({ releaseOpenHours: e.target.value })} className={`${fieldCls} w-16`} /> часов до заезда
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink">
              Тариф закроется за
              <input value={s.releaseCloseDays} onChange={(e) => set({ releaseCloseDays: e.target.value })} className={`${fieldCls} w-16`} /> дней
              <input value={s.releaseCloseHours} onChange={(e) => set({ releaseCloseHours: e.target.value })} className={`${fieldCls} w-16`} /> часов до заезда
            </div>
          </Field>

          <Field title="Доступность и условия">
            <div className="flex flex-wrap gap-4 text-sm text-ink">
              <label className="flex items-center gap-2"><input type="checkbox" checked={s.availableFrontDesk} onChange={(e) => set({ availableFrontDesk: e.target.checked })} /> Стойка</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={s.availableBookingModule} onChange={(e) => set({ availableBookingModule: e.target.checked })} /> Модуль бронирования</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={s.availableOta} onChange={(e) => set({ availableOta: e.target.checked })} /> OTA</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={s.refundable} onChange={(e) => set({ refundable: e.target.checked })} /> Возвратный</label>
            </div>
          </Field>

          {err ? <p className="text-sm text-red-600">{err}</p> : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-ink/10 px-6 py-4">
          {isEdit && plan ? (
            <button type="button" disabled={saving} onClick={() => void remove()} className="text-sm text-red-600 hover:underline disabled:opacity-40">Удалить тариф</button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Отмена</Button>
            <Button onClick={() => void save()} disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Блок предоплаты по аудитории (Физ. лицо / Компании / Агентства), сворачиваемый. */
function AudienceBlock({ title, value, onChange, buyers, agency, legalEntities, onlineInts }: { title: string; value: GuaranteeAudience; onChange: (p: Partial<GuaranteeAudience>) => void; buyers?: boolean; agency?: boolean; legalEntities: LegalEntity[]; onlineInts: FinanceIntegration[] }) {
  const [open, setOpen] = useState(true);
  const isLink = value.method === 'Ссылка на онлайн-оплату';
  const defaultLe = legalEntities.find((e) => e.isDefault) ?? legalEntities[0];
  return (
    <div className="rounded-md border border-ink/10">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-ink">
        {title}<span className={`text-ink/40 transition ${open ? '' : '-rotate-90'}`}>▾</span>
      </button>
      {open ? (
        <div className="space-y-3 border-t border-ink/10 px-3 py-3 text-sm">
          {buyers ? (
            <>
              <div className="flex items-center gap-4">
                <span className="w-40 text-dark-gray">Покупатели</span>
                <label className="flex items-center gap-1.5"><input type="radio" checked={(value.buyers ?? 'all') === 'all'} onChange={() => onChange({ buyers: 'all' })} /> Все {agency ? 'агентства' : 'компании'}</label>
                <label className="flex items-center gap-1.5"><input type="radio" checked={value.buyers === 'specific'} onChange={() => onChange({ buyers: 'specific' })} /> Конкретные</label>
              </div>
              {value.buyers === 'specific' ? (
                <label className="block">
                  <span className="mb-1 block text-dark-gray">{agency ? 'Агентства' : 'Компании'}, к которым применяется тариф (по одному на строку)</span>
                  <textarea value={value.buyersList ?? ''} onChange={(e) => onChange({ buyersList: e.target.value })} rows={3} placeholder={agency ? 'ООО «Тревел», ИП Иванов…' : 'ООО «Газпром», АО «РЖД»…'} className={fieldCls} />
                  <span className="mt-1 block text-xs text-dark-gray">Тариф будет доступен онлайн этим контрагентам по промокоду. <a href="/promocodes" target="_blank" rel="noreferrer" className="text-primary underline">Настроить промокоды</a>.</span>
                </label>
              ) : null}
            </>
          ) : null}
          {agency ? (
            <Line label="Комиссия агентства">
              <div className="flex items-center gap-1.5">
                <input value={value.agencyCommission ?? ''} onChange={(e) => onChange({ agencyCommission: e.target.value === '' ? undefined : Number(e.target.value) })} className={`${fieldCls} w-24`} placeholder="0" /> %
                <span className="text-xs text-dark-gray">удерживается агентством из стоимости</span>
              </div>
            </Line>
          ) : null}
          <Line label="Способ предоплаты">
            <select value={value.method ?? ''} onChange={(e) => onChange({ method: e.target.value })} className={`${fieldCls} max-w-xs`}>{PREPAY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
          </Line>
          {isLink ? (
            <label className="flex items-center gap-2 text-dark-gray"><input type="checkbox" checked={!!value.showForOnline} onChange={(e) => onChange({ showForOnline: e.target.checked })} /> Выставлять для бронирований из систем онлайн-бронирования</label>
          ) : null}
          <Line label="Юр. лицо">
            {legalEntities.length === 0 ? (
              <span className="text-xs text-dark-gray">Нет реквизитов — добавьте в <span className="text-ink">Настройки → Финансы → Реквизиты</span></span>
            ) : (
              <select value={value.legalEntityId ?? ''} onChange={(e) => onChange({ legalEntityId: e.target.value || null })} className={`${fieldCls} max-w-xs`}>
                <option value="">{defaultLe ? `${defaultLe.name} (по умолчанию)` : '— по умолчанию —'}</option>
                {legalEntities.map((le) => <option key={le.id} value={le.id}>{le.name}</option>)}
              </select>
            )}
          </Line>
          <Line label="Предоплата за проживание">
            <div className="flex flex-wrap items-center gap-1">
              <input value={value.stayPrepay ?? ''} onChange={(e) => onChange({ stayPrepay: e.target.value === '' ? undefined : Number(e.target.value) })} className={`${fieldCls} w-24`} placeholder="размер" />
              <select value={value.stayPrepayUnit ?? 'RUB'} onChange={(e) => onChange({ stayPrepayUnit: e.target.value as 'RUB' | 'PERCENT' })} className={`${fieldCls} w-20`}>
                <option value="RUB">₽</option>
                <option value="PERCENT">%</option>
              </select>
              {(value.stayPrepayUnit ?? 'RUB') === 'PERCENT' ? (
                <select value={value.stayPrepayBase ?? 'FULL'} onChange={(e) => onChange({ stayPrepayBase: e.target.value as 'FULL' | 'FIRST_NIGHT' })} className={`${fieldCls} w-auto`}>
                  <option value="FULL">от полной стоимости брони</option>
                  <option value="FIRST_NIGHT">от первой ночи</option>
                </select>
              ) : null}
            </div>
          </Line>
          <Line label="Предоплата за доп. услуги">
            <YesNo value={!!value.extrasPrepay} onChange={(v) => onChange({ extrasPrepay: v })} />
          </Line>
          {isLink ? (
            <>
              <Line label="Срок оплаты">
                <select value={value.dueTerm ?? ''} onChange={(e) => onChange({ dueTerm: e.target.value })} className={`${fieldCls} max-w-sm`}>{DUE_TERMS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
              </Line>
              <Line label="Автоотмена без онлайн-оплаты">
                <YesNo value={!!value.autoCancel} onChange={(v) => onChange({ autoCancel: v })} />
              </Line>
              <Line label="Платёжная система">
                <div className="space-y-1.5">
                  {(() => {
                    const yoo = onlineInts.find((i) => i.id === 'yookassa');
                    const yooOn = yoo ? yoo.connected && yoo.enabled : false;
                    return (
                      <>
                        <label className={`flex items-center gap-1.5 ${yooOn ? '' : 'opacity-60'}`} title={yooOn ? '' : 'Подключите ЮKassa в Настройки → Финансы'}>
                          <input type="checkbox" checked={!!value.yookassa} disabled={!yooOn} onChange={(e) => onChange({ yookassa: e.target.checked })} /> ЮKassa
                          <span className={`rounded-full px-1.5 text-[10px] ${yooOn ? 'bg-emerald-100 text-emerald-700' : 'bg-ink/10 text-dark-gray'}`}>{yooOn ? 'подключена' : 'не подключена'}</span>
                        </label>
                        {!yooOn ? <p className="text-[11px] text-dark-gray">Онлайн-оплата настраивается в <a href="/settings/finance" target="_blank" rel="noreferrer" className="text-primary underline">Настройки → Финансы → Приём онлайн-оплаты</a>.</p> : null}
                        <label className="flex items-center gap-1.5 text-dark-gray"><input type="checkbox" checked={!!value.payKeeper} onChange={(e) => onChange({ payKeeper: e.target.checked })} /> PayKeeper <span className="rounded-full bg-ink/10 px-1.5 text-[10px]">внешняя (ручная ссылка)</span></label>
                      </>
                    );
                  })()}
                </div>
              </Line>
            </>
          ) : (
            <label className="block"><span className="mb-1 block text-dark-gray">Дополнительное описание</span>
              <textarea value={value.description ?? ''} onChange={(e) => onChange({ description: e.target.value })} rows={2} className={fieldCls} />
            </label>
          )}
        </div>
      ) : null}
    </div>
  );
}
function Line({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3"><span className="w-40 shrink-0 text-dark-gray">{label}</span>{children}</div>;
}
function YesNo({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-ink/20 text-sm">
      <button type="button" onClick={() => onChange(true)} className={`px-3 py-1 ${value ? 'bg-ink text-beige' : 'text-ink'}`}>Да</button>
      <button type="button" onClick={() => onChange(false)} className={`px-3 py-1 ${!value ? 'bg-ink text-beige' : 'text-ink'}`}>Нет</button>
    </div>
  );
}
function Field({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 border-t border-ink/10 pt-4 sm:grid-cols-[200px_1fr]">
      <div><p className="text-sm font-semibold text-ink">{title}</p>{hint ? <p className="mt-0.5 text-xs text-dark-gray">{hint}</p> : null}</div>
      <div>{children}</div>
    </div>
  );
}
function Radio({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return <label className="flex items-center gap-2 py-0.5 text-sm text-ink"><input type="radio" checked={checked} onChange={onChange} /> {label}</label>;
}
function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-md border border-dashed border-primary/40 px-3 py-1.5 text-sm font-medium text-primary hover:border-primary hover:bg-primary-50">＋ {label}</button>;
}
