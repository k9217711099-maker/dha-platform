import { Module } from '@nestjs/common';
import { AiDirectoryService } from './ai-directory.service.js';

/** Резолв id→имя для операторов/гостей (лента эскалаций, QA). PrismaService — @Global. */
@Module({
  providers: [AiDirectoryService],
  exports: [AiDirectoryService],
})
export class AiDirectoryModule {}
