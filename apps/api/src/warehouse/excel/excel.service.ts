import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';

export interface ExcelColumn {
  key: string;
  label: string;
}

/** Генерация и парсинг Excel (§18, §10). Обёртка над SheetJS. */
@Injectable()
export class ExcelService {
  /** Книга xlsx из строк по колонкам {key,label}. Возвращает Buffer для скачивания. */
  build(sheet: string, columns: ExcelColumn[], rows: Record<string, unknown>[]): Buffer {
    const data = rows.map((r) => {
      const o: Record<string, string | number> = {};
      for (const c of columns) o[c.label] = this.cell(r[c.key]);
      return o;
    });
    const ws = XLSX.utils.json_to_sheet(data, { header: columns.map((c) => c.label) });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  /** Парсинг первого листа в массив объектов (первая строка — заголовки). */
  parse(buffer: Buffer): Record<string, unknown>[] {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const name = wb.SheetNames[0];
    if (!name) return [];
    const sheet = wb.Sheets[name];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  }

  private cell(v: unknown): string | number {
    if (v == null) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 'да' : 'нет';
    return String(v);
  }
}
