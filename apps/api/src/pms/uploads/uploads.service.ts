import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** Локальный «диск» на сервере: публичные файлы (фото/PDF) отдаются статикой из /uploads.
 *  Позже адаптер меняется на S3 (Yandex Object Storage) без изменения контракта. */
const IMAGE_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic' };
const VIDEO_EXT: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
const DOC_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
};
const MAX_BYTES = 10 * 1024 * 1024; // 10 МБ
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 МБ

export interface UploadResult {
  url: string;
  name: string;
  size: number;
  contentType: string;
}

@Injectable()
export class UploadsService {
  private readonly dir = resolve(process.cwd(), 'uploads');

  constructor() {
    mkdirSync(this.dir, { recursive: true });
  }

  async saveImage(file?: Express.Multer.File): Promise<UploadResult> {
    if (!file) throw new BadRequestException('Файл не передан');
    const ext = IMAGE_EXT[file.mimetype];
    if (!ext) throw new BadRequestException('Поддерживаются форматы JPG, PNG и GIF');
    if (file.size > MAX_BYTES) throw new BadRequestException('Максимальный размер изображения — 10 МБ');
    return this.write(file, ext);
  }

  async savePdf(file?: Express.Multer.File): Promise<UploadResult> {
    if (!file) throw new BadRequestException('Файл не передан');
    if (file.mimetype !== 'application/pdf') throw new BadRequestException('Поддерживается только PDF');
    if (file.size > MAX_BYTES) throw new BadRequestException('Максимальный размер файла — 10 МБ');
    return this.write(file, 'pdf');
  }

  async saveVideo(file?: Express.Multer.File): Promise<UploadResult> {
    if (!file) throw new BadRequestException('Файл не передан');
    const ext = VIDEO_EXT[file.mimetype];
    if (!ext) throw new BadRequestException('Поддерживаются форматы MP4, WebM и MOV');
    if (file.size > MAX_VIDEO_BYTES) throw new BadRequestException('Максимальный размер видео — 100 МБ');
    return this.write(file, ext);
  }

  /** Универсальное вложение задачи (§4.1): фото, видео или файл (PDF/Office/txt). */
  async saveAttachment(file?: Express.Multer.File): Promise<UploadResult> {
    if (!file) throw new BadRequestException('Файл не передан');
    const ext = IMAGE_EXT[file.mimetype] ?? VIDEO_EXT[file.mimetype] ?? DOC_EXT[file.mimetype];
    if (!ext) throw new BadRequestException('Формат не поддерживается (фото, видео, PDF, Word/Excel, txt)');
    const limit = VIDEO_EXT[file.mimetype] ? MAX_VIDEO_BYTES : MAX_BYTES;
    if (file.size > limit) throw new BadRequestException(`Максимальный размер — ${Math.round(limit / 1024 / 1024)} МБ`);
    return this.write(file, ext);
  }

  private async write(file: Express.Multer.File, ext: string): Promise<UploadResult> {
    const name = `${randomUUID()}.${ext}`;
    await writeFile(join(this.dir, name), file.buffer);
    // Кириллица в имени файла: Multer отдаёт latin1 → реинтерпретируем как UTF-8 (§1).
    let display = file.originalname;
    try { const u = Buffer.from(display, 'latin1').toString('utf8'); if (!u.includes('�')) display = u; } catch { /* keep */ }
    return { url: `/uploads/${name}`, name: display, size: file.size, contentType: file.mimetype };
  }
}
