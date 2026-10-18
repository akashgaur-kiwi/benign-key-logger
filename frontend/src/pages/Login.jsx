import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { setSession, errMsg } from '../lib/api.js';
import { inputCls, btnCls } from '../components/ui.jsx';
import { AuthCard } from './AuthPages.jsx';

export default function Login() {
  const nav = useNavigate();
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const { data } = await api.post('/auth/login', f);
      setSession(data.token, data.user);
      nav('/', { replace: true });
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard>
      <form onSubmit={submit} className="space-y-4">
        <input className={inputCls} type="email" placeholder="Email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} required />
        <input className={inputCls} type="password" placeholder="Password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} required />
        {err && <div className="text-xs text-rose-600">{err}</div>}
        <button className={`${btnCls} w-full justify-center py-2`} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <div className="flex justify-between text-xs">
        <Link to="/forgot-password" className="text-blue-600 hover:underline">Forgot password?</Link>
        <Link to="/request-access" className="text-slate-500 hover:underline">Request access</Link>
      </div>
    </AuthCard>
  );
}
