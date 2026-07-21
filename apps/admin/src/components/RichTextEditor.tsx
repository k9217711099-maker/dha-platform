'use client';

import { type ReactNode, useEffect, useRef } from 'react';

/**
 * Простой WYSIWYG-редактор (как в Word, #4): contentEditable + панель форматирования,
 * вставка фото/видео/ссылок/файлов/таблиц. Хранит и отдаёт HTML (совместимо с рендером
 * статей KB через dangerouslySetInnerHTML). uploadFile — загрузка медиа, возвращает URL.
 */
export function RichTextEditor({
  value,
  onChange,
  uploadFile,
}: {
  value: string;
  onChange: (html: string) => void;
  uploadFile?: (file: File) => Promise<string>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Инициализируем innerHTML один раз / при внешней смене value (не на каждый ввод — иначе прыгает курсор).
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== (value ?? '')) el.innerHTML = value ?? '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sync = () => onChange(ref.current?.innerHTML ?? '');
  const exec = (cmd: string, val?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, val);
    sync();
  };
  const insertHtml = (html: string) => {
    ref.current?.focus();
    document.execCommand('insertHTML', false, html);
    sync();
  };

  const addLink = () => {
    const url = window.prompt('Ссылка (URL):', 'https://');
    if (url) exec('createLink', url);
  };
  const addVideo = () => {
    const url = window.prompt('Ссылка на видео (YouTube / Vimeo / mp4):', 'https://');
    if (!url) return;
    const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]+)/);
    const vm = url.match(/vimeo\.com\/(\d+)/);
    let embed: string;
    if (yt) embed = `https://www.youtube.com/embed/${yt[1]}`;
    else if (vm) embed = `https://player.vimeo.com/video/${vm[1]}`;
    else embed = '';
    const html = embed
      ? `<div style="position:relative;padding-bottom:56.25%;height:0;margin:8px 0;"><iframe src="${embed}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;border-radius:8px;" allowfullscreen></iframe></div>`
      : `<video src="${url}" controls style="max-width:100%;border-radius:8px;margin:8px 0;"></video>`;
    insertHtml(html);
  };
  const addTable = () => {
    const spec = window.prompt('Таблица — строки×столбцы (напр. 3x4):', '3x3');
    if (!spec) return;
    const m = spec.match(/(\d+)\s*[x×]\s*(\d+)/i);
    const rows = Math.min(30, Math.max(1, Number(m?.[1] ?? 3)));
    const cols = Math.min(12, Math.max(1, Number(m?.[2] ?? 3)));
    let html = '<table style="border-collapse:collapse;width:100%;margin:8px 0;">';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++)
        html += `<td style="border:1px solid #d4d4d4;padding:6px;min-width:40px;">${r === 0 ? '&nbsp;' : '&nbsp;'}</td>`;
      html += '</tr>';
    }
    html += '</table><p><br/></p>';
    insertHtml(html);
  };
  const doUpload = async (file: File | undefined, kind: 'image' | 'file') => {
    if (!file || !uploadFile) return;
    try {
      const url = await uploadFile(file);
      if (kind === 'image') insertHtml(`<img src="${url}" alt="" style="max-width:100%;height:auto;border-radius:8px;margin:6px 0;" />`);
      else insertHtml(`<a href="${url}" target="_blank" rel="noreferrer" download>📎 ${escapeHtml(file.name)}</a>`);
    } catch {
      window.alert('Не удалось загрузить файл');
    }
  };

  return (
    <div className="rounded-lg border border-neutral-300">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-neutral-200 bg-neutral-50 px-1.5 py-1">
        <select
          onMouseDown={(e) => e.preventDefault()}
          onChange={(e) => { exec('formatBlock', e.target.value); e.target.selectedIndex = 0; }}
          className="mr-1 rounded border border-neutral-300 bg-white px-1 py-0.5 text-xs"
          title="Стиль"
        >
          <option>Стиль</option>
          <option value="p">Обычный текст</option>
          <option value="h2">Заголовок</option>
          <option value="h3">Подзаголовок</option>
          <option value="blockquote">Цитата</option>
          <option value="pre">Код</option>
        </select>
        <select
          onMouseDown={(e) => e.preventDefault()}
          onChange={(e) => { exec('fontSize', e.target.value); e.target.selectedIndex = 0; }}
          className="mr-1 rounded border border-neutral-300 bg-white px-1 py-0.5 text-xs"
          title="Размер"
        >
          <option>Размер</option>
          <option value="2">Мелкий</option>
          <option value="3">Обычный</option>
          <option value="5">Крупный</option>
          <option value="6">Очень крупный</option>
        </select>
        <Btn onClick={() => exec('bold')} title="Жирный"><b>Ж</b></Btn>
        <Btn onClick={() => exec('italic')} title="Курсив"><i>К</i></Btn>
        <Btn onClick={() => exec('underline')} title="Подчёркнутый"><u>Ч</u></Btn>
        <Btn onClick={() => exec('strikeThrough')} title="Зачёркнутый"><s>З</s></Btn>
        <label onMouseDown={(e) => e.preventDefault()} className="mx-0.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded text-sm hover:bg-neutral-200" title="Цвет текста">
          🎨
          <input type="color" onChange={(e) => exec('foreColor', e.target.value)} className="absolute h-0 w-0 opacity-0" />
        </label>
        <Sep />
        <Btn onClick={() => exec('insertUnorderedList')} title="Маркеры">• —</Btn>
        <Btn onClick={() => exec('insertOrderedList')} title="Нумерация">1.</Btn>
        <Btn onClick={() => exec('justifyLeft')} title="По левому">⇤</Btn>
        <Btn onClick={() => exec('justifyCenter')} title="По центру">≡</Btn>
        <Btn onClick={() => exec('justifyRight')} title="По правому">⇥</Btn>
        <Sep />
        <Btn onClick={addLink} title="Ссылка">🔗</Btn>
        <Btn onClick={() => imgRef.current?.click()} title="Фото">🖼</Btn>
        <Btn onClick={addVideo} title="Видео">🎬</Btn>
        <Btn onClick={() => fileRef.current?.click()} title="Файл">📎</Btn>
        <Btn onClick={addTable} title="Таблица">▦</Btn>
        <Sep />
        <Btn onClick={() => exec('removeFormat')} title="Убрать форматирование">⌫</Btn>
        <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void doUpload(f, 'image'); }} />
        <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void doUpload(f, 'file'); }} />
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={sync}
        onBlur={sync}
        className="kb-rte min-h-[160px] max-w-none px-3 py-2 text-sm leading-relaxed focus:outline-none"
        style={{ wordBreak: 'break-word' }}
      />
    </div>
  );
}

function Btn({ onClick, title, children }: { onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex h-6 min-w-6 items-center justify-center rounded px-1 text-xs text-neutral-700 hover:bg-neutral-200"
    >
      {children}
    </button>
  );
}
const Sep = () => <span className="mx-0.5 h-4 w-px bg-neutral-300" />;
function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}
