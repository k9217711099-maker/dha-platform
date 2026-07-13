import type { Config } from 'tailwindcss';
import preset from '@dha/ui/tailwind-preset';

const config: Config = {
  presets: [preset],
  content: [
    './src/**/*.{ts,tsx}',
    // Подхватываем классы из дизайн-системы
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};

export default config;
