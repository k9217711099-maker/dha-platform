import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { htmlToText, sanitizeHtml, type KbBlock } from '../content.js';

/**
 * Разбор ZIP-экспорта базы знаний Bitrix24 (формат зафиксирован по реальному
 * архиву владельца 2026-07-09, KB-DRIVE-TZ.md §3.4):
 *   manifest.json                 — CODE: "landing_knowledge"
 *   files.json                    — { "<fileId>": { NAME, ID } }
 *   files/<fileId>                — тела ассетов (без расширений)
 *   LANDING/page_<s>_00.json      — описание «сайта» (TITLE, LANDING_ID_INDEX)
 *   LANDING/page_<s>_<f>_<id>.json— страницы: TITLE, CODE, BLOCKS
 * Блок: { code: "27.one_col_fix_title_and_text_2", nodes: { ".selector": [значения] } }.
 * Значение — HTML-строка либо объект { src, id } (картинка) / { href, text } (кнопка)
 * / { src, source } (видео). Внутренние ссылки: "page:#landing631" / "#landing631".
 */

export interface B24Node {
  [key: string]: unknown;
}
export interface B24Block {
  code: string;
  nodes?: Record<string, unknown[]>;
}
export interface B24Page {
  id: string;
  title: string;
  code: string;
  blocks: B24Block[];
}
export interface B24Export {
  siteTitle: string;
  siteCode: string;
  indexLandingId: string | null;
  pages: B24Page[];
  /** fileId → оригинальное имя файла. */
  fileNames: Record<string, string>;
  filesDir: string;
}

/** Ссылки на другие страницы БЗ в экспорте: "page:#landing631", "#landing631". */
const LANDING_HREF = /^(?:page:)?#landing(\d+)$/;
const HTML_LANDING_HREF = /(href=(["']))(?:page:)?#landing(\d+)(\2)/gi;

export function parseB24Export(dir: string): B24Export {
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error('В архиве нет manifest.json — это не экспорт Bitrix24');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { CODE?: string };
  if (manifest.CODE !== 'landing_knowledge') {
    throw new Error(`Архив не является экспортом базы знаний Bitrix24 (CODE=${manifest.CODE ?? 'нет'})`);
  }

  const fileNames: Record<string, string> = {};
  const filesJson = join(dir, 'files.json');
  if (existsSync(filesJson)) {
    const meta = JSON.parse(readFileSync(filesJson, 'utf8')) as Record<string, { NAME?: string }>;
    for (const [id, v] of Object.entries(meta)) fileNames[id] = v?.NAME ?? id;
  }

  const landingDir = join(dir, 'LANDING');
  if (!existsSync(landingDir)) throw new Error('В архиве нет папки LANDING со страницами');
  const entries = readdirSync(landingDir).filter((f) => /^page_.*\.json$/.test(f));

  let siteTitle = 'База знаний';
  let siteCode = 'baza-znaniy';
  let indexLandingId: string | null = null;
  const pages: B24Page[] = [];

  for (const f of entries.sort()) {
    const raw = JSON.parse(readFileSync(join(landingDir, f), 'utf8')) as Record<string, unknown>;
    if (/^page_\d+_00\.json$/.test(f)) {
      siteTitle = String(raw.TITLE ?? siteTitle);
      siteCode = String(raw.CODE ?? siteCode).replace(/\//g, '') || siteCode;
      const idx = raw.LANDING_ID_INDEX;
      indexLandingId = idx != null && String(idx) !== '0' ? String(idx) : null;
      continue;
    }
    if (String(raw.DELETED ?? 'N') === 'Y') continue;
    const blocksRaw = (raw.BLOCKS ?? {}) as Record<string, { code?: string; nodes?: Record<string, unknown[]> }>;
    const blocks: B24Block[] = Object.values(blocksRaw).map((b) => ({ code: String(b.code ?? ''), nodes: b.nodes }));
    pages.push({
      id: String(raw.ID ?? ''),
      title: htmlToText(String(raw.TITLE ?? 'Без названия')) || 'Без названия',
      code: String(raw.CODE ?? ''),
      blocks,
    });
  }
  if (pages.length === 0) throw new Error('В архиве не найдено ни одной страницы');
  return { siteTitle, siteCode, indexLandingId, pages, fileNames, filesDir: join(dir, 'files') };
}

// ─── Дерево: родители по ссылкам (BFS от главной страницы) ───

/** ID лендингов, на которые страница ссылается (в порядке появления, без дублей). */
export function extractLinkTargets(page: B24Page): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };
  for (const b of page.blocks) {
    for (const vals of Object.values(b.nodes ?? {})) {
      for (const v of vals) {
        if (typeof v === 'string') {
          for (const m of v.matchAll(HTML_LANDING_HREF)) if (m[3]) add(m[3]);
        } else if (v && typeof v === 'object') {
          const href = (v as { href?: unknown }).href;
          if (typeof href === 'string') {
            const m = LANDING_HREF.exec(href.trim());
            if (m?.[1]) add(m[1]);
          }
        }
      }
    }
  }
  return out;
}

/** parentId по BFS от индексной страницы: первый сославшийся — родитель. */
export function buildTree(pages: B24Page[], indexLandingId: string | null): Map<string, string | null> {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const parent = new Map<string, string | null>();
  const queue: string[] = [];
  if (indexLandingId && byId.has(indexLandingId)) {
    parent.set(indexLandingId, null);
    queue.push(indexLandingId);
  }
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const target of extractLinkTargets(byId.get(id)!)) {
      if (target !== id && byId.has(target) && !parent.has(target)) {
        parent.set(target, id);
        queue.push(target);
      }
    }
  }
  for (const p of pages) if (!parent.has(p.id)) parent.set(p.id, null); // не связанные — в корень
  return parent;
}

