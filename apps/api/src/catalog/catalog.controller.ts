import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CAPACITY_LABELS,
  DISTRICT_LABELS,
  LoyaltyTier,
  PRICE_RANGES,
  PROPERTY_FEATURES,
  PROPERTY_TYPE_LABELS,
  getTierConfig,
  priceLevelIndicator,
} from '@dha/domain';
import { CatalogService } from './catalog.service.js';
import { AvailabilityService } from './availability.service.js';
import { SearchService } from './search.service.js';
import { CatalogAdminService } from './catalog-admin.service.js';
import { ExtrasService } from '../extras/extras.service.js';
import { AvailabilityQueryDto } from './dto/availability-query.dto.js';
import { CalendarQueryDto } from './dto/calendar-query.dto.js';
import { SearchDto } from './dto/search.dto.js';
import { BrowseDto } from './dto/browse.dto.js';
import { RATE_PLAN_KINDS } from './rate-plan-kinds.js';

/** Кэшбэк баллами за регистрацию = базовая ставка уровня Member (§лояльность). */
const REGISTRATION_CASHBACK_PERCENT = Math.round(getTierConfig(LoyaltyTier.MEMBER).accrualRate * 100);

@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly availability: AvailabilityService,
    private readonly search: SearchService,
    private readonly catalogAdmin: CatalogAdminService,
    private readonly extras: ExtrasService,
  ) {}

  @Get('extras')
  @ApiOperation({ summary: 'Доступные дополнительные услуги (апселлы)' })
  listExtras() {
    return this.extras.listActive();
  }

  @Get('rate-plan-kinds')
  @ApiOperation({ summary: 'Виды тарифов (для пометки «включено в тариф»)' })
  ratePlanKinds() {
    return RATE_PLAN_KINDS;
  }

  @Get('filters')
  @ApiOperation({ summary: 'Справочники фильтров подбора (§6.3)' })
  async getFilters() {
    return {
      propertyTypes: Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => ({ value, label })),
      districts: Object.entries(DISTRICT_LABELS).map(([value, label]) => ({ value, label })),
      capacities: Object.entries(CAPACITY_LABELS).map(([value, label]) => ({ value, label })),
      // Словарь удобств — из БД (редактируется в админке)
      amenityCategories: await this.catalogAdmin.amenityCategoriesForFilters(),
      features: PROPERTY_FEATURES.map((f) => ({ code: f.code, label: f.label })),
      priceRanges: PRICE_RANGES.map((r) => ({
        code: r.code,
        level: r.level,
        indicator: priceLevelIndicator(r.level),
        minRub: r.minRub,
        maxRub: r.maxRub,
      })),
      /** Кэшбэк баллами за регистрацию гостя, % (для бейджа на незалогиненных). */
      registrationCashbackPercent: REGISTRATION_CASHBACK_PERCENT,
    };
  }

  @Get('properties')
  @ApiOperation({ summary: 'Список объектов размещения' })
  listProperties() {
    return this.catalog.listProperties();
  }

  @Get('properties/:id')
  @ApiOperation({ summary: 'Карточка объекта с категориями (§6.4)' })
  getProperty(@Param('id') id: string) {
    return this.catalog.getProperty(id);
  }

  @Get('availability')
  @ApiOperation({ summary: 'Доступность, цены и тарифы на даты (из нашего PMS/Rate Engine)' })
  getAvailability(@Query() query: AvailabilityQueryDto) {
    return this.availability.getAvailability(query);
  }

  @Get('price-calendar')
  @ApiOperation({ summary: 'Календарь цен/доступности на диапазон дат (пикер дат)' })
  getPriceCalendar(@Query() query: CalendarQueryDto) {
    return this.availability.getPriceCalendar({ ...query, days: query.days ?? 62 });
  }

  @Post('search')
  @ApiOperation({ summary: 'Поиск проживания по датам и фильтрам (§6.2–6.3)' })
  runSearch(@Body() dto: SearchDto) {
    return this.search.search(dto);
  }

  @Post('browse')
  @ApiOperation({ summary: 'Просмотр каталога без дат (все объекты по фильтрам, без цен)' })
  browse(@Body() dto: BrowseDto) {
    return this.search.browse(dto);
  }
}
