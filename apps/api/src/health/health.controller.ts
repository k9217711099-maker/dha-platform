import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../common/prisma/prisma.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  /** Проверка живости сервиса и доступности БД. */
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.prismaIndicator.pingCheck('database', this.prisma)]);
  }
}
