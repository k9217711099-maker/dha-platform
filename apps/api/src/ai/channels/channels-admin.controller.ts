import { BadRequestException, Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { CurrentAdminId } from '../../admin/current-admin.decorator.js';
import { TelegramConfigService } from '../../integrations/telegram/telegram-config.service.js';
import { MaxConfigService } from '../../integrations/max/max-config.service.js';
import { WhatsAppService, type WaState } from '../../integrations/whatsapp/whatsapp.service.js';
import {
  TelegramUserbotService,
  type TgUserbotState,
} from '../../integrations/telegram-userbot/telegram-userbot.service.js';
import { EmailConfigService } from '../../notifications/email/email-config.service.js';
import { UmnicoConfigService } from '../../integrations/umnico/umnico-config.service.js';
import { AuditService } from '../../warehouse/audit/audit.service.js';
import {
  SaveMaxConfigDto,
  SaveTelegramConfigDto,
  TestMaxConfigDto,
  TestTelegramConfigDto,
  ToggleChannelDto,
  SaveEmailConfigDto,
  SaveUmnicoConfigDto,
  TestUmnicoConfigDto,
  RegisterUmnicoWebhookDto,
  TgDirectCodeDto,
  TgDirectPasswordDto,
  TgDirectStartDto,
  TgDirectStartQrDto,
} from './dto/channel-config.dto.js';
import {
  ChannelToggleService,
  TOGGLEABLE_CHANNELS,
  type ToggleChannelId,
} from './channel-toggle.service.js';

/** Категория канала: гостевой AI-агент или уведомления. */
type ChannelCategory = 'guest' | 'notifications';

type ChannelId = 'web' | 'app' | 'telegram' | 'tg_direct' | 'max' | 'whatsapp' | 'umnico' | 'email' | 'avito';

interface ChannelCardBase {
  id: ChannelId;
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

interface ChannelCard extends ChannelCardBase {
  /** Есть ли тумблер вкл/выкл (web/app работают из коробки, без тумблера). */
  toggleable: boolean;
  /** Включён ли канал (для переключаемых — из Setting; иначе всегда true). */
  enabled: boolean;
}

const isToggleable = (id: ChannelId): id is ToggleChannelId =>
  (TOGGLEABLE_CHANNELS as readonly string[]).includes(id);

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
    private readonly whatsapp: WhatsAppService,
    private readonly userbot: TelegramUserbotService,
    private readonly emailCfg: EmailConfigService,
    private readonly umnico: UmnicoConfigService,
    private readonly toggle: ChannelToggleService,
    private readonly audit: AuditService,
  ) {}

  @Get('ai-agent')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Включён ли AI-агент (отвечает автоматически)' })
  async aiAgent(): Promise<{ enabled: boolean }> {
    return { enabled: await this.toggle.isAiEnabled() };
  }

  @Put('ai-agent')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Включить/выключить AI-агента (при выкл — диалоги идут оператору)' })
  async setAiAgent(@Body() dto: ToggleChannelDto, @CurrentAdminId() adminId: string): Promise<{ enabled: boolean }> {
    await this.toggle.setAiEnabled(dto.enabled);
    await this.audit.record({ actorId: adminId, action: 'updated', entity: 'AiChannel', entityId: 'ai_agent', payload: { enabled: dto.enabled } });
    return { enabled: dto.enabled };
  }

  @Get()
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Список каналов коммуникации и их статус' })
  async list(): Promise<ChannelCard[]> {
    const [tg, mx, enabledMap] = await Promise.all([
      this.telegram.getPublicConfig(),
      this.max.getPublicConfig(),
      this.toggle.map(),
    ]);
    const wa = this.whatsapp.getState();
    const ub = this.userbot.getState();
    const email = await this.emailCfg.getPublicConfig();
    const um = await this.umnico.hasToken();
    const base: ChannelCardBase[] = [
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
        id: 'tg_direct',
        name: 'Telegram Direct (личный аккаунт)',
        category: 'guest',
        description:
          'Общение с гостями от ЛИЧНОГО Telegram-аккаунта (userbot), а не бота. Дублирует штатного бота. ⚠️ Неофициально, нарушает правила Telegram — риск блокировки аккаунта. Нужен отдельный SOCKS5-прокси.',
        available: true,
        connected: ub.status === 'connected',
        needsSetup: true,
        setup:
          'Как подключить:\n' +
          '1. Включите канал тумблером выше.\n' +
          '2. На сервере нужен отдельный SOCKS5-прокси: TG_USERBOT_PROXY=socks5://user:pass@host:port (HTTP-прокси для MTProto не подойдёт).\n' +
          '3. На my.telegram.org → API development tools получите api_id и api_hash.\n' +
          '4. Нажмите «Настроить», введите api_id, api_hash и телефон → «Подключить».\n' +
          '5. Введите код из Telegram; при двухэтапной проверке — облачный пароль.\n' +
          '6. Статус сменится на «Подключено». Сессия хранится зашифрованно и переживает перезапуск.',
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
        name: 'WhatsApp',
        category: 'guest',
        description:
          'Неофициальное подключение номера WhatsApp по QR-коду (Baileys). Гость пишет в WhatsApp, AI-агент отвечает. Подключайте ОТДЕЛЬНЫЙ номер — за автоматизацию WhatsApp может заблокировать аккаунт.',
        available: true,
        connected: wa.status === 'connected',
        needsSetup: true,
        setup:
          'Как подключить:\n' +
          '1. Включите канал тумблером выше.\n' +
          '2. Возьмите отдельный телефон/номер под бота (не основной рабочий).\n' +
          '3. Нажмите «Подключить» — появится QR-код.\n' +
          '4. В WhatsApp на телефоне: Настройки → Связанные устройства → Привязка устройства → отсканируйте QR.\n' +
          '5. Статус сменится на «Подключено». Сессия хранится на сервере и переживает перезапуск.',
      },
      {
        id: 'umnico',
        name: 'Umnico (агрегатор)',
        category: 'guest',
        description:
          'Единое окно для WhatsApp, Telegram, VK, Avito и др. через Umnico. Гость пишет в любой подключённый в Umnico мессенджер — AI-агент отвечает. Не нужны прокси и api_id: подключением мессенджеров занимается Umnico. Нужен API-токен из настроек Umnico.',
        available: true,
        connected: um,
        needsSetup: true,
        setup:
          'Как подключить:\n' +
          '1. В Umnico подключите нужные мессенджеры (WhatsApp, Telegram и т.д.).\n' +
          '2. В Umnico → Настройки → API создайте/скопируйте API-токен.\n' +
          '3. Вставьте токен в поле и нажмите «Проверить подключение» — покажем список подключённых каналов.\n' +
          '4. Нажмите «Зарегистрировать вебхук» — мы сами пропишем адрес в Umnico через API (в кабинете Umnico этой настройки нет).\n' +
          '5. Готово — входящие из мессенджеров пойдут в AI-агента, ответы вернутся тем же каналом.',
      },
      {
        id: 'email',
        name: 'Email (SMTP)',
        category: 'notifications',
        description:
          'Отправка писем гостям: приглашения воронки заселения, подтверждения, ссылки на регистрацию. Укажите SMTP вашего почтового ящика. Пока не настроено — письма только логируются, гостю не уходят.',
        available: true,
        connected: email.configured,
        needsSetup: true,
        setup:
          'Как подключить:\n' +
          '1. Возьмите SMTP-реквизиты вашего почтового провайдера (Яндекс/Mail/Google/корпоративный).\n' +
          '2. Хост и порт: напр. smtp.yandex.ru, порт 465 (SSL) или 587 (STARTTLS).\n' +
          '3. Логин — полный адрес ящика; пароль — пароль приложения (не основной пароль аккаунта).\n' +
          '4. Отправитель (From) — тот же адрес, напр. «D H&A <noreply@nomero.online>».\n' +
          '5. Сохраните и нажмите «Проверить подключение».',
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
    return base.map((c) => ({
      ...c,
      toggleable: isToggleable(c.id),
      enabled: isToggleable(c.id) ? enabledMap[c.id] : true,
    }));
  }

  /** Включить/выключить канал тумблером. Для WhatsApp/Telegram Direct — со стартом/остановкой сокета. */
  @Put(':id/enabled')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Включить/выключить канал' })
  async setEnabled(
    @Param('id') id: string,
    @Body() dto: ToggleChannelDto,
    @CurrentAdminId() adminId: string,
  ): Promise<ChannelCard[]> {
    if (!isToggleable(id as ChannelId)) throw new BadRequestException('Канал не переключается');
    const channel = id as ToggleChannelId;
    if (channel === 'whatsapp') await this.whatsapp.setEnabled(dto.enabled);
    else if (channel === 'tg_direct') await this.userbot.setEnabled(dto.enabled);
    else await this.toggle.setEnabled(channel, dto.enabled);
    await this.audit.record({
      actorId: adminId,
      action: 'updated',
      entity: 'AiChannel',
      entityId: channel,
      payload: { enabled: dto.enabled },
    });
    return this.list();
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

  @Get('whatsapp')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Статус WhatsApp (подключение/QR)' })
  whatsappState(): WaState {
    return this.whatsapp.getState();
  }

  @Post('whatsapp/start')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Запустить подключение WhatsApp (сгенерировать QR)' })
  async whatsappStart(@CurrentAdminId() adminId: string): Promise<WaState> {
    const state = await this.whatsapp.start();
    await this.audit.record({ actorId: adminId, action: 'updated', entity: 'AiChannel', entityId: 'whatsapp', payload: { action: 'start' } });
    return state;
  }

  @Post('whatsapp/logout')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Отвязать номер WhatsApp и удалить сессию' })
  async whatsappLogout(@CurrentAdminId() adminId: string): Promise<WaState> {
    const state = await this.whatsapp.logout();
    await this.audit.record({ actorId: adminId, action: 'updated', entity: 'AiChannel', entityId: 'whatsapp', payload: { action: 'logout' } });
    return state;
  }

  @Get('tg-direct')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Статус Telegram Direct (userbot)' })
  tgDirectState(): Promise<TgUserbotState> {
    return this.userbot.getPublicState();
  }

  @Post('tg-direct/start')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Шаг 1: реквизиты + телефон, отправить код' })
  async tgDirectStart(@Body() dto: TgDirectStartDto, @CurrentAdminId() adminId: string): Promise<TgUserbotState> {
    const state = await this.userbot.start(dto);
    await this.audit.record({ actorId: adminId, action: 'updated', entity: 'AiChannel', entityId: 'tg_direct', payload: { action: 'start' } });
    return state;
  }

  @Post('tg-direct/start-qr')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Вход по QR (как Telegram Web): api_id/api_hash → QR-код' })
  async tgDirectStartQr(@Body() dto: TgDirectStartQrDto, @CurrentAdminId() adminId: string): Promise<TgUserbotState> {
    const state = await this.userbot.startQr(dto);
    await this.audit.record({ actorId: adminId, action: 'updated', entity: 'AiChannel', entityId: 'tg_direct', payload: { action: 'start_qr' } });
    return state;
  }

  @Post('tg-direct/code')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Шаг 2: код из Telegram' })
  tgDirectCode(@Body() dto: TgDirectCodeDto): Promise<TgUserbotState> {
    return this.userbot.submitCode(dto.code);
  }

  @Post('tg-direct/password')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Шаг 3: облачный пароль (2FA)' })
  tgDirectPassword(@Body() dto: TgDirectPasswordDto): Promise<TgUserbotState> {
    return this.userbot.submitPassword(dto.password);
  }

  @Post('tg-direct/logout')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Отвязать аккаунт Telegram Direct' })
  async tgDirectLogout(@CurrentAdminId() adminId: string): Promise<TgUserbotState> {
    const state = await this.userbot.logout();
    await this.audit.record({ actorId: adminId, action: 'updated', entity: 'AiChannel', entityId: 'tg_direct', payload: { action: 'logout' } });
    return state;
  }

  @Get('email')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Текущая конфигурация SMTP (без пароля)' })
  emailConfig() {
    return this.emailCfg.getPublicConfig();
  }

  @Put('email')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Сохранить реквизиты SMTP' })
  async saveEmail(@Body() dto: SaveEmailConfigDto, @CurrentAdminId() adminId: string) {
    await this.emailCfg.save(dto);
    await this.audit.record({
      actorId: adminId,
      action: 'updated',
      entity: 'AiChannel',
      entityId: 'email',
      payload: { hostSet: dto.host !== undefined, passChanged: !!dto.pass },
    });
    return this.emailCfg.getPublicConfig();
  }

  @Post('email/test')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Проверить подключение SMTP (verify)' })
  testEmail() {
    return this.emailCfg.testConnection();
  }

  @Get('umnico')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Конфигурация Umnico (без токена) + список подключённых каналов' })
  umnicoConfig() {
    return this.umnico.getPublicConfig();
  }

  @Get('umnico/channels')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Список подключённых в Umnico каналов (для выбора в воронке/брони)' })
  umnicoChannels() {
    return this.umnico.listChannels();
  }

  @Put('umnico')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Сохранить токен Umnico' })
  async saveUmnico(@Body() dto: SaveUmnicoConfigDto, @CurrentAdminId() adminId: string) {
    await this.umnico.save(dto);
    await this.audit.record({ actorId: adminId, action: 'updated', entity: 'AiChannel', entityId: 'umnico', payload: { tokenChanged: !!dto.token } });
    return this.umnico.getPublicConfig();
  }

  @Post('umnico/test')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Проверить подключение Umnico (GET /integrations)' })
  testUmnico(@Body() dto: TestUmnicoConfigDto) {
    return this.umnico.testConnection(dto.token);
  }

  @Get('umnico/webhooks')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Список вебхуков, зарегистрированных в Umnico' })
  umnicoWebhooks() {
    return this.umnico.listWebhooks();
  }

  @Post('umnico/webhook-register')
  @RequirePermission('ai_agent')
  @ApiOperation({ summary: 'Зарегистрировать наш вебхук в Umnico (в UI Umnico настройки нет)' })
  async registerUmnicoWebhook(@Body() dto: RegisterUmnicoWebhookDto, @CurrentAdminId() adminId: string) {
    const res = await this.umnico.registerWebhook(dto.url);
    await this.audit.record({
      actorId: adminId,
      action: 'updated',
      entity: 'AiChannel',
      entityId: 'umnico',
      payload: { webhookRegistered: res.ok, url: dto.url },
    });
    return res;
  }
}
