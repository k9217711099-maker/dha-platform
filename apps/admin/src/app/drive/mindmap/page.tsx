'use client';

import 'mind-elixir/style.css';
import '@mind-elixir/node-menu/dist/style.css';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type ChangeEvent, Suspense, useEffect, useRef, useState } from 'react';
import type { MindElixirData, MindElixirInstance } from 'mind-elixir';
import { Button } from '@dha/ui';
import { adminApi, fileUrl } from '../../../lib/api';
import { useAdminMe, useRequireAdmin } from '../../../lib/use-admin';
import { EmojiPicker } from '../../staff-chat/EmojiPicker';

/** Топик = выделенный узел (DOM-элемент с .nodeObj). */
type Topic = NonNullable<MindElixirInstance['currentNode']>;

/**
 * Стартовые шаблоны карт (#7). Это НЕ разные «движки диаграмм» (mind-elixir рисует
 * ментальные карты — дерево «узел → ветви»), а разные по СМЫСЛУ и РАСКЛАДКЕ заготовки:
 * центр + расходящиеся ветви (side), иерархия слева-направо (right) и т.п. Полноценные
 * fishbone/матрица/оргдиаграмма как отдельные типы в этой библиотеке недоступны — здесь
 * они сделаны структурой узлов.
 */
let _tid = 0;
const nid = () => `t${Date.now().toString(36)}${_tid++}`;
type TplNode = { id: string; topic: string; children?: TplNode[] };
const N = (topic: string, children: TplNode[] = []): TplNode => ({ id: nid(), topic, children });
type Layout = 'side' | 'left' | 'right';
const D = (nodeData: TplNode): MindElixirData => ({ nodeData }) as unknown as MindElixirData;

const TEMPLATES: { name: string; hint: string; layout: Layout; build: () => MindElixirData }[] = [
  { name: 'Ментальная карта', hint: 'Тема в центре, мысли во все стороны', layout: 'side',
    build: () => D(N('Тема', [N('Аспект 1', [N('деталь')]), N('Аспект 2'), N('Аспект 3'), N('Аспект 4')])) },
  { name: 'Оргструктура / дерево', hint: 'Иерархия сверху вниз (кто кому подчиняется)', layout: 'right',
    build: () => D(N('Руководитель', [N('Отдел 1', [N('Сотрудник'), N('Сотрудник')]), N('Отдел 2', [N('Сотрудник')]), N('Отдел 3')])) },
  { name: 'Причинно-следственная', hint: '«Рыбья кость»: причины проблемы по категориям', layout: 'side',
    build: () => D(N('Проблема', [N('Люди'), N('Процессы'), N('Оборудование'), N('Материалы'), N('Внешняя среда')])) },
  { name: 'Таймлайн / этапы', hint: 'Последовательность шагов слева направо', layout: 'right',
    build: () => D(N('Проект', [N('1. Старт'), N('2. Подготовка'), N('3. Работа'), N('4. Проверка'), N('5. Запуск')])) },
  { name: 'SWOT-анализ', hint: 'Сильные/слабые стороны, возможности, угрозы', layout: 'side',
    build: () => D(N('SWOT', [N('Сильные стороны'), N('Слабые стороны'), N('Возможности'), N('Угрозы')])) },
  { name: 'Матрица приоритетов', hint: 'Эйзенхауэр: срочно/важно', layout: 'side',
    build: () => D(N('Задачи', [N('Срочно и важно → сделать'), N('Важно, не срочно → запланировать'), N('Срочно, не важно → делегировать'), N('Не срочно, не важно → убрать')])) },
  { name: 'Карта проекта', hint: 'Цель, задачи, сроки, команда, риски', layout: 'side',
    build: () => D(N('Проект', [N('Цель'), N('Задачи', [N('Задача 1'), N('Задача 2')]), N('Сроки'), N('Команда'), N('Риски')])) },
  { name: 'Цели (OKR)', hint: 'Цель и ключевые результаты-метрики', layout: 'right',
    build: () => D(N('Цель квартала', [N('КР 1 — метрика'), N('КР 2 — метрика'), N('КР 3 — метрика')])) },
  { name: 'Мозговой штурм', hint: 'Свободные идеи вокруг темы', layout: 'side',
    build: () => D(N('Идея', [N('Вариант 1'), N('Вариант 2'), N('Вариант 3'), N('Вариант 4'), N('Вариант 5')])) },
  { name: 'Дорожная карта', hint: 'Развитие по кварталам', layout: 'right',
    build: () => D(N('Продукт', [N('Q1'), N('Q2'), N('Q3'), N('Q4')])) },
];

