import 'reflect-metadata';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { raw } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import type { Env } from './config/env.schema.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  // Локальный «диск»: публичные загруженные файлы (фото/PDF) отдаём статикой из /uploads.
  const uploadsDir = join(process.cwd(), 'uploads');
  mkdirSync(uploadsDir, { recursive: true });
  app.useStaticAssets(uploadsDir, { prefix: '/uploads/' });

  // WOPI PutFile (Collabora) шлёт бинарное тело — принимаем raw независимо от Content-Type
  app.use('/api/wopi/files/:id/contents', raw({ type: () => true, limit: '210mb' }));

  // Структурное логирование через pino
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService<Env, true>);

  // Валидация входных DTO во всём приложении
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Единый формат ошибок
  app.useGlobalFilters(new AllExceptionsFilter());

  // Префикс API
  app.setGlobalPrefix('api');

  // CORS только для разрешённых origin
  const origins = config.get('CORS_ORIGINS', { infer: true });
  app.enableCors({ origin: origins.length ? origins : true, credentials: true });

  // OpenAPI: источник типизированного клиента (@dha/api-client) и контракт Пути B.
  // Собственный PMS/Booking/Rate/Channel — источник истины (DHP); Bnovo — опц. импорт.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('D H&A API · D Hospitality Platform')
    .setDescription(
      'Backend платформы D Hotels & Apartments. Ядро (Путь B): собственный PMS, ' +
        'Booking/Rate Engine и Channel Manager под префиксом `/api/v1`. Гостевые сервисы ' +
        '(auth, каталог, лояльность, ключи, платежи) — под `/api`. Сверка с контрактом ' +
        'DHP и демо-прогон — см. `DHP.md` в корне репозитория.',
    )
    .setVersion('0.2.0')
    .addBearerAuth()
    .addServer('/', 'Текущий хост')
    // Ядро DHP (Путь B)
    .addTag('pms-rooms', 'PMS · Номерной фонд (юниты Room, статусы sell/hk/maintenance)')
    .addTag('pms-bookings', 'PMS · Брони: create (Idempotency-Key), lifecycle, анти-овербукинг')
    .addTag('pms-availability', 'PMS · Доступность: поиск, инвентарные локи, блокировки номеров')
    .addTag('pms-rates', 'PMS · Тарифы, цены, ограничения; расчёт quote (Rate Engine)')
    .addTag('booking-engine', 'Гостевой Booking Engine: search → quote → бронь + оплата')
    .addTag('channels', 'Channel Manager: каналы, маппинги, синк-джобы и логи')
    .addTag('channel-ingestion', 'Приём OTA-броней/отмен по токену канала (дедуп)')
    .addTag('pms-housekeeping', 'Операции · Уборка (на выезд создаётся автоматически)')
    .addTag('pms-maintenance', 'Операции · Обслуживание (техблок снимает номер с продажи)')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // Корректная остановка (закрытие соединений с БД и т.п.)
  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
}

void bootstrap();
