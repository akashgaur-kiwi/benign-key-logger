import React, { useState } from 'react';
import api, { useApi, can, errMsg } from '../lib/api.js';
import { PageHeader, Card, Table, StatTile, Status, Badge, Modal, Tabs, DeleteButton, inputCls, btnCls, ghostBtn } from '../components/ui.jsx';
import { fmtDate, title } from '../lib/format.js';

const TYPES = ['CASUAL', 'SICK', 'EMERGENCY', 'UNPAID'];
const STATUS_TONE = { PENDING: 'amber', APPROVED: 'emerald', REJECTED: 'rose', CANCELLED: 'slate' };

function RequestModal({ onClose, onDone }) {
  const [form, setForm] = useState({ type: 'CASUAL', startDate: '', endDate: '', reason: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await api.post('/leaves', form);
      onDone();
    } catch (e) { setErr(errMsg(e)); setBusy(false); }
  };

  return (
    <Modal title="Request leave" onClose={onClose}>
      {err && <div className="p-2 text-xs text-rose-600 bg-rose-50 rounded-lg">{err}</div>}
      <label className="block text-[11px] font-semibold text-slate-500">Leave type
        <select className={inputCls + ' mt-1'} value={form.type} onChange={set('type')}>
          {TYPES.map(t => <option key={t} value={t}>{title(t)}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-[11px] font-semibold text-slate-500">From
          <input type="date" className={inputCls + ' mt-1'} value={form.startDate} onChange={set('startDate')} />
        </label>
        <label className="block text-[11px] font-semibold text-slate-500">To
          <input type="date" className={inputCls + ' mt-1'} value={form.endDate} onChange={set('endDate')} />
        </label>
      </div>
      <label className="block text-[11px] font-semibold text-slate-500">Reason (optional)
        <textarea rows={3} className={inputCls + ' mt-1'} value={form.reason} onChange={set('reason')} />
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <button className={ghostBtn} onClick={onClose}>Cancel</button>
        <button className={btnCls} disabled={busy || !form.startDate || !form.endDate} onClick={submit}>Submit request</button>
      </div>
    </Modal>
  );
}

export default function Leave() {
  const [tab, setTab] = useState('all');
  const [showReq, setShowReq] = useState(false);
  const params = tab === 'mine' ? { mine: '1' } : tab === 'pending' ? { status: 'PENDING' } : {};
  const { data, error, reload } = useApi('/leaves', params);
  const { data: bal, reload: reloadBal } = useApi('/leaves/balance');

  const canApprove = can('LEAVE', 'APPROVE');
  const me = JSON.parse(localStorage.getItem('wn_user') || '{}');

  const refresh = () => { reload(); reloadBal(); };

  const decide = async (id, decision) => {
    const note = decision === 'REJECTED' ? (prompt('Reason for rejection (optional):') || '') : '';
    await api.post(`/leaves/${id}/decide`, { decision, note });
    refresh();
  };
  const cancel = async id => {
    if (!confirm('Cancel this leave request?')) return;
    await api.post(`/leaves/${id}/cancel`);
    refresh();
  };
  const onRequested = () => { setShowReq(false); refresh(); };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="People" title="Leave management" sub="Request time off, track balances and approvals.">
        {can('LEAVE', 'CREATE') && <button className={btnCls} onClick={() => setShowReq(true)}>+ Request leave</button>}
      </PageHeader>

      {bal && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {bal.balances.map(b => (
            <StatTile key={b.type} label={`${title(b.type)} leave`}
              value={b.entitled == null ? b.used : b.remaining}
              sub={b.entitled == null ? `${b.used} taken (uncapped)` : `${b.used} used · ${b.pending} pending · of ${b.entitled}`}
              tone={b.entitled != null && b.remaining === 0 ? 'text-rose-600' : undefined} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Tabs value={tab} onChange={setTab} options={[['all', 'All'], ['pending', 'Pending'], ['mine', 'My requests']]} />
      </div>

      <Status error={error} loading={!data && !error} />
      {data && (
        <Card className="overflow-hidden">
          <Table cols={['Employee', 'Type', 'From', 'To', 'Days', 'Reason', 'Status', 'Decided by', '']}
            empty={data.length ? null : 'No leave requests.'}>
            {data.map(r => {
              const isOwn = r.user.id === me.id;
              return (
                <tr key={r.id} className="hover:bg-slate-50/70 transition">
                  <td className="py-3 px-4 font-bold text-slate-900">{r.user.fullName}{isOwn && <span className="text-slate-400 font-normal"> (you)</span>}</td>
                  <td className="py-3 px-4"><Badge tone="blue">{title(r.type)}</Badge></td>
                  <td className="py-3 px-4 text-slate-600">{fmtDate(r.startDate)}</td>
                  <td className="py-3 px-4 text-slate-600">{fmtDate(r.endDate)}</td>
                  <td className="py-3 px-4 font-mono text-slate-700">{r.days}</td>
                  <td className="py-3 px-4 text-slate-500 max-w-[16rem] truncate" title={r.reason || ''}>{r.reason || '—'}</td>
                  <td className="py-3 px-4"><Badge tone={STATUS_TONE[r.status]}>{title(r.status)}</Badge></td>
                  <td className="py-3 px-4 text-slate-500">{r.decidedBy?.fullName || '—'}</td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    {r.status === 'PENDING' && canApprove && !isOwn && (
                      <span className="inline-flex gap-1.5">
                        <button className={ghostBtn + ' !text-emerald-700 !border-emerald-200 hover:!bg-emerald-50'} onClick={() => decide(r.id, 'APPROVED')}>Approve</button>
                        <button className={ghostBtn + ' !text-rose-700 !border-rose-200 hover:!bg-rose-50'} onClick={() => decide(r.id, 'REJECTED')}>Reject</button>
                      </span>
                    )}
                    {['PENDING', 'APPROVED'].includes(r.status) && (isOwn || canApprove) && (
                      <button className={ghostBtn + ' ml-1.5'} onClick={() => cancel(r.id)}>Cancel</button>
                    )}
                    <span className="inline-flex align-middle ml-1.5">
                      <DeleteButton module="LEAVE" url={`/leaves/${r.id}`} label={`${r.user.fullName}'s leave request`} onDone={refresh} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </Table>
        </Card>
      )}

      {showReq && <RequestModal onClose={() => setShowReq(false)} onDone={onRequested} />}
    </div>
  );
}