const COLORS = ['#3E362E', '#A5794A', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#6b7280'];

/**
 * Редактор ментальных карт (.dmap, KB-DRIVE-TZ.md §5.5) на mind-elixir. Понятная панель
 * (#7): картинка/эмодзи/цвет прямо в выделенный узел, скобка-сводка над несколькими
 * узлами, шаблоны с разной раскладкой, экспорт PNG/PDF, встроенная подсказка.
 */
function MindmapInner() {
  const ready = useRequireAdmin();
  const me = useAdminMe();
  const params = useSearchParams();
  const fileId = params.get('id');
  const canEdit = me?.permissions.includes('drive_edit') ?? false;

  const containerRef = useRef<HTMLDivElement>(null);
  const meRef = useRef<MindElixirInstance | null>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const pendingNodeRef = useRef<Topic | null>(null);
  const [name, setName] = useState('');
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showColors, setShowColors] = useState(false);

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
        // Плагин node-menu — правая панель оформления узла (иконка, цвет, ссылка-URL,
        // картинка). Ставим защищённо: если API плагина изменится, редактор всё равно
        // откроется. Дублируем главные действия своей понятной панелью сверху (#7).
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

  // Действие над выделенным узлом: если ничего не выделено — понятная подсказка.
  const withNode = (fn: (m: MindElixirInstance, node: Topic) => void) => {
    const m = meRef.current;
    const node = m?.currentNode;
    if (!m || !node) {
      setHint('Сначала кликните по узлу карты, чтобы выделить его.');
      return;
    }
    setHint('');
    setError('');
    fn(m, node);
    setDirty(true);
  };

  // Картинка в узел (#7): выбираем узел → файл → загрузка → reshapeNode({ image }).
  const pickImage = () =>
    withNode((_m, node) => {
      pendingNodeRef.current = node;
      imgInputRef.current?.click();
    });
  async function onImagePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const m = meRef.current;
    const node = pendingNodeRef.current;
    if (!file || !m || !node) return;
    setBusy(true);
    setError('');
    try {
      const up = await adminApi.kbUpload(file);
      await m.reshapeNode(node, { image: { url: fileUrl(up.url), width: 300, height: 200, fit: 'contain' } });
      setDirty(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      pendingNodeRef.current = null;
    }
  }

  // Эмодзи как иконка узла (#7).
  const addEmoji = (emoji: string) => {
    withNode((m, node) => {
      const icons = [...(node.nodeObj.icons ?? []), emoji];
      void m.reshapeNode(node, { icons });
    });
    setShowEmoji(false);
  };

  // Цвет узла (#7).
  const setNodeColor = (bg: string) => {
    withNode((m, node) => {
      void m.reshapeNode(node, { style: { ...(node.nodeObj.style ?? {}), background: bg, color: '#ffffff' } });
    });
    setShowColors(false);
  };

  // Скобка-сводка над выделенными узлами (#7): нужно выделить 2+ узла (Ctrl/⌘+клик).
  const addSummary = () => {
    const m = meRef.current;
    if (!m) return;
    if (!m.currentNodes || m.currentNodes.length === 0) {
      setHint('Скобка объединяет узлы: выделите 2+ узла (Ctrl/⌘ + клик) и нажмите «Скобка».');
      return;
    }
    setHint('');
    try { m.createSummary(); setDirty(true); } catch { setHint('Выделите узлы одного уровня.'); }
  };

  // Применить шаблон + его раскладку (#7).
  const applyTemplate = (tpl: (typeof TEMPLATES)[number]) => {
    const m = meRef.current;
    if (!m) return;
    if (!window.confirm(`Заменить содержимое карты шаблоном «${tpl.name}»?`)) return;
    m.refresh(tpl.build());
    try {
      if (tpl.layout === 'right') m.initRight();
      else if (tpl.layout === 'left') m.initLeft();
      else m.initSide();
      m.toCenter();
    } catch {
      /* раскладка не критична */
    }
    setDirty(true);
  };

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;
  if (!fileId) return <main className="px-8 py-12 text-dark-gray">Не указан файл карты.</main>;

  const btn = 'rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-40';

  return (
    <main className="flex h-screen flex-col">
      <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={onImagePicked} />
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white px-6 py-2.5">
        <Link href="/drive" className="text-sm text-indigo-600 underline">← Диск</Link>
        <h1 className="text-lg text-ink">{name || 'Ментальная карта'}</h1>
        <span className="text-xs text-neutral-400">v{version}{dirty ? ' · не сохранено' : ''}</span>
        <span className="grow" />
        {error && <span className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">{error}</span>}

        {canEdit && (
          <>
            <select
              onChange={(e) => { const t = TEMPLATES[Number(e.target.value)]; if (t) applyTemplate(t); e.target.selectedIndex = 0; }}
              className={btn}
              title="Стартовый шаблон карты (разные виды и раскладки)"
              defaultValue=""
            >
              <option value="" disabled>Шаблон карты…</option>
              {TEMPLATES.map((t, i) => <option key={t.name} value={i}>{t.name} — {t.hint}</option>)}
            </select>

            <span className="mx-0.5 h-5 w-px bg-neutral-200" />

            <button className={btn} onClick={pickImage} disabled={busy} title="Вставить картинку в выделенный узел">🖼 Картинка</button>

            <div className="relative">
              <button className={btn} onClick={() => { setShowEmoji((v) => !v); setShowColors(false); }} title="Добавить эмодзи в выделенный узел">😊 Эмодзи</button>
              {showEmoji && (
                <EmojiPicker className="absolute right-0 top-full z-40 mt-1" onPick={addEmoji} onClose={() => setShowEmoji(false)} />
              )}
            </div>

            <div className="relative">
              <button className={btn} onClick={() => { setShowColors((v) => !v); setShowEmoji(false); }} title="Цвет выделенного узла">🎨 Цвет</button>
              {showColors && (
                <div className="absolute right-0 top-full z-40 mt-1 flex gap-1.5 rounded-lg border border-neutral-200 bg-white p-2 shadow-xl">
                  {COLORS.map((c) => (
                    <button key={c} onClick={() => setNodeColor(c)} style={{ background: c }} className="h-6 w-6 rounded-full ring-1 ring-black/10" title={c} />
                  ))}
                  <button onClick={() => setNodeColor('')} className="h-6 rounded px-1.5 text-[10px] text-neutral-500 hover:bg-neutral-100" title="Сбросить">сброс</button>
                </div>
              )}
            </div>

            <button className={btn} onClick={addSummary} title="Скобка-сводка над несколькими узлами (выделите 2+ узла)">⌐ Скобка</button>

            <span className="mx-0.5 h-5 w-px bg-neutral-200" />
          </>
        )}

        <button className={btn} onClick={() => setShowHelp((v) => !v)} title="Как пользоваться картой">❓ Помощь</button>
        <button className={btn} onClick={() => void exportPng()}>PNG</button>
        <button className={btn} onClick={() => void exportPdf()} disabled={busy}>PDF</button>
        {canEdit && (
          <Button onClick={() => void save()} disabled={busy || !dirty}>
            {busy ? 'Сохранение…' : dirty ? 'Сохранить' : 'Сохранено'}
          </Button>
        )}
      </div>

      {hint && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-1.5 text-xs text-amber-800">💡 {hint}</div>
      )}

      <div className="relative min-h-0 grow">
        <div ref={containerRef} className="h-full w-full" />
        {showHelp && (
          <div className="absolute right-4 top-4 z-30 w-80 rounded-2xl border border-neutral-200 bg-white p-4 text-sm shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium text-ink">Как пользоваться картой</span>
              <button onClick={() => setShowHelp(false)} className="text-neutral-400 hover:text-ink">✕</button>
            </div>
            <ul className="space-y-1.5 text-[13px] text-dark-gray">
              <li><b>Tab</b> — добавить дочерний узел, <b>Enter</b> — соседний.</li>
              <li><b>Двойной клик</b> по узлу — редактировать текст, <b>Delete</b> — удалить.</li>
              <li>Перетаскивайте узлы мышью, чтобы менять структуру.</li>
              <li><b>🖼 Картинка / 😊 Эмодзи / 🎨 Цвет</b> — сначала кликните узел, потом кнопку.</li>
              <li><b>⌐ Скобка</b> — выделите 2+ узла (<b>Ctrl/⌘ + клик</b>) и нажмите: появится скобка-сводка.</li>
              <li><b>Связь между узлами</b> — правый клик по узлу → «Связать»/меню.</li>
              <li><b>Правая панель</b> (появляется при выделении узла) — тонкая настройка: иконки, цвет, шрифт, <b>ссылка (URL)</b> и картинка. Дублирует кнопки сверху.</li>
              <li><b>PNG / PDF</b> — выгрузить карту файлом.</li>
            </ul>
            <p className="mt-2 border-t border-neutral-100 pt-2 text-[11px] text-neutral-400">
              Карта строится как «дерево» (центр → ветви). Шаблоны задают разный смысл и раскладку.
            </p>
          </div>
        )}
      </div>
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
