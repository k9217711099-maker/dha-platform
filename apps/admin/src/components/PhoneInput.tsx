'use client';

import { useRef } from 'react';
import { formatPhoneInput, isValidPhone } from '../lib/phone';

/**
 * Поле ввода телефона с форматированием по мере ввода (РФ/международный) и
 * валидацией. Управляет позицией курсора: при Backspace/Delete рядом с
 * форматирующим символом (пробел, тире, скобка) сразу удаляется ближайшая
 * цифра — курсор не «застревает». Хранит и отдаёт отформатированную строку;
 * нормализация к E.164 — при сохранении через normalizePhone.
 */
const isDigit = (ch: string | undefined) => !!ch && ch >= '0' && ch <= '9';

/** Позиция курсора после n-й цифры в отформатированной строке. */
function caretAfterNthDigit(formatted: string, n: number): number {
  if (n <= 0) return formatted.startsWith('+') ? Math.min(1, formatted.length) : 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (isDigit(formatted[i])) {
      seen++;
      if (seen === n) return i + 1;
    }
  }
  return formatted.length;
}

const countDigits = (s: string) => (s.match(/\d/g) ?? []).length;

export function PhoneInput({ value, onChange, className = '', placeholder = '+7 (999) 123-45-67', autoFocus }: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const invalid = value.trim().length > 0 && !isValidPhone(value);

  /** Применить сырое значение, отформатировать и поставить курсор после digitsBefore цифр. */
  const apply = (rawValue: string, digitsBefore: number) => {
    const formatted = formatPhoneInput(rawValue);
    onChange(formatted);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      const pos = caretAfterNthDigit(formatted, digitsBefore);
      el.setSelectionRange(pos, pos);
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const raw = el.value;
    const caret = el.selectionStart ?? raw.length;
    apply(raw, countDigits(raw.slice(0, caret)));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start == null || end == null || start !== end) return; // выделение — обычное поведение
    const v = el.value;

    if (e.key === 'Backspace') {
      // Ближайшая цифра слева от курсора (перешагиваем форматирующие символы).
      let i = start - 1;
      while (i >= 0 && !isDigit(v[i])) i--;
      if (i < 0) return; // слева только «+»/символы — стирать нечего
      if (i !== start - 1) {
        e.preventDefault();
        apply(v.slice(0, i) + v.slice(start), countDigits(v.slice(0, i)));
      }
      // иначе слева цифра — стандартное удаление, handleChange переформатирует
    } else if (e.key === 'Delete') {
      let i = start;
      while (i < v.length && !isDigit(v[i])) i++;
      if (i >= v.length) return;
      if (i !== start) {
        e.preventDefault();
        apply(v.slice(0, i) + v.slice(i + 1), countDigits(v.slice(0, i)));
      }
    }
  };

  return (
    <div>
      <input
        ref={ref}
        type="tel"
        inputMode="tel"
        autoFocus={autoFocus}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`${className} ${invalid ? 'border-red-400' : ''}`}
      />
      {invalid ? <p className="mt-0.5 text-xs text-red-600">Проверьте номер: +7 (РФ, 11 цифр) или международный формат</p> : null}
    </div>
  );
}
