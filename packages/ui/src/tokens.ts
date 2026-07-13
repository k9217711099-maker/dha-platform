/**
 * Бренд-токены D Hotels & Apartments (из брендбука ТЗ).
 * Палитра: бежевый #e7e3dd (= PANTONE P 169-1 C), чёрный, тёмно-серый #242424.
 * Шрифт: Onest (начертания Thin 100 / ExtraLight 200 / Light 300 / Regular 400).
 */
export const brand = {
  color: {
    /** Бежевый — основной фон (= PANTONE P 169-1 C). */
    beige: '#e7e3dd',
    black: '#000000',
    darkGray: '#242424',
    white: '#ffffff',
  },
  font: {
    /** Основной шрифт бренда; начертания Onest подключаются в @font-face (tokens.css). */
    sans: "'Onest', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  },
  radius: {
    sm: '4px',
    md: '8px',
    lg: '16px',
  },
} as const;

export type Brand = typeof brand;
