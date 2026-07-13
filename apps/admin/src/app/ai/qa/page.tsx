'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@dha/ui';
import { adminApi, type QaDashboard, type QaReviewRow, type QaSentiment } from '../../../lib/api';
import { useRequireAdmin } from '../../../lib/use-admin';

const PERIODS = [7, 30, 90] as const;

const SENTIMENT_RU: Record<QaSentiment, string> = {
  POSITIVE: 'Позитив',
  NEUTRAL: 'Нейтрально',
  NEGATIVE: 'Негатив',
};
const SENTIMENT_CLS: Record<QaSentiment, string> = {
  POSITIVE: 'bg-emerald-50 text-emerald-700',
  NEUTRAL: 'bg-slate-100 text-slate-600',
  NEGATIVE: 'bg-rose-50 text-rose-700',
};
const CRITERIA_RU: Record<string, string> = {
  greeting: 'Приветствие',
  politeness: 'Вежливость',
  completeness: 'Полнота',
  compliance: 'Регламент',
  upsell: 'Апселл',
  escalation: 'Эскалация',
  respect: 'Уважение',
  pii: 'ПДн',
};

const shortId = (id: string) => id.slice(0, 8);

function fmtDur(sec: number | null): string {
  if (sec == null) return '—';
  if (sec < 60) return `${sec} с`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m} мин ${s} с` : `${m} мин`;
}
const fmtScore = (v: number | null) => (v == null ? '—' : String(v));
function scoreCls(v: number | null): string {
  if (v == null) return 'text-slate-400';
  if (v >= 80) return 'text-emerald-600';
  if (v >= 60) return 'text-amber-600';
  return 'text-rose-600';
}
function sentimentSummary(s: Record<QaSentiment, number>): string {
  const total = s.POSITIVE + s.NEUTRAL + s.NEGATIVE;
  return total ? `${Math.round((100 * s.POSITIVE) / total)}% 👍` : '—';
}

function Metric({
  label,
  value,
  hint,
  valueCls = 'text-ink',
}: {
  label: string;
  value: string;
  hint?: string;
  valueCls?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-dark-gray">{label}</p>
      <p className={`mt-1 text-2xl font-light ${valueCls}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </Card>
  );
}

