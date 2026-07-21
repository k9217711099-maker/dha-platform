import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StaffChatKind, StaffNotifyMode } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AttachmentStorageService } from './attachment-storage.service.js';
import { StaffChatEvents } from './staff-chat.events.js';

export interface AttachmentRow {
  id: string;
  kind: string;
  url: string;
  name: string;
  size: number;
  mime: string;
}

interface MessageRow {
  id: string;
  senderId: string;
  text: string;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  pinnedAt: Date | null;
  mentionIds: string[];
  reactions: { emoji: string; userId: string }[];
  replyTo: { id: string; senderId: string; text: string; deletedAt: Date | null } | null;
  attachments: AttachmentRow[];
}

const ATTACHMENT_SELECT = {
  select: { id: true, kind: true, url: true, name: true, size: true, mime: true },
} as const;

const ONLINE_WINDOW_MS = 60_000; // онлайн, если активность за последнюю минуту
const TYPING_TTL_MS = 6_000; // «печатает» живёт 6 c с последнего пинга

/**
 * Внутренний мессенджер сотрудников (§2), текстовый MVP: 1:1 и групповые чаты,
 * отправка сообщений, непрочитанные/«прочитано», presence и «печатает». Доставка —
 * опросом (как лента эскалаций), без WebSocket. presence — по lastSeenAt (heartbeat
 * на опросах), typing — в памяти процесса (одиночный инстанс на MVP). Реакции/поиск/
 * файлы/голосовые — следующей итерацией.
 */
