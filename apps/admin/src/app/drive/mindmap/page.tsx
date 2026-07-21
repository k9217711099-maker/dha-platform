'use client';

import 'mind-elixir/style.css';
import '@mind-elixir/node-menu/dist/style.css';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import type { MindElixirData, MindElixirInstance } from 'mind-elixir';
import { Button } from '@dha/ui';

/** Стартовые шаблоны карт (#7): применяются к пустой/новой карте. */
let _tid = 0;
const nid = () => `t${Date.now().toString(36)}${_tid++}`;
type TplNode = { id: string; topic: string; children?: TplNode[] };
const N = (topic: string, children: TplNode[] = []): TplNode => ({ id: nid(), topic, children });
const TEMPLATES: { name: string; build: () => MindElixirData }[] = [
  { name: 'Мозговой штурм', build: () => ({ nodeData: N('Идея', [N('Ветка 1'), N('Ветка 2'), N('Ветка 3'), N('Ветка 4')]) }) as unknown as MindElixirData },
  { name: 'Проект / задача', build: () => ({ nodeData: N('Проект', [N('Цель'), N('Задачи', [N('Задача 1'), N('Задача 2')]), N('Сроки'), N('Ответственные'), N('Риски')]) }) as unknown as MindElixirData },
  { name: 'Процесс / этапы', build: () => ({ nodeData: N('Процесс', [N('Шаг 1'), N('Шаг 2'), N('Шаг 3'), N('Результат')]) }) as unknown as MindElixirData },
  { name: 'SWOT-анализ', build: () => ({ nodeData: N('SWOT', [N('Сильные стороны'), N('Слабые стороны'), N('Возможности'), N('Угрозы')]) }) as unknown as MindElixirData },
];
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
        // Плагин node-menu: панель узла — эмодзи/иконки, теги-приоритеты, цвет/шрифт/фон,
        // ссылка, картинка (#7.3/#7.6). Ставим защищённо: если API плагина изменится — редактор
        // всё равно откроется, просто без панели.
        if (canEdit) {
          try {
            const { default: nodeMenu } = await import('@mind-elixir/node-menu');
            instance.install(nodeMenu);
          } catch {
            /* плагин не критичен */
          }
        }
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

  // Экспорт карты в PDF (#7.7): рендерим PNG и вписываем в страницу A4.
  async function exportPdf() {
    const instance = meRef.current;
    if (!instance) return;
    setBusy(true);
    setError('');
    try {
      const blob = await instance.exportPng();
      if (!blob) return;
      const dataUrl: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(blob);
      });
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
      const { jsPDF } = await import('jspdf');
      const landscape = img.width >= img.height;
      const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const ratio = Math.min((pw - 40) / img.width, (ph - 40) / img.height);
      const w = img.width * ratio;
      const h = img.height * ratio;
      pdf.addImage(dataUrl, 'PNG', (pw - w) / 2, (ph - h) / 2, w, h);
      pdf.save(`${name || 'карта'}.pdf`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Сводка/скобка над выделенными узлами (#7.5).
  const addSummary = () => {
    try { meRef.current?.createSummary(); setDirty(true); } catch { /* нужно выделить узлы */ }
  };
  // Применить стартовый шаблон к карте (#7.1).
  const applyTemplate = (tpl: (typeof TEMPLATES)[number]) => {
    if (!meRef.current) return;
    if (!window.confirm(`Заменить содержимое карты шаблоном «${tpl.name}»?`)) return;
    meRef.current.refresh(tpl.build());
    setDirty(true);
  };

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
        {canEdit && (
          <>
            <select
              onChange={(e) => { const t = TEMPLATES[Number(e.target.value)]; if (t) applyTemplate(t); e.target.selectedIndex = 0; }}
              className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm hover:bg-neutral-100"
              title="Стартовый шаблон карты"
            >
              <option>Шаблон</option>
              {TEMPLATES.map((t, i) => <option key={t.name} value={i}>{t.name}</option>)}
            </select>
            <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100" onClick={addSummary} title="Скобка-сводка над выделенными узлами">
              ⎯ Сводка
            </button>
          </>
        )}
        <div className="hidden text-xs text-neutral-400 lg:block" title="ПКМ по узлу — связь между нодами, сводка, стиль">
          ПКМ — связи и меню
        </div>
        <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100" onClick={() => void exportPng()}>
          PNG
        </button>
        <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100" onClick={() => void exportPdf()} disabled={busy}>
          PDF
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
