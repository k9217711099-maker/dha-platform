import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '../lib/auth-context';
import { CartProvider } from '../lib/cart-context';
import { Header } from '../components/Header';
import { CartBar } from '../components/CartBar';
import { ChatWidget } from '../components/ChatWidget';
import { YandexMetrika } from '../components/YandexMetrika';
import { InstallAppBanner } from '../components/InstallAppBanner';
import './globals.css';

export const metadata: Metadata = {
  title: 'D Hotels & Apartments',
  description: 'Личный кабинет гостя и бронирование D Hotels & Apartments',
  appleWebApp: { capable: true, title: 'D H&A', statusBarStyle: 'default' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <YandexMetrika />
        <AuthProvider>
          <CartProvider>
            <Header />
            {children}
            <CartBar />
            <ChatWidget />
            <InstallAppBanner />
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
