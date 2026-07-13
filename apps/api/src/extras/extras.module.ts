import { Module } from '@nestjs/common';
import { ExtrasService } from './extras.service.js';

@Module({
  providers: [ExtrasService],
  exports: [ExtrasService],
})
export class ExtrasModule {}
