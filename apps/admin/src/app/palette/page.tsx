'use client';

/**
 * Наглядное сравнение 3 кандидатов основного цвета (замена индиго).
 * Цвета заданы инлайн-hex, чтобы рендерились точно, независимо от Tailwind.
 * Только для выбора — реальная тема меняется в токенах.
 */

type Palette = {
  id: string;
  name: string;
  vibe: string;
  primary: string;
  hover: string;
  c50: string;
  c100: string;
  c700: string;
};

const PALETTES: Palette[] = [
  { id: 'A', name: 'A · Тёмная бирюза (Teal)', vibe: 'спокойный премиальный, «спа/бутик-отель»', primary: '#0F766E', hover: '#115E59', c50: '#F0FDFA', c100: '#CCFBF1', c700: '#0F766E' },
  { id: 'B', name: 'B · Королевский фиолет (Violet)', vibe: 'люксовый, креативный, современный', primary: '#7C3AED', hover: '#6D28D9', c50: '#F5F3FF', c100: '#EDE9FE', c700: '#6D28D9' },
  { id: 'C', name: 'C · Глубокий океан (Ocean blue)', vibe: 'солидный, доверительный, глубокий', primary: '#0369A1', hover: '#075985', c50: '#F0F9FF', c100: '#E0F2FE', c700: '#075985' },
];

const INK = '#1E1B4B';
const MUTED = '#64748B';

const plus = 'M12 5v14M5 12h14';

export default function PalettePreview() {
  return (
    <div style={{ fontFamily: "'Manrope', system-ui, sans-serif", background: '#F6F7FB', color: INK, minHeight: '100vh' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 }}>Выбор основного цвета</h1>
        <p style={{ color: MUTED, marginTop: 6, marginBottom: 28, fontSize: 14 }}>
          Один и тот же интерфейс в 3 цветах. Фон, шрифт (Manrope) и изумрудный акцент — как сейчас. Выбери букву — применю на всю админку.
        </p>

        <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          {PALETTES.map((p) => <PaletteCard key={p.id} p={p} />)}
        </div>
      </div>
    </div>
  );
}

function PaletteCard({ p }: { p: Palette }) {
  const cardShadow = '0 1px 2px rgba(30,27,75,0.04), 0 6px 20px rgba(30,27,75,0.07)';
  return (
    <div style={{ background: '#fff', borderRadius: 18, boxShadow: cardShadow, border: '1px solid rgba(30,27,75,0.05)', overflow: 'hidden' }}>
      {/* Шапка с названием и свотчами */}
      <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(30,27,75,0.06)' }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{p.name}</p>
        <p style={{ margin: '2px 0 10px', fontSize: 12, color: MUTED }}>{p.vibe}</p>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {[p.c100, p.primary, p.hover].map((c) => (
            <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: c, border: '1px solid rgba(0,0,0,0.06)' }} />
              <span style={{ fontSize: 10.5, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{c}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Мок-интерфейс */}
      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Кнопки */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: p.primary, color: '#fff', border: 'none', borderRadius: 10, padding: '9px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round"><path d={plus} /></svg>
            Добавить бронирование
          </button>
          <button style={{ background: '#fff', color: p.c700, border: `1px solid ${p.primary}55`, borderRadius: 10, padding: '9px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            Отмена
          </button>
        </div>

        {/* Мини-меню */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {[['Дашборд', false], ['Шахматка', true], ['Тарифы', false]].map(([label, active]) => (
            <span key={label as string} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: 13, borderRadius: 9,
              borderLeft: `3px solid ${active ? p.primary : 'transparent'}`,
              background: active ? p.c100 : 'transparent',
              color: active ? p.c700 : MUTED,
              fontWeight: active ? 700 : 500,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: active ? p.primary : '#CBD5E1' }} />
              {label as string}{active ? '  (активный)' : ''}
            </span>
          ))}
        </div>

        {/* Ссылки-действия */}
        <div style={{ fontSize: 13, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {['Редактировать', 'В работу', 'Все брони →'].map((t) => (
            <a key={t} href="#" onClick={(e) => e.preventDefault()} style={{ color: p.primary, textDecoration: 'underline', textUnderlineOffset: 2, fontWeight: 600 }}>{t}</a>
          ))}
        </div>

        {/* Мини-таблица со статусами (изумруд/статусы не меняются) */}
        <div style={{ border: '1px solid rgba(30,27,75,0.06)', borderRadius: 12, overflow: 'hidden', fontSize: 12.5 }}>
          {[
            ['Розов Сергей', 'Заселён', '#0EA5E9', '#E0F2FE', '30 000 ₽'],
            ['Иванова Анна', 'Проверено', '#10B981', '#D1FAE5', '18 500 ₽'],
            ['Петров Кирилл', 'Новое', '#F59E0B', '#FEF3C7', '24 000 ₽'],
          ].map(([g, st, dot, chipBg, sum], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderTop: i ? '1px solid rgba(30,27,75,0.05)' : 'none' }}>
              <span style={{ flex: 1, fontWeight: 600 }}>{g}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: chipBg, color: '#0f172a', borderRadius: 99, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: dot as string }} /> {st}
              </span>
              <span style={{ color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{sum}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
