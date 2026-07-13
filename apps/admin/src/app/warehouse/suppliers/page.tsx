'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Input } from '@dha/ui';
import { adminApi, type WhSupplier } from '../../../lib/api';
import { useRequireAdmin } from '../../../lib/use-admin';

interface Form {
  name: string;
  inn: string;
  contactName: string;
  phone: string;
  email: string;
  paymentTerms: string;
}
const EMPTY: Form = { name: '', inn: '', contactName: '', phone: '', email: '', paymentTerms: '' };

export default function WarehouseSuppliersPage() {
  const ready = useRequireAdmin();
  const [items, setItems] = useState<WhSupplier[]>([]);
  const [form, setForm] = useState<Form>({ ...EMPTY });
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => adminApi.whSuppliers().then(setItems).catch((e) => setError(e.message));
  useEffect(() => {
    if (ready) void load();
  }, [ready]);

  function startEdit(s: WhSupplier) {
    setEditId(s.id);
    setForm({
      name: s.name,
      inn: s.inn ?? '',
      contactName: s.contactName ?? '',
      phone: s.phone ?? '',
      email: s.email ?? '',
      paymentTerms: s.paymentTerms ?? '',
    });
  }
  function reset() {
    setEditId(null);
    setForm({ ...EMPTY });
  }

  async function save() {
    if (!form.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: form.name.trim(),
        inn: form.inn.trim() || undefined,
        contactName: form.contactName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        paymentTerms: form.paymentTerms.trim() || undefined,
      };
      if (editId) await adminApi.whUpdateSupplier(editId, body);
      else await adminApi.whCreateSupplier(body);
      reset();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <main className="px-6 py-10 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-4 py-6 sm:px-8 sm:py-8">
      <h1 className="mb-1 text-3xl font-light text-ink">Склад · Поставщики</h1>
      <p className="mb-5 text-sm text-dark-gray">Справочник поставщиков (§4.6).</p>

      <Card className="mb-6 space-y-3">
        <h2 className="text-lg text-ink">{editId ? 'Редактирование' : 'Новый поставщик'}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input id="name" label="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input id="inn" label="ИНН" value={form.inn} onChange={(e) => setForm({ ...form, inn: e.target.value })} />
          <Input id="contact" label="Контактное лицо" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          <Input id="phone" label="Телефон" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input id="email" label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input id="terms" label="Условия оплаты" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <Button onClick={() => void save()} disabled={busy}>
            {editId ? 'Сохранить' : 'Добавить'}
          </Button>
          {editId && (
            <Button variant="secondary" onClick={reset}>
              Отмена
            </Button>
          )}
        </div>
      </Card>

      <div className="space-y-2">
        {items.map((s) => (
          <Card key={s.id} className="flex items-center justify-between py-3">
            <div>
              <p className={s.active ? 'text-ink' : 'text-dark-gray line-through'}>{s.name}</p>
              <p className="text-xs text-dark-gray">
                {[s.inn && `ИНН ${s.inn}`, s.contactName, s.phone, s.email].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
            <Button variant="secondary" onClick={() => startEdit(s)}>
              Изменить
            </Button>
          </Card>
        ))}
      </div>
    </main>
  );
}
