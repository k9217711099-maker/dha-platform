import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';

export interface FavoriteView {
  roomTypeId: string;
  roomTypeName: string;
  propertyId: string;
  propertyName: string;
  address: string;
  capacity: number;
  areaSqm: number | null;
  bedType: string | null;
  amenities: string[];
  photos: string[];
  addedAt: Date;
}

/** Избранные категории гостя (§ личный кабинет). */
@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Только id категорий — для подсветки сердечек в выдаче. */
  async ids(guestId: string): Promise<string[]> {
    const favs = await this.prisma.favorite.findMany({
      where: { guestId },
      select: { roomTypeId: true },
    });
    return favs.map((f) => f.roomTypeId);
  }

  async list(guestId: string): Promise<FavoriteView[]> {
    const favs = await this.prisma.favorite.findMany({
      where: { guestId },
      include: { roomType: { include: { property: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return favs.map((f) => ({
      roomTypeId: f.roomTypeId,
      roomTypeName: f.roomType.name,
      propertyId: f.roomType.propertyId,
      propertyName: f.roomType.property.name,
      address: f.roomType.property.address,
      capacity: f.roomType.capacity,
      areaSqm: f.roomType.areaSqm,
      bedType: f.roomType.bedType,
      amenities: f.roomType.amenities,
      photos: f.roomType.photos,
      addedAt: f.createdAt,
    }));
  }

  async add(guestId: string, roomTypeId: string): Promise<{ ok: true }> {
    const room = await this.prisma.roomType.findUnique({ where: { id: roomTypeId } });
    if (!room) throw new NotFoundException('Категория не найдена');
    await this.prisma.favorite.upsert({
      where: { guestId_roomTypeId: { guestId, roomTypeId } },
      create: { guestId, roomTypeId },
      update: {},
    });
    return { ok: true };
  }

  async remove(guestId: string, roomTypeId: string): Promise<{ ok: true }> {
    await this.prisma.favorite.deleteMany({ where: { guestId, roomTypeId } });
    return { ok: true };
  }
}
