'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Button, Card } from '@dha/ui';
import { adminApi, publicLinkUrl, type DriveNodeRow, type DriveVersionRow, type PublicLinkRow } from '../../lib/api';
import { useAdminMe, useRequireAdmin } from '../../lib/use-admin';
import { AccessModal } from '../../components/AccessModal';

function fmtSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} ГБ`;
}

/** Файл ментальной карты (.dmap, ТЗ §5.5) — открывается во встроенном редакторе. */
const isMindmap = (n: DriveNodeRow) => n.kind === 'FILE' && n.name.toLowerCase().endsWith('.dmap');

/** Office-форматы — онлайн-редактирование через Collabora, когда настроена (§5.2). */
const isOffice = (n: DriveNodeRow) => n.kind === 'FILE' && /\.(docx?|xlsx?|pptx?|odt|ods|odp|csv)$/i.test(n.name);

const MapIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5 shrink-0 text-violet-500">
    <path d="M12 12H5m7 0h7M12 12V5m0 7v7M3 4h4v3H3zM17 4h4v3h-4zM3 17h4v3H3zM17 17h4v3h-4zM10 10.5h4v3h-4z" />
  </svg>
);

/** Предпросмотр файла (§5.1): картинки/PDF/видео/аудио через blob c авторизацией, текст — как текст. */
function FilePreview({ node }: { node: DriveNodeRow }) {
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'none' | 'error'>('loading');
  const mime = node.mime ?? '';
  const kind = /^image\//.test(mime) ? 'image'
    : mime === 'application/pdf' ? 'pdf'
    : /^video\//.test(mime) ? 'video'
    : /^audio\//.test(mime) ? 'audio'
    : /^text\/|json$/.test(mime) ? 'text'
    : 'none';

  useEffect(() => {
    let objectUrl: string | null = null;
    let disposed = false;
    setUrl(null);
    setText(null);
    if (kind === 'none' || (node.size ?? 0) > 100 * 1024 * 1024) {
      setState('none');
      return;
    }
    setState('loading');
    void (async () => {
      try {
        if (kind === 'text') {
          const f = await adminApi.driveFileContent(node.id);
          if (!disposed) { setText(f.content.slice(0, 20_000)); setState('ok'); }
        } else {
          objectUrl = await adminApi.driveFileBlobUrl(node.id);
          if (!disposed) { setUrl(objectUrl); setState('ok'); }
        }
      } catch {
        if (!disposed) setState('error');
      }
    })();
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id, node.currentVersion]);

  if (state === 'none') return null;
  if (state === 'loading') return <p className="mb-3 text-xs text-neutral-400">Предпросмотр…</p>;
  if (state === 'error') return <p className="mb-3 text-xs text-neutral-400">Предпросмотр недоступен.</p>;
  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-neutral-200">
      {kind === 'image' && url && <img src={url} alt={node.name} className="max-h-72 w-full object-contain" />}
      {kind === 'pdf' && url && <iframe src={url} className="h-96 w-full" title={node.name} />}
      {kind === 'video' && url && <video src={url} controls className="max-h-72 w-full" />}
      {kind === 'audio' && url && <audio src={url} controls className="w-full p-2" />}
      {kind === 'text' && text !== null && <pre className="max-h-72 overflow-auto whitespace-pre-wrap p-2 text-xs text-neutral-700">{text}</pre>}
    </div>
  );
}

const FolderIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5 shrink-0 text-amber-500">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  </svg>
);
const FileIcon = ({ mime }: { mime: string | null }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className={`h-5 w-5 shrink-0 ${mime?.startsWith('image/') ? 'text-emerald-500' : 'text-indigo-400'}`}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6" />
  </svg>
);

/** Диск: файлы и папки с версиями, корзиной и публичными ссылками (KB-DRIVE-TZ.md §5). */
function DrivePageInner() {
  const ready = useRequireAdmin();
  const me = useAdminMe();
  const router = useRouter();
  const params = useSearchParams();
  const canEdit = me?.permissions.includes('drive_edit') ?? false;
  const canManage = me?.permissions.includes('drive_manage') ?? false;

  const [parentId, setParentId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<DriveNodeRow[]>([]);
  const [crumbs, setCrumbs] = useState<{ id: string; name: string }[]>([]);
  const [trashMode, setTrashMode] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<DriveNodeRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Панель деталей файла: версии + публичные ссылки
  const [detail, setDetail] = useState<DriveNodeRow | null>(null);
  const [access, setAccess] = useState<{ id: string; title: string } | null>(null);
  const [usage, setUsage] = useState<{ usedBytes: number; quotaBytes: number | null } | null>(null);
  const [versions, setVersions] = useState<DriveVersionRow[]>([]);
  const [links, setLinks] = useState<PublicLinkRow[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  async function load(pid: string | null = parentId) {
    const r = await adminApi.driveList(pid);
    setNodes(r.nodes);
    setCrumbs(r.breadcrumbs);
    void adminApi.driveUsage().then(setUsage).catch(() => undefined);
  }
  useEffect(() => {
    if (!ready) return;
    if (trashMode) void adminApi.driveTrash().then(setNodes).catch(() => undefined);
    else void load(parentId).catch((e) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, parentId, trashMode]);

  // Внутренняя ссылка /drive?d=<shortId>
  useEffect(() => {
    const sid = params.get('d');
    if (!ready || !sid) return;
    void adminApi
      .driveResolve(sid)
      .then((n) => setParentId(n.kind === 'FOLDER' ? n.id : n.parentId))
      .catch(() => setError('Объект по ссылке не найден'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, params]);

  // Поиск по имени с дебаунсом
  useEffect(() => {
    if (!q.trim()) {
      setHits(null);
      return;
    }
    const t = setTimeout(() => void adminApi.driveSearch(q).then(setHits).catch(() => setHits([])), 300);
    return () => clearTimeout(t);
  }, [q]);

  async function openDetail(n: DriveNodeRow) {
    setDetail(n);
    setVersions(n.kind === 'FILE' ? await adminApi.driveVersions(n.id).catch(() => []) : []);
    setLinks(n.kind === 'FILE' ? await adminApi.linksFor('drive_file', n.id).catch(() => []) : []);
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy('upload');
    setError('');
    try {
      for (const f of Array.from(files)) await adminApi.driveUpload(f, parentId);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function newFolder() {
    const name = prompt('Название папки');
    if (!name) return;
    await adminApi.driveCreateFolder({ parentId, name }).catch((e) => setError((e as Error).message));
    await load();
  }

  async function newMindmap() {
    const name = prompt('Название ментальной карты');
    if (!name) return;
    try {
      const node = await adminApi.driveCreateMindmap({ parentId, name });
      router.push(`/drive/mindmap?id=${node.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function rename(n: DriveNodeRow) {
    const name = prompt('Новое имя', n.name);
    if (!name || name === n.name) return;
    await adminApi.driveRename(n.id, name).catch((e) => setError((e as Error).message));
    await load();
  }

  async function remove(n: DriveNodeRow) {
    if (!confirm(`Переместить «${n.name}» в корзину?`)) return;
    await adminApi.driveDelete(n.id);
    setDetail(null);
    await load();
  }

  async function copyInternal(n: DriveNodeRow) {
    await navigator.clipboard.writeText(`${location.origin}/drive?d=${n.shortId}`);
    setCopiedId(n.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  async function editOnline(n: DriveNodeRow) {
    try {
      const s = await adminApi.driveEditSession(n.id);
      window.open(s.editorUrl, '_blank');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function sharePublic(n: DriveNodeRow) {
    const link = await adminApi.linkCreate({ resourceType: 'drive_file', resourceId: n.id });
    await navigator.clipboard.writeText(publicLinkUrl(link.token));
    setCopiedId(`pub-${n.id}`);
    setTimeout(() => setCopiedId(null), 1500);
    if (detail?.id === n.id) setLinks(await adminApi.linksFor('drive_file', n.id));
  }

  const rows = hits ?? nodes;

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-6">
      <div className="mb-4 flex items-center gap-4">
        <h1 className="text-3xl font-light text-ink">Диск</h1>
        {usage && (
          <span className="text-xs text-neutral-400" title="Занято с учётом всех версий файлов">
            занято {fmtSize(usage.usedBytes)}{usage.quotaBytes ? ` из ${fmtSize(usage.quotaBytes)}` : ''}
          </span>
        )}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по имени файла…"
          className="w-80 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
        />
        <span className="grow" />
        {canEdit && !trashMode && (
          <>
            <input ref={fileInput} type="file" multiple hidden onChange={(e) => void uploadFiles(e.target.files)} />
            <Button onClick={() => fileInput.current?.click()} disabled={busy !== null}>
              {busy === 'upload' ? 'Загрузка…' : 'Загрузить файлы'}
            </Button>
            <button className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100" onClick={() => void newFolder()}>
              + Папка
            </button>
            <button className="rounded-lg border border-violet-300 bg-violet-50 px-4 py-2 text-sm text-violet-800 hover:bg-violet-100" onClick={() => void newMindmap()}>
              + Карта
            </button>
          </>
        )}
        <button
          className={`rounded-lg border px-4 py-2 text-sm ${trashMode ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-neutral-300 hover:bg-neutral-100'}`}
          onClick={() => { setTrashMode((t) => !t); setDetail(null); setHits(null); setQ(''); }}
        >
          {trashMode ? '← К файлам' : 'Корзина'}
        </button>
      </div>
      {error && <p className="mb-2 cursor-pointer rounded bg-red-50 px-3 py-1 text-sm text-red-700" onClick={() => setError('')}>{error}</p>}

      {!trashMode && hits === null && (
        <div className="mb-3 flex items-center gap-1 text-sm text-neutral-500">
          <button className="hover:text-ink hover:underline" onClick={() => setParentId(null)}>Диск</button>
          {crumbs.map((c) => (
            <span key={c.id}>
              {' / '}
              <button className="hover:text-ink hover:underline" onClick={() => setParentId(c.id)}>{c.name}</button>
            </span>
          ))}
        </div>
      )}
      {hits !== null && <p className="mb-3 text-sm text-neutral-500">Найдено: {hits.length}. <button className="underline" onClick={() => setQ('')}>Сбросить</button></p>}

      <div className="flex gap-6">
        <Card className="min-w-0 grow p-0">
          {rows.length === 0 && <p className="p-6 text-dark-gray">{trashMode ? 'Корзина пуста.' : 'Папка пустая — загрузите файлы или создайте папку.'}</p>}
          {rows.map((n) => (
            <div key={n.id} className={`flex items-center gap-3 border-b border-neutral-100 px-4 py-2 last:border-0 hover:bg-neutral-50 ${detail?.id === n.id ? 'bg-indigo-50/40' : ''}`}>
              {n.kind === 'FOLDER' ? <FolderIcon /> : isMindmap(n) ? <MapIcon /> : <FileIcon mime={n.mime} />}
              <button
                className="min-w-0 grow truncate text-left text-sm text-ink hover:underline"
                title={n.name}
                onClick={() => {
                  if (trashMode) return;
                  if (n.kind === 'FOLDER') { setHits(null); setQ(''); setParentId(n.id); }
                  else if (isMindmap(n)) router.push(`/drive/mindmap?id=${n.id}`);
                  else void openDetail(n);
                }}
              >
                {n.name}
              </button>
              {n.kind === 'FILE' && n.currentVersion > 1 && <span className="rounded bg-neutral-100 px-1.5 text-[11px] text-neutral-500">v{n.currentVersion}</span>}
              <span className="w-20 shrink-0 text-right text-xs text-neutral-400">{fmtSize(n.size)}</span>
              <span className="w-36 shrink-0 text-right text-xs text-neutral-400">{new Date(n.updatedAt).toLocaleString('ru')}</span>
              <div className="flex shrink-0 gap-2 text-xs">
                {trashMode ? (
                  <>
                    {canEdit && <button className="text-indigo-600 hover:underline" onClick={() => void adminApi.driveRestore(n.id).then(() => adminApi.driveTrash().then(setNodes))}>восстановить</button>}
                    {canManage && <button className="text-red-600 hover:underline" onClick={() => { if (confirm(`Удалить «${n.name}» навсегда?`)) void adminApi.drivePurge(n.id).then(() => adminApi.driveTrash().then(setNodes)); }}>навсегда</button>}
                  </>
                ) : (
                  <>
                    {n.kind === 'FILE' && <button className="text-indigo-600 hover:underline" onClick={() => void adminApi.driveDownload(n.id, n.name)}>скачать</button>}
                    {canEdit && isOffice(n) && <button className="text-indigo-600 hover:underline" title="Collabora Online (нужна настройка на сервере)" onClick={() => void editOnline(n)}>онлайн</button>}
                    <button className="text-indigo-600 hover:underline" onClick={() => void copyInternal(n)}>{copiedId === n.id ? '✓' : 'ссылка'}</button>
                    {canManage && n.kind === 'FILE' && (
                      <button className="text-indigo-600 hover:underline" onClick={() => void sharePublic(n)}>{copiedId === `pub-${n.id}` ? '✓ скопирована' : 'публичная'}</button>
                    )}
                    {canManage && <button className="text-neutral-500 hover:underline" onClick={() => setAccess({ id: n.id, title: n.name })}>доступы</button>}
                    {canEdit && <button className="text-neutral-500 hover:underline" onClick={() => void rename(n)}>имя</button>}
                    {canEdit && <button className="text-red-500 hover:underline" onClick={() => void remove(n)}>удалить</button>}
                  </>
                )}
              </div>
            </div>
          ))}
        </Card>

        {detail && !trashMode && (
          <Card className="w-96 shrink-0 self-start">
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="min-w-0 break-words text-sm font-medium text-ink">{detail.name}</p>
              <button className="text-neutral-400 hover:text-ink" onClick={() => setDetail(null)}>✕</button>
            </div>
            <p className="mb-3 text-xs text-neutral-500">
              {detail.mime} · {fmtSize(detail.size)} · sha256 {detail.sha256?.slice(0, 10)}…
            </p>
            <FilePreview node={detail} />
            <p className="mb-1 text-sm font-medium text-ink">Версии</p>
            <div className="mb-3 space-y-0.5">
              {versions.map((v) => (
                <div key={v.id} className="flex items-center gap-2 text-xs text-neutral-600">
                  <span>v{v.n}</span>
                  <span>{fmtSize(v.size)}</span>
                  <span className="grow text-neutral-400">{new Date(v.createdAt).toLocaleString('ru')}</span>
                  <button className="text-indigo-600 hover:underline" onClick={() => void adminApi.driveDownload(detail.id, detail.name, v.n)}>скачать</button>
                </div>
              ))}
            </div>
            <p className="mb-1 text-sm font-medium text-ink">Публичные ссылки</p>
            {links.filter((l) => !l.revokedAt).length === 0 && <p className="text-xs text-neutral-500">Нет действующих ссылок.</p>}
            {links.filter((l) => !l.revokedAt).map((l) => (
              <div key={l.id} className="flex items-center gap-2 text-xs text-neutral-600">
                <span className="grow truncate">…/s/{l.token.slice(0, 8)}… · открытий: {l.openCount}</span>
                <button className="text-indigo-600 hover:underline" onClick={() => void navigator.clipboard.writeText(publicLinkUrl(l.token))}>копировать</button>
                {canManage && (
                  <button className="text-red-600 hover:underline" onClick={() => void adminApi.linkRevoke(l.id).then(() => adminApi.linksFor('drive_file', detail.id).then(setLinks))}>
                    отозвать
                  </button>
                )}
              </div>
            ))}
          </Card>
        )}
      </div>
      {access && (
        <AccessModal
          resourceType="drive_node"
          resourceId={access.id}
          title={access.title}
          onClose={(changed) => {
            setAccess(null);
            if (changed) void load();
          }}
        />
      )}
    </main>
  );
}

export default function DrivePage() {
  return (
    <Suspense fallback={<main className="px-8 py-12 text-dark-gray">Загрузка…</main>}>
      <DrivePageInner />
    </Suspense>
  );
}
