import React, { useState } from 'react';
import api, { useApi, can, errMsg } from '../lib/api.js';
import { PageHeader, Card, Table, StatTile, Status, Modal, inputCls, btnCls, ghostBtn } from '../components/ui.jsx';
import { title } from '../lib/format.js';

const TYPES = [['CALL', 'Client call'], ['MEETING', 'Client meeting'], ['NEW_CLIENT', 'New client acquired']];

function LogModal({ onClose, onDone }) {
  const [form, setForm] = useState({ clientName: '', type: 'CALL', notes: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const submit = async () => {
    setBusy(true); setErr(null);
    try { await api.post('/client-activity', form); onDone(); }
    catch (e) { setErr(errMsg(e)); setBusy(false); }
  };
  return (
    <Modal title="Log client interaction" onClose={onClose}>
      {err && <div className="p-2 text-xs text-rose-600 bg-rose-50 rounded-lg">{err}</div>}
      <label className="block text-[11px] font-semibold text-slate-500">Client name
        <input className={inputCls + ' mt-1'} value={form.clientName} onChange={set('clientName')} placeholder="e.g. Acme Corp" />
      </label>
      <label className="block text-[11px] font-semibold text-slate-500">Interaction type
        <select className={inputCls + ' mt-1'} value={form.type} onChange={set('type')}>
          {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label className="block text-[11px] font-semibold text-slate-500">Notes (optional)
        <textarea rows={3} className={inputCls + ' mt-1'} value={form.notes} onChange={set('notes')} />
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <button className={ghostBtn} onClick={onClose}>Cancel</button>
        <button className={btnCls} disabled={busy || !form.clientName} onClick={submit}>Log</button>
      </div>
    </Modal>
  );
}

export default function BdmActivity() {
  const { data, error, reload } = useApi('/client-activity');
  const [show, setShow] = useState(false);
  const t = data?.totals;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Productivity" title="BDM performance" sub="Client development activity and delivery, this month.">
        {can('CLIENT_ACTIVITY', 'CREATE') && <button className={btnCls} onClick={() => setShow(true)}>+ Log interaction</button>}
      </PageHeader>
      <Status error={error} loading={!data && !error} />
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <StatTile label="Client calls" value={t.calls} />
            <StatTile label="Client meetings" value={t.meetings} />
            <StatTile label="New clients" value={t.newClients} tone="text-emerald-600" />
            <StatTile label="New requirements" value={t.newReqs} />
            <StatTile label="Placements" value={t.placements} />
            <StatTile label="Starts" value={t.starts} tone="text-emerald-600" />
          </div>
          <Card className="overflow-hidden">
            <Table cols={['BDM', 'Team', 'Calls', 'Meetings', 'New clients', 'New req.', 'Existing req.', 'Placements', 'Starts']}
              empty={data.rows.length ? null : 'No account managers.'}>
              {data.rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/70 transition">
                  <td className="py-3 px-4 font-bold text-slate-900">{r.name}</td>
                  <td className="py-3 px-4 text-slate-600">{r.team || '—'}</td>
                  <td className="py-3 px-4 text-slate-800">{r.calls}</td>
                  <td className="py-3 px-4 text-slate-800">{r.meetings}</td>
                  <td className="py-3 px-4 font-bold text-emerald-600">{r.newClients}</td>
                  <td className="py-3 px-4 text-slate-800">{r.newReqs}</td>
                  <td className="py-3 px-4 text-slate-800">{r.existingReqs}</td>
                  <td className="py-3 px-4 text-slate-800">{r.placements}</td>
                  <td className="py-3 px-4 font-bold text-emerald-600">{r.starts}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      )}
      {show && <LogModal onClose={() => setShow(false)} onDone={() => { setShow(false); reload(); }} />}
    </div>
  );
}
