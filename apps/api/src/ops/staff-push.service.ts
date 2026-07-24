import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import webpush from 'web-push';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { OpsEvents, type OpsEvent } from './ops.events.js';

/**
 * Web Push для сотрудников (LQA: заявка должна догонять техника с телефоном в кармане,
 * SSE работает только при открытой вкладке). Без внешних сервисов: VAPID-ключи
 * генерируются при первом старте и хранятся в Setting; подписки — на устройство.
 * Мёртвые подписки (404/410) удаляются автоматически.
 */
@Injectable()
export class StaffPushService implements OnModuleInit {
  private readonly logger = new Logger(StaffPushService.name);
  private publicKey = '';
  private ready = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: OpsEvents,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.initVapid();
    } catch (e) {
      this.logger.warn(`web push init: ${e instanceof Error ? e.message : e}`);
    }
    // Пуш дублирует SSE-события задач: новая задача, напоминание, эскалация, комментарий, статус.
    this.events.stream().subscribe((e) => void this.onEvent(e).catch((err) => this.logger.warn(`push event: ${err instanceof Error ? err.message : err}`)));
  }

  private async initVapid(): Promise<void> {
    const [pub, priv] = await Promise.all([
      this.prisma.setting.findUnique({ where: { key: 'webpush.publicKey' } }),
      this.prisma.setting.findUnique({ where: { key: 'webpush.privateKey' } }),
    ]);
    let publicKey = pub?.value;
    let privateKey = priv?.value;
    if (!publicKey || !privateKey) {
      const keys = webpush.generateVAPIDKeys();
      publicKey = keys.publicKey;
      privateKey = keys.privateKey;
      await this.prisma.setting.upsert({ where: { key: 'webpush.publicKey' }, create: { key: 'webpush.publicKey', value: publicKey }, update: { value: publicKey } });
      await this.prisma.setting.upsert({ where: { key: 'webpush.privateKey' }, create: { key: 'webpush.privateKey', value: privateKey }, update: { value: privateKey } });
      this.logger.log('VAPID-ключи Web Push сгенерированы и сохранены в Setting');
    }
    webpush.setVapidDetails('mailto:admin@dha.local', publicKey, privateKey);
    this.publicKey = publicKey;
    this.ready = true;
  }

  async getPublicKey(): Promise<string> {
    if (!this.ready) await this.initVapid();
    return this.publicKey;
  }

  async subscribe(tenantId: string, userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent?: string) {
    await this.prisma.staffPushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { tenantId, userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent ?? null },
      update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
    return { ok: true };
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.staffPushSubscription.deleteMany({ where: { userId, endpoint } });
    return { ok: true };
  }

  async status(userId: string, endpoint?: string) {
    const count = await this.prisma.staffPushSubscription.count({ where: { userId } });
    const thisDevice = endpoint ? (await this.prisma.staffPushSubscription.count({ where: { userId, endpoint } })) > 0 : false;
    return { devices: count, thisDevice };
  }

  /** Заголовок/текст пуша по событию Ops. null — событие не пушим.
   *  urgent → на устройстве другой профиль уведомления (многократная вибрация, не закрывается само). */
  private format(e: OpsEvent): { title: string; body: string; urgent: boolean } | null {
    const t = String(e.payload?.title ?? 'Задача');
    // Срочные: аварийная критичность или «важная» задача, а также напоминания/эскалации по просрочке.
    const hot = e.payload?.severity === 'CRITICAL' || e.payload?.important === true;
    switch (e.kind) {
      case 'task_created': return { title: hot ? '‼️ Срочная задача' : 'Новая задача', body: t, urgent: hot };
      case 'reminder': return { title: '⏰ Напоминание по задаче', body: t, urgent: true };
      case 'escalation': return { title: '⚠️ Требует внимания руководителя', body: t, urgent: true };
      case 'deadline': return { title: '⏳ Приближается срок задачи', body: t, urgent: true };
      case 'task_comment': return { title: 'Комментарий к задаче', body: t, urgent: false };
      case 'task_status': {
        const to = String(e.payload?.to ?? '');
        // Пушим только значимые для адресатов переходы, чтобы не спамить.
        if (to !== 'WAITING_CONFIRM' && to !== 'CANCELLED') return null;
        return { title: to === 'WAITING_CONFIRM' ? 'Задача ждёт подтверждения' : 'Задача отменена', body: t, urgent: false };
      }
      default: return null;
    }
  }

  private async onEvent(e: OpsEvent): Promise<void> {
    if (!this.ready || !e.userIds?.length) return;
    const msg = this.format(e);
    if (!msg) return;
    const subs = await this.prisma.staffPushSubscription.findMany({ where: { userId: { in: e.userIds } } });
    if (subs.length === 0) return;
    const payload = JSON.stringify({ ...msg, kind: e.kind, url: e.taskId ? `/ops/my?task=${e.taskId}` : '/ops/my' });
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await this.prisma.staffPushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
        } else {
          this.logger.warn(`push send: ${err instanceof Error ? err.message : err}`);
        }
      }
    }));
  }
}
