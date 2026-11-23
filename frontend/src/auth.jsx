import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout); // any 401 (expired token) signs the user out
  }, [logout]);

  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await api('/auth/login', { method: 'POST', body: { email, password } });
    setToken(r.token);
    setUser(r.user);
  }, []);

  const register = useCallback(async (name, email, password) => {
    await api('/auth/register', { method: 'POST', body: { name, email, password } });
    await login(email, password);
  }, [login]);

  const value = useMemo(() => ({ user, loading, login, register, logout, isAdmin: user?.role === 'ADMIN' }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
