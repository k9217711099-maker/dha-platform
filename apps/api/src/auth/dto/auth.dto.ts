import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
} from 'class-validator';

/** Запрос OTP по телефону. */
export class RequestPhoneOtpDto {
  @ApiProperty({ example: '+79210000000' })
  @Matches(/^\+?[1-9]\d{7,14}$/, { message: 'Некорректный номер телефона' })
  phone!: string;
}

/** Запрос OTP по email. */
export class RequestEmailOtpDto {
  @ApiProperty({ example: 'guest@example.com' })
  @IsEmail()
  email!: string;
}

/** Подтверждение OTP по телефону. При первом входе создаётся гость. */
export class VerifyPhoneOtpDto {
  @ApiProperty({ example: '+79210000000' })
  @Matches(/^\+?[1-9]\d{7,14}$/)
  phone!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(4, 8)
  code!: string;

  @ApiProperty({ description: 'Согласие на обработку ПДн (обязательно при регистрации)' })
  @IsBoolean()
  acceptPersonalData!: boolean;

  @ApiProperty({ required: false, description: 'Согласие на маркетинг' })
  @IsOptional()
  @IsBoolean()
  acceptMarketing?: boolean;
}

/** Подтверждение OTP по email. */
export class VerifyEmailOtpDto {
  @ApiProperty({ example: 'guest@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(4, 8)
  code!: string;

  @ApiProperty()
  @IsBoolean()
  acceptPersonalData!: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  acceptMarketing?: boolean;
}

/** Регистрация по email + паролю. */
export class RegisterEmailDto {
  @ApiProperty({ example: 'guest@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'StrongPass123' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty()
  @IsBoolean()
  acceptPersonalData!: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  acceptMarketing?: boolean;
}

/** Вход по email + паролю. */
export class LoginEmailDto {
  @ApiProperty({ example: 'guest@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  password!: string;
}

/** Обновление/отзыв токена. */
export class RefreshDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}
