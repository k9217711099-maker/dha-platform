import type { InputHTMLAttributes, ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  error?: string;
}

const fieldClass =
  'w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 font-sans text-sm text-ink outline-none transition focus:border-ink focus:ring-1 focus:ring-ink disabled:opacity-50';

/** Поле ввода дизайн-системы D H&A с подписью и текстом ошибки. */
export function Input({ label, error, className = '', id, ...rest }: InputProps) {
  return (
    <label className="block" htmlFor={id}>
      {label && <span className="mb-1.5 block text-sm text-dark-gray">{label}</span>}
      <input id={id} className={`${fieldClass} ${className}`} {...rest} />
      {error && <span className="mt-1 block text-xs text-red-700">{error}</span>}
    </label>
  );
}
