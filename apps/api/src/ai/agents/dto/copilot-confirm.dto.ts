import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';

/** Решение сотрудника по одному предложенному действию на запись. */
export class CopilotDecisionDto {
  @ApiProperty()
  @IsString()
  toolCallId!: string;

  @ApiProperty()
  @IsBoolean()
  allow!: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  denyReason?: string;
}

/** Подтверждение/отклонение предложенных копилотом действий. */
export class CopilotConfirmDto {
  @ApiProperty()
  @IsString()
  conversationId!: string;

  @ApiProperty({ type: [CopilotDecisionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CopilotDecisionDto)
  decisions!: CopilotDecisionDto[];
}