// ─── Маппинг блоков в наш контент ───

export interface MapContext {
  /** landingId → внутренняя ссылка (kb:<shortId>) либо null (страница не найдена). */
  resolveLink: (landingId: string) => string | null;
  /** fileId → локальный URL ассета либо null (файла нет в архиве). */
  resolveAsset: (fileId: string) => string | null;
}

export interface MappedPage {
  blocks: KbBlock[];
  /** Блоки, распознанные эвристикой не полностью, — страница «на доработку». */
  unknownBlocks: string[];
  /** Ссылки на страницы, которых нет в архиве (оставлены как есть). */
  unresolvedLinks: number;
  usedFileIds: string[];
}

type Role = 'skip' | 'image' | 'video' | 'button' | 'heading2' | 'heading3' | 'text' | 'unknown';

function selectorRole(sel: string): Role {
  const s = sel.toLowerCase();
  if (s === '#wrapper' || /icon|bgimage/.test(s)) return 'skip';
  if (/video|embed/.test(s)) return 'video';
  if (/img-title/.test(s)) return 'text'; // подпись к картинке
  if (/img|image/.test(s)) return 'image';
  if (/button|link/.test(s)) return 'button';
  if (/faq-visible/.test(s)) return 'heading3';
  if (/faq-hidden/.test(s)) return 'text';
  if (/subtitle|card-title/.test(s)) return 'heading3';
  if (/title/.test(s)) return 'heading2';
  if (/text|number/.test(s)) return 'text';
  return 'unknown';
}

/** Порядок ролей внутри «карточки» (i-й элемент каждого селектора). */
const ROLE_ORDER: Role[] = ['heading2', 'heading3', 'image', 'video', 'text', 'button'];

function rewriteHref(href: string, ctx: MapContext, stats: { unresolved: number }): string {
  const m = LANDING_HREF.exec(href.trim());
  if (!m?.[1]) return href;
  const internal = ctx.resolveLink(m[1]);
  if (internal) return internal;
  stats.unresolved += 1;
  return href;
}

