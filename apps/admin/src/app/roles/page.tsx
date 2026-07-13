'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Card, Input } from '@dha/ui';
import { adminApi, fileUrl, type AdminUserRow, type EmployeeCard, type EmployeeFieldDef, type PermissionDef, type Position, type Role, type UserGroupRow, type WhAddress } from '../../lib/api';
import { useRequireAdmin } from '../../lib/use-admin';
import { DatePicker } from '../../components/DatePicker';

type Tab = 'staff' | 'positions' | 'departments' | 'roles';
const TABS: [Tab, string][] = [['staff', 'Сотрудники'], ['positions', 'Должности'], ['departments', 'Отделы'], ['roles', 'Роли (доступы)']];

/** Раздел «Сотрудники и оргструктура» — единый центр: сотрудники, должности, отделы, роли-доступы.
 *  Отсюда все модули берут: доступы (роль), команду/подчинение (отдел), функцию (должность). */
export default function RolesPage() {
  const ready = useRequireAdmin();
  const [tab, setTab] = useState<Tab>('staff');
  const [perms, setPerms] = useState<PermissionDef[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [groups, setGroups] = useState<UserGroupRow[]>([]);
  const [addresses, setAddresses] = useState<WhAddress[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadRoles = () => adminApi.roles().then(setRoles).catch(() => undefined);
  const loadUsers = () => adminApi.adminUsers().then(setUsers).catch(() => undefined);
  const loadPositions = () => adminApi.positions().then(setPositions).catch(() => undefined);
  const loadGroups = () => adminApi.groups().then(setGroups).catch(() => undefined);

  useEffect(() => {
    if (!ready) return;
    adminApi.permissionsCatalog().then(setPerms).catch(() => setError('Нет доступа к разделу'));
    void loadRoles(); void loadUsers(); void loadPositions(); void loadGroups();
    adminApi.whAddresses().then((a) => setAddresses(a.filter((x) => x.active))).catch(() => setAddresses([]));
  }, [ready]);

  const run = (fn: () => Promise<unknown>) => { setError(null); fn().then(() => { void loadUsers(); void loadGroups(); void loadPositions(); void loadRoles(); }).catch((e) => setError(e instanceof Error ? e.message : 'Ошибка')); };

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="space-y-4 px-8 py-8">
      <h1 className="text-3xl font-light text-ink">Сотрудники и оргструктура</h1>
      <p className="max-w-3xl text-sm text-dark-gray">Единое место: <b>Роль</b> — что можно в софте (доступы), <b>Должность</b> — кто по функции, <b>Отдел</b> — команда/подчинение (кому задачи, кто руководитель). Остальные модули (задачи, БЗ/Диск, склад) читают эти данные отсюда.</p>
      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm" style={{ width: 'fit-content' }}>
        {TABS.map(([v, l]) => (
          <button key={v} type="button" onClick={() => setTab(v)} className={`rounded-md px-4 py-1.5 transition ${tab === v ? 'bg-white font-medium text-ink shadow-sm' : 'text-slate-500 hover:text-ink'}`}>{l}</button>
        ))}
      </div>

      {tab === 'staff' ? <StaffTab users={users} roles={roles} positions={positions} groups={groups} addresses={addresses} onRun={run} setError={setError} reload={loadUsers} /> : null}
      {tab === 'positions' ? <PositionsTab positions={positions} roles={roles} users={users} onRun={run} /> : null}
      {tab === 'departments' ? <DepartmentsTab groups={groups} users={users} onRun={run} /> : null}
      {tab === 'roles' ? <RolesMatrixTab perms={perms} roles={roles} onReload={loadRoles} setError={setError} /> : null}
    </main>
  );
}

/** Мультивыбор чипами (отделы, объекты). */
function ChipMulti({ options, selected, onToggle, color }: { options: { id: string; label: string; color?: string }[]; selected: string[]; onToggle: (id: string) => void; color?: boolean }) {
  if (options.length === 0) return <p className="text-xs text-slate-400">—</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <button key={o.id} type="button" onClick={() => onToggle(o.id)}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition ${on ? 'border-transparent text-white shadow-sm' : 'border-ink/15 text-slate-600 hover:border-ink/30'}`}
            style={on ? { backgroundColor: color && o.color ? o.color : '#6366f1' } : {}}>
            {color && o.color ? <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: on ? '#fff' : o.color }} /> : null}{o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Сотрудники ───────────────────────────────────────────────────────────────
function StaffTab({ users, roles, positions, groups, addresses, onRun, setError, reload }: {
  users: AdminUserRow[]; roles: Role[]; positions: Position[]; groups: UserGroupRow[]; addresses: WhAddress[];
  onRun: (fn: () => Promise<unknown>) => void; setError: (s: string | null) => void; reload: () => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [roleKey, setRoleKey] = useState('');
  const [positionId, setPositionId] = useState('');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const roleName = (k: string | null) => roles.find((r) => r.key === k)?.name ?? k ?? '—';
  const posName = (id: string | null) => positions.find((p) => p.id === id)?.name ?? null;
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  // При выборе должности с ролью по умолчанию — подставить роль.
  const pickPosition = (id: string) => { setPositionId(id); const p = positions.find((x) => x.id === id); if (p?.defaultRoleKey && !roleKey) setRoleKey(p.defaultRoleKey); };

  const create = () => {
    if (!email.trim() || password.length < 6 || (!roleKey && !positions.find((p) => p.id === positionId)?.defaultRoleKey)) {
      setError('Заполните email, пароль (≥6) и роль (или должность с ролью по умолчанию)');
      return;
    }
    onRun(async () => {
      await adminApi.createAdminUser({ email: email.trim(), password, name: name.trim() || undefined, roleKey: roleKey || undefined, positionId: positionId || undefined, groupIds });
      setEmail(''); setName(''); setPassword(''); setRoleKey(''); setPositionId(''); setGroupIds([]);
    });
  };

  return (
    <Card>
      <h2 className="mb-3 text-lg text-ink">Сотрудники</h2>
      <div className="space-y-1.5">
        {users.map((u) => (
          <EmployeeRow key={u.id} user={u} roles={roles} positions={positions} groups={groups} addresses={addresses}
            open={expanded === u.id} onToggle={() => setExpanded(expanded === u.id ? null : u.id)}
            roleName={roleName} posName={posName} onRun={onRun} reload={reload} />
        ))}
        {users.length === 0 ? <p className="text-sm text-slate-400">Сотрудников нет.</p> : null}
      </div>

      <div className="mt-5 border-t border-ink/10 pt-4">
        <h3 className="mb-2 text-sm font-medium text-ink">Добавить сотрудника</h3>
        <div className="grid items-end gap-3 sm:grid-cols-3">
          <Input id="ue" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input id="un" label="Имя" value={name} onChange={(e) => setName(e.target.value)} />
          <Input id="up" label="Пароль (≥6)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <label className="block"><span className="mb-1.5 block text-sm text-dark-gray">Должность</span>
            <select value={positionId} onChange={(e) => pickPosition(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm">
              <option value="">—</option>
              {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="mb-1.5 block text-sm text-dark-gray">Роль (доступы)</span>
            <select value={roleKey} onChange={(e) => setRoleKey(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm">
              <option value="">— из должности —</option>
              {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-2">
          <span className="mb-1 block text-sm text-dark-gray">Отделы</span>
          <ChipMulti options={groups.map((g) => ({ id: g.id, label: g.name, color: g.color }))} selected={groupIds} onToggle={(id) => toggle(groupIds, setGroupIds, id)} color />
        </div>
        <Button className="mt-3" onClick={create}>Создать сотрудника</Button>
      </div>
    </Card>
  );
}

function EmployeeRow({ user, roles, positions, groups, addresses, open, onToggle, roleName, posName, onRun, reload }: {
  user: AdminUserRow; roles: Role[]; positions: Position[]; groups: UserGroupRow[]; addresses: WhAddress[];
  open: boolean; onToggle: () => void; roleName: (k: string | null) => string; posName: (id: string | null) => string | null;
  onRun: (fn: () => Promise<unknown>) => void; reload: () => void;
}) {
  const [roleKey, setRoleKey] = useState(user.roleKey ?? '');
  const [positionId, setPositionId] = useState(user.positionId ?? '');
  const [groupIds, setGroupIds] = useState<string[]>(user.groupIds);
  const [addr, setAddr] = useState<string[]>(user.allowedAddressIds);
  const [password, setPassword] = useState('');
  const [cardOpen, setCardOpen] = useState(false);
  useEffect(() => { setRoleKey(user.roleKey ?? ''); setPositionId(user.positionId ?? ''); setGroupIds(user.groupIds); setAddr(user.allowedAddressIds); }, [user]);
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const save = () => onRun(async () => {
    await adminApi.updateAdminUser(user.id, { roleKey, positionId, groupIds, allowedAddressIds: addr, ...(password ? { password } : {}) });
    setPassword('');
  });

  const deptNames = user.groupIds.map((id) => groups.find((g) => g.id === id)?.name).filter(Boolean).join(', ');

  return (
    <div className="rounded-lg border border-ink/10">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className={user.active ? 'text-ink' : 'text-dark-gray line-through'}>{user.name ?? user.email}</p>
          <p className="text-xs text-dark-gray">{user.email} · {roleName(user.roleKey)}{posName(user.positionId) ? ` · ${posName(user.positionId)}` : ''}{deptNames ? ` · ${deptNames}` : ''}</p>
        </div>
        <button type="button" onClick={() => setCardOpen(true)} className="rounded-md border border-ink/15 px-2.5 py-1 text-xs text-ink hover:bg-slate-50">Карточка</button>
        <Button variant="secondary" onClick={() => void adminApi.updateAdminUser(user.id, { active: !user.active }).then(reload)}>{user.active ? 'Отключить' : 'Включить'}</Button>
        <button type="button" onClick={onToggle} className="text-xs text-indigo-600 hover:underline">{open ? 'Свернуть' : 'Изменить'}</button>
      </div>
      {cardOpen ? <EmployeeCardModal userId={user.id} onClose={() => setCardOpen(false)} onSaved={reload} /> : null}
      {open ? (
        <div className="space-y-3 border-t border-ink/5 px-3 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1 block text-xs text-slate-500">Должность</span>
              <select value={positionId} onChange={(e) => setPositionId(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-2 py-1.5 text-sm">
                <option value="">—</option>
                {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="block"><span className="mb-1 block text-xs text-slate-500">Роль (доступы)</span>
              <select value={roleKey} onChange={(e) => setRoleKey(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-2 py-1.5 text-sm">
                {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
              </select>
            </label>
          </div>
          <div>
            <span className="mb-1 block text-xs text-slate-500">Отделы</span>
            <ChipMulti options={groups.map((g) => ({ id: g.id, label: g.name, color: g.color }))} selected={groupIds} onToggle={(id) => toggle(groupIds, setGroupIds, id)} color />
          </div>
          {addresses.length > 0 ? (
            <div>
              <span className="mb-1 block text-xs text-slate-500">Адреса склада (пусто — все)</span>
              <ChipMulti options={addresses.map((a) => ({ id: a.id, label: a.name }))} selected={addr} onToggle={(id) => toggle(addr, setAddr, id)} />
            </div>
          ) : null}
          <div className="flex flex-wrap items-end gap-2">
            <Input id={`pw-${user.id}`} label="Новый пароль (по желанию)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button onClick={save}>Сохранить</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Должности ──────────────────────────────────────────────────────────────
function PositionsTab({ positions, roles, users, onRun }: { positions: Position[]; roles: Role[]; users: AdminUserRow[]; onRun: (fn: () => Promise<unknown>) => void }) {
  const [name, setName] = useState('');
  const [defaultRoleKey, setDefaultRoleKey] = useState('');
  const roleName = (k: string | null) => roles.find((r) => r.key === k)?.name ?? '—';
  const countFor = (id: string) => users.filter((u) => u.positionId === id).length;

  return (
    <Card>
      <h2 className="mb-1 text-lg text-ink">Должности</h2>
      <p className="mb-4 text-xs text-slate-500">Должность — кто человек по функции (Горничная, Инженер, Ресепшн…). Можно задать <b>роль по умолчанию</b> — она подставится при заведении сотрудника с этой должностью.</p>
      <div className="space-y-2">
        {positions.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink/10 px-3 py-2">
            <input defaultValue={p.name} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== p.name) onRun(() => adminApi.updatePosition(p.id, { name: e.target.value.trim() })); }} className="flex-1 rounded border-0 bg-transparent text-sm font-medium text-ink outline-none focus:ring-1 focus:ring-indigo-300 px-1" />
            <label className="text-xs text-slate-500">роль по умолчанию:
              <select value={p.defaultRoleKey ?? ''} onChange={(e) => onRun(() => adminApi.updatePosition(p.id, { defaultRoleKey: e.target.value || null }))} className="ml-1 rounded-md border border-ink/20 bg-white px-2 py-1 text-sm text-ink">
                <option value="">—</option>
                {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
              </select>
            </label>
            <span className="text-xs text-slate-400">{countFor(p.id)} чел.</span>
            <button type="button" className="text-xs text-rose-500 hover:underline" onClick={() => { if (confirm(`Удалить должность «${p.name}»? У сотрудников она снимется.`)) onRun(() => adminApi.deletePosition(p.id)); }}>Удалить</button>
          </div>
        ))}
        {positions.length === 0 ? <p className="text-sm text-slate-400">Должностей нет.</p> : null}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Input id="posn" label="Новая должность" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="block"><span className="mb-1 block text-sm text-dark-gray">Роль по умолчанию</span>
          <select value={defaultRoleKey} onChange={(e) => setDefaultRoleKey(e.target.value)} className="rounded-md border border-ink/20 bg-white px-3 py-2 text-sm">
            <option value="">—</option>
            {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
          </select>
        </label>
        <Button disabled={!name.trim()} onClick={() => { onRun(() => adminApi.createPosition({ name: name.trim(), defaultRoleKey: defaultRoleKey || undefined })); setName(''); setDefaultRoleKey(''); }}>Добавить должность</Button>
      </div>
    </Card>
  );
}

// ── Отделы (оргструктура) ────────────────────────────────────────────────────
function DepartmentsTab({ groups, users, onRun }: { groups: UserGroupRow[]; users: AdminUserRow[]; onRun: (fn: () => Promise<unknown>) => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [expanded, setExpanded] = useState<string | null>(null);
  const userName = (id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? users.find((u) => u.id === id)?.email ?? '—') : null);

  return (
    <Card>
      <h2 className="mb-1 text-lg text-ink">Отделы</h2>
      <p className="mb-4 text-xs text-slate-500">Оргструктура: отделы и подотделы (дерево), у каждого — руководитель (получатель уведомлений «Уведомить руководителя») и участники. Задачи назначаются на отдел; «свой отдел» задаёт видимость задач. Эти же отделы — субъекты доступа в Базе знаний/Диске.</p>
      <div className="space-y-2">
        {groups.map((g) => {
          const open = expanded === g.id;
          const memberSet = new Set(g.memberIds);
          return (
            <div key={g.id} className="rounded-lg border border-ink/10">
              <div className="flex items-center gap-2 px-3 py-2">
                {g.parentId ? <span className="text-slate-300" title={`подотдел: ${groups.find((x) => x.id === g.parentId)?.name ?? ''}`}>↳</span> : null}
                <input type="color" value={g.color} onChange={(e) => onRun(() => adminApi.groupUpdate(g.id, { color: e.target.value }))} className="h-6 w-8 shrink-0 cursor-pointer border-0 bg-transparent p-0" />
                <input defaultValue={g.name} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== g.name) onRun(() => adminApi.groupUpdate(g.id, { name: e.target.value.trim() })); }} className="flex-1 rounded border-0 bg-transparent text-sm font-medium text-ink outline-none focus:ring-1 focus:ring-indigo-300 px-1" />
                {g.headUserId ? <span className="hidden text-[10px] text-slate-400 sm:inline">рук.: {userName(g.headUserId)}</span> : null}
                <span className="text-xs text-slate-400">{g.memberIds.length} уч.</span>
                <button type="button" onClick={() => setExpanded(open ? null : g.id)} className="text-xs text-indigo-600 hover:underline">{open ? 'Свернуть' : 'Настроить'}</button>
                <button type="button" className="text-xs text-rose-500 hover:underline" onClick={() => { if (confirm(`Удалить отдел «${g.name}»?`)) onRun(() => adminApi.groupDelete(g.id)); }}>Удалить</button>
              </div>
              {open ? (
                <div className="border-t border-ink/5 px-3 py-2">
                  <div className="mb-3 grid gap-2 sm:grid-cols-2">
                    <label className="text-xs text-slate-500">Руководитель отдела
                      <select value={g.headUserId ?? ''} onChange={(e) => onRun(() => adminApi.groupUpdate(g.id, { headUserId: e.target.value || null }))} className="mt-1 w-full rounded-md border border-ink/20 bg-white px-2 py-1.5 text-sm text-ink">
                        <option value="">— не задан —</option>
                        {users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
                      </select>
                    </label>
                    <label className="text-xs text-slate-500">Родительский отдел
                      <select value={g.parentId ?? ''} onChange={(e) => onRun(() => adminApi.groupUpdate(g.id, { parentId: e.target.value || null }))} className="mt-1 w-full rounded-md border border-ink/20 bg-white px-2 py-1.5 text-sm text-ink">
                        <option value="">— верхний уровень —</option>
                        {groups.filter((x) => x.id !== g.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </label>
                  </div>
                  <p className="mb-2 text-xs text-slate-500">Участники отдела:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {users.filter((u) => u.active).map((u) => {
                      const on = memberSet.has(u.id);
                      const next = on ? g.memberIds.filter((x) => x !== u.id) : [...g.memberIds, u.id];
                      return (
                        <button key={u.id} type="button" onClick={() => onRun(() => adminApi.groupUpdate(g.id, { memberIds: next }))} className={`rounded-full border px-2.5 py-0.5 text-xs transition ${on ? 'border-indigo-300 bg-indigo-50 text-indigo-900' : 'border-ink/15 text-slate-600 hover:border-ink/30'}`}>{u.name ?? u.email}</button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
        {groups.length === 0 ? <p className="text-sm text-slate-400">Отделов нет.</p> : null}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <Input id="depn" label="Новый отдел" value={name} onChange={(e) => setName(e.target.value)} />
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-10 cursor-pointer rounded-md border border-ink/20" />
        <Button disabled={!name.trim()} onClick={() => { onRun(() => adminApi.groupCreate({ name: name.trim(), color })); setName(''); }}>Добавить отдел</Button>
      </div>
    </Card>
  );
}

// ── Роли (доступы): матрица прав + конструктор ───────────────────────────────
function RolesMatrixTab({ perms, roles, onReload, setError }: { perms: PermissionDef[]; roles: Role[]; onReload: () => void; setError: (s: string | null) => void }) {
  const [newRoleName, setNewRoleName] = useState('');
  const [newRolePerms, setNewRolePerms] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  // Локальная копия ролей — оптимистичное обновление галочек без перезагрузки (§2: убирает «скачки» столбцов/сброс прокрутки).
  const [rows, setRows] = useState<Role[]>(roles);
  useEffect(() => { setRows(roles); }, [roles]);
  const toggleNewPerm = (key: string) => setNewRolePerms((ps) => ps.includes(key) ? ps.filter((p) => p !== key) : [...ps, key]);

  const createRole = async () => {
    if (!newRoleName.trim()) { setError('Укажите название роли'); return; }
    setError(null); setCreating(true);
    try { await adminApi.createRole({ name: newRoleName.trim(), permissions: newRolePerms }); setNewRoleName(''); setNewRolePerms([]); onReload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); } finally { setCreating(false); }
  };
  const togglePerm = async (role: Role, permKey: string) => {
    const next = role.permissions.includes(permKey) ? role.permissions.filter((p) => p !== permKey) : [...role.permissions, permKey];
    setRows((rs) => rs.map((r) => (r.key === role.key ? { ...r, permissions: next } : r))); // оптимистично, без перезагрузки
    await adminApi.updateRole(role.key, { permissions: next }).catch(() => undefined);
  };
  const renameRole = async (key: string, name: string) => { await adminApi.updateRole(key, { name }).catch(() => undefined); onReload(); };
  const deleteRole = async (key: string, label: string) => { if (!confirm(`Удалить роль «${label}»?`)) return; await adminApi.deleteRole(key).then(onReload).catch((e) => setError(e instanceof Error ? e.message : 'Ошибка')); };

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-3 text-lg text-ink">Права ролей</h2>
        {/* Excel-стиль (§2): закреплены заголовки столбцов (роли) и первый столбец (функции), прокрутка внутри. */}
        <div className="max-h-[70vh] overflow-auto rounded-lg border border-ink/10">
          <table className="border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-dark-gray">
                <th className="sticky left-0 top-0 z-30 min-w-[240px] border-b border-r border-ink/10 bg-slate-50 px-3 py-2 text-left shadow-[4px_0_6px_-4px_rgba(15,23,42,0.15)]">Раздел / функция</th>
                {rows.map((r) => (
                  <th key={r.key} className="sticky top-0 z-20 min-w-[92px] border-b border-ink/10 bg-slate-50 px-2 py-2 text-center align-bottom">
                    {r.system ? <span className="text-xs font-medium">{r.name}</span> : (
                      <span className="inline-flex flex-col items-center gap-1">
                        <input defaultValue={r.name} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== r.name) void renameRole(r.key, e.target.value.trim()); }} className="w-24 rounded border border-ink/15 px-1 py-0.5 text-center text-xs" />
                        <button type="button" onClick={() => void deleteRole(r.key, r.name)} className="text-[10px] text-rose-500 hover:underline">удалить</button>
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perms.map((p, i) => (
                <tr key={p.key} className="group">
                  {/* Фон строго непрозрачный (§1): полупрозрачный bg просвечивал чекбоксы при горизонтальном скролле */}
                  <td className={`sticky left-0 z-10 border-b border-r border-ink/10 px-3 py-2 text-ink shadow-[4px_0_6px_-4px_rgba(15,23,42,0.15)] ${i % 2 ? 'bg-slate-100' : 'bg-white'} group-hover:bg-primary-50`}>{p.label}</td>
                  {rows.map((r) => {
                    const locked = r.key === 'superadmin';
                    return (
                      <td key={r.key} className={`border-b border-ink/5 px-2 py-2 text-center ${i % 2 ? 'bg-slate-50/60' : 'bg-white'} group-hover:bg-primary-50/60`}>
                        <input type="checkbox" className="h-4 w-4 cursor-pointer accent-primary" checked={r.permissions.includes(p.key)} disabled={locked} onChange={() => void togglePerm(r, p.key)} title={locked ? 'Администратор всегда имеет все права' : `${r.name}: ${p.label}`} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-dark-gray">Изменения сохраняются сразу. «Администратор» всегда имеет полный доступ.</p>
      </Card>

      <Card>
        <h2 className="mb-1 text-lg text-ink">Конструктор ролей</h2>
        <p className="mb-3 text-sm text-dark-gray">Своя роль: название + нужные права. Появится в матрице и при назначении сотрудника.</p>
        <div className="mb-4 max-w-md"><Input id="nrn" label="Название роли" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} /></div>
        <div className="mb-4 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {perms.map((p) => (
            <label key={p.key} className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={newRolePerms.includes(p.key)} onChange={() => toggleNewPerm(p.key)} />{p.label}</label>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => void createRole()} disabled={creating || !newRoleName.trim()}>{creating ? 'Создание…' : 'Создать роль'}</Button>
          <span className="text-xs text-dark-gray">Выбрано прав: {newRolePerms.length}</span>
          {newRolePerms.length > 0 ? <button type="button" onClick={() => setNewRolePerms([])} className="text-xs text-primary hover:underline">Очистить</button> : null}
        </div>
      </Card>
    </div>
  );
}

/** Карточка сотрудника для руководителя (§6): все поля + фото + пользовательские поля + управление их набором. */
function EmployeeCardModal({ userId, onClose, onSaved }: { userId: string; onClose: () => void; onSaved: () => void }) {
  const [card, setCard] = useState<EmployeeCard | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthday, setBirthday] = useState('');
  const [hireDate, setHireDate] = useState('');
  const [hobby, setHobby] = useState('');
  const [about, setAbout] = useState('');
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [manageFields, setManageFields] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const apply = (c: EmployeeCard) => {
    setCard(c); setName(c.name ?? ''); setPhone(c.phone ?? '');
    setBirthday(c.birthday ? c.birthday.slice(0, 10) : ''); setHireDate(c.hireDate ? c.hireDate.slice(0, 10) : '');
    setHobby(c.hobby ?? ''); setAbout(c.about ?? ''); setCustom(c.customFields ?? {});
  };
  const load = () => adminApi.adminUserCard(userId).then(apply).catch(() => undefined);
  useEffect(() => { void load(); }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!card) return null;
  const save = async () => {
    setSaving(true);
    await adminApi.updateAdminUser(userId, { name, phone, birthday: birthday || null, hireDate: hireDate || null, hobby, about, customFields: custom }).catch(() => undefined);
    setSaving(false); onSaved(); onClose();
  };
  const onPhoto = async (f: File) => { const r = await adminApi.adminUploadUserPhoto(userId, f).catch(() => null); if (r) setCard({ ...card, avatarUrl: r.avatarUrl }); };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-medium text-ink">Карточка сотрудника</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-ink/50 hover:bg-ink/5">✕</button>
        </div>
        <div className="mb-4 flex items-center gap-4">
          <div className="relative">
            {card.avatarUrl ? <img src={fileUrl(card.avatarUrl)} alt="" className="h-16 w-16 rounded-full object-cover" /> : <span className="grid h-16 w-16 place-items-center rounded-full bg-primary-100 text-lg font-bold text-primary-700">{(card.name ?? card.email).slice(0, 2).toUpperCase()}</span>}
            <button type="button" onClick={() => fileRef.current?.click()} className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-primary text-xs text-white shadow hover:opacity-90">✎</button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPhoto(f); e.target.value = ''; }} />
          </div>
          <div className="text-sm text-dark-gray">
            <p className="text-ink">{card.email}</p>
            <p className="text-xs">{[card.positionName, card.roleName].filter(Boolean).join(' · ')}{card.groupNames?.length ? ` · ${card.groupNames.join(', ')}` : ''}</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-dark-gray">ФИО<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 text-sm" /></label>
          <label className="text-sm text-dark-gray">Телефон<input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 text-sm" /></label>
          <div className="text-sm text-dark-gray">Дата рождения<div className="mt-1"><DatePicker value={birthday} onChange={(d) => setBirthday(d ?? '')} placeholder="—" /></div></div>
          <div className="text-sm text-dark-gray">Дата приёма<div className="mt-1"><DatePicker value={hireDate} onChange={(d) => setHireDate(d ?? '')} placeholder="—" /></div></div>
          <label className="text-sm text-dark-gray sm:col-span-2">Хобби<input value={hobby} onChange={(e) => setHobby(e.target.value)} className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 text-sm" /></label>
          <label className="text-sm text-dark-gray sm:col-span-2">О себе<textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={3} className="mt-1 w-full resize-y rounded-md border border-ink/20 px-3 py-2 text-sm" /></label>
        </div>
        {card.fieldDefs.length ? (
          <div className="mt-3 border-t border-ink/5 pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Пользовательские поля</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {card.fieldDefs.map((d) => (
                <label key={d.id} className="text-sm text-dark-gray">{d.name} <span className="text-[10px] text-slate-400">({d.editableBy === 'SELF' ? 'сам' : d.editableBy === 'BOTH' ? 'оба' : 'рук.'})</span>
                  <input value={custom[d.id] ?? ''} onChange={(e) => setCustom((c) => ({ ...c, [d.id]: e.target.value }))} className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 text-sm" />
                </label>
              ))}
            </div>
          </div>
        ) : null}
        <button type="button" onClick={() => setManageFields((v) => !v)} className="mt-3 text-xs text-indigo-600 hover:underline">{manageFields ? 'Скрыть настройку полей' : 'Настроить набор полей'}</button>
        {manageFields ? <FieldDefsManager defs={card.fieldDefs} onChanged={load} /> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button onClick={() => void save()} disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</Button>
        </div>
      </div>
    </div>
  );
}

/** Управление набором пользовательских полей карточки (§6). */
function FieldDefsManager({ defs, onChanged }: { defs: EmployeeFieldDef[]; onChanged: () => void }) {
  const [name, setName] = useState('');
  const [editableBy, setEditableBy] = useState<'SELF' | 'MANAGER' | 'BOTH'>('MANAGER');
  return (
    <div className="mt-2 rounded-lg border border-ink/10 bg-slate-50/50 p-3">
      <div className="space-y-1.5">
        {defs.map((d) => (
          <div key={d.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1 text-ink">{d.name}</span>
            <select value={d.editableBy} onChange={(e) => void adminApi.updateEmployeeField(d.id, { editableBy: e.target.value }).then(onChanged)} className="rounded-md border border-ink/15 bg-white px-1.5 py-1 text-xs">
              <option value="SELF">Сотрудник</option><option value="MANAGER">Руководитель</option><option value="BOTH">Оба</option>
            </select>
            <button type="button" onClick={() => void adminApi.deleteEmployeeField(d.id).then(onChanged)} className="text-xs text-rose-500 hover:underline">×</button>
          </div>
        ))}
        {defs.length === 0 ? <p className="text-xs text-slate-400">Полей пока нет.</p> : null}
      </div>
      <div className="mt-2 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Напр. Выданная форма" className="flex-1 rounded-md border border-ink/20 px-2.5 py-1.5 text-sm" />
        <select value={editableBy} onChange={(e) => setEditableBy(e.target.value as 'SELF' | 'MANAGER' | 'BOTH')} className="rounded-md border border-ink/20 bg-white px-2 py-1.5 text-xs">
          <option value="SELF">Сотрудник</option><option value="MANAGER">Руководитель</option><option value="BOTH">Оба</option>
        </select>
        <Button variant="secondary" disabled={!name.trim()} onClick={() => { void adminApi.createEmployeeField({ name: name.trim(), editableBy }).then(() => { setName(''); onChanged(); }); }}>Добавить</Button>
      </div>
    </div>
  );
}
