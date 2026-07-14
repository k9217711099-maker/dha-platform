'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { Button, Card } from '@dha/ui';
import { adminApi, fileUrl, type BspbAdminConfig, type Counterparty, type CounterpartyInput, type FinanceAuditEntry, type FinanceIntegration, type FiscalStatus, type LegalEntity, type LegalEntityInput, type PaykeeperAdminConfig, type YookassaAdminConfig } from '../../../lib/api';
import { useRequireAdmin } from '../../../lib/use-admin';
import { useEsc } from '../../../lib/use-esc';

const fieldCls = 'w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm';
const labelCls = 'mb-1 block text-xs font-medium text-dark-gray';

type Tab = 'requisites' | 'counterparties' | 'online' | 'fiscal' | 'onec' | 'journal';
const TABS: { id: Tab; label: string }[] = [
  { id: 'requisites', label: 'Реквизиты' },
  { id: 'counterparties', label: 'Агентства и компании' },
  { id: 'online', label: 'Приём онлайн-оплаты' },
  { id: 'fiscal', label: 'Фискальный регистратор' },
  { id: 'onec', label: '1С Бухгалтерия' },
  { id: 'journal', label: 'Журнал изменений' },
];

export default function FinancePage() {
  const ready = useRequireAdmin();
  const [tab, setTab] = useState<Tab>('requisites');
  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;
  return (
    <main className="px-8 py-8">
      <h1 className="mb-1 text-3xl font-light text-ink">Финансы</h1>
      <p className="mb-6 text-sm text-dark-gray">Реквизиты организаций для счетов и гарантии брони, приём онлайн-оплаты, фискализация и обмен с 1С. Все изменения фиксируются в журнале.</p>

      <div className="mb-6 flex flex-wrap gap-1 border-b border-ink/10">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition ${tab === t.id ? 'border-ink font-medium text-ink' : 'border-transparent text-dark-gray hover:text-ink'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'requisites' ? <RequisitesTab /> : null}
      {tab === 'counterparties' ? <CounterpartiesTab /> : null}
      {tab === 'online' ? <IntegrationsTab category="online" /> : null}
      {tab === 'fiscal' ? <FiscalPanel /> : null}
      {tab === 'onec' ? <IntegrationsTab category="accounting" /> : null}
      {tab === 'journal' ? <JournalTab /> : null}
    </main>
  );
}

// ─── Реквизиты ───
const EMPTY: LegalEntityInput = { name: '' };

