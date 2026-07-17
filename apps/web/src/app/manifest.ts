import type { MetadataRoute } from 'next';

/**
 * Web App Manifest — делает гостевой сайт устанавливаемым как приложение (PWA),
 * без публикации в сторах. Цвета — гостевой бренд «Тихий люкс» (слоновая кость / умбра).
 * Для «магазинного» вида установки желательно добавить PNG-иконки 192/512 (см. TODO ниже).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'D Hotels & Apartments',
    short_name: 'D H&A',
    description: 'Бронирование, цифровой ключ и программа лояльности D Hotels & Apartments',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'ru',
    background_color: '#FAF8F3',
    theme_color: '#524A40',
    icons: [
      // TODO: добавить PNG 192×192 и 512×512 (+ maskable) для «магазинной» установки.
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
