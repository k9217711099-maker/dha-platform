import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Добавляет к DATABASE_URL параметры пула, если их не задали в .env: увеличенный
 * `connection_limit` (запас против всплесков — раньше пул ~CPU×2+1 исчерпывался штормом
 * запросов и весь API вставал) и `pool_timeout`. Значения из окружения не перетираем.
 */
function withPoolParams(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', '20');
    if (!u.searchParams.has('pool_timeout')) u.searchParams.set('pool_timeout', '15');
    return u.toString();
  } catch {
    return url; // на всякий случай — не ломаем подключение из-за парсинга
  }
}

/** Клиент БД. Подключается при старте модуля, корректно закрывается при остановке. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const url = withPoolParams(process.env.DATABASE_URL);
    super(url ? { datasources: { db: { url } } } : {});
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    // Предохранитель: ни один запрос не может висеть дольше 15с и держать соединение пула
    // (раньше зависший запрос жил до таймаута прокси — 60с — и копил очередь). Персистентно
    // для роли → наследуется новыми соединениями пула. Не критично, если не применится.
    try {
      await this.$executeRawUnsafe(`ALTER ROLE CURRENT_USER SET statement_timeout = '15s'`);
    } catch (e) {
      this.logger.warn(`statement_timeout не задан: ${(e as Error).message}`);
    }
    this.logger.log('Подключение к PostgreSQL установлено');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
