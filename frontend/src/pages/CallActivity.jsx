import React, { useState } from 'react';
import { useApi } from '../lib/api.js';
import { PageHeader, Card, Table, StatTile, Tabs, Status } from '../components/ui.jsx';
import { title } from '../lib/format.js';

const PERIODS = [['today', 'Today'], ['week', 'Week'], ['month', 'Month']];

export default function CallActivity() {
  const [period, setPeriod] = useState('today');
  const { data, error } = useApi('/calls/summary', { period });
  const max = Math.max(1, ...(data?.outcomes.map(o => o.count) || [1]));
  const connected = data?.outcomes.find(o => o.outcome === 'CONNECTED')?.count || 0;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Productivity" title="Call activity" sub="VoIP call volume, outcomes and recruiter totals.">
        <Tabs value={period} onChange={setPeriod} options={PERIODS} />
      </PageHeader>
      <Status error={error} loading={!data && !error} />
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatTile label="Total calls" value={data.totalCalls} />
            <StatTile label="Connected" value={connected} sub={data.totalCalls ? `${Math.round((connected / data.totalCalls) * 100)}% connect rate` : ''} />
            <StatTile label="Talk time" value={`${data.talkMinutes}m`} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-800">Outcomes</h3>
              {data.outcomes.map(o => (
                <div key={o.outcome} className="text-xs" title={`${title(o.outcome)}: ${o.count}`}>
                  <div className="flex justify-between text-slate-600 font-medium mb-1">
                    <span>{title(o.outcome)}</span><span className="font-bold text-slate-800">{o.count}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${(o.count / max) * 100}%` }} />
                  </div>
                </div>
              ))}
            </Card>
            <Card className="overflow-hidden lg:col-span-2">
              <Table cols={['Recruiter', 'Calls', 'Connected', 'Minutes']} empty={!data.recruiters.length && 'No calls in this period.'}>
                {data.recruiters.map(r => (
                  <tr key={r.userId} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4 font-bold text-slate-900">{r.name}</td>
                    <td className="py-3 px-4 text-slate-800">{r.calls}</td>
                    <td className="py-3 px-4 text-slate-800">{r.connected}</td>
                    <td className="py-3 px-4 text-slate-800">{r.minutes}</td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
