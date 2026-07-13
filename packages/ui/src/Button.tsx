import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const base =
  'inline-flex items-center justify-center rounded-md px-5 py-2.5 font-sans text-sm font-semibold transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white shadow-sm hover:bg-primary-700',
  secondary: 'border border-ink/15 bg-white text-ink hover:border-primary/30 hover:bg-primary-50',
};

/** Базовая кнопка дизайн-системы D H&A. */
export function Button({ variant = 'primary', className = '', children, ...rest }: ButtonProps) {
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}
