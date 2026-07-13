import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { OtpService } from './otp.service.js';
import { TokensService } from './tokens.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import type { Env } from '../config/env.schema.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, OtpService, TokensService, JwtAuthGuard],
  exports: [JwtAuthGuard, TokensService],
})
export class AuthModule {}
