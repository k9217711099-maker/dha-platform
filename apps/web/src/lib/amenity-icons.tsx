/**
 * Иконки удобств для гостевого каталога.
 *
 * Удобства приходят из нашего PMS (в т.ч. импорт из Bnovo), поэтому у части из них
 * поле icon (имя Lucide) пустое. Чтобы иконки были у всех, подбираем их по ключевым
 * словам русской подписи; имя Lucide используется как дополнительная подсказка.
 * Набор осознанно небольшой — «первый проход», расширяем после подключения Bnovo.
 */
import type { ReactNode } from 'react';

type IconKey =
  | 'wifi'
  | 'tv'
  | 'kitchen'
  | 'ac'
  | 'parking'
  | 'washer'
  | 'bath'
  | 'coffee'
  | 'safe'
  | 'balcony'
  | 'pets'
  | 'elevator'
  | 'pool'
  | 'gym'
  | 'fridge'
  | 'workspace'
  | 'bed'
  | 'key'
  | 'wine'
  | 'iron'
  | 'microwave'
  | 'fan'
  | 'generic';

/** SVG-«тела» иконок (24×24, штрих currentColor). */
const PATHS: Record<IconKey, ReactNode> = {
  wifi: (
    <>
      <path d="M5 12.5a10 10 0 0 1 14 0" />
      <path d="M8.5 16a5 5 0 0 1 7 0" />
      <circle cx="12" cy="19" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  tv: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="1.5" />
      <path d="M8 21h8" />
    </>
  ),
  kitchen: (
    <>
      <path d="M9 3v7a3 3 0 0 1-6 0V3" />
      <path d="M6 3v18" />
      <path d="M18 3c-1.7 0-3 2-3 5s1.3 4 3 4v9" />
    </>
  ),
  ac: (
    <>
      <rect x="3" y="5" width="18" height="7" rx="2" />
      <path d="M7 16c0 1.5 1 2 1 3M12 16c0 1.5 1 2 1 3M17 16c0 1.5 1 2 1 3" />
    </>
  ),
  parking: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9.5 16V8h3a2.5 2.5 0 0 1 0 5h-3" />
    </>
  ),
  washer: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <circle cx="12" cy="13" r="4" />
      <path d="M8 6h.5M11 6h.5" />
    </>
  ),
  bath: (
    <>
      <path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3z" />
      <path d="M6 12V6a2 2 0 0 1 2-2c1 0 1.5.5 2 1" />
      <path d="M6 19l-1 2M18 19l1 2" />
    </>
  ),
  coffee: (
    <>
      <path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8z" />
      <path d="M17 9h2a2 2 0 0 1 0 4h-2" />
      <path d="M8 3v2M12 3v2" />
    </>
  ),
  safe: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 8.5v1M12 14.5v1M8.5 12h1M14.5 12h1" />
    </>
  ),
  balcony: (
    <>
      <path d="M3 21V11h18v10" />
      <path d="M3 15h18M8 15v6M12 15v6M16 15v6" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  pets: (
    <>
      <circle cx="6.5" cy="10" r="1.6" />
      <circle cx="17.5" cy="10" r="1.6" />
      <circle cx="9.5" cy="6.5" r="1.6" />
      <circle cx="14.5" cy="6.5" r="1.6" />
      <path d="M12 12c-2.5 0-4.5 2-4.5 4S9 20 12 20s4.5-2 4.5-4-2-4-4.5-4z" />
    </>
  ),
  elevator: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M12 3v18" />
      <path d="M8.5 9L10 7l1.5 2M8.5 15L10 17l1.5-2" />
    </>
  ),
  pool: (
    <>
      <path d="M3 15c1.5 0 1.5 1.5 3 1.5s1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5" />
      <path d="M3 19c1.5 0 1.5 1.5 3 1.5s1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5" />
      <path d="M8 13V5.5A1.5 1.5 0 0 1 9.5 4M16 13V5.5A1.5 1.5 0 0 0 14.5 4" />
    </>
  ),
  gym: (
    <>
      <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
    </>
  ),
  fridge: (
    <>
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <path d="M6 10h12M10 6v2M10 13v3" />
    </>
  ),
  workspace: (
    <>
      <rect x="3" y="4" width="18" height="11" rx="1.5" />
      <path d="M8 20h8M12 15v5" />
    </>
  ),
  bed: (
    <>
      <path d="M3 8v10M3 12h18v6M21 18v-4a2 2 0 0 0-2-2" />
      <path d="M7 12v-2a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 14 10v2" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="8" r="4" />
      <path d="M10.8 10.8 20 20M17 17l2-2M14.5 14.5l2-2" />
    </>
  ),
  wine: (
    <>
      <path d="M8 3h8" />
      <path d="M9 3c0 5 1 7.5 3 7.5S15 8 15 3" />
      <path d="M12 10.5V18M9 21h6" />
    </>
  ),
  iron: (
    <>
      <path d="M3 16v-3a5 5 0 0 1 5-5h8l4 4v4z" />
      <path d="M3 16h18M8 8V6a1 1 0 0 1 1-1h3" />
    </>
  ),
  microwave: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <rect x="6" y="8" width="8" height="8" rx="1" />
      <path d="M17.5 9v.5M17.5 12v.5M17.5 15v.5" />
    </>
  ),
  fan: (
    <>
      <circle cx="12" cy="12" r="1.6" />
      <path d="M12 10.4c-1-3-1-6 0-7 2 .5 2 3.5 1 5.6M13.6 12c3-1 6-1 7 0-.5 2-3.5 2-5.6 1M12 13.6c1 3 1 6 0 7-2-.5-2-3.5-1-5.6M10.4 12c-3 1-6 1-7 0 .5-2 3.5-2 5.6-1" />
    </>
  ),
  generic: (
    <>
      <path d="M20 6L9 17l-5-5" />
    </>
  ),
};

