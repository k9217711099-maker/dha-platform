import { describe, expect, it } from 'vitest';
import { contentToSearchText, htmlToText, kbSlugify, plainTextToContent, sanitizeHtml } from './content.js';
import { buildTree, extractLinkTargets, mapB24Page, type B24Page, type MapContext } from './import/bitrix24.js';

const ctx = (over: Partial<MapContext> = {}): MapContext => ({
  resolveLink: (id) => (id === '21' ? 'kb:abc123' : null),
  resolveAsset: (fileId) => (fileId === '762023' ? '/uploads/kb/762023-pic.jpg' : null),
  ...over,
});

const page = (id: string, blocks: B24Page['blocks'], title = `Стр ${id}`): B24Page => ({ id, title, code: `page${id}`, blocks });

describe('kb/content', () => {
  it('slugify транслитерирует кириллицу', () => {
    expect(kbSlugify('Инструкция для водителей!')).toBe('instrukciya-dlya-voditeley');
  });
  it('sanitizeHtml вырезает скрипты и on-обработчики', () => {
    const dirty = '<p onclick="x()">ок</p><script>alert(1)</script><a href="javascript:evil()">x</a>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('javascript:');
    expect(clean).toContain('ок');
  });
  it('htmlToText снимает разметку и сущности', () => {
    expect(htmlToText('<p>Пароль &laquo;тест&raquo;&nbsp;&mdash; нет</p>')).toBe('Пароль «тест» — нет');
  });
});

describe('kb/plainTextToContent — текст от AI-агента в блоки (§3.5)', () => {
  it('заголовки, абзацы, списки, разделитель', () => {
    const c = plainTextToContent('# Регламент\nПервый абзац.\nВторая строка.\n\n## Шаги\n- раз\n- два\n\n---\nфинал');
    expect(c.blocks).toEqual([
      { type: 'heading', level: 2, text: 'Регламент' },
      { type: 'text', html: '<p>Первый абзац.<br />Вторая строка.</p>' },
      { type: 'heading', level: 3, text: 'Шаги' },
      { type: 'text', html: '<ul><li>раз</li><li>два</li></ul>' },
      { type: 'divider' },
      { type: 'text', html: '<p>финал</p>' },
    ]);
  });
  it('HTML от модели экранируется — инъекция разметки невозможна', () => {
    const c = plainTextToContent('текст <script>alert(1)</script> и <b>жирный</b>');
    const html = (c.blocks[0] as { html: string }).html;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;');
  });
});

describe('kb/import: дерево по ссылкам', () => {
  const textWith = (html: string) => ({ code: '27.4.one_col_fix_text', nodes: { '.landing-block-node-text': [html] } });
  it('BFS от индексной: первый сославшийся — родитель; несвязанные — в корень', () => {
    const pages = [
      page('1', [textWith('<a href="page:#landing2">A</a> <a href="#landing3">B</a>')]),
      page('2', [textWith('<a href="page:#landing3">B</a>')]), // 3 уже занят индексом
      page('3', [textWith('без ссылок')]),
      page('9', [textWith('остров')]),
    ];
    const parents = buildTree(pages, '1');
    expect(parents.get('1')).toBeNull();
    expect(parents.get('2')).toBe('1');
    expect(parents.get('3')).toBe('1');
    expect(parents.get('9')).toBeNull();
  });
  it('extractLinkTargets видит и объекты-кнопки, и HTML', () => {
    const p = page('5', [
      { code: '13.2.one_col_fix_button', nodes: { '.landing-block-node-button': [{ href: '#landing21', text: 'Кнопка' }] } },
      textWith('и <a href="page:#landing22">ссылка</a>'),
    ]);
    expect(extractLinkTargets(p)).toEqual(['21', '22']);
  });
});

