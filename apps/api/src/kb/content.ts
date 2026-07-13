import { randomBytes } from 'node:crypto';

/**
 * Блочный формат контента страницы БЗ (KB-DRIVE-TZ.md §3.2).
 * Rich-text хранится как санитизированный HTML внутри блока `text` —
 * это переваривает и рендер админки, и будущий TipTap-редактор.
 */
export type KbBlock =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'text'; html: string }
  | { type: 'image'; src: string; alt?: string }
  | { type: 'video'; src: string; source?: string }
  | { type: 'button'; href: string; text: string }
  | { type: 'divider' }
  /** Эмбед ментальной карты с Диска (ТЗ §5.5): fileId — DriveNode. */
  | { type: 'mindmap'; fileId: string; name?: string }
  /** Нераспознанный при импорте фрагмент — «на доработку» (ТЗ §3.4 п.4). */
  | { type: 'raw'; html: string; note?: string };

export interface KbContent {
  blocks: KbBlock[];
}

export const EMPTY_CONTENT: KbContent = { blocks: [] };

/** Неизменяемый короткий код страницы для постоянных ссылок (§3.3). */
export function newShortId(): string {
  // 6 байт → 8+ символов base36; коллизии страхует @unique в БД.
  return BigInt(`0x${randomBytes(6).toString('hex')}`).toString(36);
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Слаг латиницей из названия страницы/базы. */
export function kbSlugify(name: string): string {
  const s = name
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return s || 'page';
}

/** Санитизация HTML-фрагмента: без скриптов, инлайн-обработчиков и javascript:-ссылок.
 *  Инлайн-стили тоже убираем: экспорт B24 отдаёт их искалеченными (`bxstyle=`, `st="" yle=`),
 *  а значения завязаны на тему Bitrix (var(--theme-…)) и в нашей админке бессмысленны. */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|object|embed|form)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|object|embed|form)[^>]*\/?\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\sst\s*=\s*""\s*yle\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/\s(?:bx)?style\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'\s>]*\2/gi, '$1=$2#$2');
}

const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&laquo;': '«', '&raquo;': '»', '&mdash;': '—', '&ndash;': '–' };

/** Плоский текст из HTML — для searchText и заголовков. */
export function htmlToText(html: string): string {
  let s = html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ');
  for (const [ent, ch] of Object.entries(ENTITIES)) s = s.split(ent).join(ch);
  s = s.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
  return s.replace(/\s+/g, ' ').trim();
}

/** Нормализация контента перед записью: санитизация HTML-блоков (редактор админки
 *  шлёт сырой HTML, а страница может уйти наружу по публичной ссылке — §5.4). */
export function normalizeContent(content: KbContent): KbContent {
  return {
    blocks: (content.blocks ?? []).map((b) => {
      if (b.type === 'text' || b.type === 'raw') return { ...b, html: sanitizeHtml(b.html ?? '') };
      if (b.type === 'heading') return { ...b, text: htmlToText(b.text ?? '') };
      return b;
    }),
  };
}

/** Эвристика «на странице пароль» (ТЗ §8): пароли в БЗ запрещены — им место в «Секретах». */
const SECRET_HINT = /(пароль|password|pwd|passcode|пин[\s-]?код|api[\s_-]?key|секретный\s+ключ|access[\s_-]?token)\s*[:=—–-]/i;

export function looksLikeSecret(text: string): boolean {
  return SECRET_HINT.test(text);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Плоский текст (в т.ч. от AI-агента) → блочный контент (ТЗ §3.5):
 * `# `/`## ` — заголовки, `- `/`* ` — списки, пустая строка — разрыв абзаца,
 * `---` — разделитель. HTML экранируется — модель не может внедрить разметку.
 */
export function plainTextToContent(text: string): KbContent {
  const blocks: KbBlock[] = [];
  let list: string[] = [];
  let paragraph: string[] = [];
  const flushList = () => {
    if (list.length > 0) blocks.push({ type: 'text', html: `<ul>${list.map((li) => `<li>${escapeHtml(li)}</li>`).join('')}</ul>` });
    list = [];
  };
  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ type: 'text', html: `<p>${paragraph.map(escapeHtml).join('<br />')}</p>` });
    paragraph = [];
  };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      flushParagraph();
    } else if (/^---+$/.test(line)) {
      flushList();
      flushParagraph();
      blocks.push({ type: 'divider' });
    } else if (line.startsWith('## ')) {
      flushList();
      flushParagraph();
      blocks.push({ type: 'heading', level: 3, text: line.slice(3).trim() });
    } else if (line.startsWith('# ')) {
      flushList();
      flushParagraph();
      blocks.push({ type: 'heading', level: 2, text: line.slice(2).trim() });
    } else if (/^[-*•]\s+/.test(line)) {
      flushParagraph();
      list.push(line.replace(/^[-*•]\s+/, ''));
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushList();
  flushParagraph();
  return { blocks };
}

/** Плоский текст всей страницы — заполняется при каждом сохранении/импорте. */
export function contentToSearchText(content: KbContent): string {
  const parts: string[] = [];
  for (const b of content.blocks ?? []) {
    if (b.type === 'heading') parts.push(b.text);
    else if (b.type === 'text' || b.type === 'raw') parts.push(htmlToText(b.html));
    else if (b.type === 'button') parts.push(b.text);
    else if (b.type === 'image' && b.alt) parts.push(b.alt);
    else if (b.type === 'mindmap' && b.name) parts.push(b.name);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 100_000);
}
