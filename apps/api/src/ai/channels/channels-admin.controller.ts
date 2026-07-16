import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { CurrentAdminId } from '../../admin/current-admin.decorator.js';
import { TelegramConfigService } from '../../integrations/telegram/telegram-config.service.js';
import { MaxConfigService } from '../../integrations/max/max-config.service.js';
import { AuditService } from '../../warehouse/audit/audit.service.js';
import {
  SaveMaxConfigDto,
  SaveTelegramConfigDto,
  TestMaxConfigDto,
  TestTelegramConfigDto,
} from './dto/channel-config.dto.js';

/** Категория канала: гостевой AI-агент или уведомления. */
type ChannelCategory = 'guest' | 'notifications';

interface ChannelCard {
  id: 'web' | 'app' | 'telegram' | 'max' | 'whatsapp' | 'avito';
  name: string;
  category: ChannelCategory;
  description: string;
  /** Доступен в текущем релизе (MVP) или заготовка v2. */
  available: boolean;
  /** Настроен и готов принимать/отправлять сообщения. */
  connected: boolean;
  /** Требуется ли ввод реквизитов (иначе — работает «из коробки»). */
  needsSetup: boolean;
  /** Короткая инструкция по подключению (Markdown-подобный текст). */
  setup?: string;
}

/**
 * Админ-API интеграций каналов гостевого AI-агента (AI-COMMUNICATIONS-TZ §4.2,
 * §9). Право `ai_agent` («Настройка гостевого агента»). Web-виджет и чат в
 * приложении работают из коробки; Telegram настраивается вводом токена от
 * @BotFather; WhatsApp/Avito — заготовки v2.
 */
@ApiTags('ai-channels')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('ai/channels')
export class ChannelsAdminController {
  constructor(
    private readonly telegram: TelegramConfigService,
    private readonly max: MaxConfigService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Список каналов коммуникации и их статус' })
  async list(): Promise<ChannelCard[]> {
    const [tg, mx] = await Promise.all([
      this.telegram.getPublicConfig(),
      this.max.getPublicConfig(),
    ]);
    return [
      {
        id: 'web',
        name: 'Виджет на сайте и в личном кабинете',
        category: 'guest',
        description:
          'Чат гостевого AI-агента на сайте бронирования и в веб-кабинете. Работает из коробки — гость пишет прямо на странице, без внешних аккаунтов.',
        available: true,
        connected: true,
        needsSetup: false,
        setup:
          'Отдельные реквизиты не нужны. Виджет встроен в веб-приложение (apps/web) и обращается к нашему backend. Чтобы отключить канал, скройте виджет на стороне сайта.',
      },
      {
        id: 'app',
        name: 'Встроенный чат в мобильном приложении',
        category: 'guest',
        description:
          'Диалог с AI-агентом внутри iOS/Android-приложения. Работает из коробки через тот же backend, что и веб-виджет.',
        available: true,
        connected: true,
        needsSetup: false,
        setup:
          'Отдельные реквизиты не нужны. Экран чата встроен в мобильное приложение и ходит на наш API. Управление доступностью — на стороне приложения.',
      },
      {
        id: 'telegram',
        name: 'Telegram-бот',
        category: 'guest',
        description:
          'Гость пишет боту в Telegram, AI-агент отвечает и при необходимости эскалирует оператору. Нужен токен бота от @BotFather.',
        available: true,
        connected: tg.connected,
        needsSetup: true,
        setup:
          'Как подключить:\n' +
          '1. В Telegram откройте @BotFather → /newbot → задайте имя и username бота.\n' +
          '2. Скопируйте выданный токен вида 123456:ABC... и вставьте в поле «Токен бота».\n' +
          '3. Укажите username бота (без @) — по нему собирается ссылка t.me/<bot> для гостей.\n' +
          '4. Придумайте «секрет вебхука» (любая длинная строка) — им подписываются входящие вебхуки.\n' +
          '5. Сохраните и нажмите «Проверить подключение».\n' +
          '6. Зарегистрируйте вебхук у Telegram (один раз), подставив свой публичный адрес API:\n' +
          '   https://api.telegram.org/bot<ТОКЕН>/setWebhook?url=<ПУБЛИЧНЫЙ_URL>/api/ai/telegram/webhook&secret_token=<СЕКРЕТ>',
      },
      {
        id: 'max',
        name: 'MAX (бот)',
        category: 'guest',
        description:
          'Гость пишет боту в мессенджере MAX, AI-агент отвечает и при необходимости эскалирует оператору. Нужен токен бота от @MasterBot. MAX — российская площадка, работает с сервера напрямую.',
        available: true,
        connected: mx.connected,
        needsSetup: true,
        setup:
          'Как подключить:\n' +
          '1. В MAX откройте @MasterBot → создайте бота, задайте имя и username.\n' +
          '2. Скопируйте выданный токен и вставьте в поле «Токен бота».\n' +
          '3. Укажите username бота (без @) — по нему собирается ссылка max.ru/<bot> для гостей.\n' +
          '4. Сохраните и нажмите «Проверить подключение» (метод /me).\n' +
          '5. Приём входящих по умолчанию — long polling (сервер сам опрашивает MAX), отдельная регистрация вебхука не требуется.',
      },
      {
        id: 'whatsapp',
        name: 'WhatsApp Business',
        category: 'guest',
        description:
          'Приём и ответы в WhatsApp через Business API. Появится на следующем этапе (v2).',
        available: false,
        connected: false,
        needsSetup: true,
      },
      {
        id: 'avito',
        name: 'Avito',
        category: 'guest',
        description:
          'Диалоги с гостями из объявлений Avito в едином окне. Появится на следующем этапе (v2).',
        available: false,
        connected: false,
        needsSetup: true,
      },
    ];
  }

  @Get('telegram')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Текущая конфигурация Telegram-бота (без секретов)' })
  telegramConfig() {
    return this.telegram.getPublicConfig();
  }

  @Put('telegram')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Сохранить реквизиты Telegram-бота' })
  async saveTelegram(@Body() dto: SaveTelegramConfigDto, @CurrentAdminId() adminId: string) {
    await this.telegram.save(dto);
    await this.audit.record({
      actorId: adminId,
      action: 'updated',
      entity: 'AiChannel',
      entityId: 'telegram',
      payload: {
        botUsernameSet: dto.botUsername !== undefined,
        tokenChanged: !!dto.botToken,
        webhookSecretChanged: !!dto.webhookSecret,
      },
    });
    return this.telegram.getPublicConfig();
  }

  @Post('telegram/test')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Проверить подключение Telegram-бота (getMe)' })
  testTelegram(@Body() dto: TestTelegramConfigDto) {
    return this.telegram.testConnection(dto.botToken);
  }

  @Get('max')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Текущая конфигурация MAX-бота (без секретов)' })
  maxConfig() {
    return this.max.getPublicConfig();
  }

  @Put('max')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Сохранить реквизиты MAX-бота' })
  async saveMax(@Body() dto: SaveMaxConfigDto, @CurrentAdminId() adminId: string) {
    await this.max.save(dto);
    await this.audit.record({
      actorId: adminId,
      action: 'updated',
      entity: 'AiChannel',
      entityId: 'max',
      payload: {
        botUsernameSet: dto.botUsername !== undefined,
        tokenChanged: !!dto.botToken,
        webhookSecretChanged: !!dto.webhookSecret,
      },
    });
    return this.max.getPublicConfig();
  }

  @Post('max/test')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Проверить подключение MAX-бота (/me)' })
  testMax(@Body() dto: TestMaxConfigDto) {
    return this.max.testConnection(dto.botToken);
  }
}