/** Переписать в HTML-фрагменте внутренние ссылки и src картинок из CDN на локальные ассеты. */
function rewriteHtml(html: string, ctx: MapContext, nameToFileId: Map<string, string>, mapped: MappedPage): string {
  let out = html.replace(HTML_LANDING_HREF, (whole, pre: string, q: string, id: string, post: string) => {
    const internal = ctx.resolveLink(id);
    if (!internal) {
      mapped.unresolvedLinks += 1;
      return whole;
    }
    return `${pre}${internal}${post}`;
  });
  // <img src="https://cdn-ru.bitrix24.ru/.../name.jpg"> → локальный ассет по имени файла
  out = out.replace(/(src=(["']))(https?:\/\/[^"']*bitrix24[^"']*\/([^/"']+))(\2)/gi, (whole, pre: string, q: string, _url: string, name: string, post: string) => {
    const fileId = nameToFileId.get(name.toLowerCase());
    const local = fileId ? ctx.resolveAsset(fileId) : null;
    if (!local) return whole;
    mapped.usedFileIds.push(fileId!);
    return `${pre}${local}${post}`;
  });
  return out;
}

function normalizeVideoSrc(src: string): string {
  return src.startsWith('//') ? `https:${src}` : src;
}

/** Один блок B24 → наши блоки. Эвристика по ролям селекторов + «карточная» интерливка. */
export function mapB24Block(block: B24Block, ctx: MapContext, nameToFileId: Map<string, string>, mapped: MappedPage): KbBlock[] {
  const code = block.code;
  if (/separator/.test(code)) return [{ type: 'divider' }];
  if (/^0\.menu/.test(code) || /^59\./.test(code)) return []; // навигация и поисковый виджет — чистое оформление

  const groups = new Map<Role, unknown[]>();
  for (const [sel, vals] of Object.entries(block.nodes ?? {})) {
    let role = selectorRole(sel);
    if (role === 'skip') continue;
    if (role === 'unknown') {
      // По форме значения: {src}→image/video, {href}→button, строка→text
      const first = vals[0];
      if (first && typeof first === 'object' && 'src' in (first as object)) role = 'image';
      else if (first && typeof first === 'object' && 'href' in (first as object)) role = 'button';
      else if (typeof first === 'string') role = 'text';
      else {
        if (vals.length > 0) mapped.unknownBlocks.push(`${code} ${sel}`);
        continue;
      }
    }
    const existing = groups.get(role);
    if (existing) existing.push(...vals);
    else groups.set(role, [...vals]);
  }

  const out: KbBlock[] = [];
  const maxLen = Math.max(0, ...[...groups.values()].map((v) => v.length));
  const stats = { unresolved: 0 };
  for (let i = 0; i < maxLen; i++) {
    for (const role of ROLE_ORDER) {
      const v = groups.get(role)?.[i];
      if (v == null) continue;
      const kb = mapValue(role, v, ctx, nameToFileId, mapped, stats);
      if (kb) out.push(kb);
    }
  }
  mapped.unresolvedLinks += stats.unresolved;
  return out;
}

function mapValue(role: Role, v: unknown, ctx: MapContext, nameToFileId: Map<string, string>, mapped: MappedPage, stats: { unresolved: number }): KbBlock | null {
  if (role === 'heading2' || role === 'heading3') {
    const text = typeof v === 'string' ? htmlToText(v) : '';
    return text ? { type: 'heading', level: role === 'heading2' ? 2 : 3, text } : null;
  }
  if (role === 'text') {
    if (typeof v !== 'string') return null;
    const html = sanitizeHtml(rewriteHtml(v, ctx, nameToFileId, mapped)).trim();
    if (!html || htmlToText(html) === '') return null;
    return { type: 'text', html: /^\s*</.test(html) ? html : `<p>${html}</p>` };
  }
  if (role === 'image') {
    if (typeof v !== 'object' || v === null) return null;
    const img = v as { src?: string; src2x?: string; id?: string | null; id2x?: string | null; alt?: string };
    const fileId = img.id != null ? String(img.id) : img.id2x != null ? String(img.id2x) : null;
    const local = fileId ? ctx.resolveAsset(fileId) : null;
    if (local && fileId) mapped.usedFileIds.push(fileId);
    const src = local ?? img.src ?? img.src2x ?? '';
    return src ? { type: 'image', src, alt: img.alt || undefined } : null;
  }
  if (role === 'video') {
    if (typeof v !== 'object' || v === null) return null;
    const vid = v as { src?: string; source?: string };
    const src = vid.src ? normalizeVideoSrc(vid.src) : '';
    return src ? { type: 'video', src, source: vid.source || undefined } : null;
  }
  if (role === 'button') {
    if (typeof v !== 'object' || v === null) return null;
    const btn = v as { href?: string; text?: string };
    const text = htmlToText(btn.text ?? '');
    if (!btn.href || !text) return null;
    return { type: 'button', href: rewriteHref(btn.href, ctx, stats), text };
  }
  return null;
}

/** Вся страница B24 → наш контент. */
export function mapB24Page(page: B24Page, ctx: MapContext, fileNames: Record<string, string>): MappedPage {
  const mapped: MappedPage = { blocks: [], unknownBlocks: [], unresolvedLinks: 0, usedFileIds: [] };
  const nameToFileId = new Map<string, string>();
  for (const [id, name] of Object.entries(fileNames)) {
    const key = name.toLowerCase();
    if (!nameToFileId.has(key)) nameToFileId.set(key, id);
  }
  for (const b of page.blocks) mapped.blocks.push(...mapB24Block(b, ctx, nameToFileId, mapped));
  // Схлопнуть подряд идущие разделители (в экспорте их сотни подряд)
  mapped.blocks = mapped.blocks.filter((b, i, arr) => b.type !== 'divider' || arr[i - 1]?.type !== 'divider');
  while (mapped.blocks[0]?.type === 'divider') mapped.blocks.shift();
  while (mapped.blocks[mapped.blocks.length - 1]?.type === 'divider') mapped.blocks.pop();
  mapped.usedFileIds = [...new Set(mapped.usedFileIds)];
  return mapped;
}
