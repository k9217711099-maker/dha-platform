/**
 * Общий Tailwind-пресет с токенами D H&A.
 * Тема «Спокойный индиго» (Manrope): светлый воздушный холст, глубокий индиго,
 * изумруд для действий, статусы — читаемые семантические цвета.
 * Подключается в tailwind.config приложений: `presets: [require('@dha/ui/tailwind-preset')]`.
 *
 * Совместимость: `ink` = основной текст (тёмный индиго), `beige` = светлый холст /
 * светлый текст на тёмном, `dark-gray` = приглушённый текст. Так существующие
 * классы (text-ink, bg-beige, text-dark-gray, bg-ink) перекрашиваются централизованно.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        beige: '#F6F7FB', // светлый холст приложения / светлый текст на тёмном сайдбаре
        ink: '#1E1B4B', // основной текст — глубокий индиго (indigo-950)
        'dark-gray': '#64748B', // приглушённый текст (slate-500)
        surface: '#FFFFFF',
        canvas: '#F6F7FB',
        primary: {
          DEFAULT: '#0369A1', // «Глубокий океан» (ocean blue) — основной акцент/CTA
          50: '#F0F9FF',
          100: '#E0F2FE',
          600: '#0369A1',
          700: '#075985',
        },
        accent: {
          DEFAULT: '#10B981', // emerald-500 — подтверждающие действия
          600: '#059669',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '16px',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(30,27,75,0.04), 0 4px 16px rgba(30,27,75,0.06)',
      },
    },
  },
};
