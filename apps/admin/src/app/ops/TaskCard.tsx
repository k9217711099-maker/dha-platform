'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@dha/ui';
import {
  adminApi, fileUrl, type OpsBlockerKind, type OpsGroup, type OpsStaff, type OpsStatus, type OpsTag, type OpsTaskChecklist, type OpsTaskFull,
  type OpsWriteoffList, type WhItem, type WhWarehouse,
} from '../../lib/api';
import { useAdminMe } from '../../lib/use-admin';
import { BLOCKER, SEVERITY_RU, STATUS, STATUS_PIPELINE, TRANSITIONS, checklistProgress, fmtDT, fmtMin } from './shared';

/** Значение по умолчанию для input[type=datetime-local]: локальное время без секунд. */
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/** Является ли вложение картинкой (по расширению) — иначе рисуем файловую плитку. */
const isImage = (url: string) => /\.(jpe?g|png|gif|webp|heic)$/i.test(url);

const ANSWER_LABEL: Record<string, string> = { YES: 'Да', NO: 'Нет', THIRD: '—', AUTO: 'Авто' };

/** Карточка задачи (§4.3): статусы, чек-листы, комментарии, вложения, история. */
export function TaskCard({ taskId, staff, onClose, onChanged }: {
  taskId: string;
  staff: OpsStaff[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const me = useAdminMe();
  const [task, setTask] = useState<OpsTaskFull | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [cancelNote, setCancelNote] = useState<string | null>(null);
  // Диалог откладывания (workflow-ТЗ §2.1): причина блокера + необязательная заметка + ожидаемая дата.
  const [pausing, setPausing] = useState(false);
  const [blockerKind, setBlockerKind] = useState<OpsBlockerKind | ''>('');
  const [blockerNote, setBlockerNote] = useState('');
  const [blockerUntil, setBlockerUntil] = useState('');
  const [writeoff, setWriteoff] = useState(false);
  const [editing, setEditing] = useState(false);
  const [delegating, setDelegating] = useState(false);
  const [tags, setTags] = useState<OpsTag[]>([]);
  const [groups, setGroups] = useState<OpsGroup[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoTarget = useRef<{ clId: string; itemId: string } | null>(null);

  const load = () => adminApi.opsTask(taskId).then(setTask).catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  useEffect(() => { void load(); }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Отметить прочитанной при открытии (сбрасывает счётчик непрочитанных в списке).
  useEffect(() => { adminApi.opsMarkRead(taskId).then(() => onChanged()).catch(() => undefined); }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    void adminApi.opsTags().then(setTags).catch(() => undefined);
    void adminApi.opsGroups().then(setGroups).catch(() => undefined);
  }, []);

  const userName = (id: string | null) => {
    if (!id) return 'система';
    const u = staff.find((s) => s.id === id);
    return u?.name ?? u?.email ?? id.slice(0, 6);
  };

  const run = (fn: () => Promise<unknown>) => {
    setError('');
    void fn().then(() => { void load(); onChanged(); }).catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  };

  const changeStatus = (to: OpsStatus) => {
    if (to === 'CANCELLED') { setCancelNote(''); return; }
    if (to === 'PAUSED') { setPausing(true); return; }
    run(() => adminApi.opsStatus(taskId, to));
  };

  // Отложить задачу: причина обязательна; дата нужна для «на дату» либо если у задачи нет срока.
  const submitPause = () => {
    if (!blockerKind || !task) return;
    const needDate = blockerKind === 'SCHEDULED' || !task.dueAt;
    if (needDate && !blockerUntil) { setError('Укажите ожидаемую дату решения'); return; }
    run(() => adminApi.opsStatus(taskId, 'PAUSED', undefined, {
      blockerKind,
      blockerNote: blockerNote.trim() || undefined,
      blockerUntil: blockerUntil ? new Date(blockerUntil).toISOString() : undefined,
    }));
    setPausing(false); setBlockerKind(''); setBlockerNote(''); setBlockerUntil('');
  };

  const canManage = me?.permissions.includes('ops_manage') ?? false;
  const canInspect = me?.permissions.includes('ops_inspect') ?? false;

  if (!task) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
        <div className="rounded-xl bg-white px-8 py-6 text-sm text-dark-gray">{error || 'Загрузка…'}</div>
      </div>
    );
  }

  const st = STATUS[task.status];
  const canEdit = task.createdBy === me?.id || task.supervisorId === me?.id || canManage || task.assignees.some((a) => a.userId === me?.id);
  const isConfirmer = task.createdBy === me?.id || task.supervisorId === me?.id || canManage;
  let allowed = TRANSITIONS[task.status].filter((to) => (to === 'NEW' && (task.status === 'DONE' || task.status === 'CANCELLED') ? canManage : true));
  // requireConfirmation: путь вперёд из работы — только через «Ждёт подтв.»; иначе шаг подтверждения скрыт.
  if (task.requireConfirmation && (task.status === 'IN_PROGRESS' || task.status === 'PAUSED')) allowed = allowed.filter((s) => s !== 'DONE');
  if (!task.requireConfirmation && (task.status === 'IN_PROGRESS' || task.status === 'PAUSED')) allowed = allowed.filter((s) => s !== 'WAITING_CONFIRM');
  if (task.status === 'WAITING_CONFIRM' && !isConfirmer) allowed = allowed.filter((s) => s !== 'DONE');
  const overdue = task.dueAt && new Date(task.dueAt) < new Date() && !['DONE', 'CANCELLED'].includes(task.status);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4" onClick={onClose}>
      <div className="my-4 w-full max-w-2xl rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Шапка */}
        <div className="flex items-start justify-between gap-3 border-b border-ink/10 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {task.important ? <span title="Важная" className="text-amber-500">▲</span> : null}
              <span className={`rounded-full px-2.5 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">{task.kind === 'CLEANING' ? 'Уборка' : 'Задача'}</span>
              {task.blocksSale ? <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs text-rose-700">снят с продажи</span> : null}
              {task.parentTaskId ? <span title="Эта задача вернулась после закрытия другой" className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs text-sky-700">↩︎ возвратный шаг</span> : null}
              {task.tags.map((t) => (
                <span key={t.tagId} className="rounded-full px-2.5 py-0.5 text-xs" style={{ backgroundColor: `${t.tag.color}22`, color: t.tag.color }}>{t.tag.name}</span>
              ))}
            </div>
            <h2 className="mt-1.5 text-lg font-semibold text-ink">{task.room ? `№${task.room.number} · ` : task.zone ? `${task.zone.name} · ` : ''}{task.title}</h2>
            {task.description ? <p className="mt-1 whitespace-pre-wrap text-sm text-dark-gray">{task.description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-slate-400 hover:text-ink">×</button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Реквизиты */}
          <div className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            <p className="text-dark-gray">Исполнители: <span className="text-ink">{task.assignees.length ? task.assignees.map((a) => userName(a.userId)).join(', ') : '—'}</span></p>
            <p className="text-dark-gray">Наблюдатели: <span className="text-ink">{task.watchers.length ? task.watchers.map((w) => userName(w.userId)).join(', ') : '—'}</span></p>
            <p className="text-dark-gray">Создана: <span className="text-ink">{fmtDT(task.createdAt)} · {userName(task.createdBy)}</span></p>
            <p className="text-dark-gray">Важность: <span className="text-ink">{SEVERITY_RU[task.severity]}</span></p>
            {task.dueAt ? <p className="text-dark-gray">Срок: <span className={overdue ? 'font-semibold text-rose-600' : 'text-ink'}>{fmtDT(task.dueAt)}</span></p> : null}
            {task.scheduledAt && task.status === 'PLAN' ? <p className="text-dark-gray">Активация: <span className="text-ink">{fmtDT(task.scheduledAt)}</span></p> : null}
            {task.workSeconds > 0 ? <p className="text-dark-gray">В работе: <span className="text-ink">{fmtMin(task.workSeconds)}</span></p> : null}
            {task.supervisorId ? <p className="text-dark-gray">Супервайзер: <span className="text-ink">{userName(task.supervisorId)}</span></p> : null}
            {task.group ? <p className="text-dark-gray">Отдел: <span className="inline-flex items-center gap-1 text-ink"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: task.group.color }} />{task.group.name}</span></p> : null}
            {task.requireConfirmation ? <p className="text-dark-gray">Завершение: <span className="text-violet-700">по подтверждению установщика</span></p> : null}
            {task.followUpText && !task.followUpFiredAt ? <p className="text-dark-gray sm:col-span-2">↩︎ После закрытия вернётся: <span className="text-ink">«{task.followUpText}»</span> → {userName(task.followUpAssigneeId ?? task.createdBy)}</p> : null}
          </div>

          {/* Статус-степпер (§4.3): контур = цвет статуса, заливка = текущий этап, hover = полупрозрачный тот же цвет */}
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              {STATUS_PIPELINE.map((s) => {
                const mode = s === task.status ? 'current' : allowed.includes(s) ? 'allowed' : 'muted';
                return <StageButton key={s} status={s} mode={mode} onClick={mode === 'allowed' ? () => changeStatus(s) : undefined} />;
              })}
              {task.status === 'CANCELLED' ? <StageButton status="CANCELLED" mode="current" /> : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {allowed.includes('PAUSED') ? <Button variant="secondary" onClick={() => changeStatus('PAUSED')}>Отложить</Button> : null}
              {canEdit && !['DONE', 'CANCELLED'].includes(task.status) ? <Button variant="secondary" onClick={() => setDelegating(true)}>Делегировать</Button> : null}
              {canEdit ? <Button variant="secondary" onClick={() => setEditing(true)}>Изменить</Button> : null}
              {allowed.includes('CANCELLED') ? <Button variant="secondary" onClick={() => changeStatus('CANCELLED')}>Отменить</Button> : null}
              {task.kind === 'CLEANING' && task.status === 'DONE' && canInspect ? (
                <Button variant="secondary" onClick={() => run(() => adminApi.opsInspect(taskId))}>Проверено (инспекция)</Button>
              ) : null}
              {task.roomId ? <Button variant="secondary" onClick={() => setWriteoff(true)}>Списать расходники</Button> : null}
            </div>
          </div>

          {/* Подтверждение установщика (§3.2) */}
          {task.status === 'WAITING_CONFIRM' ? (
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
              <p className="text-sm text-violet-800">
                Исполнитель отметил задачу выполненной.{' '}
                {isConfirmer ? 'Проверьте результат и подтвердите завершение — или верните на доработку.' : 'Ожидает подтверждения установщика/руководителя.'}
              </p>
              {isConfirmer ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button onClick={() => changeStatus('DONE')}>Подтвердить (завершить)</Button>
                  <Button variant="secondary" onClick={() => changeStatus('IN_PROGRESS')}>Вернуть на доработку</Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Блокер отложенной задачи (workflow-ТЗ §2.1): видно, почему и до какого срока «висит» */}
          {task.status === 'PAUSED' && task.blockerKind ? (
            <div className="rounded-lg border border-slate-300 bg-slate-50 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700"><span>{BLOCKER[task.blockerKind].icon}</span>Отложена: {BLOCKER[task.blockerKind].label}</p>
              {task.blockerNote ? <p className="mt-1 text-sm text-slate-600">{task.blockerNote}</p> : null}
              <p className="mt-1 text-xs text-slate-500">
                {task.pausedSince ? `отложена ${fmtDT(task.pausedSince)}` : ''}
                {task.blockerUntil ? ` · ${task.blockerKind === 'SCHEDULED' ? 'вернётся в работу' : 'ожидается решение'} ${fmtDT(task.blockerUntil)}` : ''}
              </p>
              <div className="mt-2"><Button variant="secondary" onClick={() => changeStatus('IN_PROGRESS')}>Возобновить</Button></div>
            </div>
          ) : null}

          {/* Диалог откладывания: выбор причины блокера + заметка + ожидаемая дата */}
          {pausing ? (
            <div className="rounded-lg border border-slate-300 bg-slate-50 p-3">
              <p className="mb-2 text-sm font-medium text-slate-700">Отложить задачу — почему?</p>
              <div className="mb-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {(Object.keys(BLOCKER) as OpsBlockerKind[]).map((k) => (
                  <button key={k} type="button" onClick={() => setBlockerKind(k)}
                    className={`rounded-lg border px-2 py-1.5 text-left text-xs transition ${blockerKind === k ? 'border-slate-500 bg-white font-medium text-ink shadow-sm' : 'border-ink/15 text-slate-600 hover:border-ink/30'}`}>
                    <span className="mr-1">{BLOCKER[k].icon}</span>{BLOCKER[k].label}
                  </button>
                ))}
              </div>
              {blockerKind ? (
                <div className="space-y-2">
                  <input value={blockerNote} onChange={(e) => setBlockerNote(e.target.value)} placeholder="Заметка (необязательно): что ждём, номер заявки…" className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm" />
                  <label className="block text-xs text-slate-500">
                    {blockerKind === 'SCHEDULED' ? 'Дата возврата в работу' : task.dueAt ? 'Ожидаемая дата решения (необязательно)' : 'Ожидаемая дата решения'}
                    <input type="datetime-local" value={blockerUntil} min={toLocalInput(new Date())} onChange={(e) => setBlockerUntil(e.target.value)} className="mt-1 block w-full rounded-md border border-ink/20 px-3 py-2 text-sm text-ink" />
                  </label>
                </div>
              ) : null}
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" onClick={() => { setPausing(false); setBlockerKind(''); setBlockerNote(''); setBlockerUntil(''); }}>Отмена</Button>
                <Button disabled={!blockerKind} onClick={submitPause}>Отложить</Button>
              </div>
            </div>
          ) : null}

          {cancelNote !== null ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="mb-2 text-sm text-rose-700">Причина отмены (обязательно):</p>
              <div className="flex gap-2">
                <input value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm" placeholder="Почему отменяем?" />
                <Button variant="secondary" onClick={() => setCancelNote(null)}>Не отменять</Button>
                <Button disabled={!cancelNote.trim()} onClick={() => { run(() => adminApi.opsStatus(taskId, 'CANCELLED', cancelNote ?? '')); setCancelNote(null); }}>Отменить задачу</Button>
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          {/* Блок номера (§4.3): гость (ops_guest_info), DND, «просит уборку», история задач. */}
          {task.room ? (
            <div className="rounded-lg border border-ink/10 bg-slate-50/60 p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-ink">№{task.room.number}</span>
                {task.room.floor ? <span className="text-slate-400">этаж {task.room.floor}</span> : null}
                {task.room.dndUntil && new Date(task.room.dndUntil) > new Date()
                  ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">DND до {fmtDT(task.room.dndUntil)}</span> : null}
                {task.room.cleanRequestedAt ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">просит уборку</span> : null}
                <a href={`/ops/tasks?roomId=${task.room.id}`} className="ml-auto text-xs text-primary-700 hover:underline">Все задачи номера →</a>
              </div>
              {task.guestInfo ? (
                <p className="mt-1.5 text-xs text-dark-gray">
                  Гость: <span className="text-ink">{task.guestInfo.name}</span>
                  {task.guestInfo.phone ? ` · ${task.guestInfo.phone}` : ''}
                  {' · '}{task.guestInfo.status === 'CHECKED_IN' ? 'проживает' : 'заезд'} {new Date(task.guestInfo.checkIn).toLocaleDateString('ru-RU')}–{new Date(task.guestInfo.checkOut).toLocaleDateString('ru-RU')}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {task.room.dndUntil && new Date(task.room.dndUntil) > new Date() ? (
                  <button type="button" className="rounded-md border border-ink/15 px-2 py-1 text-slate-600 hover:border-ink/30" onClick={() => run(() => adminApi.opsDnd(task.room!.id, null))}>Снять DND</button>
                ) : (
                  <>
                    <button type="button" className="rounded-md border border-ink/15 px-2 py-1 text-slate-600 hover:border-ink/30" onClick={() => run(() => adminApi.opsDnd(task.room!.id, new Date(Date.now() + 2 * 3600_000).toISOString()))}>DND 2 часа</button>
                    <button type="button" className="rounded-md border border-ink/15 px-2 py-1 text-slate-600 hover:border-ink/30" onClick={() => { const d = new Date(); d.setHours(24, 0, 0, 0); run(() => adminApi.opsDnd(task.room!.id, d.toISOString())); }}>DND до завтра</button>
                  </>
                )}
                <button type="button" className={`rounded-md border px-2 py-1 ${task.room.cleanRequestedAt ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-ink/15 text-slate-600 hover:border-ink/30'}`} onClick={() => run(() => adminApi.opsCleanRequest(task.room!.id, !task.room!.cleanRequestedAt))}>
                  {task.room.cleanRequestedAt ? 'Снять «просит уборку»' : 'Просит уборку'}
                </button>
              </div>
            </div>
          ) : null}

          {/* Чек-листы (§5.3) */}
          {task.checklists.map((cl) => <ChecklistBlock key={cl.id} task={task} cl={cl} onRun={run} onPhoto={(itemId) => { photoTarget.current = { clId: cl.id, itemId }; fileRef.current?.click(); }} />)}

          {/* Вложения: фото, видео и файлы (§4.1) */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-sm font-medium text-ink">Фото, видео и файлы</p>
              <Button variant="secondary" onClick={() => { photoTarget.current = null; fileRef.current?.click(); }}>Добавить файл</Button>
            </div>
            {task.attachments.length === 0 ? <p className="text-xs text-slate-400">Нет вложений.</p> : (
              <div className="flex flex-wrap gap-2">
                {task.attachments.map((a) => (
                  <a key={a.id} href={fileUrl(a.fileUrl)} target="_blank" rel="noreferrer" title={a.name ?? ''} className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-ink/10 bg-slate-50">
                    {isImage(a.fileUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fileUrl(a.fileUrl)} alt={a.name ?? ''} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex flex-col items-center gap-1 px-1 text-center">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-6 w-6 text-slate-400"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" /><path d="M14 2v6h6" /></svg>
                        <span className="w-full truncate text-[9px] text-slate-500">{(a.name ?? a.fileUrl).split('.').pop()?.toUpperCase()}</span>
                      </span>
                    )}
                  </a>
                ))}
              </div>
            )}
            <input
              ref={fileRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                const target = photoTarget.current;
                run(() => target ? adminApi.opsAnswerPhoto(taskId, target.clId, target.itemId, f) : adminApi.opsAttach(taskId, f));
              }}
            />
          </div>

          {/* Комментарии (§4.3) */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">Комментарии</p>
            <div className="space-y-2">
              {task.comments.map((c) => (
                <div key={c.id} className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-400">{userName(c.authorId)} · {fmtDT(c.createdAt)}</p>
                  <p className="whitespace-pre-wrap text-sm text-ink">{c.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && comment.trim()) { run(() => adminApi.opsComment(taskId, comment.trim())); setComment(''); } }} placeholder="Написать комментарий…" className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm" />
              <Button disabled={!comment.trim()} onClick={() => { run(() => adminApi.opsComment(taskId, comment.trim())); setComment(''); }}>Отправить</Button>
            </div>
          </div>

          {/* История статусов */}
          <details className="text-sm">
            <summary className="cursor-pointer text-dark-gray">История статусов ({task.statusLog.length})</summary>
            <div className="mt-2 space-y-1">
              {task.statusLog.map((l) => (
                <p key={l.id} className="text-xs text-slate-500">
                  {fmtDT(l.at)} · {STATUS[l.from].label} → {STATUS[l.to].label} · {userName(l.actorId)}{l.note ? ` · ${l.note}` : ''}
                </p>
              ))}
            </div>
          </details>
        </div>
      </div>
      {writeoff ? <WriteoffModal task={task} onClose={() => setWriteoff(false)} onDone={(msg) => { setWriteoff(false); void adminApi.opsComment(taskId, msg).then(() => { void load(); }); }} /> : null}
      {editing ? <EditTaskForm task={task} staff={staff} tags={tags} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void load(); onChanged(); }} /> : null}
      {delegating ? <DelegatePanel task={task} staff={staff} groups={groups} onClose={() => setDelegating(false)} onDone={() => { setDelegating(false); void load(); onChanged(); }} /> : null}
    </div>
  );
}

