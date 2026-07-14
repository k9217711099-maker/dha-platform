import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv } from './config/env.schema.js';
import { RateLimitGuard } from './common/rate-limit/rate-limit.guard.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { CryptoModule } from './common/crypto/crypto.module.js';
import { SettingsModule } from './common/settings/settings.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { AuthModule } from './auth/auth.module.js';
import { GuestsModule } from './guests/guests.module.js';
import { BnovoModule } from './integrations/bnovo/bnovo.module.js';
import { YooKassaModule } from './integrations/yookassa/yookassa.module.js';
import { FiscalModule } from './integrations/fiscal/fiscal.module.js';
import { StorageModule } from './integrations/storage/storage.module.js';
import { TtlockModule } from './integrations/ttlock/ttlock.module.js';
import { OtaMessagingModule } from './integrations/ota-messaging/ota-messaging.module.js';
import { Bitrix24Module } from './integrations/bitrix24/bitrix24.module.js';
import { PassportModule } from './integrations/passport/passport.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { LoyaltyModule } from './loyalty/loyalty.module.js';
import { BookingModule } from './booking/booking.module.js';
import { FavoritesModule } from './favorites/favorites.module.js';
import { ExtrasModule } from './extras/extras.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { CheckinModule } from './checkin/checkin.module.js';
import { KeysModule } from './keys/keys.module.js';
import { CrmModule } from './crm/crm.module.js';
import { ChatModule } from './chat/chat.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { AdminModule } from './admin/admin.module.js';
import { WarehouseModule } from './warehouse/warehouse.module.js';
import { PmsModule } from './pms/pms.module.js';
import { BookingEngineModule } from './booking-engine/booking-engine.module.js';
import { ChannelModule } from './channel/channel.module.js';
import { AiModule } from './ai/ai.module.js';
import { StaffChatModule } from './staff-chat/staff-chat.module.js';
import { KbModule } from './kb/kb.module.js';
import { DriveModule } from './drive/drive.module.js';
import { AclModule } from './acl/acl.module.js';
import { SecretsModule } from './secrets/secrets.module.js';
import { OpsModule } from './ops/ops.module.js';
import { BonusModule } from './bonus/bonus.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        // Не логируем чувствительные заголовки (ПДн/токены)
        redact: ['req.headers.authorization', 'req.headers.cookie'],
      },
    }),
    PrismaModule,
    CryptoModule,
    SettingsModule,
    PmsModule,
    NotificationsModule,
    AuthModule,
    GuestsModule,
    BnovoModule,
    YooKassaModule,
    FiscalModule,
    StorageModule,
    TtlockModule,
    OtaMessagingModule,
    Bitrix24Module,
    PassportModule,
    CatalogModule,
    LoyaltyModule,
    BookingModule,
    FavoritesModule,
    ExtrasModule,
    PaymentsModule,
    CheckinModule,
    KeysModule,
    CrmModule,
    ChatModule,
    AnalyticsModule,
    AdminModule,
    WarehouseModule,
    BookingEngineModule,
    ChannelModule,
    AiModule,
    StaffChatModule,
    KbModule,
    DriveModule,
    AclModule,
    SecretsModule,
    OpsModule,
    BonusModule,
    HealthModule,
  ],
  providers: [
    // Глобальный rate-limit: активен только на эндпоинтах с декоратором @RateLimit.
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
