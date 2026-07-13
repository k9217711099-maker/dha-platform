'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card } from '@dha/ui';
import {
  adminApi,
  fileUrl,
  type BonusAwardRow,
  type BonusLeaderRow,
  type BonusOverview,
  type BonusRule,
  type BonusUserRow,
} from '../../lib/api';
import { useAdminMe, useRequireAdmin } from '../../lib/use-admin';

/** Понятные названия ролей для критериев/чипов (fallback — ключ роли). */
const ROLE_LABELS: Record<string, string> = {
  ops_maid: 'Горничная',
  pms_hk_supervisor: 'Супервайзер ХС',
  pms_engineer: 'Инженер',
  pms_frontdesk: 'Администратор',
  pms_gm: 'General Manager',
  pms_owner: 'Управляющий',
  spir_head: 'Руководитель СПиР',
  manager: 'Управляющий',
};
const roleLabel = (k: string | null | undefined) => (k ? (ROLE_LABELS[k] ?? k) : null);

const nf = (n: number) => n.toLocaleString('ru-RU');
const fmtDate = (s: string) => new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
const initials = (name: string) => name.trim().slice(0, 2).toUpperCase();

function Avatar({ url, name, cls = 'h-8 w-8' }: { url?: string | null; name: string; cls?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={fileUrl(url)} alt="" className={`${cls} shrink-0 rounded-full object-cover`} />
  ) : (
    <span className={`${cls} grid shrink-0 place-items-center rounded-full bg-primary-100 text-xs font-bold text-primary-700`}>{initials(name)}</span>
  );
}

/** Плашка баллов: зелёная для начисления, розовая для корректировки-минуса. */
function Points({ n, big = false }: { n: number; big?: boolean }) {
  const pos = n >= 0;
  return (
    <span className={`font-semibold ${pos ? 'text-emerald-600' : 'text-rose-600'} ${big ? 'text-2xl' : ''}`}>
      {pos ? '+' : '−'}{nf(Math.abs(n))}
    </span>
  );
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card className="flex-1">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-1 text-ink">{children}</div>
    </Card>
  );
}

type Tab = 'overview' | 'leaderboard' | 'award' | 'rules';

export default function BonusesPage() {
  const ready = useRequireAdmin();
  const me = useAdminMe();
  const canAward = me?.permissions.includes('bonus_award') ?? false;

  const [tab, setTab] = useState<Tab>('overview');
  const [ov, setOv] = useState<BonusOverview | null>(null);
  const [board, setBoard] = useState<BonusLeaderRow[]>([]);
  const [period, setPeriod] = useState<'all' | 'month'>('all');

  const reloadOverview = useCallback(() => {
    void adminApi.bonusMe().then(setOv).catch(() => undefined);
  }, []);
  useEffect(() => { if (ready) reloadOverview(); }, [ready, reloadOverview]);
  useEffect(() => {
    if (ready && tab === 'leaderboard') void adminApi.bonusLeaderboard(period).then(setBoard).catch(() => undefined);
  }, [ready, tab, period]);

  if (!ready || !me) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Обзор' },
    { key: 'leaderboard', label: 'Рейтинг команды' },
    ...(canAward ? ([{ key: 'award', label: 'Начислить' }, { key: 'rules', label: 'Критерии' }] as { key: Tab; label: string }[]) : []),
  ];

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="mb-1 text-3xl font-light text-ink">Бонусы команды</h1>
      <p className="mb-6 text-sm text-dark-gray">Нематериальное признание: руководители начисляют баллы за инициативу и результат. Это не баллы лояльности гостей.</p>

      {/* Мои показатели */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <StatCard label="Мой баланс"><span className="text-3xl font-semibold text-ink">{nf(ov?.balance ?? 0)}</span> <span className="text-sm text-slate-400">баллов</span></StatCard>
        <StatCard label="За этот месяц"><span className="text-2xl">{ov ? <Points n={ov.monthPoints} /> : '—'}</span></StatCard>
        <StatCard label="Моё место">{ov?.rank ? <><span className="text-3xl font-semibold text-ink">#{ov.rank}</span> <span className="text-sm text-slate-400">из {ov.totalPeople}</span></> : <span className="text-slate-400">—</span>}</StatCard>
      </div>

      {/* Вкладки */}
      <div className="mb-5 flex flex-wrap gap-1 border-b border-ink/10">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${tab === t.key ? 'border-primary text-primary-700' : 'border-transparent text-slate-500 hover:text-ink'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab ov={ov} />}
      {tab === 'leaderboard' && <LeaderboardTab board={board} period={period} setPeriod={setPeriod} meId={me.id} />}
      {tab === 'award' && canAward && <AwardTab rules={ov?.rules ?? []} onAwarded={reloadOverview} />}
      {tab === 'rules' && canAward && <RulesTab />}
    </main>
  );
}

