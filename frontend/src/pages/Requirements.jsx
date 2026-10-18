import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import api, { useApi, can } from '../lib/api.js';
import { PageHeader, Card, Table, Tabs, Status, Modal, DeleteButton, inputCls, btnCls } from '../components/ui.jsx';
import { title } from '../lib/format.js';

const PRI_TONE = { CRITICAL: 'bg-rose-50 text-rose-700', HOT: 'bg-amber-50 text-amber-700', NORMAL: 'bg-slate-100 text-slate-600' };
const ST_TONE = { OPEN: 'bg-emerald-50 text-emerald-700', HOLD: 'bg-amber-50 text-amber-700', CLOSED: 'bg-slate-100 text-slate-600' };

const Pill = ({ value, opts, tone, onChange }) => (
  <select value={value} disabled={!can('REQUIREMENTS', 'EDIT')} onChange={e => onChange(e.target.value)} className={`px-1.5 py-0.5 rounded text-[10px] font-bold border-0 cursor-pointer disabled:cursor-default disabled:appearance-none ${tone[value]}`}>
    {opts.map(o => <option key={o} value={o}>{title(o)}</option>)}
  </select>
);

export default function Requirements() {
  const [sp, setSp] = useSearchParams();
  const [status, setStatus] = useState('OPEN');
  const [q, setQ] = useState('');
  const { data, error, reload } = useApi('/requirements', { status: status || undefined, q: q || undefined });
  const open = sp.get('new') === '1' && !!can('REQUIREMENTS', 'CREATE');
  const close = () => setSp({});

  const setField = async (id, patch) => {
    await api.patch(`/requirements/${id}`, patch);
    reload();
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Work Management" title="Requirements" sub="Requisitions, priority aging and recruiter allocation.">
        {can('REQUIREMENTS', 'CREATE') && <button onClick={() => setSp({ new: '1' })} className={btnCls}><Plus size={14} /> New requirement</button>}
      </PageHeader>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center gap-4">
          <div className="relative w-80">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search title or client..." className={`${inputCls} pl-8`} />
          </div>
          <Tabs value={status} onChange={setStatus} options={[['OPEN', 'Open'], ['HOLD', 'On hold'], ['CLOSED', 'Closed'], ['', 'All']]} />
        </div>
        <Status error={error} loading={!data && !error} />
        {data && (
          <Table cols={['Requirement', 'Client', 'Account manager', 'Priority', 'Age', 'Positions', 'Recruiters', 'Submissions', 'Status', '']} empty={!data.length && 'No requirements found.'}>
            {data.map(r => (
              <tr key={r.id} className="hover:bg-slate-50/70 transition">
                <td className="py-3 px-4 font-bold text-slate-900">{r.jobTitle}</td>
                <td className="py-3 px-4 text-slate-600">{r.clientName}</td>
                <td className="py-3 px-4 text-slate-600">{r.accountManager.fullName}</td>
                <td className="py-3 px-4">
                  <Pill value={r.priority} opts={['NORMAL', 'HOT', 'CRITICAL']} tone={PRI_TONE} onChange={v => setField(r.id, { priority: v })} />
                </td>
                <td className={`py-3 px-4 font-semibold ${r.ageInDays > 7 ? 'text-rose-600' : 'text-slate-800'}`}>{r.ageInDays}d</td>
                <td className="py-3 px-4 text-slate-800">{r.openPositions}</td>
                <td className="py-3 px-4 text-slate-600">{r.assignees.map(a => a.recruiter.fullName).join(', ') || '—'}</td>
                <td className="py-3 px-4 text-slate-800">{r._count.submissions}</td>
                <td className="py-3 px-4">
                  <Pill value={r.status} opts={['OPEN', 'HOLD', 'CLOSED']} tone={ST_TONE} onChange={v => setField(r.id, { status: v })} />
                </td>
                <td className="py-3 px-4 text-right">
                  <DeleteButton module="REQUIREMENTS" url={`/requirements/${r.id}`} label={`requirement "${r.jobTitle}" and all its candidates/interviews`} onDone={reload} />
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {open && <NewRequirement onClose={close} onSaved={() => { close(); reload(); }} />}
    </div>
  );
}

function NewRequirement({ onClose, onSaved }) {
  const [f, setF] = useState({ jobTitle: '', clientName: '', priority: 'NORMAL', openPositions: 1, description: '' });
  const [err, setErr] = useState('');
  const set = k => e => setF({ ...f, [k]: e.target.value });

  const save = async e => {
    e.preventDefault();
    try {
      await api.post('/requirements', f);
      onSaved();
    } catch (e) {
      setErr(e.response?.data?.error || 'Save failed');
    }
  };

  return (
    <Modal title="New requirement" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <input className={inputCls} placeholder="Job title" value={f.jobTitle} onChange={set('jobTitle')} required />
        <input className={inputCls} placeholder="Client" value={f.clientName} onChange={set('clientName')} required />
        <div className="grid grid-cols-2 gap-3">
          <select className={inputCls} value={f.priority} onChange={set('priority')}>
            {['NORMAL', 'HOT', 'CRITICAL'].map(p => <option key={p} value={p}>{title(p)}</option>)}
          </select>
          <input className={inputCls} type="number" min="1" value={f.openPositions} onChange={set('openPositions')} />
        </div>
        <textarea className={inputCls} rows="3" placeholder="Description" value={f.description} onChange={set('description')} />
        {err && <div className="text-xs text-rose-600">{err}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-slate-500">Cancel</button>
          <button className={btnCls}>Create</button>
        </div>
      </form>
    </Modal>
  );
}
