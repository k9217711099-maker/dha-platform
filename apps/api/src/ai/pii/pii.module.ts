import { Global, Module } from '@nestjs/common';
import { PiiMaskingService } from './pii-masking.service.js';

/** Маскирование ПДн доступно всем модулям (агенты, журналы). */
@Global()
@Module({
  providers: [PiiMaskingService],
  exports: [PiiMaskingService],
})
export class PiiModule {}
