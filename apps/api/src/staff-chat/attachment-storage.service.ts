import { BadRequestException, Injectable } from '@nestjs/common';
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
  private readonly dir = resolve(process.cwd(), 'uploads');
  private readonly maxBytes = 25 * 1024 * 1024; // 25 МБ

  constructor() {
    mkdirSync(this.dir, { recursive: true });
  }

  async save(file?: Express.Multer.File): Promise<SavedAttachment> {
    if (!file) throw new BadRequestException('Файл не передан');
    if (file.size > this.maxBytes) throw new BadRequestException('Максимальный размер файла — 25 МБ');
    const originalName = decodeUploadName(file.originalname);
    const stored = `${randomUUID()}.${safeExt(originalName, file.mimetype)}`;
    await writeFile(join(this.dir, stored), file.buffer);
    return {
      url: `/uploads/${stored}`,
      name: originalName,
      size: file.size,
      mime: file.mimetype,
      kind: kindFromMime(file.mimetype),
    };
  }
}
