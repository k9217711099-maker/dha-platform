'use client';

import 'mind-elixir/style.css';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import type { MindElixirInstance } from 'mind-elixir';
import { Button } from '@dha/ui';
import { adminApi } from '../../../lib/api';
import { useAdminMe, useRequireAdmin } from '../../../lib/use-admin';

/**
 * Редактор ментальных карт (.dmap, KB-DRIVE-TZ.md §5.5) на mind-elixir.
 * Tab — подузел, Enter — соседний узел, двойной клик — правка, drag-and-drop ветвей.
 * Карта — обычный файл Диска: версии, доступы и поиск работают как у всех файлов.
 */
function MindmapInner() {
  const ready = useRequireAdmin();
  const me = useAdminMe();
  const params = useSearchParams();
  const fileId = params.get('id');
  const canEdit = me?.permissions.includes('drive_edit') ?? false;

  const containerRef = useRef<HTMLDivElement>(null);
  const meRef = useRef<MindElixirInstance | null>(null);
  const [name, setName] = useState('');
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ready || !fileId || !containerRef.current) return;
    let disposed = false;
    void (async () => {
      try {
        const file = await adminApi.driveFileContent(fileId);
        if (disposed || !containerRef.current) return;
        setName(file.name.replace(/\.dmap$/, ''));
        setVersion(file.version);
        const { default: MindElixir } = await import('mind-elixir');
        const instance = new MindElixir({
          el: containerRef.current,
          locale: 'ru',
          draggable: canEdit,
          editable: canEdit,
          contextMenu: canEdit,
          toolBar: true,
          keypress: canEdit,
        });
        instance.init(JSON.parse(file.content));
        instance.bus.addListener('operation', () => setDirty(true));
        meRef.current = instance;
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => {
      disposed = true;
      meRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fileId, canEdit]);

  // Предупреждение о несохранённых изменениях
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  async function save() {
    if (!fileId || !meRef.current) return;
    setBusy(true);
    setError('');
    try {
      const node = await adminApi.driveSaveContent(fileId, JSON.stringify(meRef.current.getData()));
      setVersion(node.currentVersion);
      setDirty(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function exportPng() {
    const instance = meRef.current;
    if (!instance) return;
    const blob = await instance.exportPng();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name || 'карта'}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;
  if (!fileId) return <main className="px-8 py-12 text-dark-gray">Не указан файл карты.</main>;

  return (
    <main className="flex h-screen flex-col">
      <div className="flex items-center gap-3 border-b border-neutral-200 bg-white px-6 py-3">
        <Link href="/drive" className="text-sm text-indigo-600 underline">← Диск</Link>
        <h1 className="text-lg text-ink">{name || 'Ментальная карта'}</h1>
        <span className="text-xs text-neutral-400">v{version}{dirty ? ' · есть несохранённые изменения' : ''}</span>
        <span className="grow" />
        {error && <span className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">{error}</span>}
        <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100" onClick={() => void exportPng()}>
          Экспорт PNG
        </button>
        {canEdit && (
          <Button onClick={() => void save()} disabled={busy || !dirty}>
            {busy ? 'Сохранение…' : dirty ? 'Сохранить' : 'Сохранено'}
          </Button>
        )}
      </div>
      <div ref={containerRef} className="min-h-0 grow" />
    </main>
  );
}

export default function MindmapPage() {
  return (
    <Suspense fallback={<main className="px-8 py-12 text-dark-gray">Загрузка…</main>}>
      <MindmapInner />
    </Suspense>
  );
}
