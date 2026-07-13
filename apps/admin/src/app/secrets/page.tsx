'use client';

import { useEffect, useState } from 'react';
import { Button, Card } from '@dha/ui';
import { adminApi, type AclSubjectsCatalog, type SecretInput, type SecretRow, type SecretTaskRow, type SecretViewRow } from '../../lib/api';
import { useAdminMe, useRequireAdmin } from '../../lib/use-admin';
import { AccessModal } from '../../components/AccessModal';

/** Скрываем раскрытый пароль автоматически через 20 секунд. */
const REVEAL_TTL_MS = 20_000;

const emptyForm: SecretInput = { name: '', login: '', password: '', url: '', comment: '', responsibleId: '' };

/**
 * Модуль «Секреты» (KB-DRIVE-TZ.md §8): пароли внешних кабинетов (Островок, банк,
 * соцсети…) вместо страниц БЗ. Каждое раскрытие пишется в журнал; при увольнении
 * сотрудника автоматически создаются задачи на ротацию.
 */
export default function SecretsPage() {
  const ready = useRequireAdmin();
  const me = useAdminMe();
  const canManage = me?.permissions.includes('secrets_manage') ?? false;

  const [secrets, setSecrets] = useState<SecretRow[]>([]);
  const [tasks, setTasks] = useState<SecretTaskRow[]>([]);
  const [subjects, setSubjects] = useState<AclSubjectsCatalog | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [views, setViews] = useState<{ secret: SecretRow; rows: SecretViewRow[] } | null>(null);
  const [access, setAccess] = useState<SecretRow | null>(null);
  const [editing, setEditing] = useState<SecretRow | 'new' | null>(null);
  const [form, setForm] = useState<SecretInput>(emptyForm);
  const [error, setError] = useState('');

  const load = () => Promise.all([
    adminApi.secretsList().then(setSecrets),
    adminApi.secretTasks().then(setTasks),
  ]).catch((e) => setError((e as Error).message));
  useEffect(() => {
    if (!ready) return;
    void load();
    if (canManage) void adminApi.aclSubjects().then(setSubjects).catch(() => undefined);
  }, [ready, canManage]);

  const userName = (id: string | null) => {
    if (!id || !subjects) return id ?? '—';
    const u = subjects.users.find((x) => x.id === id);
    return u ? (u.name ?? u.email) : id;
  };

  async function reveal(s: SecretRow, copy: boolean) {
    try {
      const { password } = await adminApi.secretReveal(s.id);
      if (copy) {
        await navigator.clipboard.writeText(password);
        setCopiedId(s.id);
        setTimeout(() => setCopiedId(null), 1500);
      } else {
        setRevealed((r) => ({ ...r, [s.id]: password }));
        setTimeout(() => setRevealed((r) => {
          const { [s.id]: _hidden, ...rest } = r;
          return rest;
        }), REVEAL_TTL_MS);
      }
      void adminApi.secretsList().then(setSecrets); // счётчик просмотров
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function startEdit(s: SecretRow | 'new') {
    setEditing(s);
    setForm(s === 'new' ? emptyForm : { name: s.name, login: s.login ?? '', password: '', url: s.url ?? '', comment: s.comment ?? '', responsibleId: s.responsibleId ?? '' });
  }

  async function save() {
    setError('');
    try {
      if (editing === 'new') await adminApi.secretCreate(form);
      else if (editing) await adminApi.secretUpdate(editing.id, { ...form, password: form.password || undefined });
      setEditing(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function closeTask(t: SecretTaskRow, dismiss: boolean) {
    if (dismiss) {
      if (!confirm(`Отклонить задачу по «${t.secret.name}» (ротация не нужна)?`)) return;
      await adminApi.secretTaskClose(t.id, { dismiss: true }).catch((e) => setError((e as Error).message));
    } else {
      const newPassword = prompt(`Новый пароль для «${t.secret.name}» (после смены в самом кабинете):`);
      if (!newPassword) return;
      await adminApi.secretTaskClose(t.id, { newPassword }).catch((e) => setError((e as Error).message));
    }
    await load();
  }

  const openTasks = tasks.filter((t) => t.status === 'OPEN');

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <div className="mb-2 flex items-center gap-4">
        <h1 className="text-3xl font-light text-ink">Секреты</h1>
        <span className="grow" />
        {canManage && <Button onClick={() => startEdit('new')}>+ Секрет</Button>}
      </div>
      <p className="mb-4 text-sm text-dark-gray">
        Пароли внешних кабинетов хранятся здесь в зашифрованном виде — не в базе знаний. Каждое раскрытие
        попадает в журнал; при увольнении сотрудника система сама создаст задачи на ротацию.
      </p>
      {error && <p className="mb-3 cursor-pointer rounded bg-red-50 px-3 py-1.5 text-sm text-red-700" onClick={() => setError('')}>{error}</p>}

      {openTasks.length > 0 && (
        <Card className="mb-4 border-amber-200 bg-amber-50/40">
          <p className="mb-2 font-medium text-amber-900">Ротация паролей: открытых задач — {openTasks.length}</p>
          {openTasks.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 border-t border-amber-100 py-1.5 text-sm first:border-0">
              <span className="font-medium text-ink">{t.secret.name}</span>
              {t.offboardedUser && <span className="text-amber-800">уволен: {t.offboardedUser}</span>}
              <span className="text-neutral-500">ответственный: {t.assignee ?? '—'}</span>
              {t.secret.url && <a href={t.secret.url} target="_blank" rel="noreferrer" className="text-indigo-600 underline">открыть кабинет ↗</a>}
              <span className="grow" />
              <button className="text-emerald-700 hover:underline" onClick={() => void closeTask(t, false)}>пароль сменён — ввести новый</button>
              <button className="text-neutral-500 hover:underline" onClick={() => void closeTask(t, true)}>отклонить</button>
            </div>
          ))}
        </Card>
      )}

      <Card className="p-0">
        {secrets.length === 0 && <p className="p-6 text-dark-gray">Секретов пока нет.</p>}
        {secrets.map((s) => (
          <div key={s.id} className="border-b border-neutral-100 px-4 py-2.5 last:border-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="min-w-40 font-medium text-ink">🔑 {s.name}</span>
              {s.login && (
                <button
                  className="text-sm text-neutral-600 hover:underline"
                  title="Скопировать логин"
                  onClick={() => void navigator.clipboard.writeText(s.login!)}
                >
                  {s.login} ⧉
                </button>
              )}
              {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 underline">кабинет ↗</a>}
              {(s._count?.tasks ?? 0) > 0 && <span className="rounded bg-amber-100 px-1.5 text-[11px] text-amber-800">ротация!</span>}
              <span className="grow" />
              <span className="text-xs text-neutral-400">
                {s.rotatedAt ? `пароль от ${new Date(s.rotatedAt).toLocaleDateString('ru')}` : ''} · просмотров: {s._count?.views ?? 0}
              </span>
              <div className="flex gap-2 text-xs">
                <button className="text-indigo-600 hover:underline" onClick={() => void reveal(s, false)}>показать</button>
                <button className="text-indigo-600 hover:underline" onClick={() => void reveal(s, true)}>{copiedId === s.id ? '✓' : 'копировать'}</button>
                {canManage && <button className="text-indigo-600 hover:underline" onClick={() => setAccess(s)}>доступы</button>}
                {canManage && <button className="text-neutral-500 hover:underline" onClick={() => void adminApi.secretViews(s.id).then((rows) => setViews({ secret: s, rows }))}>журнал</button>}
                {canManage && <button className="text-neutral-500 hover:underline" onClick={() => startEdit(s)}>✎</button>}
                {canManage && (
                  <button
                    className="text-red-500 hover:underline"
                    onClick={() => { if (confirm(`Удалить секрет «${s.name}»?`)) void adminApi.secretDelete(s.id).then(load); }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            {revealed[s.id] && (
              <p className="mt-1 rounded bg-neutral-900 px-3 py-1.5 font-mono text-sm text-emerald-300">
                {revealed[s.id]} <span className="ml-2 text-xs text-neutral-400">(скроется через 20 с; раскрытие записано в журнал)</span>
              </p>
            )}
            {s.comment && <p className="mt-0.5 text-xs text-neutral-500">{s.comment}</p>}
          </div>
        ))}
      </Card>

      {views && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setViews(null)}>
          <div className="max-h-[70vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-2 text-lg text-ink">Журнал раскрытий: {views.secret.name}</p>
            {views.rows.length === 0 && <p className="text-sm text-dark-gray">Пароль ещё никто не раскрывал.</p>}
            {views.rows.map((v) => (
              <div key={v.id} className="flex items-center gap-3 border-t border-neutral-100 py-1 text-sm first:border-0">
                <span className="text-ink">{v.userName}</span>
                <span className="grow" />
                <span className="text-xs text-neutral-400">{new Date(v.at).toLocaleString('ru')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-lg text-ink">{editing === 'new' ? 'Новый секрет' : `Изменить: ${editing.name}`}</p>
            <div className="space-y-2 text-sm">
              <input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Название (например, «Экстранет Островок»)" className="w-full rounded border border-neutral-300 px-3 py-2" />
              <input value={form.login ?? ''} onChange={(e) => setForm({ ...form, login: e.target.value })} placeholder="Логин" className="w-full rounded border border-neutral-300 px-3 py-2" />
              <input value={form.password ?? ''} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editing === 'new' ? 'Пароль/ключ' : 'Новый пароль (пусто — не менять)'} className="w-full rounded border border-neutral-300 px-3 py-2 font-mono" />
              <input value={form.url ?? ''} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="URL кабинета" className="w-full rounded border border-neutral-300 px-3 py-2" />
              <input value={form.comment ?? ''} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder="Комментарий" className="w-full rounded border border-neutral-300 px-3 py-2" />
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">Ответственный за ротацию (ему падают задачи при увольнениях)</span>
                <select value={form.responsibleId ?? ''} onChange={(e) => setForm({ ...form, responsibleId: e.target.value })} className="w-full rounded border border-neutral-300 px-3 py-2">
                  <option value="">— не назначен —</option>
                  {(subjects?.users ?? []).map((u) => (
                    <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100" onClick={() => setEditing(null)}>Отмена</button>
              <Button onClick={() => void save()}>Сохранить</Button>
            </div>
          </div>
        </div>
      )}

      {access && (
        <AccessModal resourceType="secret" resourceId={access.id} title={access.name} onClose={() => { setAccess(null); void load(); }} />
      )}
    </main>
  );
}
