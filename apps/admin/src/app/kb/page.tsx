'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Button, Card } from '@dha/ui';
import { adminApi, fileUrl, publicLinkUrl, type KbAskResult, type KbBaseRow, type KbBlock, type KbPageDetail, type KbPageNode, type KbSearchHit, type KbVersionRow, type PublicLinkRow } from '../../lib/api';
import { useAdminMe, useRequireAdmin } from '../../lib/use-admin';
import { AccessModal } from '../../components/AccessModal';
import { MindmapEmbed } from '../../components/MindmapEmbed';

/** Ссылки на страницы БЗ в контенте: kb:<shortId> (проставляет импортёр/редактор). */
const KB_HREF = /^kb:([a-z0-9]+)$/i;

/** Относительные /uploads/... в html → абсолютные URL API. */
function absolutizeHtml(html: string): string {
  return html.replace(/(src|href)="(\/uploads\/[^"]+)"/g, (_, attr: string, path: string) => `${attr}="${fileUrl(path)}"`);
}

// ─── Diff версий (§3.2): построчное сравнение по блокам, LCS ───

type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string };

/** Блоки → строки для сравнения (текст без разметки). */
function blocksToLines(blocks: KbBlock[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === 'heading') out.push(`◼ ${b.text ?? ''}`);
    else if (b.type === 'text' || b.type === 'raw') {
      const text = (b.html ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr)>/gi, '\n').replace(/<[^>]+>/g, '');
      for (const line of text.split('\n')) {
        const t = line.replace(/&nbsp;/g, ' ').trim();
        if (t) out.push(t);
      }
    } else if (b.type === 'image') out.push(`[изображение ${b.src?.split('/').pop() ?? ''}]`);
    else if (b.type === 'video') out.push(`[видео ${b.source ?? ''}]`);
    else if (b.type === 'button') out.push(`[кнопка «${b.text ?? ''}»]`);
    else if (b.type === 'mindmap') out.push(`[карта «${b.name ?? ''}»]`);
    else if (b.type === 'divider') out.push('―――');
  }
  return out;
}

/** Классический LCS-diff по строкам (страницы небольшие — O(n·m) достаточно). */
function diffLines(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i]! });
      i++; j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ kind: 'removed', text: a[i]! });
      i++;
    } else {
      out.push({ kind: 'added', text: b[j]! });
      j++;
    }
  }
  while (i < n) out.push({ kind: 'removed', text: a[i++]! });
  while (j < m) out.push({ kind: 'added', text: b[j++]! });
  return out;
}

function statusBadge(status: KbPageNode['status']) {
  if (status === 'DRAFT') return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">черновик</span>;
  if (status === 'ARCHIVED') return <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[11px] text-neutral-600">архив</span>;
  return null;
}

// ─── Рендер блоков ───

function BlockView({ b, anchor, onOpenShortId, onCopyAnchor }: { b: KbBlock; anchor: string; onOpenShortId: (sid: string) => void; onCopyAnchor?: (anchor: string) => void }) {
  if (b.type === 'heading') {
    // Якорь заголовка (§3.3): id + кнопка «скопировать ссылку на заголовок» при наведении
    const pilcrow = onCopyAnchor && (
      <button
        className="ml-2 align-middle text-sm text-neutral-300 opacity-0 transition group-hover:opacity-100 hover:text-indigo-500"
        title="Скопировать ссылку на заголовок"
        onClick={() => onCopyAnchor(anchor)}
      >
        ¶
      </button>
    );
    return b.level === 2
      ? <h2 id={anchor} className="group mt-6 scroll-mt-4 text-xl font-medium text-ink">{b.text}{pilcrow}</h2>
      : <h3 id={anchor} className="group mt-4 scroll-mt-4 text-lg font-medium text-ink">{b.text}{pilcrow}</h3>;
  }
  if (b.type === 'text' || b.type === 'raw') {
    return (
      <div
        className="kb-prose max-w-none text-[15px] leading-relaxed text-ink [&_a]:text-indigo-600 [&_a]:underline [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-2 [&_table]:my-2 [&_table]:border [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_ul]:list-disc"
        dangerouslySetInnerHTML={{ __html: absolutizeHtml(b.html ?? '') }}
      />
    );
  }
  if (b.type === 'image') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={fileUrl(b.src)} alt={b.alt ?? ''} className="my-3 max-h-[480px] max-w-full rounded-lg border border-neutral-200 object-contain" loading="lazy" />;
  }
  if (b.type === 'video') {
    return (
      <div className="my-3 aspect-video max-w-2xl overflow-hidden rounded-lg border border-neutral-200">
        <iframe src={b.src} className="h-full w-full" allowFullScreen title={b.source ?? 'видео'} />
      </div>
    );
  }
  if (b.type === 'button') {
    const m = b.href ? KB_HREF.exec(b.href) : null;
    if (m) {
      return (
        <button onClick={() => onOpenShortId(m[1]!)} className="my-2 inline-block rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm text-indigo-800 hover:bg-indigo-100">
          {b.text} →
        </button>
      );
    }
    return (
      <a href={b.href} target="_blank" rel="noreferrer" className="my-2 inline-block rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm text-indigo-800 hover:bg-indigo-100">
        {b.text} ↗
      </a>
    );
  }
  if (b.type === 'divider') return <hr className="my-5 border-neutral-200" />;
  if (b.type === 'mindmap' && b.fileId) return <MindmapEmbed fileId={b.fileId} name={b.name} />;
  return null;
}