export default function QaPage() {
  const ready = useRequireAdmin();
  const [days, setDays] = useState<number>(30);
  const [dash, setDash] = useState<QaDashboard | null>(null);
  const [reviews, setReviews] = useState<QaReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setNote(null);
    try {
      const [d, r] = await Promise.all([
        adminApi.qaDashboard(days),
        adminApi.qaReviews({ limit: 100 }),
      ]);
      setDash(d);
      setReviews(r);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  async function analyzePending() {
    setBusy(true);
    setNote(null);
    try {
      const res = await adminApi.qaAnalyzePending(20);
      await load();
      setNote(
        res.analyzed
          ? `Разобрано диалогов: ${res.analyzed}.`
          : 'Новых диалогов для разбора нет.',
      );
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Ошибка разбора');
    } finally {
      setBusy(false);
    }
  }

  async function reanalyze(conversationId: string) {
    setBusy(true);
    setNote(null);
    try {
      const updated = await adminApi.qaAnalyze(conversationId);
      setReviews((rs) => rs.map((r) => (r.conversationId === conversationId ? updated : r)));
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Ошибка разбора');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light text-ink">Качество чатов</h1>
          <p className="mt-1 text-sm text-dark-gray">
            AI-контроль диалогов операторов с гостями — метрики и оценка по стандартам (§5.7).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-ink/10 bg-white p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setDays(p)}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  days === p ? 'bg-primary text-white' : 'text-slate-500 hover:text-ink'
                }`}
              >
                {p} дн
              </button>
            ))}
          </div>
          <button
            onClick={() => void analyzePending()}
            disabled={busy}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Разбираю…' : 'Разобрать новые'}
          </button>
        </div>
      </div>

      {note && (
        <div className="mb-4 rounded-lg border border-primary-100 bg-primary-50 px-4 py-2 text-sm text-primary-700">
          {note}
        </div>
      )}

      {loading || !dash ? (
        <p className="text-dark-gray">Загрузка…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Metric
              label="Средний балл"
              value={fmtScore(dash.avgOverallScore)}
              valueCls={scoreCls(dash.avgOverallScore)}
              hint={`${dash.reviewed} разборов`}
            />
            <Metric
              label="В SLA"
              value={dash.slaRate == null ? '—' : `${dash.slaRate}%`}
              hint="первый ответ ≤ 5 мин"
            />
            <Metric label="Первый ответ" value={fmtDur(dash.avgFirstResponseSec)} hint="в среднем" />
            <Metric label="Подключение" value={fmtDur(dash.avgTimeToPickupSec)} hint="от эскалации" />
            <Metric label="Время ответа" value={fmtDur(dash.avgResponseSec)} hint="по репликам" />
            <Metric label="Решение" value={fmtDur(dash.avgResolutionSec)} hint="эскалация → закрытие" />
            <Metric
              label="Доля эскалаций"
              value={dash.conversations.escalationRate == null ? '—' : `${dash.conversations.escalationRate}%`}
              hint={`из ${dash.conversations.total} диалогов`}
            />
            <Metric
              label="Тональность"
              value={sentimentSummary(dash.sentiment)}
              hint={`${dash.sentiment.NEGATIVE} негативных`}
            />
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <Card>
              <p className="mb-3 text-sm font-medium text-ink">Частые нарушения</p>
              {dash.topFlags.length === 0 ? (
                <p className="text-sm text-slate-400">Нарушений не зафиксировано 🎉</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {dash.topFlags.map((f) => (
                    <span
                      key={f.flag}
                      className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs text-rose-700"
                    >
                      {f.flag}
                      <span className="rounded-full bg-rose-100 px-1.5 text-[10px] font-semibold">{f.count}</span>
                    </span>
                  ))}
                </div>
              )}
            </Card>
            <Card>
              <p className="mb-3 text-sm font-medium text-ink">По операторам</p>
              {dash.byOperator.length === 0 ? (
                <p className="text-sm text-slate-400">Нет данных.</p>
              ) : (
                <div className="space-y-1.5">
                  {dash.byOperator.map((o) => (
                    <div key={o.operatorId} className="flex items-center justify-between text-sm">
                      <span className="truncate text-slate-600">
                        {o.operatorId === '—' ? 'Без оператора' : (o.operatorName ?? shortId(o.operatorId))}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">{o.reviews} диал.</span>
                        <span className="text-xs text-slate-400">отв. {fmtDur(o.avgFirstResponseSec)}</span>
                        <span className={`w-8 text-right font-medium ${scoreCls(o.avgOverallScore)}`}>
                          {fmtScore(o.avgOverallScore)}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <h2 className="mb-3 mt-8 text-lg font-medium text-ink">Разборы диалогов</h2>
          {reviews.length === 0 ? (
            <Card>
              <p className="text-sm text-slate-400">
                Ещё нет разборов. Нажмите «Разобрать новые», чтобы проанализировать завершённые диалоги.
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {reviews.map((r) => {
                const open = expanded[r.id] ?? false;
                return (
                  <Card key={r.id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <span
                          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-50 text-lg font-semibold ${scoreCls(r.overallScore)}`}
                        >
                          {fmtScore(r.overallScore)}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-ink">Диалог {shortId(r.conversationId)}</p>
                          <p className="text-xs text-slate-400">
                            {new Date(r.createdAt).toLocaleString('ru')} ·{' '}
                            {r.operatorId ? `оператор ${r.operatorName ?? shortId(r.operatorId)}` : 'без оператора'}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {r.sentiment && (
                          <span className={`rounded-full px-2 py-0.5 text-[11px] ${SENTIMENT_CLS[r.sentiment]}`}>
                            {SENTIMENT_RU[r.sentiment]}
                          </span>
                        )}
                        <button
                          onClick={() => void reanalyze(r.conversationId)}
                          disabled={busy}
                          className="rounded-lg border border-ink/10 px-2.5 py-1 text-xs text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                        >
                          Разобрать
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-dark-gray">
                      <span>
                        Подключение: <b className="font-medium text-slate-600">{fmtDur(r.timeToPickupSec)}</b>
                      </span>
                      <span>
                        Первый ответ: <b className="font-medium text-slate-600">{fmtDur(r.firstResponseSec)}</b>
                        {r.withinSla === false && <span className="ml-1 text-rose-500">вне SLA</span>}
                      </span>
                      <span>
                        Решение: <b className="font-medium text-slate-600">{fmtDur(r.resolutionSec)}</b>
                      </span>
                      <span>
                        Реплик: <b className="font-medium text-slate-600">{r.guestMsgCount}/{r.staffMsgCount}</b>
                      </span>
                    </div>

                    {r.flags && r.flags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {r.flags.map((f, i) => (
                          <span key={i} className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700">
                            {f}
                          </span>
                        ))}
                      </div>
                    )}

                    {r.summary && <p className="mt-2 text-sm text-slate-600">{r.summary}</p>}

                    {r.criteria && (
                      <>
                        <button
                          onClick={() => setExpanded((s) => ({ ...s, [r.id]: !open }))}
                          className="mt-2 text-xs text-primary hover:underline"
                        >
                          {open ? 'Скрыть критерии' : 'Показать критерии'}
                        </button>
                        {open && (
                          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
                            {Object.entries(r.criteria).map(([k, v]) => (
                              <div key={k} className="flex items-center justify-between text-xs">
                                <span className="text-slate-500">{CRITERIA_RU[k] ?? k}</span>
                                <span
                                  className={`font-medium ${v >= 8 ? 'text-emerald-600' : v >= 5 ? 'text-amber-600' : 'text-rose-600'}`}
                                >
                                  {v}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </main>
  );
}
