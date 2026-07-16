'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input } from '@dha/ui';
import { adminApi, type PmsProperty, type PmsPropertyInput } from '../../../lib/api';
import { MapPicker } from '../../../components/MapPicker';

const selectCls = 'w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm';

const KIND_LABEL: Record<PmsProperty['kind'], string> = {
  HOTEL: 'Отель',
  APARTMENT: 'Апартаменты / квартиры',
  MINI_HOTEL: 'Мини-отель',
};
const KINDS: PmsProperty['kind'][] = ['HOTEL', 'APARTMENT', 'MINI_HOTEL'];
const DISTRICTS: { value: string; label: string }[] = [
  { value: '', label: '— не указан —' },
  { value: 'GOLDEN_TRIANGLE', label: 'Золотой треугольник' },
  { value: 'NEVSKY_PROSPECT', label: 'Невский проспект' },
  { value: 'MOSCOW_STATION', label: 'Московский вокзал' },
  { value: 'MARIINSKY_NEW_HOLLAND', label: 'Мариинский / Новая Голландия' },
  { value: 'TAVRICHESKY_GARDEN', label: 'Таврический сад' },
];

type FormState = {
  name: string; kind: PmsProperty['kind']; district: string; city: string; address: string;
  checkInTime: string; checkOutTime: string; wifiName: string; wifiPassword: string;
  description: string; houseRules: string; instructions: string; securityDeposit: string;
  amenities: string; features: string; photos: string; latitude: string; longitude: string; active: boolean;
  autoCheckin: boolean; perRoomInstructions: boolean;
};

const emptyForm = (): FormState => ({
  name: '', kind: 'APARTMENT', district: '', city: 'Санкт-Петербург', address: '',
  checkInTime: '14:00', checkOutTime: '12:00', wifiName: '', wifiPassword: '',
  description: '', houseRules: '', instructions: '', securityDeposit: '', amenities: '', features: '', photos: '', latitude: '', longitude: '', active: true,
  autoCheckin: false, perRoomInstructions: false,
});

const toForm = (p: PmsProperty): FormState => ({
  name: p.name, kind: p.kind, district: p.district ?? '', city: p.city, address: p.address,
  checkInTime: p.checkInTime ?? '', checkOutTime: p.checkOutTime ?? '', wifiName: p.wifiName ?? '', wifiPassword: p.wifiPassword ?? '',
  description: p.description ?? '', houseRules: p.houseRules ?? '', instructions: p.instructions ?? '', securityDeposit: p.securityDeposit != null ? String(p.securityDeposit) : '',
  amenities: p.amenities.join(', '), features: p.features.join(', '), photos: p.photos.join('\n'),
  latitude: p.latitude != null ? String(p.latitude) : '', longitude: p.longitude != null ? String(p.longitude) : '', active: p.active,
  autoCheckin: p.autoCheckin ?? false, perRoomInstructions: p.perRoomInstructions ?? false,
});

const splitList = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

