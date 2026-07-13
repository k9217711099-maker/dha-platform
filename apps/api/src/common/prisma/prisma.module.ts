import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/** Глобальный модуль доступа к БД — PrismaService доступен во всех модулях. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
