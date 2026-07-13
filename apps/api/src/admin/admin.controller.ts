import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CheckinStatus } from '@prisma/client';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { RequirePermission } from './require-permission.decorator.js';
import { AdminService } from './admin.service.js';
import { CatalogSyncService } from '../catalog/catalog-sync.service.js';
import { CatalogAdminService } from '../catalog/catalog-admin.service.js';
import { ExtrasService } from '../extras/extras.service.js';
import { CreateAmenityDto, UpdateAmenityDto, UpdateRoomTypeDto } from './dto/catalog-admin.dto.js';
import { CreateExtraDto, UpdateExtraDto } from './dto/extra.dto.js';
import { CheckinService } from '../checkin/checkin.service.js';
import { KeysService } from '../keys/keys.service.js';
import { LocksService } from '../keys/locks.service.js';
import { TtlockAdminService } from '../keys/ttlock-admin.service.js';
import { EkeyDto, PasscodeDto, TtlockCredsDto, TtlockUnlockDto } from './dto/ttlock-admin.dto.js';
import { LoyaltyService } from '../loyalty/loyalty.service.js';
import { PromocodeService } from '../promocodes/promocode.service.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { RejectCheckinDto } from '../checkin/dto/reject-checkin.dto.js';
import {
  AdjustTierDto,
  CreateLockDto,
  CreatePromocodeDto,
  LinkLockDto,
  LockCoverageDto,
  ManualPointsDto,
} from './dto/admin.dto.js';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly catalogSync: CatalogSyncService,
    private readonly catalogAdmin: CatalogAdminService,
    private readonly extras: ExtrasService,
    private readonly checkin: CheckinService,
    private readonly keys: KeysService,
    private readonly locks: LocksService,
    private readonly ttlock: TtlockAdminService,
    private readonly loyalty: LoyaltyService,
    private readonly promocodes: PromocodeService,
    private readonly analytics: AnalyticsService,
  ) {}

  // --- Аналитика (§19) ---
  @Get('analytics')
  @RequirePermission('analytics')
  @ApiOperation({ summary: 'Сводные показатели платформы' })
  metrics() {
    return this.analytics.metrics();
  }

  // --- Логи и синхронизация ---
  @Get('sync-logs')
  @RequirePermission('sync')
  @ApiOperation({ summary: 'Логи синхронизаций и ошибки интеграций' })
  syncLogs() {
    return this.admin.syncLogs();
  }

  @Post('catalog/sync')
  @RequirePermission('sync')
  @ApiOperation({ summary: 'Запустить синхронизацию каталога из Bnovo' })
  async sync(): Promise<{ itemsSynced: number }> {
    return { itemsSynced: await this.catalogSync.syncCatalog() };
  }

  // --- Объекты и бронирования ---
  @Get('bookings')
  @RequirePermission('guests')
  @ApiOperation({ summary: 'Последние бронирования' })
  bookings() {
    return this.admin.recentBookings();
  }

  @Get('guests')
  @RequirePermission('guests')
  @ApiOperation({ summary: 'Поиск гостей (телефон/почта/фамилия/имя)' })
  searchGuests(@Query('q') q?: string) {
    return this.admin.searchGuests(q);
  }

  @Get('guests-list')
  @RequirePermission('guests')
  @ApiOperation({ summary: 'База гостей списком с фильтрами (§9)' })
  guestsList(@Query('q') q?: string, @Query('tier') tier?: string) {
    return this.admin.listGuests({ query: q, tier });
  }

  @Get('guests/:id')
  @RequirePermission('guests')
  @ApiOperation({ summary: 'Профиль гостя, лояльность и брони' })
  guest(@Param('id') id: string) {
    return this.admin.guestDetails(id);
  }

  @Patch('guests/:id')
  @RequirePermission('pms_bookings')
  @ApiOperation({ summary: 'Редактировать контакты гостя-заказчика' })
  updateGuest(@Param('id') id: string, @Body() dto: { firstName?: string; lastName?: string; phone?: string; email?: string; guestNotes?: string }) {
    return this.admin.updateGuest(id, dto);
  }

  // --- Онлайн-регистрации ---
  @Get('checkins')
  @RequirePermission('checkins')
  @ApiOperation({ summary: 'Очередь регистраций на проверку' })
  checkins(@Query('status') status?: CheckinStatus) {
    return this.admin.checkinQueue(status ?? CheckinStatus.SUBMITTED);
  }

  @Post('checkins/:bookingId/approve')
  @RequirePermission('checkins')
  @ApiOperation({ summary: 'Подтвердить регистрацию' })
  approve(@Param('bookingId') bookingId: string) {
    return this.checkin.approve(bookingId);
  }

  @Post('checkins/:bookingId/reject')
  @RequirePermission('checkins')
  @ApiOperation({ summary: 'Отклонить / вернуть на исправление' })
  reject(@Param('bookingId') bookingId: string, @Body() dto: RejectCheckinDto) {
    return this.checkin.reject(bookingId, dto.reason, dto.needsFix);
  }

  // --- Цифровые ключи ---
  @Post('bookings/:bookingId/key/issue')
  @RequirePermission('guests')
  @ApiOperation({ summary: 'Выдать цифровой ключ' })
  issueKey(@Param('bookingId') bookingId: string) {
    return this.keys.adminIssue(bookingId);
  }

  @Post('bookings/:bookingId/key/revoke')
  @RequirePermission('guests')
  @ApiOperation({ summary: 'Отозвать цифровой ключ' })
  async revokeKey(@Param('bookingId') bookingId: string): Promise<{ ok: true }> {
    await this.keys.revoke(bookingId, 'admin');
    return { ok: true };
  }

  // --- Замки (§9.5: личные и общие двери) ---
  @Get('ttlock/locks')
  @RequirePermission('locks')
  @ApiOperation({ summary: 'Список замков из аккаунта TTLock' })
  ttlockLocks() {
    return this.locks.listTtlockLocks();
  }

  @Get('locks')
  @RequirePermission('locks')
  @ApiOperation({ summary: 'Замки в системе (с привязками к номерам)' })
  locksList(@Query('propertyId') propertyId?: string) {
    return this.locks.listLocks(propertyId);
  }

  @Post('locks')
  @RequirePermission('locks')
  @ApiOperation({ summary: 'Добавить замок (личную или общую дверь)' })
  createLock(@Body() dto: CreateLockDto) {
    return this.locks.createLock(dto);
  }

  @Put('locks/:lockId/coverage')
  @RequirePermission('locks')
  @ApiOperation({ summary: 'Зона покрытия замка (весь объект / этаж / список номеров)' })
  setLockCoverage(@Param('lockId') lockId: string, @Body() dto: LockCoverageDto) {
    return this.locks.setCoverage(lockId, dto);
  }

  @Post('locks/:lockId/link')
  @RequirePermission('locks')
  @ApiOperation({ summary: 'Привязать замок к одному номеру' })
  linkLock(@Param('lockId') lockId: string, @Body() dto: LinkLockDto) {
    return this.locks.linkRoom(lockId, dto.roomId);
  }

  @Post('locks/:lockId/unlink')
  @RequirePermission('locks')
  @ApiOperation({ summary: 'Отвязать замок от номера' })
  unlinkLock(@Param('lockId') lockId: string, @Body() dto: LinkLockDto) {
    return this.locks.unlinkRoom(lockId, dto.roomId);
  }

  // --- Пульт TTLock (§9.2): пароли, eKey, удалённое открытие, журнал, учётка ---
  @Post('ttlock/passcode')
  @RequirePermission('locks')
  @ApiOperation({ summary: 'Создать/отправить временный или настраиваемый пароль' })
  ttlockPasscode(@Body() dto: PasscodeDto) {
    return this.ttlock.createPasscode(dto.ttlockLockId, dto);
  }

  @Post('ttlock/ekey')
  @RequirePermission('locks')
  @ApiOperation({ summary: 'Отправить eKey на аккаунт получателя' })
  ttlockEkey(@Body() dto: EkeyDto) {
    return this.ttlock.sendEkey(dto.ttlockLockId, dto);
  }

  @Post('ttlock/unlock')
  @RequirePermission('locks')
  @ApiOperation({ summary: 'Удалённо открыть замок' })
  ttlockUnlock(@Body() dto: TtlockUnlockDto) {
    return this.ttlock.unlock(dto.ttlockLockId);
  }

  @Get('ttlock/records')
  @RequirePermission('locks')
  @ApiOperation({ summary: 'Журнал входов замка за период' })
  ttlockRecords(
    @Query('ttlockLockId') ttlockLockId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const toMs = to ? Number(to) : Date.now();
    const fromMs = from ? Number(from) : toMs - 7 * 86_400_000;
    return this.ttlock.records(ttlockLockId, fromMs, toMs);
  }

  @Get('ttlock/credentials')
  @RequirePermission('locks')
  @ApiOperation({ summary: 'Текущая учётная запись TTLock (без пароля)' })
  ttlockCreds() {
    return this.ttlock.getCredentials();
  }

  @Put('ttlock/credentials')
  @RequirePermission('locks')
  @ApiOperation({ summary: 'Сохранить логин/пароль личного кабинета TTLock' })
  ttlockSetCreds(@Body() dto: TtlockCredsDto) {
    return this.ttlock.setCredentials(dto.username, dto.password);
  }

  // --- Лояльность (ручные операции §13.8) ---
  @Post('loyalty/:guestId/accrue')
  @RequirePermission('guests')
  @ApiOperation({ summary: 'Начислить баллы вручную' })
  async accrue(@Param('guestId') guestId: string, @Body() dto: ManualPointsDto): Promise<{ ok: true }> {
    await this.loyalty.manualAccrue(guestId, dto.amount, dto.comment);
    return { ok: true };
  }

  @Post('loyalty/:guestId/deduct')
  @RequirePermission('guests')
  @ApiOperation({ summary: 'Списать баллы вручную' })
  async deduct(@Param('guestId') guestId: string, @Body() dto: ManualPointsDto): Promise<{ ok: true }> {
    await this.loyalty.manualDeduct(guestId, dto.amount, dto.comment);
    return { ok: true };
  }

  @Put('loyalty/:guestId/tier')
  @RequirePermission('guests')
  @ApiOperation({ summary: 'Скорректировать уровень лояльности' })
  async adjustTier(@Param('guestId') guestId: string, @Body() dto: AdjustTierDto): Promise<{ ok: true }> {
    await this.loyalty.adjustTier(guestId, dto.tier);
    return { ok: true };
  }

  // --- Словарь удобств (фильтры) ---
  @Get('amenities')
  @RequirePermission('amenities')
  @ApiOperation({ summary: 'Словарь удобств (фильтры)' })
  amenities() {
    return this.catalogAdmin.listAmenities();
  }

  @Get('amenity-categories')
  @RequirePermission('amenities')
  @ApiOperation({ summary: 'Категории удобств (справочник для выбора)' })
  amenityCategories() {
    return this.catalogAdmin.amenityCategories();
  }

  @Post('amenities')
  @RequirePermission('amenities')
  @ApiOperation({ summary: 'Добавить удобство в словарь' })
  createAmenity(@Body() dto: CreateAmenityDto) {
    return this.catalogAdmin.createAmenity(dto);
  }

  @Patch('amenities/:id')
  @RequirePermission('amenities')
  @ApiOperation({ summary: 'Изменить удобство' })
  updateAmenity(@Param('id') id: string, @Body() dto: UpdateAmenityDto) {
    return this.catalogAdmin.updateAmenity(id, dto);
  }

  @Delete('amenities/:id')
  @RequirePermission('amenities')
  @ApiOperation({ summary: 'Удалить удобство' })
  deleteAmenity(@Param('id') id: string) {
    return this.catalogAdmin.deleteAmenity(id);
  }

  // --- Карточки номеров (контент) ---
  @Get('room-types')
  @RequirePermission('room_types')
  @ApiOperation({ summary: 'Категории номеров (для редактирования карточек)' })
  roomTypes() {
    return this.catalogAdmin.listRoomTypes();
  }

  @Patch('room-types/:id')
  @RequirePermission('room_types')
  @ApiOperation({ summary: 'Изменить карточку номера (контент)' })
  updateRoomType(@Param('id') id: string, @Body() dto: UpdateRoomTypeDto) {
    return this.catalogAdmin.updateRoomType(id, dto);
  }

  // --- Дополнительные услуги (конструктор) ---
  @Get('extras')
  @RequirePermission('extras')
  @ApiOperation({ summary: 'Список доп-услуг' })
  extrasList() {
    return this.extras.list();
  }

  @Post('extras')
  @RequirePermission('extras')
  @ApiOperation({ summary: 'Создать доп-услугу' })
  createExtra(@Body() dto: CreateExtraDto) {
    return this.extras.create(dto);
  }

  @Patch('extras/:id')
  @RequirePermission('extras')
  @ApiOperation({ summary: 'Изменить доп-услугу' })
  updateExtra(@Param('id') id: string, @Body() dto: UpdateExtraDto) {
    return this.extras.update(id, dto);
  }

  @Delete('extras/:id')
  @RequirePermission('extras')
  @ApiOperation({ summary: 'Удалить доп-услугу' })
  deleteExtra(@Param('id') id: string) {
    return this.extras.remove(id);
  }

  // --- Промокоды ---
  @Get('promocodes')
  @RequirePermission('promocodes')
  @ApiOperation({ summary: 'Список промокодов' })
  promoList() {
    return this.promocodes.list();
  }

  @Post('promocodes')
  @RequirePermission('promocodes')
  @ApiOperation({ summary: 'Создать промокод' })
  promoCreate(@Body() dto: CreatePromocodeDto) {
    return this.promocodes.create(dto);
  }

  @Put('promocodes/:id/active')
  @RequirePermission('promocodes')
  @ApiOperation({ summary: 'Включить/выключить промокод' })
  promoToggle(@Param('id') id: string, @Body() body: { active: boolean }) {
    return this.promocodes.setActive(id, body.active);
  }
}
