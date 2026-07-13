'use client';

import 'mind-elixir/style.css';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { MindElixirInstance } from 'mind-elixir';
import { adminApi } from '../lib/api';

/**
 * Read-only эмбед ментальной карты с Диска в страницу БЗ (ТЗ §5.5).
 * Доступы Диска действуют: нет права на файл — вместо карты сообщение.
 */
export function MindmapEmbed({ fileId, name }: { fileId: string; name?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<MindElixirInstance | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const file = await adminApi.driveFileContent(fileId);
        if (disposed || !ref.current) return;
        const { default: MindElixir } = await import('mind-elixir');
        const instance = new MindElixir({
          el: ref.current,
          locale: 'ru',
          editable: false,
          draggable: false,
          contextMenu: false,
          toolBar: true,
          keypress: false,
        });
        instance.init(JSON.parse(file.content));
        instanceRef.current = instance;
        setState('ok');
      } catch {
        setState('error');
      }
    })();
    return () => {
      disposed = true;
      instanceRef.current = null;
    };
  }, [fileId]);

  if (state === 'error') {
    return (
      <div className="my-3 rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
        🗺 Ментальная карта {name ? `«${name}» ` : ''}недоступна (удалена или нет прав на файл).
      </div>
    );
  }
  return (
    <div className="my-3 overflow-hidden rounded-lg border border-neutral-200">
      <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-500">
        🗺 {name || 'Ментальная карта'}
        <span className="grow" />
        <Link href={`/drive/mindmap?id=${fileId}`} className="text-indigo-600 hover:underline">Открыть в редакторе →</Link>
      </div>
      <div ref={ref} className="h-[380px]" />
      {state === 'loading' && <p className="px-3 py-2 text-xs text-neutral-400">Загрузка карты…</p>}
    </div>
  );
}
