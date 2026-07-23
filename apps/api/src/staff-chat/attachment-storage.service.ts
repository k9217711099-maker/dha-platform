import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { StaffAttachmentKind } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'application/pdf': 'pdf',
};

/** Multer/busboy отдаёт имя файла как latin1 — реинтерпретируем байты как UTF-8, чтобы кириллица
 *  не превращалась в «иероглифы» (§1). Для ASCII-имён это no-op. */
export function decodeUploadName(name: string): string {
  try {
    const utf8 = Buffer.from(name, 'latin1').toString('utf8');
    // Если после декодирования нет «replacement char», считаем результат корректным.
    return utf8.includes('�') ? name : utf8;
  } catch {
    return name;
  }
}

function kindFromMime(mime: string): StaffAttachmentKind {
  if (mime.startsWith('image/')) return StaffAttachmentKind.IMAGE;
  if (mime.startsWith('video/')) return StaffAttachmentKind.VIDEO;
  if (mime.startsWith('audio/')) return StaffAttachmentKind.VOICE;
  return StaffAttachmentKind.FILE;
}

function safeExt(name: string, mime: string): string {
  const fromName = name.includes('.')
    ? (name.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
    : '';
  if (fromName && fromName.length <= 5) return fromName;
  return MIME_EXT[mime] ?? 'bin';
}

export interface SavedAttachment {
  url: string;
  name: string;
  size: number;
  mime: string;
  kind: StaffAttachmentKind;
}

/**
 * Хранилище вложений мессенджера (§2). Пишет в тот же локальный `/uploads` (статика,
 * см. main.ts) — позже адаптер меняется на S3 (Yandex Object Storage) без смены
 * контракта. Тип вложения выводится из mime.
 */
@Injectable()
export class AttachmentStorageService {
  private readonly logger = new Logger('AttachmentStorage');
  private readonly dir = resolve(process.cwd(), 'uploads');
  private readonly maxBytes = 25 * 1024 * 1024; // общий лимит (в т.ч. видео, #10) — 25 МБ

  constructor() {
    mkdirSync(this.dir, { recursive: true });
  }

  /**
   * Сжатие/ресайз растровых картинок для экономии места (#10): авто-ориентация по EXIF,
   * ресайз до 1920px по ширине, пере-кодирование с качеством ~82. gif/svg/heic и прочее —
   * не трогаем (возвращаем null → сохраняем оригинал). Ошибка sharp тоже → оригинал.
   */
  private async compressImage(
    file: Express.Multer.File,
  ): Promise<{ buffer: Buffer; mime: string; ext: string } | null> {
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) return null;
    try {
      const sharp = (await import('sharp')).default;
      let img = sharp(file.buffer, { failOn: 'none' }).rotate();
      const meta = await img.metadata();
      if ((meta.width ?? 0) > 1920) img = img.resize({ width: 1920, withoutEnlargement: true });
      if (file.mimetype === 'image/png')
        return { buffer: await img.png({ compressionLevel: 9 }).toBuffer(), mime: 'image/png', ext: 'png' };
      if (file.mimetype === 'image/webp')
        return { buffer: await img.webp({ quality: 82 }).toBuffer(), mime: 'image/webp', ext: 'webp' };
      return { buffer: await img.jpeg({ quality: 82, mozjpeg: true }).toBuffer(), mime: 'image/jpeg', ext: 'jpg' };
    } catch (e) {
      this.logger.warn(`Сжатие картинки не удалось, сохраняю оригинал: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Скачать вложение по URL и сохранить в наш `/uploads` (перехостинг). Нужен для входящих
   * медиа из Umnico: их URL (umnico.com/api/doc/…) требуют авторизации и не рендерятся в
   * админке напрямую. Пробуем без заголовков и с Bearer-токеном. Возвращает null при неудаче
   * (тогда вызывающий оставит ссылку). Картинки не пережимаем — берём как есть.
   */
  async saveFromUrl(url: string, name: string, bearer?: string): Promise<SavedAttachment | null> {
    if (!/^https?:\/\//i.test(url)) return null;
    const attempts: Array<Record<string, string> | undefined> = [undefined];
    if (bearer) attempts.push({ Authorization: `Bearer ${bearer}` });
    for (const headers of attempts) {
      try {
        const res = await fetch(url, headers ? { headers } : {});
        if (!res.ok) continue;
        const buffer = Buffer.from(await res.arrayBuffer());
        if (!buffer.length || buffer.length > this.maxBytes) return null;
        const mime = (res.headers.get('content-type') ?? '').split(';')[0]?.trim() || 'application/octet-stream';
        if (/^text\/html/i.test(mime)) continue; // это страница-ошибка, а не файл
        const ext = safeExt(name, mime);
        const stored = `${randomUUID()}.${ext}`;
        await writeFile(join(this.dir, stored), buffer);
        return { url: `/uploads/${stored}`, name: decodeUploadName(name || 'file'), size: buffer.length, mime, kind: kindFromMime(mime) };
      } catch (e) {
        this.logger.warn(`saveFromUrl (${headers ? 'auth' : 'no-auth'}) не удалось: ${(e as Error).message}`);
      }
    }
    return null;
  }

  async save(file?: Express.Multer.File): Promise<SavedAttachment> {
    if (!file) throw new BadRequestException('Файл не передан');
    if (file.size > this.maxBytes) {
      const mb = Math.round(this.maxBytes / 1024 / 1024);
      throw new BadRequestException(
        file.mimetype.startsWith('video/')
          ? `Видео больше ${mb} МБ — загрузите файл покороче или сожмите.`
          : `Максимальный размер файла — ${mb} МБ.`,
      );
    }
    const originalName = decodeUploadName(file.originalname);
    const compressed = await this.compressImage(file);
    const buffer = compressed?.buffer ?? file.buffer;
    const mime = compressed?.mime ?? file.mimetype;
    const ext = compressed?.ext ?? safeExt(originalName, file.mimetype);
    const stored = `${randomUUID()}.${ext}`;
    await writeFile(join(this.dir, stored), buffer);
    return {
      url: `/uploads/${stored}`,
      name: originalName,
      size: buffer.length,
      mime,
      kind: kindFromMime(mime),
    };
  }
}
