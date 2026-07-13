import Link from 'next/link';
import { Button } from '@dha/ui';
import { LOYALTY_TIERS } from '@dha/domain';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <p className="text-sm uppercase tracking-[0.3em] text-dark-gray">D Hotels &amp; Apartments</p>
      <h1 className="mt-4 font-sans text-4xl font-light text-ink">
        Личный кабинет гостя и бронирование
      </h1>
      <p className="mt-4 max-w-xl text-dark-gray">
        Каркас веб-приложения. Дизайн-система и доменное ядро подключены — ниже
        уровни программы лояльности из <code>@dha/domain</code>.
      </p>

      <div className="mt-8 flex gap-3">
        <Link href="/search">
          <Button>Подобрать апартаменты</Button>
        </Link>
        <Link href="/login">
          <Button variant="secondary">Войти</Button>
        </Link>
      </div>

      <ul className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {LOYALTY_TIERS.map((t) => (
          <li key={t.tier} className="rounded-md border border-ink/10 bg-white/40 p-4">
            <div className="text-lg font-medium text-ink">{t.tier}</div>
            <div className="text-sm text-dark-gray">{Math.round(t.accrualRate * 100)}% баллами</div>
          </li>
        ))}
      </ul>
    </main>
  );
}