function RequisitesTab() {
  const [items, setItems] = useState<LegalEntity[]>([]);
  const [editing, setEditing] = useState<LegalEntity | 'new' | null>(null);
  const load = () => adminApi.financeLegalEntities().then(setItems).catch(() => setItems([]));
  useEffect(() => { void load(); }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-dark-gray">{items.length} реквизит(ов)</p>
          <Button onClick={() => setEditing('new')}>+ Добавить реквизиты</Button>
        </div>
        {items.length === 0 ? <Card className="p-6 text-sm text-dark-gray">Реквизиты организаций пока не заданы.</Card> : null}
        {items.map((e) => (
          <Card key={e.id} className={`cursor-pointer p-4 transition hover:ring-1 hover:ring-ink/20 ${editing !== 'new' && editing?.id === e.id ? 'ring-1 ring-ink/40' : ''}`} onClick={() => setEditing(e)}>
            <div className="flex items-center justify-between">
              <p className="font-medium text-ink">{e.name}{e.isDefault ? <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">по умолчанию</span> : null}</p>
              {!e.active ? <span className="text-xs text-dark-gray">неактивно</span> : null}
            </div>
            <p className="mt-1 text-sm text-dark-gray">{e.legalName || '—'}{e.inn ? ` · ИНН ${e.inn}` : ''}</p>
            {e.bankName ? <p className="text-xs text-dark-gray">{e.bankName}{e.bankAccount ? ` · р/с ${e.bankAccount}` : ''}</p> : null}
          </Card>
        ))}
      </div>
      <div>
        {editing ? <LegalEntityForm key={editing === 'new' ? 'new' : editing.id} entity={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} /> : (
          <Card className="p-6 text-sm text-dark-gray">Выберите реквизиты слева для редактирования или добавьте новые. Они используются в счетах брони и как «юр. лицо» в гарантии бронирования тарифа.</Card>
        )}
      </div>
    </div>
  );
}

function LegalEntityForm({ entity, onClose, onSaved }: { entity: LegalEntity | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<LegalEntityInput>(entity ? { ...entity } : EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (patch: Partial<LegalEntityInput>) => setF((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    if (!f.name?.trim()) { setErr('Укажите название'); return; }
    setBusy(true); setErr('');
    try {
      if (entity) await adminApi.financeUpdateLegalEntity(entity.id, f);
      else await adminApi.financeCreateLegalEntity(f);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!entity || !confirm('Удалить реквизиты?')) return;
    setBusy(true);
    try { await adminApi.financeDeleteLegalEntity(entity.id); onSaved(); } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); } finally { setBusy(false); }
  };

  return (
    <Card className="p-5">
      <p className="mb-4 text-lg font-light text-ink">{entity ? 'Реквизиты организации' : 'Новые реквизиты'}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className={labelCls}>Название (короткое) *</label><input value={f.name ?? ''} onChange={(e) => set({ name: e.target.value })} className={fieldCls} placeholder="напр. D apartments" /></div>
        <div className="sm:col-span-2"><label className={labelCls}>Полное юр. наименование</label><input value={f.legalName ?? ''} onChange={(e) => set({ legalName: e.target.value })} className={fieldCls} placeholder="ООО «…»" /></div>
        <div><label className={labelCls}>ИНН</label><input value={f.inn ?? ''} onChange={(e) => set({ inn: e.target.value })} className={fieldCls} /></div>
        <div><label className={labelCls}>КПП</label><input value={f.kpp ?? ''} onChange={(e) => set({ kpp: e.target.value })} className={fieldCls} /></div>
        <div><label className={labelCls}>ОГРН</label><input value={f.ogrn ?? ''} onChange={(e) => set({ ogrn: e.target.value })} className={fieldCls} /></div>
        <div><label className={labelCls}>Директор</label><input value={f.director ?? ''} onChange={(e) => set({ director: e.target.value })} className={fieldCls} /></div>
        <div className="sm:col-span-2"><label className={labelCls}>Юридический адрес</label><input value={f.legalAddress ?? ''} onChange={(e) => set({ legalAddress: e.target.value })} className={fieldCls} /></div>
        <div><label className={labelCls}>Телефон</label><input value={f.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} className={fieldCls} /></div>
        <div><label className={labelCls}>Email</label><input value={f.email ?? ''} onChange={(e) => set({ email: e.target.value })} className={fieldCls} /></div>
        <div className="sm:col-span-2"><label className={labelCls}>Банк</label><input value={f.bankName ?? ''} onChange={(e) => set({ bankName: e.target.value })} className={fieldCls} /></div>
        <div><label className={labelCls}>Расчётный счёт</label><input value={f.bankAccount ?? ''} onChange={(e) => set({ bankAccount: e.target.value })} className={fieldCls} /></div>
        <div><label className={labelCls}>Корр. счёт</label><input value={f.corrAccount ?? ''} onChange={(e) => set({ corrAccount: e.target.value })} className={fieldCls} /></div>
        <div><label className={labelCls}>БИК</label><input value={f.bik ?? ''} onChange={(e) => set({ bik: e.target.value })} className={fieldCls} /></div>
        <div><label className={labelCls}>НДС по умолчанию</label>
          <select value={f.defaultVatRate == null ? '' : String(f.defaultVatRate)} onChange={(e) => set({ defaultVatRate: e.target.value === '' ? null : Number(e.target.value) })} className={fieldCls}>
            <option value="">Без НДС</option>
            <option value="0">НДС 0%</option>
            <option value="5">НДС 5%</option>
            <option value="7">НДС 7%</option>
            <option value="10">НДС 10%</option>
            <option value="22">НДС 22%</option>
          </select>
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <ScanField label="Подпись (скан)" url={f.signatureUrl ?? null} onChange={(url) => set({ signatureUrl: url })} />
        <ScanField label="Печать (скан)" url={f.stampUrl ?? null} onChange={(url) => set({ stampUrl: url })} />
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={f.isDefault ?? false} onChange={(e) => set({ isDefault: e.target.checked })} /> Использовать по умолчанию</label>
      {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-2">
          <Button onClick={save} disabled={busy}>{busy ? 'Сохранение…' : 'Сохранить'}</Button>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Отмена</Button>
        </div>
        {entity ? <button type="button" onClick={remove} disabled={busy} className="text-sm text-red-600 hover:underline">Удалить</button> : null}
      </div>
    </Card>
  );
}

// ─── Контрагенты (агентства и компании) ───
const CP_EMPTY: CounterpartyInput = { name: '', kind: 'company' };

/** Справочник контрагентов-покупателей: агентства и компании (для счетов/актов). */
function CounterpartiesTab() {
  const [items, setItems] = useState<Counterparty[]>([]);
  const [editing, setEditing] = useState<Counterparty | 'new' | null>(null);
  const load = () => adminApi.financeCounterparties(true).then(setItems).catch(() => undefined);
  useEffect(() => { void load(); }, []);

  if (editing) return <CounterpartyForm entity={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-dark-gray">Контрагенты-покупатели, которым выставляются счета и акты. В отличие от «Реквизитов» (это наши юр. лица) — здесь внешние агентства и компании.</p>
      <div className="mb-1"><Button onClick={() => setEditing('new')}>+ Добавить контрагента</Button></div>
      {items.length === 0 ? <Card className="p-6 text-sm text-dark-gray">Контрагенты пока не заведены.</Card> : (
        <div className="overflow-hidden rounded-lg border border-ink/10">
          {items.map((c) => (
            <div key={c.id} className={`flex items-center gap-3 border-b border-ink/5 bg-white px-4 py-2.5 text-sm last:border-b-0 ${c.active ? '' : 'opacity-50'}`}>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${c.kind === 'agency' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>{c.kind === 'agency' ? 'Агентство' : 'Компания'}</span>
              <span className="min-w-0 flex-1 truncate"><span className="font-medium text-ink">{c.name}</span>{c.inn ? <span className="text-dark-gray"> · ИНН {c.inn}</span> : null}{c.kind === 'agency' && c.commission != null ? <span className="text-dark-gray"> · комиссия {c.commission}%</span> : null}</span>
              <button type="button" onClick={() => setEditing(c)} className="shrink-0 rounded px-2 py-1 text-xs text-primary hover:bg-primary-50">Редактировать</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CounterpartyForm({ entity, onClose, onSaved }: { entity: Counterparty | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<CounterpartyInput>(entity ? { ...entity } : CP_EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (patch: Partial<CounterpartyInput>) => setF((prev) => ({ ...prev, ...patch }));
  const save = async () => {
    if (!f.name?.trim()) { setErr('Укажите название'); return; }
    setBusy(true); setErr('');
    try {
      if (entity) await adminApi.financeUpdateCounterparty(entity.id, f); else await adminApi.financeCreateCounterparty(f);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); } finally { setBusy(false); }
  };
  const remove = async () => { if (!entity || !confirm('Удалить контрагента?')) return; setBusy(true); try { await adminApi.financeDeleteCounterparty(entity.id); onSaved(); } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); setBusy(false); } };

  return (
    <Card className="p-6">
      <button type="button" onClick={onClose} className="mb-3 text-sm text-primary hover:underline">← К списку</button>
      <p className="mb-4 text-lg font-light text-ink">{entity ? 'Контрагент' : 'Новый контрагент'}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className={labelCls}>Название (короткое) *</label><input value={f.name ?? ''} onChange={(e) => set({ name: e.target.value })} className={fieldCls} placeholder="напр. ООО «Тревел» / Агентство «Нева»" /></div>
        <div><label className={labelCls}>Тип</label><select value={f.kind ?? 'company'} onChange={(e) => set({ kind: e.target.value as 'company' | 'agency' })} className={fieldCls}><option value="company">Компания</option><option value="agency">Агентство</option></select></div>
        {f.kind === 'agency' ? <div><label className={labelCls}>Комиссия агентства, %</label><input type="number" value={f.commission ?? ''} onChange={(e) => set({ commission: e.target.value === '' ? undefined : Number(e.target.value) })} className={fieldCls} /></div> : <div />}
        <div className="sm:col-span-2"><label className={labelCls}>Полное юр. наименование</label><input value={f.legalName ?? ''} onChange={(e) => set({ legalName: e.target.value })} className={fieldCls} /></div>
        <div><label className={labelCls}>ИНН</label><input value={f.inn ?? ''} onChange={(e) => set({ inn: e.target.value })} className={fieldCls} /></div>
        <div><label className={labelCls}>КПП</label><input value={f.kpp ?? ''} onChange={(e) => set({ kpp: e.target.value })} className={fieldCls} /></div>
        <div className="sm:col-span-2"><label className={labelCls}>Юридический адрес</label><input value={f.legalAddress ?? ''} onChange={(e) => set({ legalAddress: e.target.value })} className={fieldCls} /></div>
        <div><label className={labelCls}>Телефон</label><input value={f.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} className={fieldCls} /></div>
        <div><label className={labelCls}>Email</label><input value={f.email ?? ''} onChange={(e) => set({ email: e.target.value })} className={fieldCls} /></div>
        <div><label className={labelCls}>Банк</label><input value={f.bankName ?? ''} onChange={(e) => set({ bankName: e.target.value })} className={fieldCls} /></div>
        <div><label className={labelCls}>БИК</label><input value={f.bik ?? ''} onChange={(e) => set({ bik: e.target.value })} className={fieldCls} /></div>
        <div><label className={labelCls}>Расчётный счёт</label><input value={f.bankAccount ?? ''} onChange={(e) => set({ bankAccount: e.target.value })} className={fieldCls} /></div>
        <div><label className={labelCls}>Корр. счёт</label><input value={f.corrAccount ?? ''} onChange={(e) => set({ corrAccount: e.target.value })} className={fieldCls} /></div>
        <div className="sm:col-span-2"><label className={labelCls}>Примечание</label><input value={f.note ?? ''} onChange={(e) => set({ note: e.target.value })} className={fieldCls} /></div>
      </div>
      {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-2">
          <Button onClick={save} disabled={busy}>{busy ? 'Сохранение…' : 'Сохранить'}</Button>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Отмена</Button>
        </div>
        {entity ? <button type="button" onClick={remove} disabled={busy} className="text-sm text-red-600 hover:underline">Удалить</button> : null}
      </div>
    </Card>
  );
}

// ─── Интеграции (онлайн-оплата / фискализация / 1С) ───
function IntegrationsTab({ category }: { category: FinanceIntegration['category'] }) {
  const [items, setItems] = useState<FinanceIntegration[]>([]);
  const [busy, setBusy] = useState('');
  const [configuring, setConfiguring] = useState<string | null>(null);
  const load = () => adminApi.financeIntegrations().then(setItems).catch(() => setItems([]));
  useEffect(() => { void load(); }, []);
  const toggle = (id: string, enabled: boolean) => { setBusy(id); void adminApi.financeToggleIntegration(id, enabled).then(setItems).catch(() => undefined).finally(() => setBusy('')); };

  const shown = items.filter((i) => i.category === category);
  return (
    <div className="max-w-2xl space-y-4">
      {shown.map((i) => (
        <Card key={i.id} className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-lg font-medium text-ink">{i.name}</p>
                {i.available
                  ? <span className={`rounded-full px-2 py-0.5 text-xs ${i.connected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{i.connected ? 'Подключено' : 'Не настроено'}</span>
                  : <span className="rounded-full bg-ink/10 px-2 py-0.5 text-xs text-dark-gray">Заготовка</span>}
              </div>
              <p className="mt-1 text-sm text-dark-gray">{i.description}</p>
              {i.id === 'bspb' || i.id === 'paykeeper' || i.id === 'yookassa' ? (
                <Button variant="secondary" className="mt-3" onClick={() => setConfiguring(i.id)}>Настроить</Button>
              ) : null}
            </div>
            {i.available ? (
              <label className="flex shrink-0 items-center gap-2 text-sm">
                <input type="checkbox" checked={i.enabled} disabled={busy === i.id} onChange={(e) => toggle(i.id, e.target.checked)} />
                {i.enabled ? 'Вкл.' : 'Выкл.'}
              </label>
            ) : null}
          </div>
          {!i.available ? <p className="mt-3 rounded-md bg-ink/[0.03] px-3 py-2 text-xs text-dark-gray">Раздел появится на следующем этапе. Здесь будут настройки подключения и параметры обмена.</p> : null}
        </Card>
      ))}
      {shown.length === 0 ? <Card className="p-6 text-sm text-dark-gray">Нет доступных интеграций в этом разделе.</Card> : null}
      {configuring === 'bspb' ? <BspbSettingsModal onClose={() => setConfiguring(null)} onSaved={() => { setConfiguring(null); void load(); }} /> : null}
      {configuring === 'paykeeper' ? <PaykeeperSettingsModal onClose={() => setConfiguring(null)} onSaved={() => { setConfiguring(null); void load(); }} /> : null}
      {configuring === 'yookassa' ? <YookassaSettingsModal onClose={() => setConfiguring(null)} onSaved={() => { setConfiguring(null); void load(); }} /> : null}
    </div>
  );
}

// ─── Настройка эквайринга БСПБ (подключение + способы оплаты) ───
const PAY_METHODS: { id: 'card' | 'sbp'; label: string; hint: string }[] = [
  { id: 'card', label: 'Банковские карты', hint: 'МИР, Visa, MasterCard, UnionPay' },
  { id: 'sbp', label: 'СБП', hint: 'Система быстрых платежей — оплата по QR / кнопке' },
];

function BspbSettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  useEsc(onClose);
  const [cfg, setCfg] = useState<BspbAdminConfig | null>(null);
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  useEffect(() => { void adminApi.financeBspb().then(setCfg).catch(() => setErr('Не удалось загрузить настройки')); }, []);

  const set = (patch: Partial<BspbAdminConfig>) => setCfg((p) => (p ? { ...p, ...patch } : p));
  const methodsCount = cfg ? Number(cfg.methods.card) + Number(cfg.methods.sbp) : 0;
  const toggleMethod = (id: 'card' | 'sbp') => {
    if (!cfg) return;
    if (cfg.methods[id] && methodsCount <= 1) { setErr('Оставьте хотя бы один способ оплаты'); return; }
    setErr('');
    set({ methods: { ...cfg.methods, [id]: !cfg.methods[id] } });
  };

  const save = async () => {
    if (!cfg) return;
    setBusy(true); setErr('');
    try {
      await adminApi.financeSaveBspb({
        apiBase: cfg.apiBase,
        merchantId: cfg.merchantId,
        username: cfg.username,
        password: pwd || undefined,
        card: cfg.methods.card,
        sbp: cfg.methods.sbp,
      });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка сохранения'); } finally { setBusy(false); }
  };

  const test = async () => {
    if (!cfg) return;
    setTesting(true); setErr(''); setTestResult(null);
    try {
      const r = await adminApi.financeTestBspb({ apiBase: cfg.apiBase, merchantId: cfg.merchantId, username: cfg.username, password: pwd || undefined });
      setTestResult(r);
    } catch (e) { setTestResult({ ok: false, message: e instanceof Error ? e.message : 'Ошибка проверки' }); } finally { setTesting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="max-h-[90vh] w-full max-w-lg overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xl font-light text-ink">Банк «Санкт-Петербург»</p>
          {cfg ? <span className={`rounded-full px-2 py-0.5 text-xs ${cfg.connected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{cfg.connected ? 'Подключено' : 'Не настроено'}</span> : null}
        </div>
        <p className="mb-5 text-sm text-dark-gray">Интернет-эквайринг БСПБ. Реквизиты выдаёт банк в личном кабинете мерчанта или письмом на internet_acquiring@bspb.ru после подключения услуги.</p>

        {!cfg ? <p className="text-sm text-dark-gray">Загрузка…</p> : (
          <>
            {/* Данные для подключения */}
            <p className="mb-2 text-sm font-medium text-ink">Данные для подключения</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>URL платёжного шлюза</label>
                <input value={cfg.apiBase} onChange={(e) => set({ apiBase: e.target.value })} className={fieldCls} placeholder="https://pg.bspb.ru" />
                <p className="mt-1 text-xs text-dark-gray">Тест — https://pgtest.bspb.ru, боевой — https://pg.bspb.ru.</p>
              </div>
              <div>
                <label className={labelCls}>Идентификатор мерчанта (Merchant ID)</label>
                <input value={cfg.merchantId} onChange={(e) => set({ merchantId: e.target.value })} className={fieldCls} placeholder="номер магазина в БСПБ" />
              </div>
              <div>
                <label className={labelCls}>Логин API мерчанта</label>
                <input value={cfg.username} onChange={(e) => set({ username: e.target.value })} className={fieldCls} autoComplete="off" />
              </div>
              <div>
                <label className={labelCls}>Пароль API</label>
                <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} className={fieldCls} autoComplete="new-password" placeholder={cfg.passwordSet ? '•••••••• (задан — оставьте пустым, чтобы не менять)' : 'введите пароль'} />
                <p className="mt-1 text-xs text-dark-gray">Хранится в зашифрованном виде и обратно не показывается. Клиентский сертификат mTLS (если требует банк) задаётся на сервере: BSPB_CERT_PATH / BSPB_CERT_KEY_PATH.</p>
              </div>
            </div>

            {/* Способы оплаты */}
            <p className="mb-2 mt-6 text-sm font-medium text-ink">Способы оплаты</p>
            <div className="space-y-2">
              {PAY_METHODS.map((m) => (
                <label key={m.id} className="flex items-start gap-3 rounded-md border border-ink/10 px-3 py-2.5">
                  <input type="checkbox" className="mt-1" checked={cfg.methods[m.id]} onChange={() => toggleMethod(m.id)} />
                  <span>
                    <span className="block text-sm font-medium text-ink">{m.label}</span>
                    <span className="block text-xs text-dark-gray">{m.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {cfg.methods.sbp && !cfg.methods.card ? <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Приём только через СБП. Карточная форма гостю показываться не будет.</p> : null}

            {testResult ? <p className={`mt-3 rounded-md px-3 py-2 text-sm ${testResult.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{testResult.ok ? '✓ ' : '✕ '}{testResult.message}</p> : null}
            {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Button onClick={save} disabled={busy || testing}>{busy ? 'Сохранение…' : 'Сохранить'}</Button>
              <Button variant="secondary" onClick={test} disabled={busy || testing}>{testing ? 'Проверка…' : 'Проверить подключение'}</Button>
              <Button variant="secondary" onClick={onClose} disabled={busy || testing}>Отмена</Button>
            </div>
            <p className="mt-2 text-xs text-dark-gray">Проверка использует значения из формы (пароль — введённый здесь или ранее сохранённый) и делает тестовый запрос к шлюзу БСПБ.</p>
          </>
        )}
      </Card>
    </div>
  );
}

// ─── Настройка эквайринга PayKeeper (подключение + способы оплаты) ───
function PaykeeperSettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  useEsc(onClose);
  const [cfg, setCfg] = useState<PaykeeperAdminConfig | null>(null);
  const [pwd, setPwd] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  useEffect(() => { void adminApi.financePaykeeper().then(setCfg).catch(() => setErr('Не удалось загрузить настройки')); }, []);

  const set = (patch: Partial<PaykeeperAdminConfig>) => setCfg((p) => (p ? { ...p, ...patch } : p));
  const methodsCount = cfg ? Number(cfg.methods.card) + Number(cfg.methods.sbp) : 0;
  const toggleMethod = (id: 'card' | 'sbp') => {
    if (!cfg) return;
    if (cfg.methods[id] && methodsCount <= 1) { setErr('Оставьте хотя бы один способ оплаты'); return; }
    setErr('');
    set({ methods: { ...cfg.methods, [id]: !cfg.methods[id] } });
  };

  const save = async () => {
    if (!cfg) return;
    setBusy(true); setErr('');
    try {
      await adminApi.financeSavePaykeeper({
        server: cfg.server,
        user: cfg.user,
        password: pwd || undefined,
        secret: secret || undefined,
        card: cfg.methods.card,
        sbp: cfg.methods.sbp,
      });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка сохранения'); } finally { setBusy(false); }
  };

  const test = async () => {
    if (!cfg) return;
    setTesting(true); setErr(''); setTestResult(null);
    try {
      const r = await adminApi.financeTestPaykeeper({ server: cfg.server, user: cfg.user, password: pwd || undefined });
      setTestResult(r);
    } catch (e) { setTestResult({ ok: false, message: e instanceof Error ? e.message : 'Ошибка проверки' }); } finally { setTesting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="max-h-[90vh] w-full max-w-lg overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xl font-light text-ink">PayKeeper</p>
          {cfg ? <span className={`rounded-full px-2 py-0.5 text-xs ${cfg.connected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{cfg.connected ? 'Подключено' : 'Не настроено'}</span> : null}
        </div>
        <p className="mb-5 text-sm text-dark-gray">Приём онлайн-оплаты через PayKeeper. Реквизиты — в личном кабинете PayKeeper: адрес ЛК, логин/пароль (рекомендуется отдельный пользователь для API) и секретное слово для проверки уведомлений об оплате.</p>

        {!cfg ? <p className="text-sm text-dark-gray">Загрузка…</p> : (
          <>
            <p className="mb-2 text-sm font-medium text-ink">Данные для подключения</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Адрес личного кабинета</label>
                <input value={cfg.server} onChange={(e) => set({ server: e.target.value })} className={fieldCls} placeholder="https://ваш-магазин.server.paykeeper.ru" />
                <p className="mt-1 text-xs text-dark-gray">Полный адрес ЛК мерчанта в PayKeeper (с https://).</p>
              </div>
              <div>
                <label className={labelCls}>Логин ЛК</label>
                <input value={cfg.user} onChange={(e) => set({ user: e.target.value })} className={fieldCls} autoComplete="off" />
              </div>
              <div>
                <label className={labelCls}>Пароль ЛК</label>
                <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} className={fieldCls} autoComplete="new-password" placeholder={cfg.passwordSet ? '•••••••• (задан — оставьте пустым, чтобы не менять)' : 'введите пароль'} />
              </div>
              <div>
                <label className={labelCls}>Секретное слово (для подписи уведомлений)</label>
                <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} className={fieldCls} autoComplete="new-password" placeholder={cfg.secretSet ? '•••••••• (задано — оставьте пустым, чтобы не менять)' : 'из настроек оповещений PayKeeper'} />
                <p className="mt-1 text-xs text-dark-gray">Пароль и секрет хранятся в зашифрованном виде и обратно не показываются.</p>
              </div>
            </div>

            <p className="mb-2 mt-6 text-sm font-medium text-ink">Способы оплаты</p>
            <div className="space-y-2">
              {PAY_METHODS.map((m) => (
                <label key={m.id} className="flex items-start gap-3 rounded-md border border-ink/10 px-3 py-2.5">
                  <input type="checkbox" className="mt-1" checked={cfg.methods[m.id]} onChange={() => toggleMethod(m.id)} />
                  <span>
                    <span className="block text-sm font-medium text-ink">{m.label}</span>
                    <span className="block text-xs text-dark-gray">{m.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-dark-gray">Итоговый набор способов на странице оплаты зависит также от настроек вашего личного кабинета PayKeeper.</p>

            {testResult ? <p className={`mt-3 rounded-md px-3 py-2 text-sm ${testResult.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{testResult.ok ? '✓ ' : '✕ '}{testResult.message}</p> : null}
            {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Button onClick={save} disabled={busy || testing}>{busy ? 'Сохранение…' : 'Сохранить'}</Button>
              <Button variant="secondary" onClick={test} disabled={busy || testing}>{testing ? 'Проверка…' : 'Проверить подключение'}</Button>
              <Button variant="secondary" onClick={onClose} disabled={busy || testing}>Отмена</Button>
            </div>
            <p className="mt-2 text-xs text-dark-gray">Проверка запрашивает токен PayKeeper с указанными логином/паролем (пароль — введённый здесь или сохранённый).</p>
          </>
        )}
      </Card>
    </div>
  );
}

// ─── Настройка эквайринга ЮKassa (подключение + способы оплаты) ───
function YookassaSettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  useEsc(onClose);
  const [cfg, setCfg] = useState<YookassaAdminConfig | null>(null);
  const [secretKey, setSecretKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  useEffect(() => { void adminApi.financeYookassa().then(setCfg).catch(() => setErr('Не удалось загрузить настройки')); }, []);

  const set = (patch: Partial<YookassaAdminConfig>) => setCfg((p) => (p ? { ...p, ...patch } : p));
  const methodsCount = cfg ? Number(cfg.methods.card) + Number(cfg.methods.sbp) : 0;
  const toggleMethod = (id: 'card' | 'sbp') => {
    if (!cfg) return;
    if (cfg.methods[id] && methodsCount <= 1) { setErr('Оставьте хотя бы один способ оплаты'); return; }
    setErr('');
    set({ methods: { ...cfg.methods, [id]: !cfg.methods[id] } });
  };

  const save = async () => {
    if (!cfg) return;
    setBusy(true); setErr('');
    try {
      await adminApi.financeSaveYookassa({
        shopId: cfg.shopId,
        secretKey: secretKey || undefined,
        card: cfg.methods.card,
        sbp: cfg.methods.sbp,
      });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка сохранения'); } finally { setBusy(false); }
  };

  const test = async () => {
    if (!cfg) return;
    setTesting(true); setErr(''); setTestResult(null);
    try {
      const r = await adminApi.financeTestYookassa({ shopId: cfg.shopId, secretKey: secretKey || undefined });
      setTestResult(r);
    } catch (e) { setTestResult({ ok: false, message: e instanceof Error ? e.message : 'Ошибка проверки' }); } finally { setTesting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="max-h-[90vh] w-full max-w-lg overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xl font-light text-ink">ЮKassa</p>
          {cfg ? <span className={`rounded-full px-2 py-0.5 text-xs ${cfg.connected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{cfg.connected ? 'Подключено' : 'Не настроено'}</span> : null}
        </div>
        <p className="mb-5 text-sm text-dark-gray">Приём онлайн-оплаты через ЮKassa. Реквизиты — в личном кабинете ЮKassa (Настройки → Магазин): идентификатор магазина (shopId) и секретный ключ API. ЮKassa сама формирует чек (54-ФЗ).</p>

        {!cfg ? <p className="text-sm text-dark-gray">Загрузка…</p> : (
          <>
            <p className="mb-2 text-sm font-medium text-ink">Данные для подключения</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Идентификатор магазина (shopId)</label>
                <input value={cfg.shopId} onChange={(e) => set({ shopId: e.target.value })} className={fieldCls} placeholder="напр. 123456" autoComplete="off" />
              </div>
              <div>
                <label className={labelCls}>Секретный ключ API</label>
                <input type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} className={fieldCls} autoComplete="new-password" placeholder={cfg.secretKeySet ? '•••••••• (задан — оставьте пустым, чтобы не менять)' : 'live_… или test_…'} />
                <p className="mt-1 text-xs text-dark-gray">Хранится в зашифрованном виде и обратно не показывается.</p>
              </div>
            </div>

            <p className="mb-2 mt-6 text-sm font-medium text-ink">Способы оплаты</p>
            <div className="space-y-2">
              {PAY_METHODS.map((m) => (
                <label key={m.id} className="flex items-start gap-3 rounded-md border border-ink/10 px-3 py-2.5">
                  <input type="checkbox" className="mt-1" checked={cfg.methods[m.id]} onChange={() => toggleMethod(m.id)} />
                  <span>
                    <span className="block text-sm font-medium text-ink">{m.label}</span>
                    <span className="block text-xs text-dark-gray">{m.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-dark-gray">Итоговый набор способов на странице оплаты зависит также от подключённых методов в личном кабинете ЮKassa.</p>

            {testResult ? <p className={`mt-3 rounded-md px-3 py-2 text-sm ${testResult.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{testResult.ok ? '✓ ' : '✕ '}{testResult.message}</p> : null}
            {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Button onClick={save} disabled={busy || testing}>{busy ? 'Сохранение…' : 'Сохранить'}</Button>
              <Button variant="secondary" onClick={test} disabled={busy || testing}>{testing ? 'Проверка…' : 'Проверить подключение'}</Button>
              <Button variant="secondary" onClick={onClose} disabled={busy || testing}>Отмена</Button>
            </div>
            <p className="mt-2 text-xs text-dark-gray">Проверка делает запрос к API ЮKassa с указанными shopId и ключом (ключ — введённый здесь или ранее сохранённый).</p>
          </>
        )}
      </Card>
    </div>
  );
}

// ─── Фискализация чеков (54-ФЗ) ───
const FISCAL_LABEL: Record<string, string> = { none: 'Выключена', mock: 'Эмуляция (dev)', atol: 'АТОЛ Онлайн' };

function FiscalPanel() {
  const [fiscal, setFiscal] = useState<FiscalStatus | null>(null);
  useEffect(() => { void adminApi.financeFiscal().then(setFiscal).catch(() => setFiscal(null)); }, []);

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-lg font-medium text-ink">Онлайн-касса (54-ФЗ)</p>
            <p className="mt-1 text-sm text-dark-gray">Автоматическая фискализация чеков прихода после успешной оплаты. Эквайринг Банка «Санкт-Петербург» чек в ОФД сам не формирует, поэтому для него нужна отдельная онлайн-касса. ЮKassa фискализирует сама — тогда фискализацию можно не включать.</p>
          </div>
          {fiscal ? (
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${fiscal.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-ink/10 text-dark-gray'}`}>
              {fiscal.enabled ? 'Включена' : 'Выключена'}
            </span>
          ) : null}
        </div>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-dark-gray">Провайдер</dt>
          <dd className="text-ink">{fiscal ? (FISCAL_LABEL[fiscal.provider] ?? fiscal.provider) : '—'}</dd>
          <dt className="text-dark-gray">Статус</dt>
          <dd className="text-ink">{fiscal ? (fiscal.enabled ? 'Чеки пробиваются автоматически при оплате' : 'Чеки нашей системой не пробиваются') : '—'}</dd>
        </dl>
        <p className="mt-4 rounded-md bg-ink/[0.03] px-3 py-2 text-xs text-dark-gray">Провайдер и учётные данные онлайн-кассы задаются в конфигурации сервера (FISCAL_PROVIDER=none/mock/atol и параметры АТОЛ). После смены значения перезапустите API. Каждая фискализация фиксируется в журнале сервера.</p>
      </Card>
    </div>
  );
}

// ─── Журнал изменений ───
function JournalTab() {
  const [items, setItems] = useState<FinanceAuditEntry[]>([]);
  useEffect(() => { void adminApi.financeAudit().then(setItems).catch(() => setItems([])); }, []);
  const ACTION: Record<string, string> = { created: 'создано', updated: 'изменено', deleted: 'удалено' };
  const ENTITY: Record<string, string> = { LegalEntity: 'Реквизиты', FinanceIntegration: 'Интеграция', PaymentMethods: 'Способы оплаты' };
  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-dark-gray"><th className="px-4 py-2.5 font-medium">Дата</th><th className="px-4 py-2.5 font-medium">Раздел</th><th className="px-4 py-2.5 font-medium">Действие</th><th className="px-4 py-2.5 font-medium">Детали</th></tr></thead>
        <tbody>
          {items.length === 0 ? <tr><td colSpan={4} className="px-4 py-6 text-center text-dark-gray">Записей пока нет.</td></tr> : null}
          {items.map((r) => (
            <tr key={r.id} className="border-b border-ink/5 last:border-0">
              <td className="whitespace-nowrap px-4 py-2 text-dark-gray">{new Date(r.at).toLocaleString('ru-RU')}</td>
              <td className="px-4 py-2 text-ink">{ENTITY[r.entity] ?? r.entity}</td>
              <td className="px-4 py-2 text-ink">{ACTION[r.action] ?? r.action}</td>
              <td className="px-4 py-2 text-dark-gray">{r.payload ? renderPayload(r.payload) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
function renderPayload(p: Record<string, unknown>): ReactNode {
  const parts = Object.entries(p).map(([k, v]) => `${k}: ${String(v)}`);
  return parts.join(' · ');
}

/** Загрузка скана подписи/печати (для счетов). */
function ScanField({ label, url, onChange }: { label: string; url: string | null; onChange: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try { const r = await adminApi.uploadImage(file); onChange(r.url); } catch { /* ignore */ } finally { setBusy(false); }
  };
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="flex items-center gap-3">
        {url ? <img src={fileUrl(url)} alt={label} className="h-12 w-20 rounded border border-ink/10 object-contain" /> : <div className="flex h-12 w-20 items-center justify-center rounded border border-dashed border-ink/20 text-xs text-dark-gray">нет</div>}
        <label className="cursor-pointer rounded-md border border-ink/20 px-3 py-1.5 text-sm text-ink hover:bg-ink/5">
          {busy ? 'Загрузка…' : url ? 'Заменить' : 'Загрузить'}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        </label>
        {url ? <button type="button" onClick={() => onChange('')} className="text-xs text-red-600 hover:underline">убрать</button> : null}
      </div>
    </div>
  );
}
