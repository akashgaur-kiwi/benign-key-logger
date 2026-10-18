import React, { useEffect, useState } from 'react';
import { Plus, Lock, Trash2 } from 'lucide-react';
import api, { useApi, can, errMsg } from '../../lib/api.js';
import { PageHeader, Card, Status, Badge, Modal, inputCls, btnCls, ghostBtn } from '../../components/ui.jsx';
import PermissionMatrix from '../../components/PermissionMatrix.jsx';
import { title } from '../../lib/format.js';

const OPTS = [['', '—'], ['OWN', 'Own'], ['TEAM', 'Team'], ['ALL', 'All']];
const toMap = perms => Object.fromEntries(perms.map(p => [`${p.module}:${p.action}`, p.scope]));
const toList = map => Object.entries(map).filter(([, s]) => s).map(([k, scope]) => {
  const [module, action] = k.split(':');
  return { module, action, scope };
});

export default function Roles() {
  const { data: roles, error, reload } = useApi('/roles');
  const { data: catalog } = useApi('/access/catalog');
  const [sel, setSel] = useState(null);
  const [draft, setDraft] = useState({});
  const [desc, setDesc] = useState('');
  const [msg, setMsg] = useState('');
  const [adding, setAdding] = useState(false);
  const editable = !!can('USER_MANAGEMENT', 'APPROVE');
  const role = roles?.find(r => r.id === sel) || roles?.[0];

  useEffect(() => {
    if (role) {
      setDraft(toMap(role.permissions));
      setDesc(role.description || '');
      setMsg('');
    }
  }, [role?.id, roles]);

  const dirty = role && (JSON.stringify(toList(draft).sort((a, b) => (a.module + a.action).localeCompare(b.module + b.action))) !==
    JSON.stringify([...role.permissions].sort((a, b) => (a.module + a.action).localeCompare(b.module + b.action))) || desc !== (role.description || ''));

  const save = async () => {
    try {
      await api.patch(`/roles/${role.id}`, { description: desc, permissions: toList(draft) });
      setMsg('Saved. Changes apply to users on their next request.');
      reload();
    } catch (e) {
      setMsg(errMsg(e));
    }
  };

  const remove = async () => {
    if (!confirm(`Delete role ${role.name}?`)) return;
    try {
      await api.delete(`/roles/${role.id}`);
      setSel(null);
      reload();
    } catch (e) {
      setMsg(errMsg(e));
    }
  };

  const readOnly = !editable || role?.locked;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Administration" title="Roles & permissions" sub="What each role can see and change. Own = records they own, Team = their reporting line, All = everything.">
        {editable && <button onClick={() => setAdding(true)} className={btnCls}><Plus size={14} /> New role</button>}
      </PageHeader>
      <Status error={error} loading={!roles && !error} />
      {roles && catalog && role && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <Card className="p-2 h-fit">
            {roles.map(r => (
              <button key={r.id} onClick={() => setSel(r.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs flex justify-between items-center ${r.id === role.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'}`}>
                <span className="font-semibold flex items-center gap-1.5">{r.locked && <Lock size={11} />}{title(r.name)}</span>
                <span className="text-[10px] text-slate-400">{r.userCount} users</span>
              </button>
            ))}
          </Card>
          <Card className="lg:col-span-3 p-4 space-y-3">
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-800">{title(role.name)}</h2>
                  {role.isSystem && <Badge tone="blue">System</Badge>}
                  {role.locked && <Badge tone="amber">Locked</Badge>}
                </div>
                <input className={`${inputCls} mt-2`} value={desc} disabled={readOnly} onChange={e => setDesc(e.target.value)} placeholder="Description" />
              </div>
              {!readOnly && (
                <div className="flex gap-2">
                  {!role.isSystem && <button onClick={remove} className={ghostBtn}><Trash2 size={12} /></button>}
                  <button onClick={save} disabled={!dirty} className={btnCls}>Save changes</button>
                </div>
              )}
            </div>
            {msg && <div className="text-xs text-slate-600 bg-slate-50 rounded p-2">{msg}</div>}
            <PermissionMatrix catalog={catalog} value={draft} options={OPTS} readOnly={readOnly}
              onChange={(k, v) => setDraft({ ...draft, [k]: v })} />
          </Card>
        </div>
      )}
      {adding && <NewRole roles={roles || []} onClose={() => setAdding(false)} onDone={r => { setAdding(false); reload().then(() => setSel(r.id)); }} />}
    </div>
  );
}

function NewRole({ roles, onClose, onDone }) {
  const [f, setF] = useState({ name: '', description: '', cloneFromId: '' });
  const [err, setErr] = useState('');
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async e => {
    e.preventDefault();
    try {
      const { data } = await api.post('/roles', { ...f, cloneFromId: f.cloneFromId || undefined });
      onDone(data);
    } catch (e) {
      setErr(errMsg(e));
    }
  };
  return (
    <Modal title="New role" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <input className={inputCls} placeholder="Name (e.g. Team Lead)" value={f.name} onChange={set('name')} required />
        <input className={inputCls} placeholder="Description" value={f.description} onChange={set('description')} />
        <select className={inputCls} value={f.cloneFromId} onChange={set('cloneFromId')}>
          <option value="">Start with no permissions</option>
          {roles.map(r => <option key={r.id} value={r.id}>Copy permissions from {title(r.name)}</option>)}
        </select>
        {err && <div className="text-xs text-rose-600">{err}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-slate-500">Cancel</button>
          <button className={btnCls}>Create</button>
        </div>
      </form>
    </Modal>
  );
}
