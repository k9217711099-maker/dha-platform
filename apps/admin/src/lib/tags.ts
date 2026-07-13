/** Предустановленная «яркая» палитра цветов тегов (§6). Ключ → hex + подпись. Синхронно с бэкендом. */
export const TAG_PALETTE: { key: string; hex: string; label: string }[] = [
  { key: 'red', hex: '#EF4444', label: 'Красный' },
  { key: 'amber', hex: '#F59E0B', label: 'Янтарный' },
  { key: 'emerald', hex: '#10B981', label: 'Изумруд' },
  { key: 'blue', hex: '#3B82F6', label: 'Синий' },
  { key: 'violet', hex: '#8B5CF6', label: 'Фиолетовый' },
];

export const tagHex = (colorKey: string): string => TAG_PALETTE.find((c) => c.key === colorKey)?.hex ?? '#3B82F6';
