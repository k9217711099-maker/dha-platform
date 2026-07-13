'use client';

import { useEffect, useRef } from 'react';

/**
 * Глобальный LIFO-стек обработчиков Esc. При нажатии Escape срабатывает только
 * ВЕРХНИЙ (самый недавно открытый) слой — чтобы Esc закрывал лишь последний
 * всплывающий попап, а не все окна сразу (§4). Слои регистрируются в порядке
 * монтирования, поэтому вложенный попап всегда оказывается выше родителя.
 */
const stack: Array<() => void> = [];
let bound = false;

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  const top = stack[stack.length - 1];
  if (top) { e.stopPropagation(); top(); }
}

/** Закрытие модалки/поповера по Esc — закрывается только верхний слой. */
export function useEsc(onClose: () => void): void {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const handler = () => ref.current();
    stack.push(handler);
    if (!bound) { window.addEventListener('keydown', onKey); bound = true; }
    return () => { const i = stack.lastIndexOf(handler); if (i >= 0) stack.splice(i, 1); };
  }, []);
}
