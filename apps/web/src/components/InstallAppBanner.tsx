'use client';

import { useEffect, useState } from 'react';
import { ymGoal } from '../lib/metrika';

/** Событие beforeinstallprompt (не типизировано в lib.dom). */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'dha_install_dismissed';

/**
 * Плашка «Установить приложение» (PWA): предлагает добавить сайт на домашний экран.
 * На Android/desktop использует нативный beforeinstallprompt; на iOS Safari показывает
 * короткую инструкцию (там нативного prompt нет). Скрывается после установки/закрытия.
 */
export function InstallAppBanner() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Регистрируем service worker (нужен для установки; кэш не используется).
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => {});

    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
    if (standalone || localStorage.getItem(DISMISS_KEY)) return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBip);

    // iOS Safari: beforeinstallprompt не поддерживается — показываем инструкцию.
    const ua = navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|chrome|android/i.test(ua);
    if (isIOS && isSafari) {
      setIosHint(true);
      setVisible(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  if (!visible) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  }

  async function install() {
    if (!deferred) return;
    ymGoal('app_install');
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* пользователь закрыл — не ошибка */
    }
    setDeferred(null);
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, '1');
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md rounded-2xl border border-ink/15 bg-white p-4 shadow-xl sm:inset-x-auto sm:left-4 sm:w-96">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink font-serif text-xl text-white">D</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">Установите приложение D&nbsp;H&amp;A</p>
          {iosHint ? (
            <p className="mt-0.5 text-xs text-dark-gray">
              Нажмите «Поделиться» и выберите «На экран „Домой“». Быстрый доступ к броням, цифровому ключу и баллам.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-dark-gray">
              Как приложение, без стора: брони, цифровой ключ и баллы — в один тап с домашнего экрана.
            </p>
          )}
          <div className="mt-2.5 flex items-center gap-3">
            {!iosHint && (
              <button onClick={() => void install()} className="rounded-lg bg-ink px-3 py-1.5 text-sm text-white transition hover:bg-ink/90">
                Установить
              </button>
            )}
            <button onClick={dismiss} className="text-sm text-dark-gray underline hover:text-ink">Позже</button>
          </div>
        </div>
        <button onClick={dismiss} className="shrink-0 text-xl leading-none text-dark-gray hover:text-ink" aria-label="Закрыть">×</button>
      </div>
    </div>
  );
}
