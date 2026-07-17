import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsSender } from './sms/sms.port.js';
import { DevSmsSender } from './sms/dev-sms.sender.js';
import { SmscSmsSender } from './sms/smsc-sms.sender.js';
import { EmailSender } from './email/email.port.js';
import { DevEmailSender } from './email/dev-email.sender.js';
import { SmtpEmailSender } from './email/smtp-email.sender.js';
import { PushSender } from './push/push.port.js';
import { MockPushSender } from './push/mock-push.sender.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationTemplatesController } from './templates/notification-templates.controller.js';
import { AdminAuthGuard } from '../admin/admin-auth.guard.js';
import { AuditService } from '../warehouse/audit/audit.service.js';
import type { Env } from '../config/env.schema.js';

/**
 * Каналы уведомлений и диспетчер сценариев (§16). SMS-реализация выбирается по
 * SMS_PROVIDER; push/email пока mock/dev (реальные FCM/APNs/SMTP — при подключении).
 */
@Global()
@Module({
  controllers: [NotificationsController, NotificationTemplatesController],
  providers: [
    AdminAuthGuard,
    AuditService,
    DevSmsSender,
    SmscSmsSender,
    {
      provide: SmsSender,
      inject: [ConfigService, DevSmsSender, SmscSmsSender],
      useFactory: (config: ConfigService<Env, true>, dev: DevSmsSender, smsc: SmscSmsSender) =>
        config.get('SMS_PROVIDER', { infer: true }) === 'smsc' ? smsc : dev,
    },
    DevEmailSender,
    SmtpEmailSender,
    {
      provide: EmailSender,
      inject: [ConfigService, DevEmailSender, SmtpEmailSender],
      useFactory: (config: ConfigService<Env, true>, dev: DevEmailSender, smtp: SmtpEmailSender) =>
        config.get('SMTP_HOST', { infer: true }) ? smtp : dev,
    },
    { provide: PushSender, useClass: MockPushSender },
    NotificationsService,
  ],
  exports: [SmsSender, EmailSender, PushSender, NotificationsService],
})
export class NotificationsModule {}
