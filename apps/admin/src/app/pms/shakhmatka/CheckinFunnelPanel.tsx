'use client';

import { useEffect, useState } from 'react';
import { adminApi, type CheckinFunnelPanel as PanelData } from '../../../lib/api';

/**
 * Панель «Заселение» в окне брони (CHECK-IN-TZ §1/§11, спринт 1 — read-only).
 * Вторая ось статусов: стадия воронки самозаезда внутри CONFIRMED + цветовая
 * индикация шлюзов (контакт/регистрация/оплата/номер/окно) и журнал ключей.
 */

const STAGE_META: Record<PanelData['stage'], { label: string; badge: string }> = {
  AWAITING: { label: 'Ожидание гостя', badge: 'bg-slate-100 text-slate-600' },
  IDENTIFIED: { label: 'Контакт есть', badge: 'bg-indigo-50 text-indigo-600' },
  REGISTERED: { label: 'Регистрация пройдена', badge: 'bg-indigo-100 text-indigo-700' },
  PAID: { label: 'Оплачено', badge: 'bg-violet-100 text-violet-700' },
  READY: { label: 'Готов к заезду', badge: 'bg-emerald-100 text-emerald-700' },
  KEY_ISSUED: { label: 'Ключ выдан', badge: 'bg-emerald-500 text-white' },
  COMPLETED: { label: 'Воронка завершена', badge: 'bg-sky-100 text-sky-700' },
  NO_SHOW: { label: 'Незаезд', badge: 'bg-rose-100 text-rose-700' },
  CANCELLED: { label: 'Бронь отменена', badge: 'bg-rose-100 text-rose-700' },
};

/** Порядок стадий для степпера (терминальные не показываем в шкале). */
const STEPPER: PanelData['stage'][] = ['AWAITING', 'IDENTIFIED', 'REGISTERED', 'PAID', 'READY', 'KEY_ISSUED'];

const GATE_LABEL: Record<string, string> = {
  contact_verified: 'Контакт гостя',
  registration_approved: 'Онлайн-регистрация',
  payment_paid: 'Оплата/депозит',
  room_assigned: 'Номер назначен',
  time_window_open: 'Окно выдачи ключа',
};

const KEY_STATUS_LABEL: Record<string, string> = {
  ISSUING: 'создаётся',
  ACTIVE: 'активен',
  REVOKED: 'отозван',
  FAILED: 'ошибка',
};

