import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { SuggestionStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AttachmentStorageService } from '../staff-chat/attachment-storage.service.js';

/** Внутренняя доска идей/пожеланий по доработке системы (#1). */
@Injectable()
export class SuggestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: AttachmentStorageService,
  ) {}

  async create(
    tenantId: string,
    authorId: string,
    input: { section: string; text: string },
    files: Express.Multer.File[] = [],
  ) {
    const screenshots: string[] = [];
    for (const f of files.slice(0, 10)) {
      const saved = await this.storage.save(f);
      screenshots.push(saved.url);
    }
    return this.prisma.suggestion.create({
      data: {
        tenantId,
        authorId,
        section: input.section.trim().slice(0, 120),
        text: input.text.trim().slice(0, 4000),
        screenshots,
      },
    });
  }

  async list(tenantId: string) {
    const rows = await this.prisma.suggestion.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    const authorIds = [...new Set(rows.map((r) => r.authorId))];
    const authors = authorIds.length
      ? await this.prisma.adminUser.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const nameById = new Map(authors.map((a) => [a.id, a.name?.trim() || a.email]));
    return rows.map((r) => ({
      id: r.id,
      section: r.section,
      text: r.text,
      screenshots: Array.isArray(r.screenshots) ? (r.screenshots as string[]) : [],
      status: r.status,
      authorId: r.authorId,
      authorName: nameById.get(r.authorId) ?? 'Сотрудник',
      createdAt: r.createdAt,
    }));
  }

  async setStatus(id: string, status: SuggestionStatus): Promise<{ ok: true }> {
    try {
      await this.prisma.suggestion.update({ where: { id }, data: { status } });
    } catch {
      throw new NotFoundException('Идея не найдена');
    }
    return { ok: true };
  }

  async remove(id: string, requesterId: string): Promise<{ ok: true }> {
    const s = await this.prisma.suggestion.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Идея не найдена');
    if (s.authorId !== requesterId) throw new ForbiddenException('Можно удалить только свою идею');
    await this.prisma.suggestion.delete({ where: { id } });
    return { ok: true };
  }
}
