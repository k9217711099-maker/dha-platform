'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth-context';

const navLink =
  'text-[13px] uppercase tracking-overline text-dark-gray transition-colors hover:text-ink';

export function Header() {
  const { guest, loading, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push('/');
  }

  return (
    <header className="sticky top-0 z-50 border-b border-ink/15 bg-beige/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="font-serif text-2xl font-medium tracking-wide text-ink">
          D <span className="text-bronze">H&amp;A</span>
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/search" className={navLink}>
            Поиск
          </Link>
          {loading ? null : guest ? (
            <>
              <Link href="/bookings" className={navLink}>
                Мои брони
              </Link>
              <Link href="/loyalty" className={navLink}>
                Баллы
              </Link>
              <Link href="/favorites" className={navLink}>
                Избранное
              </Link>
              <Link href="/notifications" className={navLink}>
                Уведомления
              </Link>
              <Link href="/profile" className={navLink}>
                Профиль
              </Link>
              <button
                onClick={handleLogout}
                className="border border-ink/15 px-5 py-2 text-[13px] uppercase tracking-overline text-ink transition-colors hover:bg-ink hover:text-beige"
              >
                Выйти
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="border border-ink/15 px-5 py-2 text-[13px] uppercase tracking-overline text-ink transition-colors hover:bg-ink hover:text-beige"
              >
                Войти
              </Link>
              <Link
                href="/register"
                className="bg-ink px-5 py-2 text-[13px] uppercase tracking-overline text-beige transition-colors hover:bg-bronze"
              >
                Регистрация
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
