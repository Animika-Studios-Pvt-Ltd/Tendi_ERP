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
      // If 401 is just a cold visit without credentials, don't show an error.
      // If 401 has a specific reason (expired session, deactivated account, changed password), surface it.
      const isColdVisit = error.status === 401 && (!error.message || error.message.toLowerCase() === 'unauthorized');
      setSessionError(isColdVisit ? null : error);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    const handleUnauthorized = (event) => {
      setUser(null);
      setStatus('unauthenticated');
      setSessionError(event?.detail ?? { message: 'Your session has expired. Sign in again.' });
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
      setSessionError(null);
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