// ─── Обзор: моя история + за что начисляют ───
function OverviewTab({ ov }: { ov: BonusOverview | null }) {
  if (!ov) return <p className="text-sm text-slate-400">Загрузка…</p>;
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card>
        <p className="mb-3 text-sm font-medium text-ink">Моя история начислений</p>
        {ov.history.length === 0 ? (
          <p className="text-sm text-slate-400">Пока нет начислений. Проявляйте инициативу — баллы начислит руководитель.</p>
        ) : (
          <ul className="space-y-2.5">
            {ov.history.map((a) => (
              <li key={a.id} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 w-14 shrink-0"><Points n={a.points} /></span>
                <span className="min-w-0 flex-1">
                  <span className="text-ink">{a.rule?.name ?? a.reason ?? 'Начисление'}</span>
                  {a.rule && a.reason ? <span className="text-slate-400"> — {a.reason}</span> : null}
                  <span className="block text-xs text-slate-400">{fmtDate(a.createdAt)}{a.awardedBy ? ` · ${a.awardedBy.name ?? a.awardedBy.email}` : ''}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <p className="mb-3 text-sm font-medium text-ink">За что начисляют баллы</p>
        {ov.rules.length === 0 ? (
          <p className="text-sm text-slate-400">Критерии ещё не заданы.</p>
        ) : (
          <ul className="space-y-2">
            {ov.rules.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <span className="inline-flex min-w-[42px] justify-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">+{r.points}</span>
                <span className="text-ink">{r.name}</span>
                {roleLabel(r.roleKey) ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{roleLabel(r.roleKey)}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {ov.top.length > 0 && (
        <Card className="md:col-span-2">
          <p className="mb-3 text-sm font-medium text-ink">Топ команды</p>
          <LeaderList rows={ov.top} />
        </Card>
      )}
    </div>
  );
}

// ─── Рейтинг ───
function LeaderboardTab({ board, period, setPeriod, meId }: { board: BonusLeaderRow[]; period: 'all' | 'month'; setPeriod: (p: 'all' | 'month') => void; meId: string }) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-ink">Рейтинг команды</p>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 text-sm">
          {(['all', 'month'] as const).map((p) => (
            <button key={p} type="button" onClick={() => setPeriod(p)} className={`rounded-md px-3 py-1 transition ${period === p ? 'bg-white font-medium text-ink shadow-sm' : 'text-slate-500'}`}>
              {p === 'all' ? 'За всё время' : 'За месяц'}
            </button>
          ))}
        </div>
      </div>
      {board.length === 0 ? <p className="text-sm text-slate-400">Нет данных.</p> : <LeaderList rows={board} meId={meId} />}
    </Card>
  );
}

function LeaderList({ rows, meId }: { rows: BonusLeaderRow[]; meId?: string }) {
  const medal = (rank: number) => (rank === 1 ? 'bg-amber-100 text-amber-700' : rank === 2 ? 'bg-slate-200 text-slate-600' : rank === 3 ? 'bg-orange-100 text-orange-700' : 'bg-slate-50 text-slate-400');
  return (
    <ul className="divide-y divide-ink/5">
      {rows.map((r) => (
        <li key={r.id} className={`flex items-center gap-3 py-2 ${r.id === meId ? 'rounded-lg bg-primary-50/60 px-2' : ''}`}>
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${medal(r.rank)}`}>{r.rank}</span>
          <Avatar url={r.avatarUrl} name={r.name} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-ink">{r.name}{r.id === meId ? ' · вы' : ''}</span>
            {r.positionName ? <span className="block truncate text-xs text-slate-400">{r.positionName}</span> : null}
          </span>
          <span className="shrink-0 text-sm font-semibold text-ink">{nf(r.points)}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── Начисление (руководитель) ───
function AwardTab({ rules, onAwarded }: { rules: BonusRule[]; onAwarded: () => void }) {
  const [recipients, setRecipients] = useState<BonusUserRow[]>([]);
  const [recent, setRecent] = useState<BonusAwardRow[]>([]);
  const [userId, setUserId] = useState('');
  const [ruleId, setRuleId] = useState('');
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const reloadRecent = useCallback(() => { void adminApi.bonusHistory().then((r) => setRecent(r.slice(0, 12))).catch(() => undefined); }, []);
  useEffect(() => { void adminApi.bonusRecipients().then(setRecipients).catch(() => undefined); reloadRecent(); }, [reloadRecent]);

  const activeRules = useMemo(() => rules.filter((r) => r.active), [rules]);
  const pickRule = (id: string) => {
    setRuleId(id);
    const r = activeRules.find((x) => x.id === id);
    setPoints(r ? String(r.points) : '');
  };

  const submit = async () => {
    if (!userId) { setMsg({ ok: false, text: 'Выберите сотрудника' }); return; }
    setBusy(true); setMsg(null);
    try {
      const body: { userId: string; ruleId?: string; points?: number; reason?: string } = { userId };
      if (ruleId) body.ruleId = ruleId;
      if (points.trim()) body.points = Number(points);
      if (reason.trim()) body.reason = reason.trim();
      const res = await adminApi.bonusAward(body);
      const who = recipients.find((r) => r.id === userId)?.name ?? 'сотруднику';
      setMsg({ ok: true, text: `Начислено ${who}. Новый баланс: ${nf(res.balance)}.` });
      setRuleId(''); setPoints(''); setReason('');
      reloadRecent(); onAwarded();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Ошибка начисления' });
    } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card className="space-y-4">
        <p className="text-sm font-medium text-ink">Начислить баллы</p>
        <label className="block text-sm text-dark-gray">Сотрудник
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className="mt-1 w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm">
            <option value="">— выберите —</option>
            {recipients.map((r) => <option key={r.id} value={r.id}>{r.name}{r.positionName ? ` · ${r.positionName}` : ''}</option>)}
          </select>
        </label>
        <label className="block text-sm text-dark-gray">Критерий
          <select value={ruleId} onChange={(e) => pickRule(e.target.value)} className="mt-1 w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm">
            <option value="">Свободное начисление</option>
            {activeRules.map((r) => <option key={r.id} value={r.id}>{r.name} (+{r.points}){roleLabel(r.roleKey) ? ` · ${roleLabel(r.roleKey)}` : ''}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-dark-gray">Баллы
            <input value={points} onChange={(e) => setPoints(e.target.value)} type="number" placeholder={ruleId ? 'из критерия' : 'напр. 5'} className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 text-sm" />
            <span className="mt-0.5 block text-[11px] text-slate-400">Можно отрицательные — корректировка</span>
          </label>
        </div>
        <label className="block text-sm text-dark-gray">Комментарий{!ruleId ? ' *' : ''}
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={ruleId ? 'необязательно' : 'за что начисляем'} className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 text-sm" />
        </label>
        <div className="flex items-center gap-3">
          <Button onClick={() => void submit()} disabled={busy}>{busy ? 'Начисление…' : 'Начислить'}</Button>
          {msg ? <span className={`text-sm ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</span> : null}
        </div>
      </Card>

      <Card>
        <p className="mb-3 text-sm font-medium text-ink">Последние начисления</p>
        {recent.length === 0 ? <p className="text-sm text-slate-400">Пока пусто.</p> : (
          <ul className="space-y-2.5">
            {recent.map((a) => (
              <li key={a.id} className="flex items-start gap-3 text-sm">
                <Avatar url={a.user.avatarUrl} name={a.user.name ?? a.user.email} />
                <span className="min-w-0 flex-1">
                  <span className="text-ink">{a.user.name ?? a.user.email}</span> <Points n={a.points} />
                  <span className="block text-xs text-slate-400">{a.rule?.name ?? a.reason ?? '—'} · {fmtDate(a.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ─── Критерии (руководитель) ───
function RulesTab() {
  const [rules, setRules] = useState<BonusRule[]>([]);
  const [name, setName] = useState('');
  const [points, setPoints] = useState('');
  const [roleKey, setRoleKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const reload = useCallback(() => { void adminApi.bonusRules(false).then(setRules).catch(() => undefined); }, []);
  useEffect(() => { reload(); }, [reload]);

  const add = async () => {
    if (!name.trim() || !points.trim()) { setErr('Укажите название и баллы'); return; }
    setBusy(true); setErr('');
    try {
      await adminApi.bonusCreateRule({ name: name.trim(), points: Number(points), roleKey: roleKey || undefined });
      setName(''); setPoints(''); setRoleKey(''); reload();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); } finally { setBusy(false); }
  };

  const roleOptions = Object.entries(ROLE_LABELS);

  return (
    <div className="space-y-5">
      <Card className="space-y-3">
        <p className="text-sm font-medium text-ink">Новый критерий</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_120px_1fr]">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Напр. Помощь гостю сверх регламента" className="rounded-md border border-ink/20 px-3 py-2 text-sm" />
          <input value={points} onChange={(e) => setPoints(e.target.value)} type="number" placeholder="Баллы" className="rounded-md border border-ink/20 px-3 py-2 text-sm" />
          <select value={roleKey} onChange={(e) => setRoleKey(e.target.value)} className="rounded-md border border-ink/20 bg-white px-3 py-2 text-sm">
            <option value="">Для всех ролей</option>
            {roleOptions.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => void add()} disabled={busy}>Добавить критерий</Button>
          {err ? <span className="text-sm text-rose-600">{err}</span> : null}
        </div>
      </Card>

      <Card>
        <p className="mb-3 text-sm font-medium text-ink">Каталог критериев</p>
        {rules.length === 0 ? <p className="text-sm text-slate-400">Критериев пока нет.</p> : (
          <ul className="divide-y divide-ink/5">
            {rules.map((r) => <RuleRow key={r.id} rule={r} onChange={reload} />)}
          </ul>
        )}
      </Card>
    </div>
  );
}

function RuleRow({ rule, onChange }: { rule: BonusRule; onChange: () => void }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(rule.name);
  const [points, setPoints] = useState(String(rule.points));

  const save = async () => {
    await adminApi.bonusUpdateRule(rule.id, { name: name.trim(), points: Number(points) }).catch(() => undefined);
    setEdit(false); onChange();
  };
  const toggle = async () => { await adminApi.bonusUpdateRule(rule.id, { active: !rule.active }).catch(() => undefined); onChange(); };
  const del = async () => { if (confirm(`Удалить критерий «${rule.name}»?`)) { await adminApi.bonusDeleteRule(rule.id).catch(() => undefined); onChange(); } };

  if (edit) {
    return (
      <li className="flex items-center gap-2 py-2">
        <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 rounded-md border border-ink/20 px-2 py-1 text-sm" />
        <input value={points} onChange={(e) => setPoints(e.target.value)} type="number" className="w-20 rounded-md border border-ink/20 px-2 py-1 text-sm" />
        <button type="button" onClick={() => void save()} className="rounded-md bg-primary px-2 py-1 text-xs text-white">OK</button>
        <button type="button" onClick={() => setEdit(false)} className="text-xs text-slate-400">отмена</button>
      </li>
    );
  }
  return (
    <li className={`flex items-center gap-2 py-2 text-sm ${rule.active ? '' : 'opacity-50'}`}>
      <span className="inline-flex min-w-[42px] justify-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">+{rule.points}</span>
      <span className="min-w-0 flex-1 truncate text-ink">{rule.name}</span>
      {roleLabel(rule.roleKey) ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{roleLabel(rule.roleKey)}</span> : null}
      <button type="button" onClick={() => void toggle()} className="text-xs text-slate-400 hover:text-ink" title="Вкл/выкл">{rule.active ? 'активен' : 'выключен'}</button>
      <button type="button" onClick={() => setEdit(true)} className="text-slate-400 hover:text-ink" title="Изменить">✎</button>
      <button type="button" onClick={() => void del()} className="text-slate-400 hover:text-rose-600" title="Удалить">🗑</button>
    </li>
  );
}
