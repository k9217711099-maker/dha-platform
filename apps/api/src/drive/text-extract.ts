import * as XLSX from 'xlsx';

/** Лимит извлечённого текста на файл (для поиска этого достаточно). */
const MAX_CHARS = 100_000;

const TEXT_MIME = /^text\/|^application\/(json|xml|csv)/;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = /spreadsheetml\.sheet|application\/vnd\.ms-excel/;

/** MIME ментальной карты (.dmap — JSON mind-elixir, ТЗ §5.5). */
export const MINDMAP_MIME = 'application/vnd.dha.mindmap+json';

/** Текст узлов ментальной карты (поля topic рекурсивно) — для поиска. */
function mindmapTopics(value: unknown, out: string[]): void {
  if (Array.isArray(value)) for (const v of value) mindmapTopics(v, out);
  else if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    if (typeof rec.topic === 'string') out.push(rec.topic);
    for (const v of Object.values(rec)) mindmapTopics(v, out);
  }
}

/**
 * Извлечение текста из файла для поиска по содержимому (KB-DRIVE-TZ.md §4.1).
 * Поддержка MVP: txt/md/csv/json, docx (mammoth), pdf (pdf-parse), xlsx (пакет xlsx
 * уже в проекте), .dmap (узлы ментальной карты). Сканы без текстового слоя (OCR)
 * и старые doc/xls — этап 2. Ошибка извлечения не должна ломать загрузку.
 */
export async function extractText(name: string, mime: string, body: Buffer): Promise<string> {
  try {
    const lower = name.toLowerCase();
    if (mime === MINDMAP_MIME || lower.endsWith('.dmap')) {
      const topics: string[] = [];
      mindmapTopics(JSON.parse(body.toString('utf8')), topics);
      return clean(topics.join(' '));
    }
    if (TEXT_MIME.test(mime) || /\.(txt|md|csv|json|log)$/.test(lower)) {
      return clean(body.toString('utf8'));
    }
    if (mime === DOCX_MIME || lower.endsWith('.docx')) {
      const mammoth = require('mammoth') as { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }> };
      const r = await mammoth.extractRawText({ buffer: body });
      return clean(r.value);
    }
    if (mime === 'application/pdf' || lower.endsWith('.pdf')) {
      const { PDFParse } = require('pdf-parse') as {
        PDFParse: new (o: { data: Uint8Array }) => { getText: () => Promise<{ text: string }>; destroy: () => Promise<void> };
      };
      const parser = new PDFParse({ data: new Uint8Array(body) });
      try {
        const r = await parser.getText();
        return clean(r.text);
      } finally {
        await parser.destroy().catch(() => undefined);
      }
    }
    if (XLSX_MIME.test(mime) || /\.(xlsx|xls)$/.test(lower)) {
      const wb = XLSX.read(body, { type: 'buffer' });
      const parts: string[] = [];
      for (const sheetName of wb.SheetNames.slice(0, 20)) {
        const sheet = wb.Sheets[sheetName];
        if (sheet) parts.push(XLSX.utils.sheet_to_csv(sheet).replace(/,+/g, ' '));
      }
      return clean(parts.join('\n'));
    }
    return '';
  } catch {
    return '';
  }
}

function clean(s: string): string {
  // NUL-байты Postgres в text не хранит
  return s.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
}
