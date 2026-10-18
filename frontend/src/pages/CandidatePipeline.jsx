import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import api, { useApi, can } from '../lib/api.js';
import { PageHeader, Card, Table, Tabs, Status, Modal, DeleteButton, inputCls, btnCls } from '../components/ui.jsx';
import { STAGE_LABEL, fmtWhen } from '../lib/format.js';

const TONE = {
  INTERVIEW: 'bg-blue-50 text-blue-700', CLIENT_SUBMITTED: 'bg-indigo-50 text-indigo-700',
  TIER1_SUBMITTED: 'bg-amber-50 text-amber-700', OFFER: 'bg-emerald-50 text-emerald-700',
  START: 'bg-emerald-100 text-emerald-800', REJECTED: 'bg-rose-50 text-rose-700'
};

export default function CandidatePipeline() {
  const [sp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') || '');
  const [filter, setFilter] = useState('');
  const [adding, setAdding] = useState(false);
  const { data, error, reload } = useApi('/pipeline', { q: q || undefined, filter: filter || undefined });

  const move = async (id, stage) => {
    await api.patch(`/pipeline/${id}/stage`, { stage });
    reload();
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Talent Pipeline" title="Candidates" sub="One view of every candidate, stage and next action.">
        {can('PIPELINE', 'CREATE') && <button onClick={() => setAdding(true)} className={btnCls}><Plus size={14} /> Add candidate</button>}
      </PageHeader>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <div className="relative w-80">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search candidate, role or client..." className={`${inputCls} pl-8`} />
          </div>
          <Tabs value={filter} onChange={setFilter} options={[['', 'All candidates'], ['action', 'Action due'], ['interview', 'Interview']]} />
        </div>
        <Status error={error} loading={!data && !error} />
        {data && (
          <Table cols={['Candidate', 'Requirement', 'Client', 'Stage', 'Owner', 'Next action', '']} empty={!data.length && 'No candidates found.'}>
            {data.map(c => (
              <tr key={c.id} className="hover:bg-slate-50/70 transition">
                <td className="py-3 px-4 font-bold text-slate-900">{c.candidateName}</td>
                <td className="py-3 px-4 text-slate-600">{c.requirement.jobTitle}</td>
                <td className="py-3 px-4 text-slate-600">{c.requirement.clientName}</td>
                <td className="py-3 px-4">
                  <select
                    disabled={!can('PIPELINE', 'EDIT')}
                    value={c.currentStage}
                    onChange={e => move(c.id, e.target.value)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold border-0 cursor-pointer ${TONE[c.currentStage] || 'bg-slate-100 text-slate-600'}`}
                  >
                    {Object.entries(STAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td className="py-3 px-4 text-slate-600">{c.recruiter.fullName}</td>
                <td className="py-3 px-4 font-semibold text-slate-800">{c.nextAction || fmtWhen(c.actionDueDate)}</td>
                <td className="py-3 px-4 text-right">
                  <DeleteButton module="PIPELINE" url={`/pipeline/${c.id}`} label={`candidate "${c.candidateName}"`} onDone={reload} />
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {adding && <AddCandidate onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    </div>
  );
}

function AddCandidate({ onClose, onSaved }) {
  const { data: reqs } = useApi('/requirements', { status: 'OPEN' });
  const [f, setF] = useState({ requirementId: '', candidateName: '', candidateEmail: '', candidatePhone: '', actionDueDate: '' });
  const [err, setErr] = useState('');
  const set = k => e => setF({ ...f, [k]: e.target.value });

  const save = async e => {
    e.preventDefault();
    try {
      await api.post('/pipeline', { ...f, actionDueDate: f.actionDueDate || undefined });
      onSaved();
    } catch (e) {
      setErr(e.response?.data?.error || 'Save failed');
    }
  };

  return (
    <Modal title="Add candidate" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <select className={inputCls} value={f.requirementId} onChange={set('requirementId')} required>
          <option value="">Select requirement…</option>
          {reqs?.map(r => <option key={r.id} value={r.id}>{r.jobTitle} — {r.clientName}</option>)}
        </select>
        <input className={inputCls} placeholder="Candidate name" value={f.candidateName} onChange={set('candidateName')} required />
        <input className={inputCls} type="email" placeholder="Email" value={f.candidateEmail} onChange={set('candidateEmail')} />
        <input className={inputCls} placeholder="Phone" value={f.candidatePhone} onChange={set('candidatePhone')} />
        <input className={inputCls} type="datetime-local" value={f.actionDueDate} onChange={set('actionDueDate')} />
        {err && <div className="text-xs text-rose-600">{err}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-slate-500">Cancel</button>
          <button className={btnCls}>Add</button>
        </div>
      </form>
    </Modal>
  );
}
