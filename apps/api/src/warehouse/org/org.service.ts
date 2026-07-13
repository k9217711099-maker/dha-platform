import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  CreateAddressDto,
  CreateWarehouseDto,
  UpdateAddressDto,
  UpdateWarehouseDto,
} from '../dto/warehouse.dto.js';

/** Справочники адресов/объектов и складов (§4.2, §4.3). */
@Injectable()
export class OrgService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Адреса ───
  addresses() {
    return this.prisma.whAddress.findMany({
      orderBy: { createdAt: 'asc' },
      include: { warehouses: { select: { id: true, name: true, type: true, active: true } } },
    });
  }

  async createAddress(dto: CreateAddressDto) {
    const address = await this.prisma.whAddress.create({
      data: {
        name: dto.name,
        fullAddress: dto.fullAddress ?? null,
        type: dto.type ?? 'APARTMENTS',
        roomsCount: dto.roomsCount ?? null,
        responsible: dto.responsible ?? null,
        comment: dto.comment ?? null,
      },
    });
    // У каждого адреса — собственная локальная точка хранения (§1).
    await this.prisma.whWarehouse.create({
      data: {
        name: `Склад · ${address.name}`,
        type: 'ADDRESS_LOCAL',
        addressId: address.id,
        responsible: dto.responsible ?? null,
      },
    });
    return this.prisma.whAddress.findUnique({
      where: { id: address.id },
      include: { warehouses: true },
    });
  }

  updateAddress(id: string, dto: UpdateAddressDto) {
    return this.prisma.whAddress.update({ where: { id }, data: { ...dto } });
  }

  // ─── Склады ───
  warehouses() {
    return this.prisma.whWarehouse.findMany({
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
      include: { address: { select: { id: true, name: true } } },
    });
  }

  createWarehouse(dto: CreateWarehouseDto) {
    return this.prisma.whWarehouse.create({
      data: {
        name: dto.name,
        type: dto.type ?? 'ADDRESS_LOCAL',
        addressId: dto.addressId ?? null,
        responsible: dto.responsible ?? null,
      },
    });
  }

  updateWarehouse(id: string, dto: UpdateWarehouseDto) {
    return this.prisma.whWarehouse.update({ where: { id }, data: { ...dto } });
  }
}
