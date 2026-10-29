import React, { useState } from 'react';
import { Search, UserPlus, Copy, Check } from 'lucide-react';
import api, { useApi, can, getUser, errMsg } from '../../lib/api.js';
import { PageHeader, Card, Table, Tabs, Status, Badge, Modal, DeleteButton, ask, inputCls, btnCls, ghostBtn } from '../../components/ui.jsx';
import PermissionMatrix from '../../components/PermissionMatrix.jsx';
import { title, fmtWhen } from '../../lib/format.js';

const JOB_ROLES = ['RECRUITER', 'ACCOUNT_MANAGER', 'HR_ADMIN', 'OWNER_ADMIN'];
const STATUS_TONE = { ACTIVE: 'emerald', INVITED: 'blue', PENDING_APPROVAL: 'amber', SUSPENDED: 'slate', REVOKED: 'rose' };
const STATUS_TABS = ['', 'PENDING_APPROVAL', 'INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED'];
const dateInput = v => (v ? new Date(v).toISOString().slice(0, 10) : '');

export default function Users() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const { data, error, reload } = useApi('/users', { q: q || undefined, status: status || undefined });
  const { data: roles } = useApi('/roles');
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState(null);
  const [link, setLink] = useState(null);
  const [notice, setNotice] = useState('');
  const me = getUser()?.id;
  const approver = !!can('USER_MANAGEMENT', 'APPROVE');
  const editor = !!can('USER_MANAGEMENT', 'EDIT');

  const act = async (u, op, label) => {
    if (['revoke', 'reject', 'suspend'].includes(op) && !(await ask({
      title: `${label} ${u.fullName}?`,
      message: {
        suspend: 'They will be blocked from signing in until restored. Their data is kept.',
        revoke: 'They will be permanently blocked from signing in. Only an approver can reactivate them.',
        reject: 'Their access request will be rejected.'
      }[op],
      confirmLabel: label, danger: true
    }))) return;
    try {
      const { data: r } = await api.post(`/users/${u.id}/${op}`);
      const url = r.link || r.resetLink;
      if (url) setLink({ user: u, url, emailed: r.emailed, kind: op === 'resend-invite' ? 'Invite' : 'Password reset' });
      else setNotice(`${label}: ${u.fullName}`);
      reload();
    } catch (e) {
      setNotice(errMsg(e));
    }
  };

  const counts = data?.counts || {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Administration" title="Users & access" sub="Invite people, approve access and control what each person can do.">
        {can('USER_MANAGEMENT', 'CREATE') && <button onClick={() => setInviting(true)} className={btnCls}><UserPlus size={14} /> Add user</button>}
      </PageHeader>

      {notice && <div className="text-xs bg-slate-100 text-slate-700 rounded-lg p-3 flex justify-between">{notice}<button onClick={() => setNotice('')}>✕</button></div>}

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center gap-4 flex-wrap">
          <div className="relative w-80">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email or code..." className={`${inputCls} pl-8`} />
          </div>
          <Tabs value={status} onChange={setStatus}
            options={STATUS_TABS.map(s => [s, `${s ? title(s) : 'All'} (${s ? counts[s] || 0 : total})`])} />
        </div>
        <Status error={error} loading={!data && !error} />
        {data && (
          <Table cols={['User', 'Job role', 'Access role', 'Reports to', 'Status', 'Last login', '']} empty={!data.users.length && 'No users found.'}>
            {data.users.map(u => {
              const self = u.id === me;
              const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
              const expired = u.accessExpiresAt && new Date(u.accessExpiresAt) < new Date();
              return (
                <tr key={u.id} className="hover:bg-slate-50/70 transition">
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">{u.fullName}{self && <span className="text-slate-400 font-normal"> (you)</span>}</div>
                    <div className="text-[10px] text-slate-400">{u.email}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-600">{title(u.role)}</td>
                  <td className="py-3 px-4 text-slate-600">
                    {u.appRole ? title(u.appRole.name) : '—'}
                    {u.overrides.length > 0 && <span className="ml-1 text-[10px] text-indigo-600">+{u.overrides.length} custom</span>}
                  </td>
                  <td className="py-3 px-4 text-slate-600">{u.manager?.fullName || '—'}</td>
                  <td className="py-3 px-4 space-x-1">
                    <Badge tone={STATUS_TONE[u.status]}>{title(u.status)}</Badge>
                    {u.status === 'INVITED' && u.approvedAt && <Badge tone="emerald">Pre-approved</Badge>}
                    {locked && <Badge tone="rose">Locked</Badge>}
                    {expired && <Badge tone="rose">Expired</Badge>}
                    {!expired && u.accessExpiresAt && <Badge>Until {dateInput(u.accessExpiresAt)}</Badge>}
                  </td>
                  <td className="py-3 px-4 text-slate-500">{u.lastLoginAt ? fmtWhen(u.lastLoginAt) : 'Never'}</td>
                  <td className="py-3 px-4">
                    {!self && (
                      <div className="flex gap-1 justify-end flex-wrap">
                        {approver && ['PENDING_APPROVAL', 'INVITED'].includes(u.status) && !u.approvedAt && <>
                          <button className={`${ghostBtn} !text-emerald-700 !border-emerald-200`} onClick={() => act(u, 'approve', 'Approved')}>Approve</button>
                          <button className={ghostBtn} onClick={() => act(u, 'reject', 'Rejected')}>Reject</button>
                        </>}
                        {u.status === 'INVITED' && can('USER_MANAGEMENT', 'CREATE') && <button className={ghostBtn} onClick={() => act(u, 'resend-invite', 'Invite resent')}>Resend invite</button>}
                        {editor && u.status === 'ACTIVE' && <button className={ghostBtn} onClick={() => act(u, 'suspend', 'Suspended')}>Suspend</button>}
                        {editor && u.status === 'SUSPENDED' && <button className={ghostBtn} onClick={() => act(u, 'restore', 'Restored')}>Restore</button>}
                        {approver && u.status === 'REVOKED' && <button className={ghostBtn} onClick={() => act(u, 'reactivate', 'Reactivated')}>Reactivate</button>}
                        {editor && locked && <button className={ghostBtn} onClick={() => act(u, 'unlock', 'Unlocked')}>Unlock</button>}
                        {editor && <button className={ghostBtn} onClick={() => setEditing(u)}>Manage</button>}
                        <DeleteButton module="USER_MANAGEMENT" url={`/users/${u.id}`} label={`user ${u.fullName} and all their data`} onDone={reload} />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {inviting && <Invite roles={roles || []} users={data?.users || []} onClose={() => setInviting(false)}
        onDone={r => { setInviting(false); setLink(r.defaultPassword
          ? { user: r.user, url: r.defaultPassword, kind: 'Password' }
          : { user: r.user, url: r.link, emailed: r.emailed, kind: 'Invite' }); reload(); }} />}
      {editing && <Manage user={editing} roles={roles || []} users={data?.users || []} onClose={() => setEditing(null)}
        onAct={(op, label) => { act(editing, op, label); setEditing(null); }}
        onSaved={() => { reload(); setEditing(null); }}
        onRefresh={reload} />}
      {link && <LinkModal {...link} onClose={() => setLink(null)} />}
    </div>
  );
}

function LinkModal({ user, url, kind, emailed, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard.writeText(url).then(() => setCopied(true));
  return (
    <Modal title={kind === 'Password' ? `Sign-in details for ${user.fullName}` : `${kind} link for ${user.fullName}`} onClose={onClose}>
      {kind === 'Password' ? (
        <p className="text-xs text-slate-600">
          {user.fullName} can sign in with <b>{user.email}</b> and the default password below.
          {user.status !== 'ACTIVE' && ' An admin must approve the account first.'} They will be asked to choose their own password on first sign-in.
        </p>
      ) : <>
      <p className={`text-xs font-semibold ${emailed ? 'text-emerald-600' : 'text-amber-600'}`}>
        {emailed ? `Emailed to ${user.email}, along with a verification code.` : 'Not emailed — send this link yourself.'}
      </p>
      <p className="text-xs text-slate-600">
        {emailed ? 'Keep this copy as a backup. ' : `Send this link to ${user.email}. `}
        It works once and expires in {kind === 'Invite' ? '48 hours' : '24 hours'}.
        {kind === 'Invite' && !user.approvedAt && ' An admin must also approve the account before they can sign in.'}
      </p>
      </>}
      <div className="flex gap-2">
        <input readOnly value={url} className={`${inputCls} font-mono text-[10px]`} onFocus={e => e.target.select()} />
        <button onClick={copy} className={btnCls}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>
      </div>
      <div className="flex justify-end"><button onClick={onClose} className={ghostBtn}>Close</button></div>
    </Modal>
  );
}

function Details({ f, set, roles, users, selfId, lockRole }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="text-[11px] text-slate-500 space-y-1">Job role
        <select className={inputCls} value={f.role} onChange={set('role')}>
          {JOB_ROLES.map(r => <option key={r} value={r}>{title(r)}</option>)}
        </select>
      </label>
      <label className="text-[11px] text-slate-500 space-y-1">Access role
        <select className={inputCls} value={f.appRoleId} onChange={set('appRoleId')} disabled={lockRole}>
          <option value="">Same as job role</option>
          {roles.map(r => <option key={r.id} value={r.id}>{title(r.name)}</option>)}
        </select>
      </label>
      <label className="text-[11px] text-slate-500 space-y-1">Reports to
        <select className={inputCls} value={f.managerId} onChange={set('managerId')}>
          <option value="">—</option>
          {users.filter(u => u.id !== selfId && u.status === 'ACTIVE').map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
        </select>
      </label>
      <label className="text-[11px] text-slate-500 space-y-1">Access expires (optional)
        <input className={inputCls} type="date" value={f.accessExpiresAt} onChange={set('accessExpiresAt')} />
      </label>
      <label className="text-[11px] text-slate-500 space-y-1">Team
        <input className={inputCls} value={f.teamTag} onChange={set('teamTag')} placeholder="e.g. US IT" />
      </label>
      <label className="text-[11px] text-slate-500 space-y-1">Employee code
        <input className={inputCls} value={f.employeeCode} onChange={set('employeeCode')} />
      </label>
      <label className="text-[11px] text-slate-500 space-y-1">Designation
        <input className={inputCls} value={f.designation} onChange={set('designation')} placeholder="e.g. Senior Recruiter" />
      </label>
      <label className="text-[11px] text-slate-500 space-y-1">Phone number
        <input className={inputCls} value={f.phone} onChange={set('phone')} placeholder="e.g. +1 555 0100" />
      </label>
      <label className="text-[11px] text-slate-500 space-y-1">Date of joining
        <input className={inputCls} type="date" value={f.dateOfJoining} onChange={set('dateOfJoining')} />
      </label>
      <label className="text-[11px] text-slate-500 space-y-1">Date of exit
        <input className={inputCls} type="date" value={f.dateOfExit} onChange={set('dateOfExit')} />
      </label>
    </div>
  );
}

const roleIdFor = (roles, f) => f.appRoleId || roles.find(r => r.name === f.role)?.id || '';

function Invite({ roles, users, onClose, onDone }) {
  const [f, setF] = useState({ fullName: '', email: '', role: 'RECRUITER', appRoleId: '', managerId: '', teamTag: '', employeeCode: '', accessExpiresAt: '', designation: '', phone: '', dateOfJoining: '', dateOfExit: '' });
  const [err, setErr] = useState('');
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async e => {
    e.preventDefault();
    try {
      const { data } = await api.post('/users/invite', { ...f, appRoleId: roleIdFor(roles, f) || undefined, accessExpiresAt: f.accessExpiresAt || undefined,
        // Approvers' new users can sign in right away; anyone else's wait for approval.
        preApprove: !!can('USER_MANAGEMENT', 'APPROVE') });
      onDone(data);
    } catch (e) {
      setErr(errMsg(e));
    }
  };
  return (
    <Modal title="Add user" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <input className={inputCls} placeholder="Full name" value={f.fullName} onChange={set('fullName')} required />
        <input className={inputCls} type="email" placeholder="Work email" value={f.email} onChange={set('email')} required />
        <Details f={f} set={set} roles={roles} users={users} />
        {!can('USER_MANAGEMENT', 'APPROVE') && <p className="text-[11px] text-amber-700">An admin will need to approve this user before they can sign in.</p>}
        {err && <div className="text-xs text-rose-600">{err}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-slate-500">Cancel</button>
          <button className={btnCls}>Create user</button>
        </div>
      </form>
    </Modal>
  );
}

function Manage({ user, roles, users, onClose, onAct, onSaved, onRefresh }) {
  const { data: catalog } = useApi('/access/catalog');
  const [tab, setTab] = useState('details');
  const [f, setF] = useState({
    fullName: user.fullName, role: user.role, appRoleId: user.appRole?.id || '', managerId: user.manager?.id || '',
    teamTag: user.teamTag || '', employeeCode: user.employeeCode || '', accessExpiresAt: dateInput(user.accessExpiresAt),
    designation: user.designation || '', phone: user.phone || '',
    dateOfJoining: dateInput(user.dateOfJoining), dateOfExit: dateInput(user.dateOfExit)
  });
  const [ov, setOv] = useState(Object.fromEntries(user.overrides.map(o => [`${o.module}:${o.action}`, o.allow ? o.scope : 'DENY'])));
  const [err, setErr] = useState('');
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const rolePerms = Object.fromEntries((roles.find(r => r.id === (roleIdFor(roles, f)))?.permissions || []).map(p => [`${p.module}:${p.action}`, p.scope]));

  const saveDetails = async () => {
    try {
      await api.patch(`/users/${user.id}`, { ...f, appRoleId: roleIdFor(roles, f), accessExpiresAt: f.accessExpiresAt || null });
      onSaved();
    } catch (e) {
      setErr(errMsg(e));
    }
  };
  const savePerms = async () => {
    try {
      const overrides = Object.entries(ov).filter(([, v]) => v).map(([k, v]) => {
        const [module, action] = k.split(':');
        return v === 'DENY' ? { module, action, allow: false } : { module, action, scope: v, allow: true };
      });
      await api.put(`/users/${user.id}/permissions`, { overrides });
      onSaved();
    } catch (e) {
      setErr(errMsg(e));
    }
  };

  const cellOpts = k => {
    const inh = rolePerms[k];
    return [['', inh ? `Role: ${title(inh)}` : 'Role: —'], ['OWN', 'Own'], ['TEAM', 'Team'], ['ALL', 'All'], ['DENY', 'Deny']];
  };

  return (
    <Modal wide title={`Manage ${user.fullName}`} onClose={onClose}>
      <div className="flex justify-between items-center">
        <Tabs value={tab} onChange={t => { setTab(t); setErr(''); }} options={[['details', 'Details & role'], ['perms', 'Custom permissions'], ['security', 'Security']]} />
        <Badge tone={STATUS_TONE[user.status]}>{title(user.status)}</Badge>
      </div>

      {tab === 'details' && (
        <div className="space-y-3">
          <input className={inputCls} value={f.fullName} onChange={set('fullName')} placeholder="Full name" />
          <Details f={f} set={set} roles={roles} users={users} selfId={user.id} />
          <p className="text-[11px] text-slate-500">Access role decides permissions. Job role is used for reports (e.g. recruiter leaderboard).</p>
        </div>
      )}

      {tab === 'perms' && catalog && (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-500">Leave a cell on <b>Role</b> to inherit from {title(roles.find(r => r.id === roleIdFor(roles, f))?.name) || 'the role'}. Pick a scope to grant extra access, or <b>Deny</b> to remove it for this user only.</p>
          <PermissionMatrix catalog={catalog} value={ov} options={cellOpts} onChange={(k, v) => setOv({ ...ov, [k]: v })} />
        </div>
      )}

      {tab === 'security' && (
        <div className="space-y-3 text-xs">
          <SetPassword user={user} onSaved={onRefresh} />
          <Row label="Send password reset link" hint="Creates a one-time link valid for 24 hours." disabled={user.status !== 'ACTIVE'} onClick={() => onAct('reset-link', 'Reset link')} btn="Create link" />
          <Row label="Sign out everywhere" hint="Ends all of this user's current sessions." onClick={() => onAct('force-logout', 'Signed out')} btn="Force logout" />
          {user.status === 'ACTIVE' && <Row label="Suspend access" hint="Blocks sign-in until restored. Data is kept." onClick={() => onAct('suspend', 'Suspended')} btn="Suspend" />}
          {user.status !== 'REVOKED' && <Row danger label="Revoke access" hint="Permanently blocks sign-in. Only an admin can reactivate." onClick={() => onAct('revoke', 'Revoked')} btn="Revoke" />}
        </div>
      )}

      {err && <div className="text-xs text-rose-600">{err}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-500">Close</button>
        {tab === 'details' && <button onClick={saveDetails} className={btnCls}>Save details</button>}
        {tab === 'perms' && <button onClick={savePerms} className={btnCls}>Save permissions</button>}
      </div>
    </Modal>
  );
}

// Stand-in for the invite email while no mailer is wired up: the admin sets a password
// and passes it on directly, then the user changes it from their own profile.
function SetPassword({ user, onSaved }) {
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const blocked = ['REVOKED', 'SUSPENDED'].includes(user.status);

  const gen = () => {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint32Array(12));
    setPw([...bytes].map(b => chars[b % chars.length]).join('') + '1');
    setMsg(''); setErr('');
  };

  const save = async () => {
    setBusy(true); setMsg(''); setErr('');
    try {
      const { data } = await api.post(`/users/${user.id}/set-password`, { password: pw });
      setMsg(data.message);
      onSaved?.();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-slate-100 rounded-lg p-3 space-y-2">
      <div className="font-semibold text-slate-800">Set a password manually</div>
      <div className="text-[11px] text-slate-500">
        Use this while email is not connected. Share the password with {user.email} yourself — they can change it later from their profile.
      </div>
      <div className="flex gap-2">
        <input className={`${inputCls} font-mono`} value={pw} onChange={e => setPw(e.target.value)}
          placeholder="At least 8 chars, a letter and a number" autoComplete="off" />
        <button type="button" onClick={gen} className={ghostBtn}>Generate</button>
        <button type="button" disabled={busy || !pw || blocked} onClick={save} className={btnCls}>Set</button>
      </div>
      {blocked && <div className="text-[11px] text-slate-500">Restore the account first.</div>}
      {msg && <div className="text-[11px] text-emerald-700">{msg}</div>}
      {err && <div className="text-[11px] text-rose-600">{err}</div>}
    </div>
  );
}

function Row({ label, hint, btn, onClick, disabled, danger }) {
  return (
    <div className="flex justify-between items-center border border-slate-100 rounded-lg p-3">
      <div>
        <div className="font-semibold text-slate-800">{label}</div>
        <div className="text-[11px] text-slate-500">{hint}</div>
      </div>
      <button disabled={disabled} onClick={onClick} className={`${ghostBtn} ${danger ? '!text-rose-700 !border-rose-200' : ''}`}>{btn}</button>
    </div>
  );
}
