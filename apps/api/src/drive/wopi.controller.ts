import {
  BadRequestException, Controller, Get, Param, Post, Query, Req, Res, UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { DriveService } from './drive.service.js';

/** Полезная нагрузка WOPI-токена: короткоживущий, привязан к файлу и сотруднику (§9). */
export interface WopiTokenPayload {
  typ: 'wopi';
  sub: string;
  name: string;
  tenantId: string;
  fileId: string;
  canWrite: boolean;
}

/** Срок жизни лока по WOPI-спеке — 30 минут, редактор его продлевает (REFRESH_LOCK). */
const LOCK_TTL_MS = 30 * 60 * 1000;

/** Тело PutFile: raw-парсер из main.ts кладёт Buffer в req.body; на всякий случай
 *  умеем и дочитать поток сами (если парсер не сработал), не зависая на уже прочитанном. */
function readRawBody(req: Request): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (req.readableEnded) return Promise.resolve(Buffer.alloc(0));
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * WOPI-хост для Collabora Online (KB-DRIVE-TZ.md §5.2): CheckFileInfo, GetFile,
 * PutFile, Lock/Unlock/RefreshLock. Авторизация — access_token (JWT typ=wopi),
 * который выдаёт `/v1/drive/files/:id/edit-session`; Collabora ходит сюда сама.
 * Включается конфигом COLLABORA_URL (в dev выключено — нет Docker).
 */
@ApiTags('wopi')
@Controller('wopi')
export class WopiController {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly drive: DriveService,
  ) {}

  private async auth(fileId: string, token?: string): Promise<WopiTokenPayload> {
    if (!token) throw new UnauthorizedException('Нет access_token');
    let payload: WopiTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<WopiTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Недействительный access_token');
    }
    if (payload.typ !== 'wopi' || payload.fileId !== fileId) throw new UnauthorizedException('Токен не для этого файла');
    return payload;
  }

  /** CheckFileInfo — метаданные файла и права пользователя. */
  @Get('files/:id')
  async checkFileInfo(@Param('id') id: string, @Query('access_token') token?: string) {
    const p = await this.auth(id, token);
    const node = await this.drive.getFile(p.tenantId, id);
    return {
      BaseFileName: node.name,
      Size: node.size ?? 0,
      Version: String(node.currentVersion),
      OwnerId: node.ownerId ?? 'dha',
      UserId: p.sub,
      UserFriendlyName: p.name,
      UserCanWrite: p.canWrite,
      SupportsLocks: true,
      SupportsUpdate: true,
      SupportsRename: false,
      UserCanNotWriteRelative: true,
      LastModifiedTime: node.updatedAt.toISOString(),
    };
  }

  /** GetFile — тело актуальной версии. */
  @Get('files/:id/contents')
  async getFile(@Param('id') id: string, @Res() res: Response, @Query('access_token') token?: string) {
    const p = await this.auth(id, token);
    const f = await this.drive.fileStream(p.tenantId, id);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(f.size));
    f.stream.pipe(res);
  }

  /** PutFile — сохранение из редактора → новая версия файла (§5.1/§5.2). */
  @Post('files/:id/contents')
  async putFile(@Param('id') id: string, @Req() req: Request, @Res() res: Response, @Query('access_token') token?: string) {
    const p = await this.auth(id, token);
    if (!p.canWrite) {
      res.status(403).json({});
      return;
    }
    const lockHeader = String(req.headers['x-wopi-lock'] ?? '');
    const lock = await this.currentLock(id);
    if (lock && lock.lockId !== lockHeader) {
      res.status(409).setHeader('X-WOPI-Lock', lock.lockId).json({});
      return;
    }
    const body = await readRawBody(req);
    if (body.length === 0) {
      res.status(400).json({});
      return;
    }
    const node = await this.drive.saveBinaryContent(p.tenantId, id, body, p.sub);
    res.status(200).json({ LastModifiedTime: node.updatedAt.toISOString() });
  }

  /** Lock / Unlock / RefreshLock / GetLock — по заголовку X-WOPI-Override. */
  @Post('files/:id')
  async lockOps(@Param('id') id: string, @Req() req: Request, @Res() res: Response, @Query('access_token') token?: string) {
    const p = await this.auth(id, token);
    const op = String(req.headers['x-wopi-override'] ?? '');
    const requested = String(req.headers['x-wopi-lock'] ?? '');
    const oldLock = String(req.headers['x-wopi-oldlock'] ?? '');
    const lock = await this.currentLock(id);

    const conflict = (current: string) => res.status(409).setHeader('X-WOPI-Lock', current).json({});
    const ok = () => res.status(200).json({});

    switch (op) {
      case 'LOCK': {
        // UnlockAndRelock: X-WOPI-OldLock должен совпасть с текущим
        if (oldLock) {
          if (!lock || lock.lockId !== oldLock) return conflict(lock?.lockId ?? '');
        } else if (lock && lock.lockId !== requested) {
          return conflict(lock.lockId);
        }
        await this.prisma.wopiLock.upsert({
          where: { nodeId: id },
          create: { nodeId: id, lockId: requested, userId: p.sub, expiresAt: new Date(Date.now() + LOCK_TTL_MS) },
          update: { lockId: requested, userId: p.sub, expiresAt: new Date(Date.now() + LOCK_TTL_MS) },
        });
        return ok();
      }
      case 'REFRESH_LOCK': {
        if (!lock || lock.lockId !== requested) return conflict(lock?.lockId ?? '');
        await this.prisma.wopiLock.update({ where: { nodeId: id }, data: { expiresAt: new Date(Date.now() + LOCK_TTL_MS) } });
        return ok();
      }
      case 'UNLOCK': {
        if (!lock || lock.lockId !== requested) return conflict(lock?.lockId ?? '');
        await this.prisma.wopiLock.delete({ where: { nodeId: id } }).catch(() => undefined);
        return ok();
      }
      case 'GET_LOCK': {
        res.setHeader('X-WOPI-Lock', lock?.lockId ?? '');
        return ok();
      }
      default:
        throw new BadRequestException(`Неизвестная WOPI-операция: ${op}`);
    }
  }

  /** Актуальный лок (протухшие считаются снятыми). */
  private async currentLock(nodeId: string) {
    const lock = await this.prisma.wopiLock.findUnique({ where: { nodeId } });
    if (!lock) return null;
    if (lock.expiresAt < new Date()) {
      await this.prisma.wopiLock.delete({ where: { nodeId } }).catch(() => undefined);
      return null;
    }
    return lock;
  }
}
