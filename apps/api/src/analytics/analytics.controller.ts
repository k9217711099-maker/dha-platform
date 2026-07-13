import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { AnalyticsService } from './analytics.service.js';

class TrackEventDto {
  @ApiProperty({ example: 'install' })
  @IsString()
  type!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  anonymousId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  props?: Record<string, unknown>;
}

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post('track')
  @HttpCode(204)
  @ApiOperation({ summary: 'Записать событие аналитики (публичный)' })
  async track(@Body() dto: TrackEventDto): Promise<void> {
    await this.analytics.track({ type: dto.type, anonymousId: dto.anonymousId, props: dto.props });
  }
}