// ─── Простой блочный редактор (MVP: заголовки/текст; остальные блоки — удаление/порядок) ───

function BlockEditor({ blocks, onChange }: { blocks: KbBlock[]; onChange: (b: KbBlock[]) => void }) {
  // Список карт Диска для блока-эмбеда (грузится один раз при открытии редактора)
  const [maps, setMaps] = useState<{ id: string; name: string }[] | null>(null);
  useEffect(() => {
    adminApi
      .driveSearch('.dmap')
      .then((nodes) => setMaps(nodes.filter((n) => n.kind === 'FILE').map((n) => ({ id: n.id, name: n.name }))))
      .catch(() => setMaps([]));
  }, []);
  const set = (i: number, b: KbBlock) => onChange(blocks.map((x, j) => (j === i ? b : x)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    const copy = [...blocks];
    const [x] = copy.splice(i, 1);
    copy.splice(j, 0, x!);
    onChange(copy);
  };
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => (
        <div key={i} className="group rounded-lg border border-neutral-200 bg-white p-2">
          <div className="mb-1 flex items-center gap-2 text-[11px] text-neutral-400">
            <span className="uppercase">{b.type}{b.type === 'heading' ? ` H${b.level}` : ''}</span>
            <span className="grow" />
            <button className="hover:text-ink" onClick={() => move(i, -1)} title="Выше">↑</button>
            <button className="hover:text-ink" onClick={() => move(i, 1)} title="Ниже">↓</button>
            <button className="text-red-500 hover:text-red-700" onClick={() => onChange(blocks.filter((_, j) => j !== i))} title="Удалить блок">✕</button>
          </div>
          {b.type === 'heading' && (
            <input value={b.text ?? ''} onChange={(e) => set(i, { ...b, text: e.target.value })} className="w-full rounded border border-neutral-300 px-2 py-1 text-lg font-medium" />
          )}
          {(b.type === 'text' || b.type === 'raw') && (
            <textarea value={b.html ?? ''} onChange={(e) => set(i, { ...b, html: e.target.value })} rows={Math.min(10, Math.max(2, (b.html ?? '').length / 90))} className="w-full rounded border border-neutral-300 px-2 py-1 font-mono text-xs" />
          )}
          {b.type === 'image' && <p className="truncate text-xs text-neutral-500">{b.src}</p>}
          {b.type === 'video' && <p className="truncate text-xs text-neutral-500">{b.source ?? b.src}</p>}
          {b.type === 'button' && (
            <div className="flex gap-2">
              <input value={b.text ?? ''} onChange={(e) => set(i, { ...b, text: e.target.value })} className="w-1/2 rounded border border-neutral-300 px-2 py-1 text-sm" placeholder="Текст кнопки" />
              <input value={b.href ?? ''} onChange={(e) => set(i, { ...b, href: e.target.value })} className="w-1/2 rounded border border-neutral-300 px-2 py-1 text-sm" placeholder="Ссылка (kb:shortId или URL)" />
            </div>
          )}
          {b.type === 'mindmap' && (
            <select
              value={b.fileId ?? ''}
              onChange={(e) => {
                const m = maps?.find((x) => x.id === e.target.value);
                set(i, { ...b, fileId: e.target.value, name: m?.name.replace(/\.dmap$/, '') });
              }}
              className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
            >
              <option value="">— выберите карту с Диска —</option>
              {(maps ?? []).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          )}
        </div>
      ))}
      <div className="flex gap-2 text-sm">
        <button className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100" onClick={() => onChange([...blocks, { type: 'heading', level: 2, text: '' }])}>+ Заголовок</button>
        <button className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100" onClick={() => onChange([...blocks, { type: 'text', html: '<p></p>' }])}>+ Текст</button>
        <button className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100" onClick={() => onChange([...blocks, { type: 'divider' }])}>+ Разделитель</button>
        <button className="rounded border border-violet-300 bg-violet-50 px-2 py-1 text-violet-800 hover:bg-violet-100" onClick={() => onChange([...blocks, { type: 'mindmap', fileId: '' }])}>+ Карта</button>
      </div>
    </div>
  );
}

