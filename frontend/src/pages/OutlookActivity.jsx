import React, { useState } from 'react';
import { useApi } from '../lib/api.js';
import { PageHeader, Card, Table, StatTile, Tabs, Status } from '../components/ui.jsx';

export default function OutlookActivity() {
  const [period, setPeriod] = useState('today');
  const { data, error } = useApi('/emails/summary', { period });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Productivity" title="Outlook activity" sub="Candidate vs. client outbound emails.">
        <Tabs value={period} onChange={setPeriod} options={[['today', 'Today'], ['week', 'Week'], ['month', 'Month']]} />
      </PageHeader>
      <Status error={error} loading={!data && !error} />
      {data && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <StatTile label="Candidate emails" value={data.totals.candidate} />
            <StatTile label="Client emails" value={data.totals.client} />
            <StatTile label="Internal emails" value={data.totals.internal} />
          </div>
          <Card className="overflow-hidden">
            <Table cols={['Employee', 'Candidate', 'Client', 'Internal', 'Total']} empty={!data.users.length && 'No emails in this period.'}>
              {data.users.map(u => (
                <tr key={u.userId} className="hover:bg-slate-50/70 transition">
                  <td className="py-3 px-4 font-bold text-slate-900">{u.name}</td>
                  <td className="py-3 px-4 text-slate-800">{u.CANDIDATE}</td>
                  <td className="py-3 px-4 text-slate-800">{u.CLIENT}</td>
                  <td className="py-3 px-4 text-slate-800">{u.INTERNAL}</td>
                  <td className="py-3 px-4 font-bold text-slate-900">{u.CANDIDATE + u.CLIENT + u.INTERNAL}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
