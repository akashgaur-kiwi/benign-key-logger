import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bell, Search, LogOut, KeyRound } from 'lucide-react';
import api, { useApi, useSession, can, setSession, errMsg } from '../../lib/api.js';
import { initials, title, fmtWhen } from '../../lib/format.js';
import { NAV } from '../../lib/nav.js';
import { Modal, inputCls, btnCls } from '../ui.jsx';

export default function Shell() {
  const nav = useNavigate();
  const user = useSession();
  const [pw, setPw] = useState(false);
  const { data: iv } = useApi(can('INTERVIEWS') ? '/interviews' : null);

  // Pick up permission changes made by an admin since login
  useEffect(() => {
    api.get('/auth/me').then(r => setSession(null, r.data)).catch(() => {});
  }, []);

  const logout = () => {
    localStorage.removeItem('wn_token');
    localStorage.removeItem('wn_user');
    nav('/login', { replace: true });
  };

  return (
    <div className="flex h-screen bg-[#f4f7fb] text-slate-800 font-sans antialiased">
      <aside className="w-64 bg-[#0a192f] text-slate-300 flex flex-col justify-between shrink-0">
        <div>
          <div className="p-5 flex items-center gap-3 border-b border-slate-800/80">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center font-black text-white text-lg">W</div>
            <div>
              <div className="font-bold text-white tracking-wide text-sm">WorkNovas</div>
              <div className="text-[10px] text-slate-400 font-mono tracking-wider">RECRUITMENT HUB</div>
            </div>
          </div>

          <div className="px-4 py-3">
            <div className="bg-[#112240] p-2.5 rounded-lg border border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-slate-700 text-[10px] font-bold text-white flex items-center justify-center">WN</span>
                <span className="text-xs font-medium text-slate-200">WorkNovas LLC</span>
              </div>
            </div>
          </div>

          <nav className="px-3 space-y-6 text-xs overflow-y-auto max-h-[calc(100vh-170px)]">
            {NAV.map(sec => {
              const items = sec.items.filter(i => can(i.module));
              return items.length > 0 && (
                <Section key={sec.section} label={sec.section}>
                  {items.map(({ to, icon: Icon, label }) => (
                    <NavItem key={to} to={to} icon={<Icon size={16} />} label={label} badge={to === '/interviews' ? iv?.stats?.today || null : null} />
                  ))}
                </Section>
              );
            })}
          </nav>
        </div>

        <div className="p-3 bg-[#071324] border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            All core systems operational
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
          <div className="relative w-96">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search people, jobs, candidates... (⌘K)"
              onKeyDown={e => e.key === 'Enter' && nav(`/pipeline?q=${encodeURIComponent(e.target.value)}`)}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md font-medium">Workspace</span>
            <NotificationBell />
            <div className="flex items-center gap-2 border-l pl-4 border-slate-200">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                {initials(user?.fullName)}
              </div>
              <div className="text-left text-xs">
                <div className="font-semibold text-slate-800 leading-none">{user?.fullName}</div>
                <span className="text-[10px] text-slate-400 leading-none">{title(user?.appRole || user?.role)} workspace</span>
              </div>
              <button onClick={() => setPw(true)} title="Change password" className="ml-2 text-slate-400 hover:text-slate-600"><KeyRound size={16} /></button>
              <button onClick={logout} title="Sign out" className="ml-2 text-slate-400 hover:text-slate-600"><LogOut size={16} /></button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
        {pw && <ChangePassword onClose={() => setPw(false)} />}
      </div>
    </div>
  );
}

function NotificationBell() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ notifications: [], unread: 0 });
  const ref = useRef(null);

  const load = () => api.get('/notifications').then(r => setState(r.data)).catch(() => {});

  // Poll every 60s, and refresh when the dropdown opens.
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (open) load(); }, [open]);
  useEffect(() => {
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const openItem = async n => {
    if (!n.readAt) { await api.post(`/notifications/${n.id}/read`).catch(() => {}); }
    setOpen(false);
    load();
    if (n.link) nav(n.link);
  };
  const markAll = async () => { await api.post('/notifications/read-all').catch(() => {}); load(); };
  const remove = async (e, n) => { e.stopPropagation(); await api.delete(`/notifications/${n.id}`).catch(() => {}); load(); };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className="relative text-slate-400 hover:text-slate-600">
        <Bell size={18} />
        {state.unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
            {state.unread > 9 ? '9+' : state.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-800">Notifications</span>
            {state.unread > 0 && <button onClick={markAll} className="text-[10px] font-semibold text-blue-600 hover:underline">Mark all read</button>}
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
            {state.notifications.length === 0 && <div className="p-6 text-center text-xs text-slate-400">You're all caught up.</div>}
            {state.notifications.map(n => (
              <button key={n.id} onClick={() => openItem(n)}
                className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 transition ${n.readAt ? '' : 'bg-blue-50/40'}`}>
                <div className="flex items-start gap-2">
                  {!n.readAt && <span className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-800">{n.title}</div>
                    {n.body && <div className="text-[11px] text-slate-500 mt-0.5">{n.body}</div>}
                    <div className="text-[10px] text-slate-400 mt-0.5">{fmtWhen(n.createdAt)}</div>
                  </div>
                  <span role="button" title="Delete notification" onClick={e => remove(e, n)}
                    className="text-slate-300 hover:text-rose-600 text-sm leading-none px-1">×</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div>
      <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      {children}
    </div>
  );
}

function NavItem({ to, icon, label, badge }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex items-center justify-between px-3 py-2 rounded-lg transition font-medium ${
          isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
        }`
      }
    >
      <div className="flex items-center gap-2.5">
        {icon}
        <span>{label}</span>
      </div>
      {badge && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-200">{badge}</span>}
    </NavLink>
  );
}

function ChangePassword({ onClose }) {
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const submit = async e => {
    e.preventDefault();
    if (f.newPassword !== f.confirm) return setErr('Passwords do not match');
    try {
      const { data } = await api.post('/auth/change-password', f);
      setSession(data.token, data.user);
      setDone(true);
    } catch (e) {
      setErr(errMsg(e));
    }
  };
  const set = k => e => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="Change password" onClose={onClose}>
      {done ? (
        <>
          <p className="text-xs text-slate-600">Password updated. Your other sessions have been signed out.</p>
          <div className="flex justify-end"><button onClick={onClose} className={btnCls}>Done</button></div>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input className={inputCls} type="password" placeholder="Current password" value={f.currentPassword} onChange={set('currentPassword')} required />
          <input className={inputCls} type="password" placeholder="New password (8+ chars, letter and number)" value={f.newPassword} onChange={set('newPassword')} required />
          <input className={inputCls} type="password" placeholder="Confirm new password" value={f.confirm} onChange={set('confirm')} required />
          {err && <div className="text-xs text-rose-600">{err}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-slate-500">Cancel</button>
            <button className={btnCls}>Update</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
