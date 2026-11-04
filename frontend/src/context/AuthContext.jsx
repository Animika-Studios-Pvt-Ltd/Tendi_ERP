import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { AUTH_EVENTS } from '@/constants/app';
import { authService } from '@/services/auth.service';

export const AuthContext = createContext(null);

/**
 * status: "loading" until the initial /auth/me check resolves, then
 * "authenticated" or "unauthenticated".
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');
  const [sessionError, setSessionError] = useState(null);

  const loadSession = useCallback(async () => {
    try {
      const { data } = await authService.me();
      setUser(data.user);
      setStatus('authenticated');
      setSessionError(null);
    } catch (error) {
      setUser(null);
      setStatus('unauthenticated');
      // 401 just means "not signed in"; anything else is worth surfacing on the sign-in screen.
      setSessionError(error.status === 401 ? null : error);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setStatus('unauthenticated');
    };
    window.addEventListener(AUTH_EVENTS.UNAUTHORIZED, handleUnauthorized);
    return () => window.removeEventListener(AUTH_EVENTS.UNAUTHORIZED, handleUnauthorized);
  }, []);

  const login = useCallback(async (credentials) => {
    const { data } = await authService.login(credentials);
    setUser(data.user);
    setStatus('authenticated');
    setSessionError(null);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  /** UI-level check only; the API enforces the same permissions. */
  const can = useCallback(
    (module, action = 'read') => Boolean(user?.permissions?.[module]?.includes(action)),
    [user],
  );

  const value = useMemo(
    () => ({ user, status, sessionError, login, logout, can, setUser, refreshSession: loadSession }),
    [user, status, sessionError, login, logout, can, loadSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