const fmtDT = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function CheckinFunnelPanel({ bookingId, bookingStatus }: { bookingId: string; bookingStatus: string }) {
  const [data, setData] = useState<PanelData | null>(null);
  const [err, setErr] = useState(false);
  const [linkMsg, setLinkMsg] = useState('');
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [ovMsg, setOvMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [working, setWorking] = useState(false);

  const reload = () =>
    adminApi.pmsCheckinPanel(bookingId).then((d) => { setData(d); setErr(false); }).catch(() => setErr(true));

  /** Ручной override брони в критической ситуации (§11) с подтверждением. */
  const doOverride = (action: 'issue_key' | 'no_show' | 'cancel', confirmText: string) => {
    if (!confirm(confirmText)) return;
    setWorking(true); setOvMsg(null);
    void adminApi.pmsCheckinOverride(bookingId, action)
      .then((r) => { setOvMsg({ ok: r.ok, text: r.message }); if (r.ok) void reload(); })
      .catch(() => setOvMsg({ ok: false, text: 'Не удалось выполнить действие' }))
      .finally(() => setWorking(false));
  };

  /** Выпустить magic-link гостевого портала и скопировать в буфер (CHECK-IN-TZ §4). */
  const copyLink = () => {
    setLinkMsg('');
    void adminApi.pmsCheckinLink(bookingId)
      .then(async ({ url }) => {
        try { await navigator.clipboard.writeText(url); setLinkMsg('Ссылка скопирована'); }
        catch { setLinkMsg(url); }
      })
      .catch(() => setLinkMsg('Не удалось выпустить ссылку'));
  };

  /** Отправить гостю приглашение с анкетой прямо сейчас (email/СМС) + показать исход. */
  const sendInvite = () => {
    setSending(true); setInviteMsg(null);
    void adminApi.pmsSendCheckinInvite(bookingId)
      .then(({ results }) => {
        const chLabel: Record<string, string> = { EMAIL: 'почта', SMS: 'СМС', PUSH: 'пуш', TELEGRAM: 'Telegram' };
        const sent = results.filter((r) => r.status === 'sent').map((r) => chLabel[r.channel] ?? r.channel);
        const failed = results.filter((r) => r.status === 'failed');
        if (failed.length) {
          setInviteMsg({ ok: false, text: `Ошибка: ${failed.map((r) => `${chLabel[r.channel] ?? r.channel} — ${r.error ?? 'не отправлено'}`).join('; ')}` });
        } else if (sent.length) {
          setInviteMsg({ ok: true, text: `Отправлено: ${sent.join(', ')}` });
        } else {
          setInviteMsg({ ok: false, text: 'Не отправлено: у гостя нет контактов для доступных каналов' });
        }
      })
      .catch(() => setInviteMsg({ ok: false, text: 'Не удалось отправить приглашение' }))
      .finally(() => setSending(false));
  };

  useEffect(() => {
    let alive = true;
    adminApi.pmsCheckinPanel(bookingId)
      .then((d) => { if (alive) { setData(d); setErr(false); } })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
    // Пересчитываем при смене статуса шахматки (заезд/выезд меняют стадию).
  }, [bookingId, bookingStatus]);

  if (err) return null; // нет права/сети — панель просто не показываем
  if (!data) {
    return (
      <div className="rounded-xl border border-ink/10 p-4">
        <p className="text-xs uppercase tracking-wide text-dark-gray">Заселение</p>
        <p className="mt-2 text-sm text-dark-gray">Загрузка…</p>
      </div>
    );
  }

  const sm = STAGE_META[data.stage];
  const stepIdx = STEPPER.indexOf(data.stage);
  const terminal = stepIdx === -1;

  return (
    <div className="rounded-xl border border-ink/10 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-dark-gray">Заселение</p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${sm.badge}`}>{sm.label}</span>
      </div>

      {/* Степпер воронки */}
      {!terminal ? (
        <div className="mb-3 flex items-center gap-1">
          {STEPPER.map((s, i) => (
            <div key={s} title={STAGE_META[s].label}
              className={`h-1.5 flex-1 rounded-full ${i <= stepIdx ? 'bg-indigo-500' : 'bg-ink/10'}`} />
          ))}
        </div>
      ) : null}

      {/* Шлюзы */}
      <ul className="space-y-1.5">
        {data.gates.map((g) => (
          <li key={g.key} className="flex items-start gap-2 text-sm">
            <span className={`mt-0.5 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full text-[10px] font-bold ${g.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>
              {g.ok ? '✓' : '✕'}
            </span>
            <span className="min-w-0">
              <span className={g.ok ? 'text-ink' : 'text-dark-gray'}>{GATE_LABEL[g.key] ?? g.key}</span>
              {!g.ok && g.reason ? <span className="block text-xs text-rose-600/80">{g.reason}</span> : null}
            </span>
          </li>
        ))}
      </ul>

      {/* Окно ключа + номер + ссылка заселения */}
      <div className="mt-3 space-y-0.5 border-t border-ink/10 pt-2 text-xs text-dark-gray">
        <p>Окно ключа: {fmtDT(data.window.start)} — {fmtDT(data.window.end)}</p>
        <p>Номер: {data.roomName ?? 'не назначен'}</p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <button type="button" onClick={copyLink} className="rounded-md border border-ink/20 px-2 py-1 text-xs text-ink hover:bg-ink/5">
            🔗 Ссылка заселения (портал)
          </button>
          <button type="button" onClick={sendInvite} disabled={sending}
            className="rounded-md border border-ink/20 px-2 py-1 text-xs text-ink hover:bg-ink/5 disabled:opacity-50">
            {sending ? 'Отправка…' : '✉️ Отправить приглашение гостю'}
          </button>
        </div>
        {linkMsg ? <p className="mt-1 break-all text-[11px] text-indigo-600">{linkMsg}</p> : null}
        {inviteMsg ? <p className={`mt-1 break-words text-[11px] ${inviteMsg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{inviteMsg.text}</p> : null}
      </div>

      {/* Критические действия (ручной override, §11) — только пока бронь подтверждена */}
      {bookingStatus === 'CONFIRMED' ? (
        <div className="mt-2 border-t border-ink/10 pt-2">
          <p className="mb-1 text-xs uppercase tracking-wide text-dark-gray">Критические действия</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" disabled={working}
              onClick={() => doOverride('issue_key', 'Выдать цифровой ключ сейчас, минуя обычные проверки воронки?')}
              className="rounded-md border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
              🔑 Выдать ключ сейчас
            </button>
            <button type="button" disabled={working}
              onClick={() => doOverride('no_show', 'Отметить бронь как НЕЗАЕЗД? Статус на шахматке изменится.')}
              className="rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-50">
              🚫 Незаезд
            </button>
            <button type="button" disabled={working}
              onClick={() => doOverride('cancel', 'ОТМЕНИТЬ бронь? Статус на шахматке изменится на «Отменена».')}
              className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-50">
              ✖ Отменить бронь
            </button>
          </div>
          <p className="mt-1 text-[11px] text-dark-gray">Действия закрывают «ворота»/меняют статус штатно, а не подделывают этап.</p>
          {ovMsg ? <p className={`mt-1 text-[11px] ${ovMsg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{ovMsg.text}</p> : null}
        </div>
      ) : null}

      {/* Журнал ключей */}
      {data.keys.length > 0 ? (
        <div className="mt-2 border-t border-ink/10 pt-2">
          <p className="mb-1 text-xs uppercase tracking-wide text-dark-gray">Цифровые ключи</p>
          <ul className="space-y-0.5 text-xs">
            {data.keys.map((k, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="truncate text-ink">{k.doorName ?? 'Дверь'}</span>
                <span className={k.status === 'ACTIVE' ? 'text-emerald-600' : k.status === 'FAILED' ? 'text-rose-600' : 'text-dark-gray'}>
                  {KEY_STATUS_LABEL[k.status] ?? k.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
