import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useApi } from '../lib/api.js';
import { PageHeader, Card, Table, Status } from '../components/ui.jsx';

export default function Recruiters() {
  const { data, error } = useApi('/recruiters');
  const alerts = data?.filter(r => r.alerts.length) || [];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="People" title="Recruiters" sub="Month-to-date leaderboard, conversion and coaching alerts." />
      <Status error={error} loading={!data && !error} />
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="overflow-hidden lg:col-span-2">
            <Table cols={['#', 'Recruiter', 'Sourced', 'Tier-1', 'Client', 'Interviews', 'Starts', 'Conv.', 'Calls today']} empty={!data.length && 'No recruiters.'}>
              {data.map((r, i) => (
                <tr key={r.id} className="hover:bg-slate-50/70 transition">
                  <td className="py-3 px-4 font-bold text-slate-400">{i + 1}</td>
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">{r.name}</div>
                    <div className="text-[10px] text-slate-400">{r.team}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-800">{r.sourced}</td>
                  <td className="py-3 px-4 text-slate-800">{r.tier1}</td>
                  <td className="py-3 px-4 text-slate-800">{r.client}</td>
                  <td className="py-3 px-4 text-slate-800">{r.interviews}</td>
                  <td className="py-3 px-4 font-bold text-emerald-600">{r.starts}</td>
                  <td className="py-3 px-4 text-slate-800">{r.conversion}%</td>
                  <td className="py-3 px-4 text-slate-800">{r.callsToday}</td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card className="p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-800">Coaching alerts</h3>
            {!alerts.length && <p className="text-xs text-slate-400">No alerts.</p>}
            {alerts.map(r => (
              <div key={r.id} className="flex gap-2 text-xs py-1.5 border-b border-slate-100 last:border-0">
                <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-800">{r.name}</div>
                  <div className="text-[10px] text-slate-500">{r.alerts.join(' • ')}</div>
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
