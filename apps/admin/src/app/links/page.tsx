'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card } from '@dha/ui';
import { adminApi, publicLinkUrl, type ActivePublicLinkRow } from '../../lib/api';
import { useRequireAdmin } from '../../lib/use-admin';

/**
 * Аудит публичных ссылок (KB-DRIVE-TZ.md §5.4): всё, что открыто наружу без
 * логина, — одним экраном, с отзывом в один клик.
 */
export default function PublicLinksPage() {
  const ready = useRequireAdmin();
  const [links, setLinks] = useState<ActivePublicLinkRow[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = () => adminApi.linksActive().then(setLinks).catch((e) => setError((e as Error).message));
  useEffect(() => {
    if (ready) void load();
  }, [ready]);

  async function copy(l: ActivePublicLinkRow) {
    await navigator.clipboard.writeText(publicLinkUrl(l.token));
    setCopiedId(l.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  async function revoke(l: ActivePublicLinkRow) {
    if (!confirm(`Отозвать публичную ссылку на «${l.resourceName}»? Она перестанет открываться сразу.`)) return;
    await adminApi.linkRevoke(l.id).catch((e) => setError((e as Error).message));
    await load();
  }

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <div className="mb-2 flex items-center gap-3">
        <h1 className="text-3xl font-light text-ink">Публичные ссылки</h1>
        {links && <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-sm text-neutral-600">{links.length}</span>}
      </div>
      <p className="mb-4 text-sm text-dark-gray">
        Всё, что сейчас доступно снаружи без входа в систему. Отзыв действует мгновенно; каждое открытие считается.
      </p>
      {error && <p className="mb-3 cursor-pointer rounded bg-red-50 px-3 py-1.5 text-sm text-red-700" onClick={() => setError('')}>{error}</p>}

      <Card className="p-0">
        {links === null && <p className="p-6 text-dark-gray">Загрузка…</p>}
        {links?.length === 0 && <p className="p-6 text-dark-gray">Действующих публичных ссылок нет — наружу ничего не торчит.</p>}
        {links?.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center gap-3 border-b border-neutral-100 px-4 py-2.5 last:border-0">
            <span className={`rounded px-1.5 py-0.5 text-[11px] ${l.resourceType === 'kb_page' ? 'bg-teal-100 text-teal-800' : 'bg-indigo-100 text-indigo-800'}`}>
              {l.resourceType === 'kb_page' ? 'страница БЗ' : 'файл'}
            </span>
            {l.resourceDeleted ? (
              <span className="text-sm text-neutral-400 line-through">{l.resourceName}</span>
            ) : (
              <Link
                href={l.resourceType === 'kb_page' ? `/kb?p=${l.resourceShortId}` : `/drive?d=${l.resourceShortId}`}
                className="max-w-96 truncate text-sm text-ink hover:underline"
                title={l.resourceName}
              >
                {l.resourceName}
              </Link>
            )}
            <a href={publicLinkUrl(l.token)} target="_blank" rel="noreferrer" className="font-mono text-xs text-neutral-400 hover:text-indigo-600">
              …/s/{l.token.slice(0, 10)}… ↗
            </a>
            <span className="grow" />
            <span className="text-xs text-neutral-400">
              открытий: {l.openCount} · создана {new Date(l.createdAt).toLocaleDateString('ru')}
              {l.expiresAt ? ` · истекает ${new Date(l.expiresAt).toLocaleDateString('ru')}` : ' · бессрочная'}
            </span>
            <div className="flex gap-2 text-xs">
              <button className="text-indigo-600 hover:underline" onClick={() => void copy(l)}>{copiedId === l.id ? '✓' : 'копировать'}</button>
              <button className="text-red-600 hover:underline" onClick={() => void revoke(l)}>отозвать</button>
            </div>
          </div>
        ))}
      </Card>
    </main>
  );
}
