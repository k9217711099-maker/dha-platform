'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, Card } from '@dha/ui';
import { adminApi, type KbImportJobRow, type KbImportReport, type KbImportResult, type KbImportTreeNode } from '../../../lib/api';
import { useRequireAdmin } from '../../../lib/use-admin';

function TreePreview({ nodes, depth = 0 }: { nodes: KbImportTreeNode[]; depth?: number }) {
  if (nodes.length === 0) return null;
  return (
    <ul className={depth > 0 ? 'ml-4 border-l border-neutral-200 pl-2' : ''}>
      {nodes.map((n) => (
        <li key={n.externalId} className="py-0.5 text-sm">
          <span className={n.exists ? 'text-neutral-400' : 'text-ink'}>
            {n.exists ? '~' : '+'} {n.title}
          </span>
          <TreePreview nodes={n.children} depth={depth + 1} />
        </li>
      ))}
    </ul>
  );
}

const JOB_STATUS: Record<KbImportJobRow['status'], string> = {
  PENDING: 'ожидает', RUNNING: 'выполняется', DONE: 'успешно', FAILED: 'ошибка',
};

/** Мастер импорта базы знаний из ZIP-экспорта Bitrix24 (KB-DRIVE-TZ.md §3.4). */
export default function KbImportPage() {
  const ready = useRequireAdmin();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<'upload' | 'confirm' | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [report, setReport] = useState<KbImportReport | null>(null);
  const [mode, setMode] = useState<'skip' | 'update'>('skip');
  const [result, setResult] = useState<KbImportResult | null>(null);
  const [error, setError] = useState('');
  const [jobs, setJobs] = useState<KbImportJobRow[]>([]);

  const loadJobs = () => adminApi.kbImportJobs().then(setJobs).catch(() => undefined);
  useEffect(() => {
    if (ready) void loadJobs();
  }, [ready]);

  async function runDryRun() {
    if (!file) return;
    setBusy('upload');
    setError('');
    setResult(null);
    try {
      const r = await adminApi.kbImportDryRun(file);
      setToken(r.token);
      setReport(r.report);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    if (!token) return;
    setBusy('confirm');
    setError('');
    try {
      const r = await adminApi.kbImportConfirm(token, mode);
      setResult(r);
      setReport(null);
      setToken(null);
      setFile(null);
      void loadJobs();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <div className="mb-6 flex items-center gap-4">
        <h1 className="text-3xl font-light text-ink">Импорт базы знаний из Bitrix24</h1>
        <span className="grow" />
        <Link href="/kb" className="text-sm text-indigo-600 underline">← к базе знаний</Link>
      </div>

      <Card className="mb-4">
        <p className="mb-3 text-sm text-dark-gray">
          В Bitrix24: База знаний → Действия → Экспорт → скачать архив. Загрузите полученный ZIP сюда —
          сначала покажем предпросмотр (в базу ничего не записывается), затем подтвердите импорт.
          Повторный импорт того же архива дублей не создаёт.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".zip"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setReport(null); setToken(null); }}
            className="text-sm"
          />
          <Button onClick={() => void runDryRun()} disabled={!file || busy !== null}>
            {busy === 'upload' ? 'Разбираем архив…' : 'Проверить архив'}
          </Button>
        </div>
        {error && <p className="mt-3 rounded bg-red-50 px-3 py-1.5 text-sm text-red-700">{error}</p>}
      </Card>

      {report && (
        <Card className="mb-4">
          <p className="mb-2 text-lg text-ink">Предпросмотр: «{report.baseName}»</p>
          <div className="mb-3 grid grid-cols-2 gap-x-8 gap-y-1 text-sm text-ink sm:grid-cols-4">
            <span>Страниц: <b>{report.pagesTotal}</b></span>
            <span>Новых: <b className="text-emerald-700">{report.pagesNew}</b></span>
            <span>Уже есть: <b>{report.pagesExisting}</b></span>
            <span>Файлов/картинок: <b>{report.assetsUsed}</b>{report.assetsMissing > 0 ? ` (нет в архиве: ${report.assetsMissing})` : ''}</span>
            <span>Изображений: {report.images}</span>
            <span>Видео: {report.videos}</span>
            <span>Битых ссылок: {report.unresolvedLinks}</span>
            <span>На доработку: {report.needsReview.length}</span>
          </div>
          {report.needsReview.length > 0 && (
            <details className="mb-3 text-sm">
              <summary className="cursor-pointer text-amber-700">Страницы с нераспознанными блоками ({report.needsReview.length})</summary>
              <ul className="ml-4 mt-1 list-disc text-neutral-600">
                {report.needsReview.map((x, i) => (
                  <li key={i}>{x.title} — {x.details.join('; ')}</li>
                ))}
              </ul>
            </details>
          )}
          {report.pagesExisting > 0 && (
            <div className="mb-3 flex gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={mode === 'skip'} onChange={() => setMode('skip')} />
                Пропустить существующие ({report.pagesExisting})
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={mode === 'update'} onChange={() => setMode('update')} />
                Обновить существующие из архива
              </label>
            </div>
          )}
          <Button onClick={() => void confirm()} disabled={busy !== null}>
            {busy === 'confirm' ? 'Импортируем…' : 'Импортировать'}
          </Button>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-neutral-500">Структура будущего дерева (+ новая, ~ уже есть)</summary>
            <div className="mt-1 max-h-96 overflow-auto">
              <TreePreview nodes={report.tree} />
            </div>
          </details>
        </Card>
      )}

      {result && (
        <Card className="mb-4 border-emerald-200 bg-emerald-50/40">
          <p className="text-ink">
            Импорт завершён: создано <b>{result.created}</b>, обновлено <b>{result.updated}</b>, пропущено{' '}
            <b>{result.skipped}</b>, файлов скопировано <b>{result.assetsCopied}</b>.
          </p>
          {result.needsReview.length > 0 && <p className="mt-1 text-sm text-amber-700">Страниц на доработку: {result.needsReview.length}</p>}
          <Link href="/kb" className="mt-2 inline-block text-sm text-indigo-600 underline">Открыть базу знаний →</Link>
        </Card>
      )}

      {jobs.length > 0 && (
        <Card>
          <p className="mb-2 text-sm font-medium text-ink">История импортов</p>
          {jobs.map((j) => (
            <div key={j.id} className="flex items-center gap-3 py-1 text-sm">
              <span className={j.status === 'FAILED' ? 'text-red-700' : j.status === 'DONE' ? 'text-emerald-700' : 'text-ink'}>
                {JOB_STATUS[j.status]}
              </span>
              <span className="text-neutral-500">режим: {j.mode === 'update' ? 'обновление' : 'пропуск существующих'}</span>
              {j.report && (
                <span className="text-neutral-500">создано {j.report.created}, обновлено {j.report.updated}, пропущено {j.report.skipped}</span>
              )}
              {j.error && <span className="truncate text-red-600">{j.error}</span>}
              <span className="grow" />
              <span className="text-xs text-neutral-400">{new Date(j.createdAt).toLocaleString('ru')}</span>
            </div>
          ))}
        </Card>
      )}
    </main>
  );
}