/** Кнопка-этап статуса (§4.3): контур = цвет статуса, заливка = текущий, hover = полупрозрачный тот же цвет. */
function StageButton({ status, mode, onClick }: { status: OpsStatus; mode: 'current' | 'allowed' | 'muted'; onClick?: () => void }) {
  const [hover, setHover] = useState(false);
  const c = STATUS[status].dot;
  const style: React.CSSProperties =
    mode === 'current' ? { backgroundColor: c, color: '#fff', borderColor: c }
    : mode === 'allowed' ? { backgroundColor: hover ? `${c}22` : 'transparent', color: c, borderColor: c }
    : { backgroundColor: 'transparent', color: '#94a3b8', borderColor: '#e2e8f0', opacity: 0.7 };
  return (
    <button
      type="button" disabled={mode !== 'allowed'} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      className="rounded-full border px-3 py-1 text-xs font-medium transition disabled:cursor-default"
      style={style}
    >{STATUS[status].label}</button>
  );
}

/** Делегирование задачи (§4.4): передать сотруднику или отделу; прежние — в наблюдатели. */
function DelegatePanel({ task, staff, groups, onClose, onDone }: { task: OpsTaskFull; staff: OpsStaff[]; groups: OpsGroup[]; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<'person' | 'group'>('person');
  const [userId, setUserId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const list = search.trim() ? staff.filter((s) => (s.name ?? s.email).toLowerCase().includes(search.trim().toLowerCase())) : staff;
  const canSubmit = (mode === 'person' ? userId : groupId) && !busy;

  const submit = () => {
    setBusy(true); setError('');
    adminApi.opsDelegate(task.id, { toUserId: mode === 'person' ? userId : undefined, toGroupId: mode === 'group' ? groupId : undefined, note: note.trim() || undefined })
      .then(onDone).catch((e) => { setError(e instanceof Error ? e.message : 'Ошибка'); setBusy(false); });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-ink/40 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-md rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <h3 className="text-base font-semibold text-ink">Делегировать задачу</h3>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-slate-400 hover:text-ink">×</button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 text-xs" style={{ width: 'fit-content' }}>
            <button type="button" onClick={() => setMode('person')} className={`rounded-md px-3 py-1 transition ${mode === 'person' ? 'bg-white font-medium text-ink shadow-sm' : 'text-slate-500'}`}>Сотрудник</button>
            {groups.length > 0 ? <button type="button" onClick={() => setMode('group')} className={`rounded-md px-3 py-1 transition ${mode === 'group' ? 'bg-white font-medium text-ink shadow-sm' : 'text-slate-500'}`}>Отдел</button> : null}
          </div>
          {mode === 'person' ? (
            <>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск сотрудника…" className="w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm" />
              <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {list.map((s) => (
                  <button key={s.id} type="button" onClick={() => setUserId(s.id)} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${userId === s.id ? 'bg-primary-50 text-primary-700' : 'hover:bg-slate-50 text-ink'}`}>
                    <span className="truncate">{s.name ?? s.email}</span>
                    {userId === s.id ? <span className="ml-auto text-xs text-primary-600">✓</span> : null}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => (
                <button key={g.id} type="button" onClick={() => setGroupId(g.id)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition ${groupId === g.id ? 'border-transparent text-white shadow-sm' : 'border-ink/15 text-slate-600 hover:border-ink/30'}`} style={groupId === g.id ? { backgroundColor: g.color } : {}}>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.color }} />{g.name}
                </button>
              ))}
            </div>
          )}
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Комментарий (необязательно)" className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm" />
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onClose}>Отмена</Button>
            <Button disabled={!canSubmit} onClick={submit}>Делегировать</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Редактирование задачи (§4.4): доступно создателю, исполнителю, супервайзеру, ops_manage. */
