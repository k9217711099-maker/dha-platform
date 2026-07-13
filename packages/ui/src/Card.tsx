import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** Карточка-контейнер дизайн-системы D H&A. */
export function Card({ className = '', children, ...rest }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-ink/10 bg-surface p-6 shadow-soft ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