@Injectable()
export class StaffChatService {
  /** chatId → (userId → истечение «печатает», мс). В памяти процесса. */
  private readonly typing = new Map<string, Map<string, number>>();
  /** userId → число открытых SSE-соединений (presence, мультивкладка). */
  private readonly onlineCounts = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: AttachmentStorageService,
    private readonly events: StaffChatEvents,
  ) {}

  /** Оповестить участников чата о событии (SSE realtime). Не критично — опрос подстрахует. */
  private async publishToChat(chatId: string, kind = 'message', userId?: string): Promise<void> {
    try {
      const members = await this.prisma.staffChatMember.findMany({
        where: { chatId },
        select: { userId: true },
      });
      this.events.publish({ chatId, memberIds: members.map((m) => m.userId), kind, userId });
    } catch {
      /* игнорируем — realtime не критичен */
    }
  }

  /** Публикует новое сообщение с деталями для уведомлений (автор/упоминания/превью). */
  private async publishMessage(
    chatId: string,
    senderId: string,
    mentionIds: string[],
    text: string,
  ): Promise<void> {
    try {
      const members = await this.prisma.staffChatMember.findMany({
        where: { chatId },
        select: { userId: true },
      });
      this.events.publish({
        chatId,
        memberIds: members.map((m) => m.userId),
        kind: 'message',
        senderId,
        mentionIds,
        preview: [...text].slice(0, 100).join(''), // по код-поинтам — не рвём эмодзи (§5.1)
      });
    } catch {
      /* игнорируем — realtime не критичен */
    }
  }

  /** Соединение SSE открыто → пользователь онлайн (broadcast presence). Мультивкладка — счётчик. */
  async streamConnect(userId: string): Promise<void> {
    const n = (this.onlineCounts.get(userId) ?? 0) + 1;
    this.onlineCounts.set(userId, n);
    if (n === 1) {
      await this.prisma.adminUser
        .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
        .catch(() => undefined);
      this.events.publish({ chatId: '', memberIds: [], kind: 'presence', userId, online: true });
    }
  }

  /** Соединение SSE закрыто → если последнее, пользователь оффлайн (broadcast presence). */
  streamDisconnect(userId: string): void {
    const n = (this.onlineCounts.get(userId) ?? 1) - 1;
    if (n <= 0) {
      this.onlineCounts.delete(userId);
      this.events.publish({ chatId: '', memberIds: [], kind: 'presence', userId, online: false });
    } else {
      this.onlineCounts.set(userId, n);
    }
  }

  private dmKey(tenantId: string, a: string, b: string): string {
    return `${tenantId}:${[a, b].sort().join(':')}`;
  }

  private online(lastSeenAt: Date | null | undefined): boolean {
    return !!lastSeenAt && Date.now() - lastSeenAt.getTime() < ONLINE_WINDOW_MS;
  }

  /** presence-heartbeat (вызывается на опросе списка чатов). */
  private async heartbeat(userId: string): Promise<void> {
    await this.prisma.adminUser
      .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

  private async assertMember(chatId: string, userId: string): Promise<void> {
    const member = await this.prisma.staffChatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!member) throw new ForbiddenException('Нет доступа к чату');
  }

  /** Проверяет членство и возвращает чат (нужен kind — для «прочитано» в DM). */
  private async memberChatOrThrow(chatId: string, userId: string) {
    const member = await this.prisma.staffChatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
      include: { chat: true },
    });
    if (!member) throw new ForbiddenException('Нет доступа к чату');
    return member.chat;
  }

  /** Приводит строку сообщения к DTO: реакции (свод), цитата, флаги, «прочитано», избранное. */
  private shapeMessage(
    m: MessageRow,
    userId: string,
    otherReadAt: Date | null,
    savedIds: Set<string>,
    nameMap: Map<string, string>,
  ) {
    const react = new Map<string, { count: number; mine: boolean }>();
    for (const r of m.reactions) {
      const e = react.get(r.emoji) ?? { count: 0, mine: false };
      e.count += 1;
      if (r.userId === userId) e.mine = true;
      react.set(r.emoji, e);
    }
    return {
      id: m.id,
      senderId: m.senderId,
      text: m.deletedAt ? '' : m.text,
      deleted: !!m.deletedAt,
      edited: !!m.editedAt,
      pinned: !!m.pinnedAt,
      saved: savedIds.has(m.id),
      createdAt: m.createdAt,
      replyTo: m.replyTo
        ? {
            id: m.replyTo.id,
            senderId: m.replyTo.senderId,
            text: m.replyTo.deletedAt ? 'сообщение удалено' : m.replyTo.text.slice(0, 120),
          }
        : null,
      reactions: [...react].map(([emoji, v]) => ({ emoji, count: v.count, mine: v.mine })),
      attachments: m.attachments,
      mentions: m.mentionIds
        .map((id) => ({ id, name: nameMap.get(id) ?? '' }))
        .filter((x) => x.name),
      mentionsMe: m.mentionIds.includes(userId),
      // «Прочитано» показываем только для СВОИХ сообщений в DM.
      read: m.senderId === userId && !!otherReadAt && otherReadAt >= m.createdAt,
    };
  }

  /** id сотрудников → имя (name ?? email). */
  private async resolveNames(ids: string[]): Promise<Map<string, string>> {
    const uniq = [...new Set(ids)];
    if (!uniq.length) return new Map();
    const users = await this.prisma.adminUser.findMany({
      where: { id: { in: uniq } },
      select: { id: true, name: true, email: true },
    });
    return new Map(users.map((u) => [u.id, u.name?.trim() || u.email]));
  }

  /** Оставляет из @упоминаний только реальных участников чата. */
  private async filterMentions(chatId: string, ids?: string[]): Promise<string[]> {
    if (!ids?.length) return [];
    const members = await this.prisma.staffChatMember.findMany({
      where: { chatId, userId: { in: [...new Set(ids)] } },
      select: { userId: true },
    });
    return members.map((m) => m.userId);
  }

  /** Коллеги для начала чата (активные сотрудники тенанта, кроме себя) + presence. */
  async colleagues(tenantId: string, userId: string) {
    const rows = await this.prisma.adminUser.findMany({
      where: { tenantId, active: true, NOT: { id: userId } },
      select: { id: true, name: true, email: true, lastSeenAt: true },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name?.trim() || r.email,
      online: this.online(r.lastSeenAt),
    }));
  }

  /** Отделы (UserGroup) с активными участниками — для быстрого создания чата на весь отдел (§2).
   *  Параллель к назначению задачи на отдел: выбрал отдел → в группу попадают его сотрудники. */
  async departments(tenantId: string, userId: string) {
    const groups = await this.prisma.userGroup.findMany({
      where: { tenantId },
      select: { id: true, name: true, color: true, members: { select: { adminUserId: true } } },
      orderBy: { name: 'asc' },
    });
    if (!groups.length) return [];
    const memberIds = [...new Set(groups.flatMap((g) => g.members.map((m) => m.adminUserId)))];
    const active = new Set(
      (await this.prisma.adminUser.findMany({ where: { id: { in: memberIds }, active: true }, select: { id: true } })).map((u) => u.id),
    );
    return groups
      .map((g) => ({
        id: g.id,
        name: g.name,
        color: g.color,
        // Себя исключаем (создатель добавляется автоматически), оставляем только активных.
        memberIds: g.members.map((m) => m.adminUserId).filter((id) => id !== userId && active.has(id)),
      }))
      .filter((g) => g.memberIds.length > 0);
  }

  /** Участники чата (для @упоминаний и карточки чата: аватар/онлайн, ссылка на профиль). */
  async members(chatId: string, userId: string) {
    await this.assertMember(chatId, userId);
    const rows = await this.prisma.staffChatMember.findMany({
      where: { chatId },
      select: { userId: true },
    });
    const users = await this.prisma.adminUser.findMany({
      where: { id: { in: rows.map((r) => r.userId) } },
      select: { id: true, name: true, email: true, avatarUrl: true, lastSeenAt: true },
      orderBy: { name: 'asc' },
    });
    return users.map((u) => ({
      id: u.id,
      name: u.name?.trim() || u.email,
      avatarUrl: u.avatarUrl,
      online: this.online(u.lastSeenAt),
    }));
  }

  /** Мои чаты + последнее сообщение, непрочитанные, имя/онлайн собеседника (DM). */
  async listChats(tenantId: string, userId: string) {
    await this.heartbeat(userId);
    const memberships = await this.prisma.staffChatMember.findMany({
      where: { userId, chat: { tenantId } },
      select: { chatId: true, lastReadAt: true, notifyMode: true, mutedUntil: true },
    });
    if (!memberships.length) return [];
    const lastReadByChat = new Map(memberships.map((m) => [m.chatId, m.lastReadAt]));
    const prefByChat = new Map(
      memberships.map((m) => [m.chatId, { notifyMode: m.notifyMode, mutedUntil: m.mutedUntil }]),
    );
    const now = new Date();

    const chats = await this.prisma.staffChat.findMany({
      where: { id: { in: memberships.map((m) => m.chatId) } },
      include: {
        members: { select: { userId: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Имена/онлайн собеседников DM — одним запросом.
    const otherIds = new Set<string>();
    for (const c of chats) {
      if (c.kind === StaffChatKind.DM) {
        for (const m of c.members) if (m.userId !== userId) otherIds.add(m.userId);
      }
    }
    const users = otherIds.size
      ? await this.prisma.adminUser.findMany({
          where: { id: { in: [...otherIds] } },
          select: { id: true, name: true, email: true, avatarUrl: true, lastSeenAt: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const result = [];
    for (const c of chats) {
      const lastReadAt = lastReadByChat.get(c.id) ?? null;
      const pref = prefByChat.get(c.id);
      // В режиме «Только упоминания» непрочитанными считаем лишь сообщения с @мной.
      const onlyMentions = pref?.notifyMode === StaffNotifyMode.MENTIONS;
      const unread = await this.prisma.staffMessage.count({
        where: {
          chatId: c.id,
          senderId: { not: userId },
          ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
          ...(onlyMentions ? { mentionIds: { has: userId } } : {}),
        },
      });
      let title = c.title;
      let online = false;
      let otherUserId: string | null = null;
      let avatarUrl: string | null = null; // аватар собеседника DM (#6)
      if (c.kind === StaffChatKind.DM) {
        const other = c.members.find((m) => m.userId !== userId);
        otherUserId = other?.userId ?? null;
        const u = other ? userMap.get(other.userId) : undefined;
        title = u ? u.name?.trim() || u.email : 'Диалог';
        online = this.online(u?.lastSeenAt);
        avatarUrl = u?.avatarUrl ?? null;
      }
      const muted =
        pref?.notifyMode === StaffNotifyMode.NONE || (!!pref?.mutedUntil && pref.mutedUntil > now);
      const last = c.messages[0];
      result.push({
        id: c.id,
        kind: c.kind,
        title,
        online,
        otherUserId,
        avatarUrl,
        memberCount: c.members.length,
        unread,
        notifyMode: pref?.notifyMode ?? StaffNotifyMode.ALL,
        muted,
        lastMessage: last
          ? { text: last.text, senderId: last.senderId, createdAt: last.createdAt }
          : null,
        updatedAt: c.updatedAt,
      });
    }
    return result;
  }

  /** Всего непрочитанных сообщений во всех моих чатах (§4 — счётчик в сайдбаре). */
  async unreadTotal(tenantId: string, userId: string): Promise<{ unread: number }> {
    const memberships = await this.prisma.staffChatMember.findMany({
      where: { userId, chat: { tenantId } },
      select: { chatId: true, lastReadAt: true, notifyMode: true },
    });
    let total = 0;
    for (const m of memberships) {
      const onlyMentions = m.notifyMode === StaffNotifyMode.MENTIONS;
      total += await this.prisma.staffMessage.count({
        where: {
          chatId: m.chatId,
          senderId: { not: userId },
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
          ...(onlyMentions ? { mentionIds: { has: userId } } : {}),
        },
      });
    }
    return { unread: total };
  }

  /** Глобальный поиск по всем моим чатам (§9): совпадения текста + чат, где найдено. */
  async searchAll(tenantId: string, userId: string, q: string) {
    const query = q.trim();
    if (query.length < 2) return [];
    const memberships = await this.prisma.staffChatMember.findMany({ where: { userId, chat: { tenantId } }, select: { chatId: true } });
    const chatIds = memberships.map((m) => m.chatId);
    if (!chatIds.length) return [];
    const rows = await this.prisma.staffMessage.findMany({
      where: { chatId: { in: chatIds }, deletedAt: null, text: { contains: query, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: { id: true, chatId: true, senderId: true, text: true, createdAt: true },
    });
    // Названия чатов (для DM — имя собеседника).
    const chats = await this.prisma.staffChat.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.chatId))] } },
      include: { members: { select: { userId: true } } },
    });
    const others = [...new Set(chats.flatMap((c) => (c.kind === StaffChatKind.DM ? c.members.map((m) => m.userId).filter((u) => u !== userId) : [])))];
    const names = await this.resolveNames(others);
    const titleOf = (chatId: string): string => {
      const c = chats.find((x) => x.id === chatId);
      if (!c) return 'Чат';
      if (c.kind === StaffChatKind.GROUP) return c.title ?? 'Группа';
      const other = c.members.find((m) => m.userId !== userId);
      return (other && names.get(other.userId)) ?? 'Диалог';
    };
    return rows.map((r) => ({ ...r, chatTitle: titleOf(r.chatId) }));
  }

  /** Медиа/файлы/ссылки чата (§5 — карточка чата). */
  async media(chatId: string, userId: string) {
    await this.assertMember(chatId, userId);
    const atts = await this.prisma.staffMessageAttachment.findMany({
      where: { message: { chatId, deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: { id: true, kind: true, url: true, name: true, size: true, mime: true, createdAt: true },
    });
    const withLinks = await this.prisma.staffMessage.findMany({
      where: { chatId, deletedAt: null, text: { contains: 'http' } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, text: true, senderId: true, createdAt: true },
    });
    const linkRe = /(https?:\/\/[^\s]+)/g;
    const links: { messageId: string; url: string; senderId: string; createdAt: Date }[] = [];
    for (const m of withLinks) {
      const found = m.text.match(linkRe);
      if (found) for (const url of found) links.push({ messageId: m.id, url, senderId: m.senderId, createdAt: m.createdAt });
    }
    return {
      images: atts.filter((a) => a.kind === 'IMAGE'),
      videos: atts.filter((a) => a.kind === 'VIDEO'),
      files: atts.filter((a) => a.kind === 'FILE' || a.kind === 'VOICE'),
      links: links.slice(0, 50),
    };
  }

  /** Общие групповые чаты с собеседником DM (§5 — карточка чата). Собеседник выводится из участников чата. */
  async commonChats(tenantId: string, chatId: string, userId: string) {
    await this.assertMember(chatId, userId);
    const members = await this.prisma.staffChatMember.findMany({ where: { chatId }, select: { userId: true } });
    const otherUserId = members.find((m) => m.userId !== userId)?.userId;
    if (!otherUserId) return [];
    const mine = await this.prisma.staffChatMember.findMany({ where: { userId, chat: { tenantId, kind: StaffChatKind.GROUP } }, select: { chatId: true } });
    const chatIds = mine.map((m) => m.chatId);
    if (!chatIds.length) return [];
    const shared = await this.prisma.staffChatMember.findMany({ where: { userId: otherUserId, chatId: { in: chatIds } }, select: { chatId: true } });
    const sharedIds = shared.map((s) => s.chatId);
    if (!sharedIds.length) return [];
    const chats = await this.prisma.staffChat.findMany({ where: { id: { in: sharedIds } }, select: { id: true, title: true } });
    return chats.map((c) => ({ id: c.id, title: c.title ?? 'Группа' }));
  }

  /** Найти-или-создать личный диалог (1:1). */
  async createDm(tenantId: string, userId: string, otherUserId: string): Promise<{ id: string }> {
    if (otherUserId === userId) throw new ForbiddenException('Нельзя начать чат с самим собой');
    const other = await this.prisma.adminUser.findFirst({ where: { id: otherUserId, tenantId } });
    if (!other) throw new NotFoundException('Сотрудник не найден');
    const key = this.dmKey(tenantId, userId, otherUserId);
    const existing = await this.prisma.staffChat.findUnique({ where: { dmKey: key } });
    if (existing) return { id: existing.id };
    const chat = await this.prisma.staffChat.create({
      data: {
        tenantId,
        kind: StaffChatKind.DM,
        dmKey: key,
        createdById: userId,
        members: { create: [{ userId }, { userId: otherUserId }] },
      },
    });
    return { id: chat.id };
  }

  /** Создать групповой чат (создатель включается автоматически). */
  async createGroup(
    tenantId: string,
    userId: string,
    title: string,
    memberIds: string[],
  ): Promise<{ id: string }> {
    const ids = [...new Set([userId, ...memberIds])];
    const valid = await this.prisma.adminUser.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true },
    });
    const chat = await this.prisma.staffChat.create({
      data: {
        tenantId,
        kind: StaffChatKind.GROUP,
        title: title.trim() || 'Группа',
        createdById: userId,
        members: { create: valid.map((v) => ({ userId: v.id })) },
      },
    });
    return { id: chat.id };
  }

  /** Сообщения чата (последние 50, при before — старше метки): реакции, цитаты, «прочитано», кто печатает. */
  async messages(chatId: string, userId: string, before?: string) {
    const chat = await this.memberChatOrThrow(chatId, userId);
    const rows = await this.prisma.staffMessage.findMany({
      where: { chatId, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        reactions: { select: { emoji: true, userId: true } },
        replyTo: { select: { id: true, senderId: true, text: true, deletedAt: true } },
        attachments: ATTACHMENT_SELECT,
      },
    });
    // «Прочитано» в DM: до какого момента прочитал собеседник.
    let otherReadAt: Date | null = null;
    if (chat.kind === StaffChatKind.DM) {
      const others = await this.prisma.staffChatMember.findMany({
        where: { chatId, NOT: { userId } },
        select: { lastReadAt: true },
      });
      otherReadAt = others.reduce<Date | null>(
        (acc, m) => (m.lastReadAt && (!acc || m.lastReadAt > acc) ? m.lastReadAt : acc),
        null,
      );
    }
    // Какие из показанных сообщений в избранном у пользователя.
    const saved = await this.prisma.staffSavedMessage.findMany({
      where: { userId, messageId: { in: rows.map((m) => m.id) } },
      select: { messageId: true },
    });
    const savedIds = new Set(saved.map((s) => s.messageId));
    const names = await this.resolveNames(rows.flatMap((m) => m.mentionIds));
    return {
      messages: rows
        .reverse()
        .map((m) => this.shapeMessage(m, userId, otherReadAt, savedIds, names)),
      typingUserIds: this.currentTyping(chatId, userId),
    };
  }

  async send(
    chatId: string,
    userId: string,
    text: string,
    replyToId?: string,
    mentionIds?: string[],
  ) {
    await this.assertMember(chatId, userId);
    let validReplyId: string | undefined;
    if (replyToId) {
      const r = await this.prisma.staffMessage.findFirst({
        where: { id: replyToId, chatId },
        select: { id: true },
      });
      validReplyId = r?.id; // цитата только на сообщение того же чата
    }
    const mentions = await this.filterMentions(chatId, mentionIds);
    const msg = await this.prisma.staffMessage.create({
      data: { chatId, senderId: userId, text, replyToId: validReplyId, mentionIds: mentions },
    });
    await this.prisma.staffChat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
    await this.prisma.staffChatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { lastReadAt: new Date() },
    });
    this.clearTyping(chatId, userId);
    await this.publishMessage(chatId, userId, mentions, text);
    return { id: msg.id, senderId: msg.senderId, text: msg.text, createdAt: msg.createdAt };
  }

  /** Отправить сообщение с вложением (файл — в хранилище /uploads). */
  async sendWithAttachment(
    chatId: string,
    userId: string,
    file: Express.Multer.File | undefined,
    text?: string,
  ) {
    await this.assertMember(chatId, userId);
    const saved = await this.storage.save(file);
    const msg = await this.prisma.staffMessage.create({
      data: {
        chatId,
        senderId: userId,
        text: (text ?? '').slice(0, 4000),
        attachments: {
          create: [
            { kind: saved.kind, url: saved.url, name: saved.name, size: saved.size, mime: saved.mime },
          ],
        },
      },
      include: {
        attachments: ATTACHMENT_SELECT,
        reactions: { select: { emoji: true, userId: true } },
        replyTo: { select: { id: true, senderId: true, text: true, deletedAt: true } },
      },
    });
    await this.prisma.staffChat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
    await this.prisma.staffChatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { lastReadAt: new Date() },
    });
    this.clearTyping(chatId, userId);
    await this.publishMessage(chatId, userId, [], (text ?? '').trim() || 'Вложение');
    return this.shapeMessage(msg, userId, null, new Set(), new Map());
  }

  /** Переключить реакцию-эмодзи на сообщение (повторный клик снимает). */
  async react(
    chatId: string,
    userId: string,
    messageId: string,
    emoji: string,
  ): Promise<{ ok: true }> {
    await this.assertMember(chatId, userId);
    const e = emoji.trim().slice(0, 16);
    if (!e) throw new BadRequestException('Пустая реакция');
    const msg = await this.prisma.staffMessage.findFirst({
      where: { id: messageId, chatId },
      select: { id: true },
    });
    if (!msg) throw new NotFoundException('Сообщение не найдено');
    const existing = await this.prisma.staffMessageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId, emoji: e } },
    });
    if (existing) await this.prisma.staffMessageReaction.delete({ where: { id: existing.id } });
    else await this.prisma.staffMessageReaction.create({ data: { messageId, userId, emoji: e } });
    await this.publishToChat(chatId);
    return { ok: true };
  }

  async editMessage(
    chatId: string,
    userId: string,
    messageId: string,
    text: string,
  ): Promise<{ ok: true }> {
    const msg = await this.ownMessageOrThrow(chatId, userId, messageId);
    if (msg.deletedAt) throw new ForbiddenException('Сообщение удалено');
    await this.prisma.staffMessage.update({
      where: { id: messageId },
      data: { text, editedAt: new Date() },
    });
    await this.publishToChat(chatId);
    return { ok: true };
  }

  async deleteMessage(chatId: string, userId: string, messageId: string): Promise<{ ok: true }> {
    await this.ownMessageOrThrow(chatId, userId, messageId);
    await this.prisma.staffMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date() }, // soft-delete: контент не отдаём в shapeMessage
    });
    await this.publishToChat(chatId);
    return { ok: true };
  }

  private async ownMessageOrThrow(chatId: string, userId: string, messageId: string) {
    await this.assertMember(chatId, userId);
    const msg = await this.prisma.staffMessage.findFirst({ where: { id: messageId, chatId } });
    if (!msg) throw new NotFoundException('Сообщение не найдено');
    if (msg.senderId !== userId) throw new ForbiddenException('Только своё сообщение');
    return msg;
  }

  /** Поиск по тексту внутри чата (без удалённых). */
  async search(chatId: string, userId: string, q: string) {
    await this.assertMember(chatId, userId);
    const query = q.trim();
    if (query.length < 2) return [];
    return this.prisma.staffMessage.findMany({
      where: { chatId, deletedAt: null, text: { contains: query, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, senderId: true, text: true, createdAt: true },
    });
  }

  /** Закрепить/открепить сообщение (toggle). Может любой участник чата. */
  async togglePin(chatId: string, userId: string, messageId: string): Promise<{ pinned: boolean }> {
    await this.assertMember(chatId, userId);
    const msg = await this.prisma.staffMessage.findFirst({ where: { id: messageId, chatId } });
    if (!msg) throw new NotFoundException('Сообщение не найдено');
    if (msg.deletedAt) throw new ForbiddenException('Сообщение удалено');
    const pinned = !msg.pinnedAt;
    await this.prisma.staffMessage.update({
      where: { id: messageId },
      data: { pinnedAt: pinned ? new Date() : null, pinnedById: pinned ? userId : null },
    });
    await this.publishToChat(chatId);
    return { pinned };
  }

  /** Закреплённые сообщения чата (последние закреплённые — сверху). */
  async pins(chatId: string, userId: string) {
    await this.assertMember(chatId, userId);
    const rows = await this.prisma.staffMessage.findMany({
      where: { chatId, pinnedAt: { not: null }, deletedAt: null },
      orderBy: { pinnedAt: 'desc' },
      take: 20,
      select: { id: true, senderId: true, text: true, createdAt: true },
    });
    return rows;
  }

  /** Сохранить/убрать сообщение в избранное (toggle). */
  async toggleSave(chatId: string, userId: string, messageId: string): Promise<{ saved: boolean }> {
    await this.assertMember(chatId, userId);
    const msg = await this.prisma.staffMessage.findFirst({
      where: { id: messageId, chatId },
      select: { id: true },
    });
    if (!msg) throw new NotFoundException('Сообщение не найдено');
    const existing = await this.prisma.staffSavedMessage.findUnique({
      where: { userId_messageId: { userId, messageId } },
    });
    if (existing) {
      await this.prisma.staffSavedMessage.delete({ where: { id: existing.id } });
      return { saved: false };
    }
    await this.prisma.staffSavedMessage.create({ data: { userId, messageId } });
    return { saved: true };
  }

  /** Избранные сообщения сотрудника (последние сверху, с указанием чата). */
  async savedMessages(userId: string) {
    const rows = await this.prisma.staffSavedMessage.findMany({
      where: { userId, message: { deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        message: { select: { id: true, chatId: true, senderId: true, text: true, createdAt: true } },
      },
    });
    return rows.map((r) => r.message);
  }

  // --- Папки/разделы ---

  folders(userId: string) {
    return this.prisma.staffChatFolder.findMany({ where: { userId }, orderBy: { order: 'asc' } });
  }

  async createFolder(userId: string, name: string) {
    const order = await this.prisma.staffChatFolder.count({ where: { userId } });
    return this.prisma.staffChatFolder.create({
      data: { userId, name: name.trim() || 'Папка', order },
    });
  }

  async updateFolder(
    userId: string,
    id: string,
    data: { name?: string; chatIds?: string[]; order?: number },
  ) {
    const folder = await this.prisma.staffChatFolder.findFirst({ where: { id, userId } });
    if (!folder) throw new NotFoundException('Папка не найдена');
    let chatIds = data.chatIds;
    if (chatIds) {
      // Оставляем только чаты, где пользователь действительно состоит.
      const memberships = await this.prisma.staffChatMember.findMany({
        where: { userId, chatId: { in: chatIds } },
        select: { chatId: true },
      });
      const allowed = new Set(memberships.map((m) => m.chatId));
      chatIds = chatIds.filter((c) => allowed.has(c));
    }
    return this.prisma.staffChatFolder.update({
      where: { id },
      data: { name: data.name?.trim() || undefined, chatIds, order: data.order },
    });
  }

  async deleteFolder(userId: string, id: string): Promise<{ ok: true }> {
    const folder = await this.prisma.staffChatFolder.findFirst({ where: { id, userId } });
    if (!folder) throw new NotFoundException('Папка не найдена');
    await this.prisma.staffChatFolder.delete({ where: { id } });
    return { ok: true };
  }

  async markRead(chatId: string, userId: string): Promise<{ ok: true }> {
    await this.assertMember(chatId, userId);
    await this.prisma.staffChatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { lastReadAt: new Date() },
    });
    return { ok: true };
  }

  /** Настройки уведомлений участника в чате (§2): режим + временная заглушка. */
  async setNotify(
    chatId: string,
    userId: string,
    opts: { mode?: 'ALL' | 'MENTIONS' | 'NONE'; muteHours?: number },
  ): Promise<{ notifyMode: StaffNotifyMode; muted: boolean }> {
    await this.assertMember(chatId, userId);
    const data: { notifyMode?: StaffNotifyMode; mutedUntil?: Date | null } = {};
    if (opts.mode) {
      data.notifyMode = opts.mode as StaffNotifyMode;
      if (opts.mode === 'ALL') data.mutedUntil = null; // «Все» снимает временную заглушку
    }
    if (opts.muteHours !== undefined) {
      data.mutedUntil = opts.muteHours > 0 ? new Date(Date.now() + opts.muteHours * 3_600_000) : null;
    }
    const m = await this.prisma.staffChatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data,
    });
    const muted = m.notifyMode === StaffNotifyMode.NONE || (!!m.mutedUntil && m.mutedUntil > new Date());
    return { notifyMode: m.notifyMode, muted };
  }

  async setTyping(chatId: string, userId: string): Promise<{ ok: true }> {
    await this.assertMember(chatId, userId);
    let m = this.typing.get(chatId);
    if (!m) {
      m = new Map();
      this.typing.set(chatId, m);
    }
    m.set(userId, Date.now() + TYPING_TTL_MS);
    await this.publishToChat(chatId, 'typing', userId);
    return { ok: true };
  }

  private currentTyping(chatId: string, exceptUserId: string): string[] {
    const m = this.typing.get(chatId);
    if (!m) return [];
    const now = Date.now();
    const ids: string[] = [];
    for (const [uid, exp] of m) {
      if (exp < now) m.delete(uid);
      else if (uid !== exceptUserId) ids.push(uid);
    }
    return ids;
  }

  private clearTyping(chatId: string, userId: string): void {
    this.typing.get(chatId)?.delete(userId);
  }
}
