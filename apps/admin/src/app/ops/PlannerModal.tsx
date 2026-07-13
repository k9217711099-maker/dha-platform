'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@dha/ui';
import { adminApi, type OpsGroup, type OpsRecurring, type OpsStaff } from '../../lib/api';

const WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function scheduleLabel(r: OpsRecurring): string {
  switch (r.freq) {
    case 'DAILY': return `ежедневно в ${r.time}`;
    case 'WEEKLY': return `еженедельно в ${r.time} (${r.days.map((d) => WEEK[d - 1]).join(', ')})`;
    case 'MONTHLY': return `ежемесячно в ${r.time} (числа: ${r.days.join(', ')})`;
    case 'INTERVAL': return `каждые ${r.intervalDays ?? 1} дн. в ${r.time}`;
  }
}

/** Окно «Планировщик» (§4.7): повторяющиеся задачи. Создание/правка — полной формой задачи. */
export function PlannerModal({ staff, groups, canManage, onClose, onCreate, onEdit }: {
  staff: OpsStaff[];
  groups: OpsGroup[];
  canManage: boolean;
  onClose: () => void;
  /** Открыть форму «как обычная задача» в режиме повторяемости. */
  onCreate: () => void;
  onEdit: (rule: OpsRecurring) => void;
}) {
  const [rules, setRules] = useState<OpsRecurring[]>([]);
  const load = () => adminApi.opsRecurring().then(setRules).catch(() => undefined);
  useEffect(() => { void load(); }, []);

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4" onClick={onClose}>
      <div className="my-4 w-full max-w-3xl rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <h2 className="text-lg font-semibold text-ink">Планировщик</h2>
          <div className="flex items-center gap-2">
            {canManage ? <Button onClick={onCreate}>Добавить повторяющуюся задачу</Button> : null}
            <button type="button" onClick={onClose} className="text-2xl leading-none text-slate-400 hover:text-ink">×</button>
          </div>
        </div>
        <div className="space-y-2 px-5 py-4">
          {rules.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">Повторяющихся задач нет. Создайте первую — она будет создаваться автоматически по расписанию.</p> : null}
          {rules.map((r) => {
            const p = r.payload as { title?: string; groupId?: string; assigneeIds?: string[] };
            const g = p.groupId ? groupById.get(p.groupId) : null;
            const assignee = p.assigneeIds?.[0] ? staffById.get(p.assigneeIds[0]) : null;
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink/10 px-3 py-2 text-sm">
                {canManage ? (
                  <label className="relative inline-flex cursor-pointer items-center" title={r.enabled ? 'Включено' : 'Выключено'}>
                    <input type="checkbox" checked={r.enabled} onChange={(e) => void adminApi.opsSaveRecurring({ enabled: e.target.checked }, r.id).then(load)} className="peer sr-only" />
                    <span className="h-5 w-9 rounded-full bg-slate-200 transition peer-checked:bg-emerald-400 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4" />
                  </label>
                ) : null}
                <span className="font-medium text-ink">{p.title ?? r.name}</span>
                {g ? <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-white" style={{ backgroundColor: g.color }}>{g.name}</span> : null}
                {assignee ? <span className="text-xs text-slate-500">{assignee.name ?? assignee.email}</span> : null}
                <span className="text-xs text-slate-400">
                  {scheduleLabel(r)}
                  {r.startDate ? ` · с ${new Date(r.startDate).toLocaleDateString('ru-RU')}` : ''}
                  {r.lastFiredAt ? ` · последняя: ${new Date(r.lastFiredAt).toLocaleDateString('ru-RU')}` : ''}
                </span>
                {canManage ? (
                  <span className="ml-auto flex items-center gap-2">
                    <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={() => onEdit(r)}>Изменить</button>
                    <button type="button" className="text-xs text-rose-500 hover:underline" onClick={() => { if (confirm(`Удалить правило «${r.name}»?`)) void adminApi.opsDeleteRecurring(r.id).then(load); }}>Удалить</button>
                  </span>
                ) : null}
              </div>
            );
          })}
          <p className="pt-1 text-xs text-slate-400">Экземпляры создаются автоматически в указанное время. История — в списке задач, фильтр «Повторяющиеся».</p>
        </div>
      </div>
    </div>
  );
}
