import type { Config } from 'tailwindcss';
import preset from '@dha/ui/tailwind-preset';

/**
 * Гостевая тема «Тихий люкс» (брендбук v1.0, brand/BRANDBOOK.md).
 * Переопределяет общий пресет ЛОКАЛЬНО для apps/web: админка продолжает
 * использовать тему «Спокойный индиго» из packages/ui/tailwind-preset.
 * Семантика классов сохранена (bg-beige, text-ink, bg-primary…), поэтому
 * существующие страницы перекрашиваются централизованно.
 */
const config: Config = {
  presets: [preset],
  content: [
    './src/**/*.{ts,tsx}',
    // Подхватываем классы из дизайн-системы
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        beige: '#FAF8F3', // слоновая кость — основной фон
        ink: '#524A40', // умбра — текст и кнопки (палитра «Туман», вариант 1d)
        'dark-gray': '#7C7367', // дым — приглушённый текст
        surface: '#FFFFFF',
        canvas: '#FAF8F3',
        sand: '#F2EEE5', // тёплый песок — вторые фоны
        bronze: '#A5794A', // фирменный акцент
        primary: {
          DEFAULT: '#524A40', // primary-кнопки — умбра
          50: '#FAF8F3',
          100: '#F2EEE5',
          600: '#524A40',
          700: '#A5794A', // hover primary — бронза (брендбук §6.2)
        },
        accent: {
          DEFAULT: '#A5794A',
          600: '#8F6636',
        },
      },
      fontFamily: {
        sans: ['Jost', 'Helvetica Neue', 'Arial', 'sans-serif'],
        serif: ['Cormorant Garamond', 'Georgia', 'serif'],
      },
      borderRadius: {
        // Редакционный стиль: прямые углы (rounded-full для точек/аватаров остаётся)
        sm: '0px',
        md: '0px',
        lg: '0px',
        xl: '0px',
        '2xl': '0px',
        '3xl': '0px',
      },
      boxShadow: {
        soft: '0 24px 60px rgba(82,74,64,0.08)',
      },
      letterSpacing: {
        overline: '.22em',
      },
    },
  },
};

export default config;
