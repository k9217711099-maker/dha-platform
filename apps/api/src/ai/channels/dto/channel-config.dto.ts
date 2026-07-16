import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

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
