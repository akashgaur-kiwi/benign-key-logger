import React from 'react';
import { useApi } from '../lib/api.js';
import { PageHeader, Card, Table, Status } from '../components/ui.jsx';

export default function AccountManagers() {
  const { data, error } = useApi('/account-managers');

  return (
    <div className="space-y-6">
      <PageHeader title="Account manager performance" sub="Requirement and delivery activity for today." />
      <Status error={error} loading={!data && !error} />
      {data && (
        <>
          <Card className="overflow-hidden">
            <Table cols={['Account Manager', 'Accounts', 'New Req.', 'Old Worked', 'Hot', 'Tier-1', 'Client Submits', 'Interviews', 'Offers', 'Starts']} empty={!data.managers.length && 'No account managers.'}>
              {data.managers.map(am => (
                <tr key={am.id} className="hover:bg-slate-50/70 transition">
                  <td className="py-3 px-4 font-bold text-slate-900">{am.name}</td>
                  <td className="py-3 px-4 text-slate-600">{am.accounts || '—'}</td>
                  <td className="py-3 px-4 text-slate-800">{am.newReq}</td>
                  <td className="py-3 px-4 text-slate-800">{am.oldWorked}</td>
                  <td className="py-3 px-4 text-amber-600 font-bold">{am.hot}</td>
                  <td className="py-3 px-4 text-slate-800">{am.tier1}</td>
                  <td className="py-3 px-4 text-slate-800">{am.clientSubmits}</td>
                  <td className="py-3 px-4 text-slate-800">{am.interviews}</td>
                  <td className="py-3 px-4 text-slate-800">{am.offers}</td>
                  <td className="py-3 px-4 font-bold text-emerald-600">{am.starts}</td>
                </tr>
              ))}
            </Table>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-800">Requirements by account</h3>
              <p className="text-[11px] text-slate-400">Current open workload</p>
              <div className="space-y-2 pt-2">
                {data.byAccount.map(a => <AccountBar key={a.client} {...a} />)}
              </div>
            </Card>
            <Card className="p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-800">Pending client actions</h3>
              <p className="text-[11px] text-slate-400">Follow-ups due</p>
              <div className="space-y-2.5 pt-2 text-xs">
                {data.pendingActions.length === 0 && <p className="text-slate-400">Nothing pending.</p>}
                {data.pendingActions.map((a, i) => <ActionItem key={i} {...a} />)}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function AccountBar({ client, count, width }) {
  return (
    <div className="text-xs">
      <div className="flex justify-between text-slate-600 font-medium mb-1">
        <span>{client}</span>
        <span className="font-bold text-slate-800">{count}</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div className="bg-blue-600 h-1.5 rounded-full" style={{ width }} />
      </div>
    </div>
  );
}

function ActionItem({ title, sub, due }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
      <div>
        <div className="font-semibold text-slate-800">{title}</div>
        <div className="text-[10px] text-slate-400">{sub}</div>
      </div>
      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">{due}</span>
    </div>
  );
}