function EditTaskForm({ task, staff, tags, onClose, onSaved }: { task: OpsTaskFull; staff: OpsStaff[]; tags: OpsTag[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [important, setImportant] = useState(task.important);
  const [severity, setSeverity] = useState(task.severity);
  const [requireConfirmation, setRequireConfirmation] = useState(task.requireConfirmation);
  const [dueAt, setDueAt] = useState(task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 16) : '');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(task.assignees.map((a) => a.userId));
  const [watcherIds, setWatcherIds] = useState<string[]>(task.watchers.map((w) => w.userId));
  const [tagIds, setTagIds] = useState<string[]>(task.tags.map((t) => t.tagId));
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const list = search.trim() ? staff.filter((s) => (s.name ?? s.email).toLowerCase().includes(search.trim().toLowerCase())) : staff;

  const submit = () => {
    setBusy(true); setError('');
    adminApi.opsUpdateTask(task.id, {
      title: title.trim(), description: description.trim() || null, important, severity, requireConfirmation,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      assigneeIds, watcherIds, tagIds,
    }).then(onSaved).catch((e) => { setError(e instanceof Error ? e.message : 'Ошибка'); setBusy(false); });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-ink/40 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-lg rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <h3 className="text-base font-semibold text-ink">Редактировать задачу</h3>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-slate-400 hover:text-ink">×</button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название" className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Описание" rows={2} className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm" />
          <div className="flex flex-wrap items-center gap-4 text-sm text-dark-gray">
            <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />Важная</label>
            <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={requireConfirmation} onChange={(e) => setRequireConfirmation(e.target.checked)} />Требует подтверждения</label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)} className="rounded-md border border-ink/20 bg-white px-3 py-2 text-sm">
              {Object.entries(SEVERITY_RU).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <label className="flex items-center gap-1.5">Срок<input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="rounded-md border border-ink/20 px-2 py-1 text-sm" /></label>
          </div>
          <div>
            <p className="mb-1 text-sm text-dark-gray">Исполнители</p>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск…" className="mb-1.5 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm" />
            <div className="flex max-h-28 flex-col gap-1 overflow-y-auto">
              {list.map((s) => (
                <button key={s.id} type="button" onClick={() => toggle(assigneeIds, setAssigneeIds, s.id)} className={`flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition ${assigneeIds.includes(s.id) ? 'bg-primary-50 text-primary-700' : 'hover:bg-slate-50 text-ink'}`}>
                  <span className="truncate">{s.name ?? s.email}</span>{assigneeIds.includes(s.id) ? <span className="ml-auto text-xs text-primary-600">✓</span> : null}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm text-dark-gray">Наблюдатели</p>
            <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
              {staff.map((s) => (
                <button key={s.id} type="button" onClick={() => toggle(watcherIds, setWatcherIds, s.id)} className={`rounded-full border px-2.5 py-1 text-xs transition ${watcherIds.includes(s.id) ? 'border-primary bg-primary-100 text-primary-700' : 'border-ink/15 text-slate-500 hover:border-ink/30'}`}>{s.name ?? s.email}</button>
              ))}
            </div>
          </div>
          {tags.length > 0 ? (
            <div>
              <p className="mb-1 text-sm text-dark-gray">Теги</p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <button key={t.id} type="button" onClick={() => toggle(tagIds, setTagIds, t.id)} className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${tagIds.includes(t.id) ? 'border-transparent' : 'border-ink/15 text-slate-500 hover:border-ink/30'}`} style={tagIds.includes(t.id) ? { backgroundColor: `${t.color}22`, color: t.color, borderColor: t.color } : {}}>{t.name}</button>
                ))}
              </div>
            </div>
          ) : null}
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onClose}>Отмена</Button>
            <Button disabled={!title.trim() || busy} onClick={submit}>Сохранить</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Списание расходников при уборке (§6.6): складской документ WRITE_OFF с привязкой к задаче. */
function WriteoffModal({ task, onClose, onDone }: { task: OpsTaskFull; onClose: () => void; onDone: (msg: string) => void }) {
  const [warehouses, setWarehouses] = useState<WhWarehouse[]>([]);
  const [items, setItems] = useState<WhItem[]>([]);
  const [lists, setLists] = useState<OpsWriteoffList[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [rows, setRows] = useState<{ itemId: string; qty: number }[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void adminApi.whWarehouses().then((w) => { const act = w.filter((x) => x.active); setWarehouses(act); if (act[0]) setWarehouseId(act[0].id); }).catch(() => setError('Нет доступа к складу (нужны складские права)'));
    void adminApi.whItems().then(setItems).catch(() => undefined);
    void adminApi.opsWriteoffLists().then((ls) => {
      setLists(ls);
      // Предзаполнение листом, подходящим под тип уборки (§6.6).
      const match = ls.find((l) => l.cleaningTypeId && l.cleaningTypeId === task.cleaningTypeId) ?? ls.find((l) => !l.cleaningTypeId);
      if (match) setRows(match.items.map((i) => ({ ...i })));
    }).catch(() => undefined);
  }, [task.cleaningTypeId]);

  const itemName = (id: string) => items.find((i) => i.id === id);
  const setQty = (itemId: string, qty: number) => setRows((r) => r.map((x) => (x.itemId === itemId ? { ...x, qty } : x)));
  const found = q.trim() ? items.filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()) && !rows.some((r) => r.itemId === i.id)).slice(0, 6) : [];

  const submit = () => {
    setBusy(true); setError('');
    const clean = rows.filter((r) => r.qty > 0);
    adminApi.opsWriteoff(task.id, { warehouseId, items: clean })
      .then((doc) => onDone(`Списаны расходники: документ ${doc.number} (${clean.length} поз.)`))
      .catch((e) => { setError(e instanceof Error ? e.message : 'Ошибка'); setBusy(false); });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-ink/40 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-md rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <h3 className="text-base font-semibold text-ink">Списание расходников{task.room ? ` · №${task.room.number}` : ''}</h3>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-slate-400 hover:text-ink">×</button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <label className="block"><span className="mb-1 block text-sm text-dark-gray">Склад</span>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm">
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}{w.address ? ` · ${w.address.name}` : ''}</option>)}
            </select>
          </label>
          {lists.length > 0 ? (
            <label className="block"><span className="mb-1 block text-sm text-dark-gray">Лист списания</span>
              <select defaultValue="" onChange={(e) => { const l = lists.find((x) => x.id === e.target.value); if (l) setRows(l.items.map((i) => ({ ...i }))); }} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm">
                <option value="">— выбрать лист —</option>
                {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
          ) : null}
          <div className="space-y-1.5">
            {rows.map((r) => {
              const it = itemName(r.itemId);
              return (
                <div key={r.itemId} className="flex items-center gap-2 rounded-lg border border-ink/10 px-3 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate text-ink">{it?.name ?? r.itemId}</span>
                  <input type="number" min={0} step="any" value={r.qty} onChange={(e) => setQty(r.itemId, Number(e.target.value))} className="w-20 rounded-md border border-ink/15 px-2 py-1 text-sm" />
                  <span className="w-8 text-xs text-slate-400">{it?.unit ?? ''}</span>
                  <button type="button" onClick={() => setRows((x) => x.filter((y) => y.itemId !== r.itemId))} className="text-slate-400 hover:text-rose-600">×</button>
                </div>
              );
            })}
            {rows.length === 0 ? <p className="text-xs text-slate-400">Добавьте позиции поиском ниже или выберите лист.</p> : null}
          </div>
          <div className="relative">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти позицию склада…" className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm" />
            {found.length ? (
              <div className="absolute inset-x-0 top-full z-10 mt-1 rounded-lg border border-ink/10 bg-white shadow-lg">
                {found.map((i) => (
                  <button key={i.id} type="button" onClick={() => { setRows((r) => [...r, { itemId: i.id, qty: 1 }]); setQ(''); }} className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-slate-50">{i.name} <span className="text-xs text-slate-400">({i.unit})</span></button>
                ))}
              </div>
            ) : null}
          </div>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onClose}>Отмена</Button>
            <Button disabled={busy || !warehouseId || rows.filter((r) => r.qty > 0).length === 0} onClick={submit}>Списать</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Блок одного чек-листа: пункты, ответы Да/Нет/доп., фото-статусы, автозавершение. */
function ChecklistBlock({ task, cl, onRun, onPhoto }: {
  task: OpsTaskFull;
  cl: OpsTaskChecklist;
  onRun: (fn: () => Promise<unknown>) => void;
  onPhoto: (itemId: string) => void;
}) {
  const answers = new Map(cl.answers.map((a) => [a.itemId, a]));
  const progress = checklistProgress(cl.itemsSnapshot, cl.answers);
  const items = [...cl.itemsSnapshot].sort((a, b) => a.order - b.order);

  return (
    <div className="rounded-lg border border-ink/10 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">Чек-лист: {cl.name} {cl.requiredBeforeStart ? <span className="text-xs text-amber-600">(перед началом)</span> : null}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{progress}%</span>
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${progress}%` }} /></div>
        </div>
      </div>
      <div className="space-y-1">
        {items.map((i) => {
          if (i.kind === 'HEADER') return <p key={i.id} className="pt-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{i.text}</p>;
          const a = answers.get(i.id);
          const photoCls = !a ? 'text-slate-300' : a.photoUrl ? 'text-emerald-500' : 'text-rose-500';
          const answerBtn = (val: string, label: string) => (
            <button
              type="button"
              onClick={() => onRun(() => adminApi.opsAnswer(task.id, cl.id, i.id, val))}
              className={`rounded-md border px-2 py-0.5 text-xs transition ${a?.answer === val ? (val === 'NO' ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-emerald-300 bg-emerald-50 text-emerald-700') : 'border-ink/15 text-slate-500 hover:border-ink/30'}`}
            >{label}</button>
          );
          return (
            <div key={i.id} className={`rounded-md px-2 py-1 hover:bg-slate-50 ${i.kind === 'SUBITEM' ? 'ml-5' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 text-sm text-ink">{i.text}{a?.answer === 'AUTO' ? <span className="ml-1 text-xs text-slate-400">(авто)</span> : null}</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  {answerBtn('YES', 'Да')}
                  {answerBtn('NO', 'Нет')}
                  {i.thirdOption ? answerBtn('THIRD', i.thirdOption) : null}
                  {i.requirePhoto || a?.photoUrl ? (
                    <button type="button" title={i.requirePhoto ? 'Фото обязательно' : 'Фото'} onClick={() => onPhoto(i.id)} className={photoCls}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-4 w-4"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2v11ZM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /></svg>
                    </button>
                  ) : null}
                </div>
              </div>
              <ItemComment taskId={task.id} clId={cl.id} itemId={i.id} initial={a?.comment ?? ''} onRun={onRun} />
            </div>
          );
        })}
      </div>
      {cl.answers.some((a) => a.answer === 'NO') ? (
        <p className="mt-1.5 text-xs text-rose-500">Ошибки (Нет): {cl.answers.filter((a) => a.answer === 'NO').length} — {cl.answers.filter((a) => a.answer === 'NO').map((a) => ANSWER_LABEL[a.answer] && items.find((i) => i.id === a.itemId)?.text).filter(Boolean).join('; ')}</p>
      ) : null}
    </div>
  );
}

/** Комментарий к пункту чек-листа (§5.3): сохраняется отдельно от ответа Да/Нет. */
function ItemComment({ taskId, clId, itemId, initial, onRun }: {
  taskId: string; clId: string; itemId: string; initial: string;
  onRun: (fn: () => Promise<unknown>) => void;
}) {
  const [val, setVal] = useState(initial);
  const [open, setOpen] = useState(Boolean(initial));
  useEffect(() => { setVal(initial); if (initial) setOpen(true); }, [initial]);
  const save = () => { if (val.trim() !== initial.trim()) onRun(() => adminApi.opsAnswer(taskId, clId, itemId, undefined, val.trim())); };
  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="mt-0.5 text-[11px] text-slate-400 hover:text-primary-600">＋ комментарий</button>;
  }
  return (
    <input
      value={val} onChange={(e) => setVal(e.target.value)} onBlur={save}
      onKeyDown={(e) => { if (e.key === 'Enter') { save(); (e.target as HTMLInputElement).blur(); } }}
      placeholder="Комментарий к пункту…" autoFocus={!initial}
      className="mt-1 w-full rounded-md border border-ink/15 bg-slate-50/50 px-2 py-1 text-xs text-ink"
    />
  );
}
