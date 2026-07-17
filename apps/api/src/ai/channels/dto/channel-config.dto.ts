import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Сохранение реквизитов SMTP из админки (пустой пароль — не менять). */
export class SaveEmailConfigDto {
  @ApiPropertyOptional({ description: 'SMTP-хост, напр. smtp.yandex.ru' })
  @IsOptional() @IsString() @MaxLength(200)
  host?: string;

  @ApiPropertyOptional({ description: 'Порт (465 SSL / 587 STARTTLS)' })
  @IsOptional() @IsInt() @Min(1) @Max(65535)
  port?: number;

  @ApiPropertyOptional({ description: 'SSL (true для 465)' })
  @IsOptional() @IsBoolean()
  secure?: boolean;

  @ApiPropertyOptional({ description: 'Логин (адрес ящика)' })
  @IsOptional() @IsString() @MaxLength(200)
  user?: string;

  @ApiPropertyOptional({ description: 'Пароль приложения. Пусто — не менять.' })
  @IsOptional() @IsString() @MaxLength(300)
  pass?: string;

  @ApiPropertyOptional({ description: 'Отправитель, напр. "D H&A <noreply@nomero.online>"' })
  @IsOptional() @IsString() @MaxLength(200)
  from?: string;

  @ApiPropertyOptional({ description: 'SOCKS5-прокси, если хостинг блокирует SMTP-порты (socks5://user:pass@host:port). Пусто — не менять.' })
  @IsOptional() @IsString() @MaxLength(300)
  proxy?: string;
}

/** Включить/выключить канал. */
export class ToggleChannelDto {
  @ApiProperty({ description: 'Включён ли канал' })
  @IsBoolean()
  enabled!: boolean;
}

/** Сохранение реквизитов Telegram-бота из админки (пустые поля — не менять). */
export class SaveTelegramConfigDto {
  @ApiPropertyOptional({ description: 'Токен бота от @BotFather. Пусто — не менять.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  botToken?: string;

  @ApiPropertyOptional({ description: 'Username бота без @ (для ссылки t.me/<bot>).' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  botUsername?: string;

  @ApiPropertyOptional({ description: 'Секрет вебхука (X-Telegram-Bot-Api-Secret-Token). Пусто — не менять.' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  webhookSecret?: string;
}

/** Проверка подключения Telegram: токен из формы или сохранённый. */
export class TestTelegramConfigDto {
  @ApiPropertyOptional({ description: 'Токен для разовой проверки; пусто — берём сохранённый.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  botToken?: string;
}

/** Сохранение реквизитов MAX-бота из админки (пустые поля — не менять). */
export class SaveMaxConfigDto {
  @ApiPropertyOptional({ description: 'Токен MAX-бота от @MasterBot. Пусто — не менять.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  botToken?: string;

  @ApiPropertyOptional({ description: 'Username бота без @ (для ссылки max.ru/<bot>).' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  botUsername?: string;

  @ApiPropertyOptional({ description: 'Секрет вебхука MAX (если используется webhook). Пусто — не менять.' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  webhookSecret?: string;
}

/** Проверка подключения MAX: токен из формы или сохранённый. */
export class TestMaxConfigDto {
  @ApiPropertyOptional({ description: 'Токен для разовой проверки; пусто — берём сохранённый.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  botToken?: string;
}

/** Telegram Direct (userbot): шаг 1 — реквизиты и телефон. */
export class TgDirectStartDto {
  @ApiProperty({ description: 'api_id с my.telegram.org' })
  @IsString()
  @MaxLength(32)
  apiId!: string;

  @ApiProperty({ description: 'api_hash с my.telegram.org' })
  @IsString()
  @MaxLength(64)
  apiHash!: string;

  @ApiProperty({ description: 'Телефон аккаунта в международном формате, напр. +79990000000' })
  @IsString()
  @MaxLength(32)
  phone!: string;
}

/** Сохранение токена Umnico (пусто — не менять). */
export class SaveUmnicoConfigDto {
  @ApiPropertyOptional({ description: 'API-токен Umnico (из настроек Umnico → API). Пусто — не менять.' })
  @IsOptional() @IsString() @MaxLength(1000)
  token?: string;
}

/** Проверка подключения Umnico: токен из формы или сохранённый. */
export class TestUmnicoConfigDto {
  @ApiPropertyOptional({ description: 'Токен для разовой проверки; пусто — берём сохранённый.' })
  @IsOptional() @IsString() @MaxLength(1000)
  token?: string;
}

/** Регистрация вебхука Umnico на наш адрес (в UI Umnico настройки нет — только через API). */
export class RegisterUmnicoWebhookDto {
  @ApiProperty({ description: 'Публичный URL нашего вебхука, напр. https://api.nomero.online/api/ai/umnico/webhook' })
  @IsString() @MaxLength(500)
  url!: string;
}

/** Telegram Direct: вход по QR (как Telegram Web) — нужны только реквизиты. */
export class TgDirectStartQrDto {
  @ApiProperty({ description: 'api_id с my.telegram.org' })
  @IsString()
  @MaxLength(32)
  apiId!: string;

  @ApiProperty({ description: 'api_hash с my.telegram.org' })
  @IsString()
  @MaxLength(64)
  apiHash!: string;
}

/** Telegram Direct: шаг 2 — код из Telegram. */
export class TgDirectCodeDto {
  @ApiProperty({ description: 'Код подтверждения из Telegram' })
  @IsString()
  @MaxLength(16)
  code!: string;
}

/** Telegram Direct: шаг 3 — облачный пароль (2FA). */
export class TgDirectPasswordDto {
  @ApiProperty({ description: 'Облачный пароль двухэтапной проверки' })
  @IsString()
  @MaxLength(256)
  password!: string;
}