/** Вкладка «Объекты»: список объектов сети + полная карточка создания/редактирования (§12). */
export function ObjectsTab({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<PmsProperty[]>([]);
  const [editing, setEditing] = useState<PmsProperty | 'new' | null>(null);
  const [error, setError] = useState('');

  const load = () => adminApi.pmsProperties().then(setItems).catch(() => undefined);
  useEffect(() => { void load(); }, []);

  const toggleActive = (p: PmsProperty) => {
    void adminApi.pmsUpdateProperty(p.id, { active: !p.active }).then(() => { void load(); onChanged(); }).catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  };

  const remove = (p: PmsProperty) => {
    const rooms = p._count?.rooms ?? 0;
    const cats = p._count?.roomTypes ?? 0;
    if (!confirm(`Удалить объект «${p.name}»?${cats || rooms ? ` Вместе с ним удалятся категории (${cats}) и номера (${rooms}).` : ''} Действие необратимо.`)) return;
    setError('');
    void adminApi.pmsDeleteProperty(p.id).then(() => { void load(); onChanged(); }).catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  };

  if (editing) {
    return <PropertyForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); onChanged(); }} />;
  }

  return (
    <div>
      <div className="mb-4"><Button onClick={() => setEditing('new')}>+ Добавить объект</Button></div>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {items.length === 0 ? <p className="text-sm text-dark-gray">Объектов пока нет. Создайте первый — он появится при выборе объекта в категориях, номерах и на шахматке.</p> : (
        <div className="overflow-hidden rounded-lg border border-ink/10">
          {items.map((p) => (
            <div key={p.id} className="flex items-center gap-3 border-b border-ink/5 bg-white px-4 py-2.5 text-sm last:border-b-0">
              <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-medium text-primary-700">{KIND_LABEL[p.kind]}</span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-ink">{p.name}</span>
                <span className="text-dark-gray"> · {p.city}{p.address ? `, ${p.address}` : ''}</span>
              </span>
              <span className="shrink-0 text-xs text-dark-gray">{p._count?.roomTypes ?? 0} кат. · {p._count?.rooms ?? 0} ном.</span>
              <button type="button" onClick={() => toggleActive(p)} className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${p.active ? 'bg-emerald-100 text-emerald-800' : 'bg-ink/10 text-dark-gray'}`}>{p.active ? 'Активен' : 'Скрыт'}</button>
              <button type="button" onClick={() => setEditing(p)} className="shrink-0 rounded px-2 py-1 text-xs text-primary hover:bg-primary-50">Редактировать</button>
              <button type="button" onClick={() => remove(p)} className="shrink-0 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">Удалить</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PropertyForm({ initial, onClose, onSaved }: { initial: PmsProperty | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<FormState>(initial ? toForm(initial) : emptyForm());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch: Partial<FormState>) => setF((s) => ({ ...s, ...patch }));

  const body = useMemo<PmsPropertyInput>(() => ({
    name: f.name, kind: f.kind,
    district: (f.district || null) as PmsPropertyInput['district'],
    city: f.city, address: f.address,
    checkInTime: f.checkInTime || null, checkOutTime: f.checkOutTime || null,
    wifiName: f.wifiName || null, wifiPassword: f.wifiPassword || null,
    description: f.description || null, houseRules: f.houseRules || null, instructions: f.instructions || null,
    securityDeposit: f.securityDeposit ? Number(f.securityDeposit) : null,
    amenities: splitList(f.amenities), features: splitList(f.features), photos: splitList(f.photos),
    latitude: f.latitude ? Number(f.latitude) : null, longitude: f.longitude ? Number(f.longitude) : null,
    active: f.active,
    autoCheckin: f.autoCheckin, perRoomInstructions: f.perRoomInstructions,
  }), [f]);

  const save = async () => {
    if (!f.name.trim()) { setError('Укажите название объекта'); return; }
    setBusy(true); setError('');
    try {
      if (initial) await adminApi.pmsUpdateProperty(initial.id, body);
      else await adminApi.pmsCreateProperty(body);
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); } finally { setBusy(false); }
  };

  return (
    <div>
      <button type="button" onClick={onClose} className="mb-3 text-sm text-primary hover:underline">← К списку объектов</button>
      <Card className="space-y-6">
        <div>
          <h2 className="mb-1 text-xl font-light text-ink">{initial ? `Объект: ${initial.name}` : 'Новый объект'}</h2>
          <p className="text-sm text-dark-gray">Полная карточка: основное, практическое для гостя и контент.</p>
        </div>

        <Section title="Основное">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input id="p-name" label="Название" value={f.name} onChange={(e) => set({ name: e.target.value })} />
            <label className="block text-sm"><span className="mb-1 block text-xs text-dark-gray">Тип объекта</span>
              <select value={f.kind} onChange={(e) => set({ kind: e.target.value as PmsProperty['kind'] })} className={selectCls}>
                {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </label>
            <label className="block text-sm"><span className="mb-1 block text-xs text-dark-gray">Район</span>
              <select value={f.district} onChange={(e) => set({ district: e.target.value })} className={selectCls}>
                {DISTRICTS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </label>
            <Input id="p-city" label="Город" value={f.city} onChange={(e) => set({ city: e.target.value })} />
            <Input id="p-addr" label="Адрес" className="sm:col-span-2" value={f.address} onChange={(e) => set({ address: e.target.value })} />
          </div>
          <div className="mt-3">
            <p className="mb-1 text-xs text-dark-gray">Точка на карте — введите адрес и выберите из подсказок или кликните по карте; координаты и адрес заполнятся автоматически.</p>
            <MapPicker
              lat={f.latitude ? Number(f.latitude) : null}
              lng={f.longitude ? Number(f.longitude) : null}
              address={f.address}
              onChange={(lat, lng) => set({ latitude: String(lat), longitude: String(lng) })}
              onAddressChange={(address) => set({ address })}
            />
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} /> Активен (виден при выборе объекта)</label>
        </Section>

        <Section title="Практическое для гостя">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input id="p-ci" label="Время заезда" value={f.checkInTime} onChange={(e) => set({ checkInTime: e.target.value })} />
            <Input id="p-co" label="Время выезда" value={f.checkOutTime} onChange={(e) => set({ checkOutTime: e.target.value })} />
            <Input id="p-wifi" label="Wi-Fi (имя сети)" value={f.wifiName} onChange={(e) => set({ wifiName: e.target.value })} />
            <Input id="p-wifipwd" label="Wi-Fi (пароль)" value={f.wifiPassword} onChange={(e) => set({ wifiPassword: e.target.value })} />
            <Input id="p-deposit" label="Залог по умолчанию, ₽" type="number" value={f.securityDeposit} onChange={(e) => set({ securityDeposit: e.target.value })} />
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={f.autoCheckin} onChange={(e) => set({ autoCheckin: e.target.checked })} />
            Автозаезд: при выдаче ключа воронка сама переводит бронь в «Заселён» (без стойки)
          </label>
          <Field label="Правила дома"><textarea value={f.houseRules} onChange={(e) => set({ houseRules: e.target.value })} rows={2} className={selectCls} /></Field>
          <Field label={f.perRoomInstructions ? 'Инструкция по заселению (общая — фолбэк, если у номера нет своей)' : 'Инструкция по заселению'}><textarea value={f.instructions} onChange={(e) => set({ instructions: e.target.value })} rows={2} className={selectCls} /></Field>
          <label className="mt-1 flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" checked={f.perRoomInstructions} onChange={(e) => set({ perRoomInstructions: e.target.checked })} className="mt-0.5" />
            <span>Режим апартаментов: у каждого номера своя инструкция по заселению<br />
              <span className="text-xs text-dark-gray">Инструкции задаются в карточках номеров (Номерной фонд → Номера). Гость видит инструкцию своего юнита после регистрации и оплаты.</span>
            </span>
          </label>
        </Section>

        <Section title="Контент">
          <Field label="Описание"><textarea value={f.description} onChange={(e) => set({ description: e.target.value })} rows={3} className={selectCls} /></Field>
          <Field label="Удобства (через запятую)"><input value={f.amenities} onChange={(e) => set({ amenities: e.target.value })} className={selectCls} placeholder="Кондиционер, Кухня, Стиральная машина" /></Field>
          <Field label="Особенности (через запятую)"><input value={f.features} onChange={(e) => set({ features: e.target.value })} className={selectCls} placeholder="Вид на канал, Дизайнерский ремонт" /></Field>
          <Field label="Фото (по одному URL в строке)"><textarea value={f.photos} onChange={(e) => set({ photos: e.target.value })} rows={2} className={selectCls} placeholder="https://…" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input id="p-lat" label="Широта" value={f.latitude} onChange={(e) => set({ latitude: e.target.value })} />
            <Input id="p-lng" label="Долгота" value={f.longitude} onChange={(e) => set({ longitude: e.target.value })} />
          </div>
        </Section>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Отмена</Button>
          <Button onClick={save} disabled={busy}>{busy ? 'Сохранение…' : initial ? 'Сохранить' : 'Создать объект'}</Button>
        </div>
      </Card>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-ink/10 pt-4 first:border-t-0 first:pt-0">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-dark-gray">{title}</p>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mt-3 block text-sm"><span className="mb-1 block text-xs text-dark-gray">{label}</span>{children}</label>;
}
