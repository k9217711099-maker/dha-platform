'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, tokenStore } from './api';
import type { GuestProfile, TokenPair } from './api-types';

interface AuthState {
  guest: GuestProfile | null;
  loading: boolean;
  /** Сохранить выданную пару токенов и загрузить профиль. */
  setSession: (pair: TokenPair) => Promise<void>;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [guest, setGuest] = useState<GuestProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    if (!tokenStore.access) {
      setGuest(null);
      return;
    }
    try {
      setGuest(await api.getMe());
    } catch {
      setGuest(null);
    }
  }, []);

  useEffect(() => {
    // Однократный трекинг установки/первого открытия (§19)
    if (typeof window !== 'undefined' && !localStorage.getItem('dha_installed')) {
      localStorage.setItem('dha_installed', '1');
      void api.track('install');
    }
    void refreshProfile().finally(() => setLoading(false));
  }, [refreshProfile]);

  const setSession = useCallback(
    async (pair: TokenPair) => {
      tokenStore.set(pair);
      await refreshProfile();
    },
    [refreshProfile],
  );

  const logout = useCallback(async () => {
    const refresh = tokenStore.refresh;
    if (refresh) await api.logout(refresh).catch(() => undefined);
    tokenStore.clear();
    setGuest(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ guest, loading, setSession, refreshProfile, logout }),
    [guest, loading, setSession, refreshProfile, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth должен использоваться внутри AuthProvider');
  return ctx;
}
