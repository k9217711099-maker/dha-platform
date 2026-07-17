'use client';

import {
  Wifi, Tv, Coffee, Utensils, UtensilsCrossed, Bath, ShowerHead, Car, Wind, Waves,
  Dumbbell, Wine, Beer, Cigarette, CigaretteOff, Baby, Dog, PawPrint, Snowflake,
  Thermometer, Bed, BedDouble, Sofa, Refrigerator, Microwave, WashingMachine, Fan,
  AirVent, Lock, KeyRound, SquareParking, Accessibility, Plug, Monitor, Speaker,
  Phone, Droplets, Flame, Sun, Mountain, Trees, Building2, DoorOpen, ShieldCheck,
  Luggage, Clock, Shirt, CookingPot, CupSoda, Gamepad2, Lamp, MapPin,
  type LucideIcon,
} from 'lucide-react';

/** Курируемый набор иконок удобств (ключ = значение поля Amenity.icon). */
export const AMENITY_ICONS: Record<string, LucideIcon> = {
  wifi: Wifi, tv: Tv, coffee: Coffee, utensils: Utensils, kitchen: UtensilsCrossed,
  bath: Bath, shower: ShowerHead, car: Car, ac: Wind, pool: Waves, gym: Dumbbell,
  wine: Wine, beer: Beer, smoking: Cigarette, 'no-smoking': CigaretteOff, baby: Baby,
  dog: Dog, pets: PawPrint, fridge: Refrigerator, freezer: Snowflake, heater: Thermometer,
  bed: Bed, 'bed-double': BedDouble, sofa: Sofa, microwave: Microwave,
  laundry: WashingMachine, fan: Fan, ventilation: AirVent, safe: Lock, keys: KeyRound,
  parking: SquareParking, accessible: Accessibility, socket: Plug, monitor: Monitor,
  speaker: Speaker, phone: Phone, water: Droplets, fireplace: Flame, terrace: Sun,
  'mountain-view': Mountain, garden: Trees, elevator: Building2, balcony: DoorOpen,
  security: ShieldCheck, luggage: Luggage, reception24: Clock, iron: Shirt,
  cooking: CookingPot, minibar: CupSoda, games: Gamepad2, lamp: Lamp, location: MapPin,
};

export const AMENITY_ICON_NAMES = Object.keys(AMENITY_ICONS);

/** Иконка удобства по имени (из каталога). Нет имени/совпадения — ничего не рисуем. */
export function AmenityIcon({ name, className }: { name?: string | null; className?: string }) {
  const Icon = name ? AMENITY_ICONS[name] : undefined;
  return Icon ? <Icon className={className ?? 'h-4 w-4'} aria-hidden /> : null;
}
