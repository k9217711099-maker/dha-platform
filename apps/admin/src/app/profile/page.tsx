'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Card } from '@dha/ui';
import { adminApi, fileUrl, type EmployeeCard } from '../../lib/api';
import { useRequireAdmin } from '../../lib/use-admin';
import { DatePicker } from '../../components/DatePicker';

/** «Мой профиль» (§6, self-service): сотрудник заполняет свои поля; часть полей — только руководитель (read-only). */
export default function ProfilePage() {
  const ready = useRequireAdmin();
  const [card, setCard] = useState<EmployeeCard | null>(null);
  const [phone, setPhone] = useState('');
  const [birthday, setBirthday] = useState('');
  const [hobby, setHobby] = useState('');
  const [about, setAbout] = useState('');
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const apply = (c: EmployeeCard) => {
    setCard(c);
    setPhone(c.phone ?? '');
    setBirthday(c.birthday ? c.birthday.slice(0, 10) : '');
    setHobby(c.hobby ?? '');
    setAbout(c.about ?? '');
    setCustom(c.customFields ?? {});
  };
  useEffect(() => { if (ready) void adminApi.myProfile().then(apply).catch(() => undefined); }, [ready]);

  if (!ready || !card) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  const selfFields = card.fieldDefs.filter((d) => d.editableBy === 'SELF' || d.editableBy === 'BOTH');
  const mgrFields = card.fieldDefs.filter((d) => d.editableBy === 'MANAGER');

  const save = async () => {
    setSaving(true); setMsg('');
    try { apply(await adminApi.updateMyProfile({ phone, birthday: birthday || null, hobby, about, customFields: custom })); setMsg('Сохранено'); }
    catch { setMsg('Ошибка сохранения'); } finally { setSaving(false); }
  };
  const onPhoto = async (f: File) => { const r = await adminApi.uploadMyPhoto(f).catch(() => null); if (r) setCard({ ...card, avatarUrl: r.avatarUrl }); };

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-1 text-3xl font-light text-ink">Мой профиль</h1>
      <p className="mb-6 text-sm text-dark-gray">Заполните свои данные. Поля с пометкой «заполняет руководитель» доступны только для чтения.</p>

      <Card className="mb-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            {card.avatarUrl ? <img src={fileUrl(card.avatarUrl)} alt="" className="h-20 w-20 rounded-full object-cover" /> : <span className="grid h-20 w-20 place-items-center rounded-full bg-primary-100 text-2xl font-bold text-primary-700">{(card.name ?? card.email).slice(0, 2).toUpperCase()}</span>}
            <button type="button" onClick={() => fileRef.current?.click()} className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-primary text-white shadow hover:opacity-90" title="Загрузить фото">✎</button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPhoto(f); e.target.value = ''; }} />
          </div>
          <div>
            <p className="text-lg font-medium text-ink">{card.name ?? '—'}</p>
            <p className="text-sm text-dark-gray">{card.email}</p>
            <p className="mt-0.5 text-xs text-slate-400">{[card.positionName, card.roleName].filter(Boolean).join(' · ')}{card.groupNames?.length ? ` · ${card.groupNames.join(', ')}` : ''}</p>
          </div>
        </div>
      </Card>

      <Card className="mb-4 space-y-4">
        <p className="text-sm font-medium text-ink">Личные данные</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-dark-gray">Телефон
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7…" className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 text-sm" />
          </label>
          <div className="text-sm text-dark-gray">Дата рождения
            <div className="mt-1"><DatePicker value={birthday} onChange={(d) => setBirthday(d ?? '')} placeholder="Выберите дату" /></div>
          </div>
          <label className="text-sm text-dark-gray sm:col-span-2">Хобби
            <input value={hobby} onChange={(e) => setHobby(e.target.value)} placeholder="Чем увлекаетесь" className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm text-dark-gray sm:col-span-2">О себе
            <textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={3} placeholder="Пара слов о себе — увидят коллеги в вашем профиле" className="mt-1 w-full resize-y rounded-md border border-ink/20 px-3 py-2 text-sm" />
          </label>
        </div>
        {selfFields.length ? (
          <div className="space-y-3 border-t border-ink/5 pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Дополнительно</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {selfFields.map((d) => (
                <label key={d.id} className="text-sm text-dark-gray">{d.name}
                  <input value={custom[d.id] ?? ''} onChange={(e) => setCustom((c) => ({ ...c, [d.id]: e.target.value }))} className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 text-sm" />
                </label>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          <Button onClick={() => void save()} disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</Button>
          {msg ? <span className={`text-sm ${msg === 'Сохранено' ? 'text-emerald-600' : 'text-rose-600'}`}>{msg}</span> : null}
        </div>
      </Card>

      {(card.hireDate || mgrFields.length) ? (
        <Card className="space-y-2 bg-slate-50/50">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Заполняет руководитель</p>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            {card.hireDate ? <p className="text-dark-gray">Дата приёма: <span className="text-ink">{new Date(card.hireDate).toLocaleDateString('ru-RU')}</span></p> : null}
            {mgrFields.map((d) => <p key={d.id} className="text-dark-gray">{d.name}: <span className="text-ink">{card.customFields?.[d.id] ?? '—'}</span></p>)}
          </div>
        </Card>
      ) : null}
    </main>
  );
}
