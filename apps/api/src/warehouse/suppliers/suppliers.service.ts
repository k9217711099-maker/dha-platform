import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { CreateSupplierDto, UpdateSupplierDto } from '../dto/warehouse.dto.js';

/** Справочник поставщиков (§4.6). */
@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.whSupplier.findMany({ orderBy: { name: 'asc' } });
  }

  create(dto: CreateSupplierDto) {
    return this.prisma.whSupplier.create({ data: { ...dto } });
  }

  update(id: string, dto: UpdateSupplierDto) {
    return this.prisma.whSupplier.update({ where: { id }, data: { ...dto } });
  }
}
