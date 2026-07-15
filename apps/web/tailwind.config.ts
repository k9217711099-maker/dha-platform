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
        beige: '#F7F4EE', // слоновая кость — основной фон
        ink: '#1C1A17', // тушь — текст и кнопки
        'dark-gray': '#55504A', // дым — приглушённый текст
        surface: '#FFFFFF',
        canvas: '#F7F4EE',
        sand: '#EFEAE0', // тёплый песок — вторые фоны
        bronze: '#A5794A', // фирменный акцент
        primary: {
          DEFAULT: '#1C1A17', // primary-кнопки — тушь
          50: '#F7F4EE',
          100: '#EFEAE0',
          600: '#1C1A17',
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
        soft: '0 24px 60px rgba(28,26,23,0.08)',
      },
      letterSpacing: {
        overline: '.22em',
      },
    },
  },
};

export default config;