describe('kb/import: маппер блоков', () => {
  it('title+text → heading+text, ссылки переписываются на kb:shortId', () => {
    const p = page('7', [
      {
        code: '27.one_col_fix_title_and_text_2',
        nodes: {
          '.landing-block-node-title': ['Заголовок <b>раздела</b>'],
          '.landing-block-node-text': ['<p>См. <a href="page:#landing21">регламент</a> и <a href="#landing99">потерян</a></p>'],
        },
      },
    ]);
    const m = mapB24Page(p, ctx(), {});
    expect(m.blocks[0]).toEqual({ type: 'heading', level: 2, text: 'Заголовок раздела' });
    expect(m.blocks[1]?.type).toBe('text');
    const html = (m.blocks[1] as { html: string }).html;
    expect(html).toContain('href="kb:abc123"');
    expect(html).toContain('#landing99'); // нерезолвнутая осталась как есть
    expect(m.unresolvedLinks).toBe(1);
  });

  it('картинка по id из архива, видео нормализует протокол, разделители схлопываются', () => {
    const p = page('8', [
      { code: '26.separator', nodes: {} },
      { code: '26.separator', nodes: {} },
      { code: '32.2.img_one_big', nodes: { '.landing-block-node-img': [{ src: 'https://cdn.example/x.jpg', id: '762023', alt: 'фото' }] } },
      { code: '49.1.video_just_video', nodes: { '.landing-block-node-embed': [{ src: '//www.youtube.com/embed/x', source: 'https://youtu.be/x' }] } },
      { code: '26.separator', nodes: {} },
    ]);
    const m = mapB24Page(p, ctx(), { '762023': 'pic.jpg' });
    expect(m.blocks).toEqual([
      { type: 'image', src: '/uploads/kb/762023-pic.jpg', alt: 'фото' },
      { type: 'video', src: 'https://www.youtube.com/embed/x', source: 'https://youtu.be/x' },
    ]);
    expect(m.usedFileIds).toEqual(['762023']);
  });

  it('карточки (массивы значений) интерливятся: заголовок→текст→кнопка на каждую карточку', () => {
    const p = page('9', [
      {
        code: '18.2.two_cols_fix_img_text_button_with_cards',
        nodes: {
          '.landing-block-node-title': ['Первая', 'Вторая'],
          '.landing-block-node-text': ['t1', 't2'],
          '.landing-block-node-link': [
            { href: 'page:#landing21', text: 'Подробнее' },
            { href: 'https://example.com', text: 'Наружу' },
          ],
        },
      },
    ]);
    const m = mapB24Page(p, ctx(), {});
    expect(m.blocks.map((b) => b.type)).toEqual(['heading', 'text', 'button', 'heading', 'text', 'button']);
    expect((m.blocks[2] as { href: string }).href).toBe('kb:abc123');
    expect((m.blocks[5] as { href: string }).href).toBe('https://example.com');
  });

  it('FAQ: вопрос → h3, ответ → text; меню и поиск пропускаются', () => {
    const p = page('10', [
      { code: '0.menu_24', nodes: { '#wrapper': [{}] } },
      { code: '59.1.search', nodes: { '.landing-block-node-title': ['ПОИСК'] } },
      { code: '68.1.faq', nodes: { '.landing-block-faq-visible': ['Вопрос?'], '.landing-block-faq-hidden': ['<div>Ответ</div>'] } },
    ]);
    const m = mapB24Page(p, ctx(), {});
    expect(m.blocks).toEqual([
      { type: 'heading', level: 3, text: 'Вопрос?' },
      { type: 'text', html: '<div>Ответ</div>' },
    ]);
  });

  it('searchText собирает плоский текст', () => {
    const text = contentToSearchText({
      blocks: [
        { type: 'heading', level: 2, text: 'Прачечная' },
        { type: 'text', html: '<p>Забор белья по графику</p>' },
        { type: 'button', href: '#', text: 'Стандарт' },
      ],
    });
    expect(text).toBe('Прачечная Забор белья по графику Стандарт');
  });
});
