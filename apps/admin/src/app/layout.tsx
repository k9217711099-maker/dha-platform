import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminShell } from '../components/AdminShell';
import './globals.css';

export const metadata: Metadata = {
  title: 'D H&A — Административная панель',
  description: 'Управление объектами, лояльностью, заявками и интеграциями',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <head>
        {/* Шрифт Manrope (тема «Спокойный индиго»). При отсутствии сети — системный sans. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
