import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GuestsController } from './guests.controller.js';
import { GuestsService } from './guests.service.js';

@Module({
  imports: [AuthModule],
  controllers: [GuestsController],
  providers: [GuestsService],
  exports: [GuestsService],
})
export class GuestsModule {}
