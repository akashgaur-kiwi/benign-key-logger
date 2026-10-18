import axios from 'axios';
import { useEffect, useState, useCallback } from 'react';

const api = axios.create({ baseURL: '/api/v1' });

api.interceptors.request.use(c => {
  const t = localStorage.getItem('wn_token');
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

api.interceptors.response.use(
  r => r,
  e => {
    if (e.response?.status === 401 && !e.config.url.includes('/auth/login')) {
      localStorage.removeItem('wn_token');
      localStorage.removeItem('wn_user');
      window.location.href = '/login';
    }
    return Promise.reject(e);
  }
);

export function useApi(url, params) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const key = JSON.stringify(params || {});

  const load = useCallback(() => {
    if (!url) return Promise.resolve();
    setError(null);
    return api.get(url, { params })
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.error || e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, key]);

  useEffect(() => { load(); }, [load]);
  return { data, error, reload: load };
}

export const getUser = () => {
  try { return JSON.parse(localStorage.getItem('wn_user')); } catch { return null; }
};

export const setSession = (token, user) => {
  if (token) localStorage.setItem('wn_token', token);
  localStorage.setItem('wn_user', JSON.stringify(user));
  window.dispatchEvent(new Event('wn-session'));
};

// can('PIPELINE', 'EDIT') -> 'OWN' | 'TEAM' | 'ALL' | undefined
export const can = (module, action = 'VIEW') => getUser()?.permissions?.[`${module}:${action}`];

// Re-renders when permissions are refreshed from /auth/me
export function useSession() {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump(n => n + 1);
    window.addEventListener('wn-session', f);
    return () => window.removeEventListener('wn-session', f);
  }, []);
  return getUser();
}

// Coerce any error payload into a readable string. Backends vary: some return
// { error: "msg" }, some { message }, some a structured { code, message, details, ... }
// envelope, some a bare string. Never return an object — rendering one crashes React.
export const errMsg = e => {
  const d = e?.response?.data;
  const pick = v => {
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (typeof v === 'object') return pick(v.error) || v.message || v.detail || v.title || null;
    return null;
  };
  return pick(d) || e?.message || 'Something went wrong';
};

export default api;
