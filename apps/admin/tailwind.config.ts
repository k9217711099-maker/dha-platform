import type { Config } from 'tailwindcss';
import preset from '@dha/ui/tailwind-preset';

// Тема «Спокойный индиго» (Manrope) задаётся в пресете @dha/ui/tailwind-preset.
const config: Config = {
  presets: [preset],
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
};

export default config;
