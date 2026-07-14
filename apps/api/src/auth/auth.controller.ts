import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RateLimit, RateLimitGuard } from '../common/rate-limit/rate-limit.guard.js';
import { AuthService } from './auth.service.js';
import {
  LoginEmailDto,
  RefreshDto,
  RegisterEmailDto,
  RequestEmailOtpDto,
  RequestPhoneOtpDto,
  VerifyEmailOtpDto,
  VerifyPhoneOtpDto,
} from './dto/auth.dto.js';

@ApiTags('auth')
@Controller('auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp/phone/request')
  @HttpCode(204)
  @RateLimit({ limit: 5, windowMs: 60_000 })
  @ApiOperation({ summary: 'Запросить SMS-код на телефон' })
  async requestPhoneOtp(@Body() dto: RequestPhoneOtpDto): Promise<void> {
    await this.auth.requestPhoneOtp(dto.phone);
  }

  @Post('otp/phone/verify')
  @ApiOperation({ summary: 'Подтвердить SMS-код (вход/регистрация по телефону)' })
  verifyPhoneOtp(@Body() dto: VerifyPhoneOtpDto) {
    return this.auth.verifyPhoneOtp(dto);
  }

  @Post('otp/email/request')
  @HttpCode(204)
  @RateLimit({ limit: 5, windowMs: 60_000 })
  @ApiOperation({ summary: 'Запросить код на email' })
  async requestEmailOtp(@Body() dto: RequestEmailOtpDto): Promise<void> {
    await this.auth.requestEmailOtp(dto.email);
  }

  @Post('otp/email/verify')
  @ApiOperation({ summary: 'Подтвердить код email (вход/регистрация)' })
  verifyEmailOtp(@Body() dto: VerifyEmailOtpDto) {
    return this.auth.verifyEmailOtp(dto);
  }

  @Post('register')
  @ApiOperation({ summary: 'Регистрация по email и паролю' })
  register(@Body() dto: RegisterEmailDto) {
    return this.auth.registerEmail(dto);
  }

  @Post('login')
  @RateLimit({ limit: 10, windowMs: 60_000 })
  @ApiOperation({ summary: 'Вход по email и паролю' })
  login(@Body() dto: LoginEmailDto) {
    return this.auth.loginEmail(dto);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Обновить пару токенов' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Отозвать refresh-токен' })
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }
}
