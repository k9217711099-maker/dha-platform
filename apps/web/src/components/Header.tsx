'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@dha/ui';
import { useAuth } from '../lib/auth-context';

export function Header() {
  const { guest, loading, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push('/');
  }

  return (
    <header className="border-b border-ink/10">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-sm uppercase tracking-[0.3em] text-ink">
          D Hotels &amp; Apartments
        </Link>
        <nav className="flex items-center gap-3">
          <Link href="/search" className="text-sm text-dark-gray hover:text-ink">
            Поиск
          </Link>
          {loading ? null : guest ? (
            <>
              <Link href="/bookings" className="text-sm text-dark-gray hover:text-ink">
                Мои брони
              </Link>
              <Link href="/loyalty" className="text-sm text-dark-gray hover:text-ink">
                Баллы
              </Link>
              <Link href="/favorites" className="text-sm text-dark-gray hover:text-ink">
                Избранное
              </Link>
              <Link href="/notifications" className="text-sm text-dark-gray hover:text-ink">
                Уведомления
              </Link>
              <Link href="/profile" className="text-sm text-dark-gray hover:text-ink">
                Профиль
              </Link>
              <Button variant="secondary" onClick={handleLogout}>
                Выйти
              </Button>
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="secondary">Войти</Button>
              </Link>
              <Link href="/register">
                <Button>Регистрация</Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