/** Точный маппинг по коду удобства из домена (@dha/domain AMENITIES). */
const CODE_ICON: Record<string, IconKey> = {
  kitchen: 'kitchen', kitchenette: 'kitchen', dishwasher: 'kitchen', cooktop: 'kitchen', oven: 'kitchen',
  coffee_machine: 'coffee', microwave: 'microwave',
  bathtub: 'bath', shower: 'bath', hairdryer: 'fan',
  washer: 'washer', ironing_board: 'iron', iron: 'iron',
  air_conditioner: 'ac', smart_tv: 'tv', wifi: 'wifi', workspace: 'workspace',
  premium_mattress: 'bed', baby_cot: 'bed', safe: 'safe', wine_glasses: 'wine',
  elevator: 'elevator', parking: 'parking', contactless_checkin: 'key', digital_key: 'key',
};

/** Маппинг по имени иконки из настроек (Amenity.icon — курируемый набор админки). */
const ICONNAME_ICON: Record<string, IconKey> = {
  wifi: 'wifi', tv: 'tv', coffee: 'coffee', utensils: 'kitchen', kitchen: 'kitchen', cooking: 'kitchen',
  bath: 'bath', shower: 'bath', water: 'bath', car: 'parking', parking: 'parking', ac: 'ac', fan: 'fan',
  ventilation: 'ac', heater: 'ac', pool: 'pool', gym: 'gym', wine: 'wine', beer: 'coffee', minibar: 'coffee',
  baby: 'bed', bed: 'bed', 'bed-double': 'bed', sofa: 'bed', fridge: 'fridge', freezer: 'fridge',
  microwave: 'microwave', laundry: 'washer', safe: 'safe', keys: 'key', elevator: 'elevator',
  balcony: 'balcony', 'mountain-view': 'balcony', garden: 'balcony', terrace: 'balcony',
  monitor: 'workspace', iron: 'iron', pets: 'pets', dog: 'pets',
};

/** Правила подбора иконки: ключевые слова подписи → иконка. */
const RULES: [RegExp, IconKey][] = [
  [/wi-?fi|интернет|беспровод/i, 'wifi'],
  [/телевизор|\bтв\b|\btv\b|smart/i, 'tv'],
  [/кухн|плит|варочн|посудомо|микроволнов|чайник|духов/i, 'kitchen'],
  [/кондиционер|климат|сплит/i, 'ac'],
  [/парков|паркинг|машиноместо|гараж/i, 'parking'],
  [/стиральн|прачечн|сушильн/i, 'washer'],
  [/душ|ванн|санузел|биде|полотенц|туалет/i, 'bath'],
  [/кофе|чай|завтрак|мини-?бар/i, 'coffee'],
  [/сейф|депозит/i, 'safe'],
  [/балкон|терас|лоджи|веранд/i, 'balcony'],
  [/животн|питом|pet|собак|кошк/i, 'pets'],
  [/лифт|подъёмник|elevator/i, 'elevator'],
  [/бассейн|pool|джакузи|сауна|spa|спа/i, 'pool'],
  [/фитнес|тренаж|спортзал|gym/i, 'gym'],
  [/холодильник|fridge|морозильн/i, 'fridge'],
  [/рабоч|стол|коворкинг|desk|workspace/i, 'workspace'],
];

function pickIcon(label: string, icon?: string | null, code?: string | null): IconKey {
  if (code && CODE_ICON[code]) return CODE_ICON[code];
  if (icon && ICONNAME_ICON[icon]) return ICONNAME_ICON[icon];
  const hay = `${label} ${icon ?? ''}`;
  for (const [re, key] of RULES) if (re.test(hay)) return key;
  return 'generic';
}

/** Иконка удобства: точный подбор по коду/имени иконки, иначе — по ключевым словам подписи. */
export function AmenityIcon({
  label,
  icon,
  code,
  className = 'h-4 w-4',
}: {
  label: string;
  icon?: string | null;
  code?: string | null;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {PATHS[pickIcon(label, icon, code)]}
    </svg>
  );
}
