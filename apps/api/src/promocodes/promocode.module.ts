import { Module } from '@nestjs/common';
import { PromocodeService } from './promocode.service.js';

@Module({
  providers: [PromocodeService],
  exports: [PromocodeService],
})
export class PromocodeModule {}
