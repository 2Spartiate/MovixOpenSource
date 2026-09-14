import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as authService from '../services/auth';
import type { AuthSession } from '../services/auth';

interface AuthContextValue {
  session: AuthSession | null;
  isLoading: boolean;
  login: (apiBase: string, mnemonic: string, turnstileToken: string) => Promise<void>;
  createAccount: (
    apiBase: string,
    params: { mnemonic: string; username: string; avatar: string; turnstileToken: string },
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    authService
      .loadSession()
      .then(setSession)
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (apiBase: string, mnemonic: string, turnstileToken: string) => {
    const next = await authService.login(apiBase, { mnemonic, turnstileToken });
    await authService.saveSession(next);
    setSession(next);
  }, []);

  const createAccount = useCallback(
    async (apiBase: string, params: { mnemonic: string; username: string; avatar: string; turnstileToken: string }) => {
      const next = await authService.createAccount(apiBase, params);
      await authService.saveSession(next);
      setSession(next);
    },
    [],
  );

  const logout = useCallback(async () => {
    await authService.clearSession();
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, isLoading, login, createAccount, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
