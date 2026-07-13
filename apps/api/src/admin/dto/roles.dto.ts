import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEmail, IsIn, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class CreateAdminUserDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Роль доступа. Если пусто — берётся роль по умолчанию у должности.' })
  @IsOptional()
  @IsString()
  roleKey?: string;

  @ApiPropertyOptional({ description: 'Должность (Position.id)' })
  @IsOptional()
  @IsString()
  positionId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Отделы (UserGroup.id)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groupIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Объекты/адреса склада (пусто — все)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedAddressIds?: string[];
}

export class UpdateAdminUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roleKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  positionId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groupIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedAddressIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  // Карточка сотрудника (§6) — доступно руководителю.
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional({ description: 'ISO-дата' }) @IsOptional() @IsString() birthday?: string | null;
  @ApiPropertyOptional({ description: 'ISO-дата приёма' }) @IsOptional() @IsString() hireDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() hobby?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() about?: string;
  @ApiPropertyOptional({ description: 'Пользовательские поля { defId: значение }' }) @IsOptional() @IsObject() customFields?: Record<string, string>;
}

/** Обновление своей карточки (self-service): только самозаполняемые поля. */
export class UpdateMyProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() birthday?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() hobby?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() about?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() customFields?: Record<string, string>;
}

/** Определение пользовательского поля карточки. */
export class SaveFieldDefDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional({ enum: ['SELF', 'MANAGER', 'BOTH'] }) @IsOptional() @IsIn(['SELF', 'MANAGER', 'BOTH']) editableBy?: 'SELF' | 'MANAGER' | 'BOTH';
}

export class SavePositionDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Роль доступа по умолчанию (Role.key)' })
  @IsOptional()
  @IsString()
  defaultRoleKey?: string;
}
