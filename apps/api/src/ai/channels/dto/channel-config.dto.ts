import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

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
