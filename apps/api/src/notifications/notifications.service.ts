import { Injectable, Logger } from '@nestjs/common';
import { ConsentType } from '@prisma/client';
import { NotificationChannel } from '@dha/domain';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { TelegramPort } from '../integrations/telegram/telegram.port.js';
import { PushSender } from './push/push.port.js';
import { SmsSender } from './sms/sms.port.js';
import { EmailSender } from './email/email.port.js';
import { SCENARIOS, type NotificationPayload, type Scenario } from './scenarios.js';

/** Диспетчер уведомлений (§16): выбор каналов по сценарию, учёт согласий, журнал. */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushSender,
    private readonly sms: SmsSender,
    private readonly email: EmailSender,
    private readonly telegram: TelegramPort,
  ) {}

  /**
   * Текст сценария для канала: редактируемый шаблон тенанта (CHECK-IN-TZ §5.2;
   * конкретный канал приоритетнее '*'), иначе — встроенный. {var} — из payload.
   */
  async renderScenario(
    tenantId: string | null,
    scenario: Scenario,
    payload: NotificationPayload,
    channel?: NotificationChannel,
  ): Promise<{ title: string; body: string }> {
    if (tenantId) {
      const overrides = await this.prisma.notificationTemplate.findMany({
        where: { tenantId, scenario, channel: { in: channel ? [channel, '*'] : ['*'] } },
      });
      const tpl = overrides.find((t) => t.channel === channel) ?? overrides.find((t) => t.channel === '*');
      if (tpl) return { title: substitute(tpl.title, payload), body: substitute(tpl.body, payload) };
    }
    return SCENARIOS[scenario].render(payload);
  }

  /**
   * Отправить уведомление по сценарию. Не бросает — ошибки логируются и фиксируются.
   * channelsOverride — каналы этапа воронки заселения (CHECK-IN-TZ §5.3) вместо
   * дефолтных каналов сценария (PUSH/SMS/EMAIL/TELEGRAM; whatsapp/ota — свои порты).
   */
  async notify(
    guestId: string,
    scenario: Scenario,
    payload: NotificationPayload = {},
    channelsOverride?: NotificationChannel[],
  ): Promise<void> {
    const def = SCENARIOS[scenario];
    const guest = await this.prisma.guest.findUnique({
      where: { id: guestId },
      include: { deviceTokens: true, consents: { orderBy: { grantedAt: 'desc' } } },
    });
    if (!guest) return;

    // Маркетинговые сценарии — только при согласии (152-ФЗ)
    if (def.marketing) {
      const marketing = guest.consents.find((c) => c.type === ConsentType.MARKETING);
      if (!marketing?.granted) return;
    }

    const channels = channelsOverride?.length ? channelsOverride : def.channels;
    for (const channel of channels) {
      const { title, body } = await this.renderScenario(guest.tenantId, scenario, payload, channel);
      let status = 'sent';
      try {
        if (channel === NotificationChannel.EMAIL) {
          if (guest.email) await this.email.send({ to: guest.email, subject: title, text: body });
          else status = 'skipped';
        } else if (channel === NotificationChannel.SMS) {
          if (guest.phone) await this.sms.send(guest.phone, `${title}: ${body}`);
          else status = 'skipped';
        } else if (channel === NotificationChannel.PUSH) {
          if (guest.deviceTokens.length) {
            await Promise.all(guest.deviceTokens.map((d) => this.push.send(d.token, title, body)));
          } else status = 'skipped';
        } else if (channel === NotificationChannel.TELEGRAM) {
          if (guest.telegramChatId) await this.telegram.sendMessage(guest.telegramChatId, `${title}\n${body}`);
          else status = 'skipped';
        }
      } catch (err) {
        status = 'failed';
        this.logger.warn(`Уведомление ${scenario}/${channel} не отправлено: ${String(err)}`);
      }
      await this.prisma.notification.create({
        data: { guestId, scenario, channel, title, body, status },
      });
    }
  }

  /** Зарегистрировать токен устройства для push. */
  async registerDevice(guestId: string, token: string, platform: string): Promise<void> {
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { guestId, token, platform },
      update: { guestId, platform },
    });
  }

  /** In-app список уведомлений гостя. */
  async list(guestId: string) {
    return this.prisma.notification.findMany({
      where: { guestId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}

/** Подстановка переменных {var} из payload; неизвестные — пустая строка. */
export function substitute(template: string, payload: NotificationPayload): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = payload[key];
    return v === undefined || v === null ? '' : String(v);
  });
}