// ─── Дерево ───

function Tree({ pages, selectedId, onSelect }: { pages: KbPageNode[]; selectedId: string | null; onSelect: (p: KbPageNode) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const children = useMemo(() => {
    const m = new Map<string | null, KbPageNode[]>();
    for (const p of pages) {
      const key = p.parentId ?? null;
      const list = m.get(key) ?? [];
      list.push(p);
      m.set(key, list);
    }
    return m;
  }, [pages]);

  const render = (parentId: string | null, depth: number) => (
    <ul className={depth > 0 ? 'ml-3 border-l border-neutral-200 pl-2' : ''}>
      {(children.get(parentId) ?? []).map((p) => {
        const kids = children.get(p.id)?.length ?? 0;
        const expanded = open[p.id] ?? depth < 1;
        return (
          <li key={p.id}>
            <div className={`flex items-center gap-1 rounded px-1 py-0.5 text-sm ${selectedId === p.id ? 'bg-indigo-50 text-indigo-900' : 'text-ink hover:bg-neutral-100'}`}>
              {kids > 0 ? (
                <button className="w-4 shrink-0 text-neutral-400" onClick={() => setOpen((o) => ({ ...o, [p.id]: !expanded }))}>
                  {expanded ? '▾' : '▸'}
                </button>
              ) : (
                <span className="w-4 shrink-0" />
              )}
              <button className="grow truncate text-left" onClick={() => onSelect(p)} title={p.title}>
                {p.icon ? `${p.icon} ` : ''}{p.title}
              </button>
              {statusBadge(p.status)}
            </div>
            {kids > 0 && expanded && render(p.id, depth + 1)}
          </li>
        );
      })}
    </ul>
  );
  return render(null, 0);
}

// ─── Страница раздела ───

function KbPageInner() {
  const ready = useRequireAdmin();
  const me = useAdminMe();
  const params = useSearchParams();
  const canEdit = me?.permissions.includes('kb_edit') ?? false;
  const canManage = me?.permissions.includes('kb_manage') ?? false;

  const [bases, setBases] = useState<KbBaseRow[]>([]);
  const [baseId, setBaseId] = useState<string | null>(null);
  const [pages, setPages] = useState<KbPageNode[]>([]);
  const [page, setPage] = useState<KbPageDetail | null>(null);
  const [versions, setVersions] = useState<KbVersionRow[] | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<KbSearchHit[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [askResult, setAskResult] = useState<KbAskResult | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBlocks, setDraftBlocks] = useState<KbBlock[]>([]);
  const [copied, setCopied] = useState(false);
  const [anchorCopied, setAnchorCopied] = useState(false);
  const [diff, setDiff] = useState<{ n: number; lines: DiffLine[] } | null>(null);
  const heartbeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pubLink, setPubLink] = useState<PublicLinkRow | null>(null);
  const [pubCopied, setPubCopied] = useState(false);
  const [access, setAccess] = useState<{ type: 'kb_base' | 'kb_page'; id: string; title: string } | null>(null);
  const [error, setError] = useState('');

  const loadBases = () => adminApi.kbBases().then((b) => {
    setBases(b);
    setBaseId((cur) => cur ?? b[0]?.id ?? null);
  });
  useEffect(() => {
    if (ready) void loadBases().catch(() => undefined);
  }, [ready]);

  useEffect(() => {
    if (baseId) void adminApi.kbPages(baseId).then(setPages).catch(() => undefined);
  }, [baseId]);

  // Диплинк ?p=<shortId> — постоянная ссылка на страницу
  useEffect(() => {
    const sid = params.get('p');
    if (ready && sid) void openShortId(sid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, params]);

  // Скролл к якорю заголовка после загрузки страницы (диплинк /kb?p=…#h-N)
  useEffect(() => {
    if (!page) return;
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    const t = setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' }), 150);
    return () => clearTimeout(t);
  }, [page]);

  async function copyAnchor(anchor: string) {
    if (!page) return;
    await navigator.clipboard.writeText(`${location.origin}/kb?p=${page.shortId}#${anchor}`);
    setAnchorCopied(true);
    setTimeout(() => setAnchorCopied(false), 1500);
  }

  async function openShortId(sid: string) {
    try {
      const node = await adminApi.kbResolve(sid);
      setBaseId(node.baseId);
      await openPage(node.id);
    } catch {
      setError('Страница по ссылке не найдена');
    }
  }

  async function openPage(id: string) {
    setEditing(false);
    setVersions(null);
    setHits(null);
    const p = await adminApi.kbPage(id).catch(() => null);
    if (p) {
      setPage(p);
      setBaseId(p.baseId);
      if (me?.permissions.includes('kb_manage')) {
        const links = await adminApi.linksFor('kb_page', p.id).catch(() => []);
        setPubLink(links.find((l) => !l.revokedAt && (!l.expiresAt || new Date(l.expiresAt) > new Date())) ?? null);
      }
    }
  }

  async function togglePublicLink() {
    if (!page) return;
    if (pubLink) {
      await adminApi.linkRevoke(pubLink.id);
      setPubLink(null);
      return;
    }
    const link = await adminApi.linkCreate({ resourceType: 'kb_page', resourceId: page.id });
    setPubLink(link);
    await navigator.clipboard.writeText(publicLinkUrl(link.token));
    setPubCopied(true);
    setTimeout(() => setPubCopied(false), 1500);
  }

  // Поиск с дебаунсом
  useEffect(() => {
    if (!q.trim()) {
      setHits(null);
      return;
    }
    const t = setTimeout(() => {
      void adminApi.kbSearch(q).then(setHits).catch(() => setHits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function ask() {
    if (!q.trim() || asking) return;
    setAsking(true);
    setAskResult(null);
    try {
      setAskResult(await adminApi.kbAsk(q));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAsking(false);
    }
  }

  async function startEdit() {
    if (!page) return;
    // Мягкая блокировка (§3.2): страницу редактирует один сотрудник, перехват — явно
    const lock = await adminApi.kbEditing(page.id, {}).catch(() => ({}) as { locked?: boolean; lockedByName?: string });
    if (lock.locked) {
      if (!confirm(`Страницу сейчас редактирует ${lock.lockedByName}. Перехватить редактирование?`)) return;
      await adminApi.kbEditing(page.id, { force: true }).catch(() => undefined);
    }
    if (heartbeat.current) clearInterval(heartbeat.current);
    heartbeat.current = setInterval(() => void adminApi.kbEditing(page.id, {}).catch(() => undefined), 45_000);
    setDraftTitle(page.title);
    setDraftBlocks(page.content.blocks);
    setEditing(true);
  }

  function stopEditing() {
    if (heartbeat.current) {
      clearInterval(heartbeat.current);
      heartbeat.current = null;
    }
    if (page) void adminApi.kbEditing(page.id, { release: true }).catch(() => undefined);
    setEditing(false);
  }

  async function saveEdit() {
    if (!page) return;
    try {
      const updated = await adminApi.kbUpdatePage(page.id, { title: draftTitle, content: { blocks: draftBlocks } });
      setPage({ ...page, ...updated });
      stopEditing();
      if (updated.secretWarning) {
        setError('Похоже, на странице пароль. Пароли в базе знаний запрещены — перенесите его в раздел «Секреты» (журнал доступов + ротация при увольнениях).');
      }
      if (baseId) void adminApi.kbPages(baseId).then(setPages);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function createPage(parentId: string | null) {
    if (!baseId) return;
    const p = await adminApi.kbCreatePage({ baseId, parentId, title: 'Новая страница' });
    await adminApi.kbPages(baseId).then(setPages);
    await openPage(p.id);
    startEditFor(p);
  }
  function startEditFor(p: KbPageDetail) {
    setPage(p);
    setDraftTitle(p.title);
    setDraftBlocks(p.content.blocks);
    void adminApi.kbEditing(p.id, {}).catch(() => undefined);
    if (heartbeat.current) clearInterval(heartbeat.current);
    heartbeat.current = setInterval(() => void adminApi.kbEditing(p.id, {}).catch(() => undefined), 45_000);
    setEditing(true);
  }

  async function removePage() {
    if (!page) return;
    if (!confirm(`Удалить страницу «${page.title}» вместе с подстраницами?`)) return;
    await adminApi.kbDeletePage(page.id);
    setPage(null);
    if (baseId) void adminApi.kbPages(baseId).then(setPages);
  }

  async function copyLink() {
    if (!page) return;
    await navigator.clipboard.writeText(`${location.origin}/kb?p=${page.shortId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function showVersions() {
    if (!page) return;
    setVersions(versions === null ? await adminApi.kbVersions(page.id) : null);
  }

  async function showDiff(n: number) {
    if (!page) return;
    const v = await adminApi.kbVersion(page.id, n).catch(() => null);
    if (!v) return;
    setDiff({ n, lines: diffLines(blocksToLines(v.content.blocks), blocksToLines(page.content.blocks)) });
  }

  async function restore(n: number) {
    if (!page) return;
    await adminApi.kbRestoreVersion(page.id, n);
    await openPage(page.id);
  }

  function onContentClick(e: MouseEvent<HTMLDivElement>) {
    const a = (e.target as HTMLElement).closest('a');
    const href = a?.getAttribute('href') ?? '';
    const m = KB_HREF.exec(href);
    if (m) {
      e.preventDefault();
      void openShortId(m[1]!);
    }
  }

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="flex h-[calc(100vh-0px)] flex-col px-8 py-6">
      <div className="mb-4 flex items-center gap-4">
        <h1 className="text-3xl font-light text-ink">База знаний</h1>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setAskResult(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') void ask(); }}
          placeholder="Поиск по базе знаний…"
          className="w-80 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
        />
        {me?.permissions.includes('search_ask') && (
          <button
            onClick={() => void ask()}
            disabled={!q.trim() || asking}
            className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm text-indigo-800 hover:bg-indigo-100 disabled:opacity-40"
            title="AI-ответ по базе знаний с указанием источников"
          >
            {asking ? 'Думаю…' : 'Спросить ИИ'}
          </button>
        )}
        <span className="grow" />
        {me?.permissions.includes('kb_import') && (
          <Link href="/kb/import" className="text-sm text-indigo-600 underline">Импорт из Bitrix24</Link>
        )}
      </div>
      {error && (
        <p className="mb-2 rounded bg-red-50 px-3 py-1 text-sm text-red-700" onClick={() => setError('')}>{error}</p>
      )}

      {askResult && (
        <Card className={`mb-4 ${askResult.noAnswer ? 'border-amber-200 bg-amber-50/40' : 'border-indigo-200 bg-indigo-50/30'}`}>
          <div className="mb-1 flex items-center gap-2 text-xs text-neutral-400">
            <span>AI-ответ по базе знаний · {askResult.model}</span>
            <span className="grow" />
            <button className="hover:text-ink" onClick={() => setAskResult(null)}>✕</button>
          </div>
          <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{askResult.answer}</div>
          {askResult.sources.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {askResult.sources.map((s) => (
                <button
                  key={s.pageId}
                  onClick={() => void openPage(s.pageId)}
                  className="rounded-full border border-indigo-200 bg-white px-2.5 py-0.5 text-xs text-indigo-800 hover:bg-indigo-50"
                >
                  [{s.n}] {s.title}
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {hits !== null && (
        <Card className="mb-4 max-h-80 overflow-auto">
          {hits.length === 0 && <p className="text-sm text-dark-gray">Ничего не найдено.</p>}
          {hits.map((h) => (
            <button key={h.id} onClick={() => void openPage(h.id)} className="block w-full rounded px-2 py-1.5 text-left hover:bg-neutral-100">
              <span className="text-sm text-ink">{h.title}</span>
              <span
                className="ml-2 text-xs text-neutral-500 [&_mark]:bg-amber-100"
                dangerouslySetInnerHTML={{ __html: h.snippet.slice(0, 160) }}
              />
            </button>
          ))}
        </Card>
      )}

      <div className="flex min-h-0 grow gap-6">
        {/* Дерево */}
        <aside className="w-80 shrink-0 overflow-auto rounded-xl border border-neutral-200 bg-white p-3">
          <div className="mb-2 flex items-center gap-2">
            <select value={baseId ?? ''} onChange={(e) => { setBaseId(e.target.value); setPage(null); }} className="grow rounded border border-neutral-300 px-2 py-1 text-sm">
              {bases.map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({b._count.pages})</option>
              ))}
            </select>
            {canManage && (
              <button
                title="Новая база"
                className="rounded border border-neutral-300 px-2 py-1 text-sm hover:bg-neutral-100"
                onClick={() => {
                  const name = prompt('Название новой базы знаний');
                  if (name) void adminApi.kbCreateBase({ name }).then(loadBases);
                }}
              >
                +
              </button>
            )}
            {canManage && baseId && (
              <button
                title="Доступы базы"
                className="rounded border border-neutral-300 px-2 py-1 text-sm hover:bg-neutral-100"
                onClick={() => setAccess({ type: 'kb_base', id: baseId, title: bases.find((b) => b.id === baseId)?.name ?? 'база' })}
              >
                🔒
              </button>
            )}
          </div>
          {canEdit && baseId && (
            <button className="mb-2 w-full rounded border border-dashed border-neutral-300 px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-50" onClick={() => void createPage(null)}>
              + Страница в корне
            </button>
          )}
          <Tree pages={pages} selectedId={page?.id ?? null} onSelect={(p) => void openPage(p.id)} />
        </aside>

        {/* Контент */}
        <section className="min-w-0 grow overflow-auto rounded-xl border border-neutral-200 bg-white p-6">
          {!page && <p className="text-dark-gray">Выберите страницу слева или воспользуйтесь поиском.</p>}
          {page && !editing && (
            <>
              <div className="mb-1 flex items-center gap-2">
                <h2 className="grow text-2xl font-medium text-ink">{page.icon ? `${page.icon} ` : ''}{page.title}</h2>
                {statusBadge(page.status)}
              </div>
              <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-neutral-100 pb-3 text-sm">
                <button onClick={() => void copyLink()} className="text-indigo-600 hover:underline">{copied ? '✓ Скопировано' : 'Скопировать ссылку'}</button>
                {canManage && (
                  <span className="flex items-center gap-1">
                    <button onClick={() => void togglePublicLink()} className={pubLink ? 'text-amber-700 hover:underline' : 'text-indigo-600 hover:underline'}>
                      {pubCopied ? '✓ Публичная скопирована' : pubLink ? 'Отозвать публичную' : 'Публичная ссылка'}
                    </button>
                    {pubLink && !pubCopied && (
                      <button
                        title={`Открытий: ${pubLink.openCount}`}
                        onClick={() => { void navigator.clipboard.writeText(publicLinkUrl(pubLink.token)); setPubCopied(true); setTimeout(() => setPubCopied(false), 1500); }}
                        className="text-neutral-400 hover:text-ink"
                      >
                        ⧉
                      </button>
                    )}
                  </span>
                )}
                {canEdit && <button onClick={() => void startEdit()} className="text-indigo-600 hover:underline">Редактировать</button>}
                {canEdit && <button onClick={() => void createPage(page.id)} className="text-indigo-600 hover:underline">+ Подстраница</button>}
                <button onClick={() => void showVersions()} className="text-indigo-600 hover:underline">Версии</button>
                {canManage && (
                  <button onClick={() => setAccess({ type: 'kb_page', id: page.id, title: page.title })} className="text-indigo-600 hover:underline">Доступы</button>
                )}
                {canEdit && <button onClick={() => void removePage()} className="text-red-600 hover:underline">Удалить</button>}
                {canManage && (
                  <label className="flex cursor-pointer items-center gap-1 text-xs text-neutral-500" title="Страница попадает в ответы гостевого AI-администратора (§4.3)">
                    <input
                      type="checkbox"
                      checked={page.guestAgentVisible}
                      onChange={(e) => {
                        const guestAgentVisible = e.target.checked;
                        setPage({ ...page, guestAgentVisible });
                        void adminApi.kbUpdatePage(page.id, { guestAgentVisible }).catch(() => setPage({ ...page }));
                      }}
                    />
                    гостевому AI
                  </label>
                )}
                {anchorCopied && <span className="text-xs text-emerald-600">✓ ссылка на заголовок скопирована</span>}
                <span className="grow" />
                <span className="text-xs text-neutral-400">обновлено {new Date(page.updatedAt).toLocaleString('ru')}</span>
              </div>
              {versions !== null && (
                <Card className="mb-4">
                  <p className="mb-1 text-sm font-medium text-ink">Версии страницы</p>
                  {versions.length === 0 && <p className="text-sm text-dark-gray">Версий пока нет — они появляются при каждом изменении.</p>}
                  {versions.map((v) => (
                    <div key={v.id} className="flex items-center gap-3 py-0.5 text-sm">
                      <span className="text-neutral-500">v{v.n}</span>
                      <span className="grow truncate">{v.title}{v.aiAssisted ? ' · AI' : ''}</span>
                      <span className="text-xs text-neutral-400">{new Date(v.createdAt).toLocaleString('ru')}</span>
                      <button className="text-indigo-600 hover:underline" onClick={() => void showDiff(v.n)}>сравнить</button>
                      {canEdit && <button className="text-indigo-600 hover:underline" onClick={() => void restore(v.n)}>восстановить</button>}
                    </div>
                  ))}
                </Card>
              )}
              <div onClick={onContentClick}>
                {page.content.blocks.map((b, i) => (
                  <BlockView key={i} b={b} anchor={`h-${i}`} onOpenShortId={(sid) => void openShortId(sid)} onCopyAnchor={(a) => void copyAnchor(a)} />
                ))}
                {page.content.blocks.length === 0 && <p className="text-dark-gray">Страница пустая.</p>}
              </div>
            </>
          )}
          {page && editing && (
            <>
              <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} className="mb-3 w-full rounded border border-neutral-300 px-3 py-2 text-2xl font-medium" />
              <div className="mb-3 flex gap-2">
                <Button onClick={() => void saveEdit()}>Сохранить</Button>
                <button className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100" onClick={() => stopEditing()}>Отмена</button>
              </div>
              <BlockEditor blocks={draftBlocks} onChange={setDraftBlocks} />
            </>
          )}
        </section>
      </div>
      {diff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setDiff(null)}>
          <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-1 text-lg text-ink">Сравнение: версия v{diff.n} → текущая</p>
            <p className="mb-3 text-xs text-neutral-500">
              <span className="rounded bg-red-50 px-1 text-red-700">красное</span> — было в v{diff.n} и убрано,{' '}
              <span className="rounded bg-emerald-50 px-1 text-emerald-700">зелёное</span> — добавлено после.
            </p>
            <div className="space-y-0.5 font-mono text-xs">
              {diff.lines.every((l) => l.kind === 'same') && <p className="text-neutral-500">Текстовых отличий нет.</p>}
              {diff.lines.map((l, i) => (
                <p
                  key={i}
                  className={
                    l.kind === 'added' ? 'rounded bg-emerald-50 px-2 text-emerald-800'
                    : l.kind === 'removed' ? 'rounded bg-red-50 px-2 text-red-700 line-through'
                    : 'px-2 text-neutral-500'
                  }
                >
                  {l.text}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
      {access && (
        <AccessModal
          resourceType={access.type}
          resourceId={access.id}
          title={access.title}
          onClose={(changed) => {
            setAccess(null);
            if (changed && baseId) void adminApi.kbPages(baseId).then(setPages);
          }}
        />
      )}
    </main>
  );
}

export default function KbPage() {
  return (
    <Suspense fallback={<main className="px-8 py-12 text-dark-gray">Загрузка…</main>}>
      <KbPageInner />
    </Suspense>
  );
}
