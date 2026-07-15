import Link from 'next/link';
import { LOYALTY_TIERS } from '@dha/domain';

const BENEFITS = [
  {
    num: 'I',
    title: 'Лучшая цена — гарантированно',
    text: 'Прямое бронирование всегда не дороже, чем на сторонних площадках. Нашли дешевле — сравняем цену.',
  },
  {
    num: 'II',
    title: 'Баллы D за каждую ночь',
    text: '1 балл = 1 ₽. Возвращаем до 10% стоимости проживания и принимаем баллы в оплату следующей брони.',
  },
  {
    num: 'III',
    title: 'Заселение без стойки',
    text: 'Онлайн-регистрация до приезда: данные — заранее, ключ — сразу по прибытии.',
  },
  {
    num: 'IV',
    title: 'Цифровой ключ',
    text: 'Дверь открывается с телефона — PIN-код или Bluetooth. Действует ровно на время проживания.',
  },
];

export default function HomePage() {
  return (
    <main>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-24">
        <p className="text-[13px] uppercase tracking-[0.28em] text-dark-gray">
          Сеть отелей и апартаментов · Санкт-Петербург
        </p>
        <h1 className="mt-6 max-w-3xl font-serif text-6xl leading-[1.05] text-ink sm:text-7xl">
          Тишина — главная <em className="italic text-bronze">роскошь</em>
        </h1>
        <p className="mt-7 max-w-xl text-lg text-dark-gray">
          Отели и апартаменты D H&amp;A — там, где хочется остаться. Бронируйте напрямую:
          лучшая цена, баллы за каждую ночь и заселение без ожидания.
        </p>

        <div className="mt-10 flex flex-wrap gap-4">
          <Link
            href="/search"
            className="bg-ink px-8 py-3.5 text-[13px] uppercase tracking-overline text-beige transition-colors hover:bg-bronze"
          >
            Найти номер
          </Link>
          <Link
            href="/login"
            className="border border-ink/15 px-8 py-3.5 text-[13px] uppercase tracking-overline text-ink transition-colors hover:bg-ink hover:text-beige"
          >
            Личный кабинет
          </Link>
        </div>
      </section>

      {/* Преимущества прямого бронирования */}
      <section className="border-y border-ink/15 bg-sand">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-serif text-4xl text-ink">Почему бронировать напрямую</h2>
          <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {BENEFITS.map((b) => (
              <div key={b.num} className="border-t border-ink pt-6">
                <span className="font-serif text-xl italic text-bronze">{b.num}</span>
                <h3 className="mt-4 font-serif text-2xl leading-snug text-ink">{b.title}</h3>
                <p className="mt-3 text-[15px] text-dark-gray">{b.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Уровни лояльности */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="flex flex-wrap items-center justify-between gap-10">
          <h2 className="max-w-sm font-serif text-3xl leading-tight text-ink">
            Четыре уровня. Привилегии растут с каждой поездкой.
          </h2>
          <ul className="flex flex-wrap" role="list">
            {LOYALTY_TIERS.map((t, i) => (
              <li
                key={t.tier}
                className={`border border-ink/15 px-8 py-4 text-center transition-colors hover:bg-sand ${
                  i > 0 ? 'border-l-0' : ''
                }`}
              >
                <div className="font-serif text-2xl font-medium text-ink">
                  {Math.round(t.accrualRate * 100)}%
                </div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-dark-gray">
                  {t.tier}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
