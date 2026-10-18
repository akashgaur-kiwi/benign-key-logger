import React from 'react';
import { Download } from 'lucide-react';
import api, { useApi, can } from '../lib/api.js';
import { PageHeader, Card, Table, StatTile, Status, DeleteButton, btnCls } from '../components/ui.jsx';
import { IV_LABEL, fmtWhen } from '../lib/format.js';

const TONE = {
  CONFIRMED: 'bg-emerald-50 text-emerald-700', AWAITING_CONFIRMATION: 'bg-amber-50 text-amber-700',
  FEEDBACK_PENDING: 'bg-rose-50 text-rose-700', COMPLETED: 'bg-slate-100 text-slate-600', SCHEDULED: 'bg-blue-50 text-blue-700'
};

const ics = rows => {
  const d = v => new Date(v).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const ev = rows.map(i => [
    'BEGIN:VEVENT', `UID:${i.id}@worknovas`, `DTSTAMP:${d(Date.now())}`, `DTSTART:${d(i.scheduledTime)}`,
    `DTEND:${d(new Date(i.scheduledTime).getTime() + 3600000)}`,
    `SUMMARY:${i.roundType} - ${i.candidateName} (${i.clientName})`, 'END:VEVENT'
  ].join('\r\n'));
  const blob = new Blob([['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//WorkNovas//EN', ...ev, 'END:VCALENDAR'].join('\r\n')], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'interviews.ics';
  a.click();
  URL.revokeObjectURL(a.href);
};

export default function Interviews() {
  const { data, error, reload } = useApi('/interviews');

  const setStatus = async (id, status) => {
    await api.patch(`/interviews/${id}`, { status });
    reload();
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Interview Pipeline" title="Interviews" sub="Track every scheduled interview and pending feedback.">
        {can('INTERVIEWS', 'EXPORT') && <button onClick={() => data && ics(data.schedule)} className={btnCls}><Download size={14} /> Export calendar</button>}
      </PageHeader>

      <Status error={error} loading={!data && !error} />
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatTile label="Today" value={data.stats.today} sub="Interviews" />
            <StatTile label="Confirmed" value={data.stats.confirmed} sub="Ready" />
            <StatTile label="Awaiting confirmation" value={data.stats.awaiting} sub="Follow up" />
            <StatTile label="Feedback pending" value={data.stats.feedback} sub="Chase client" tone="text-amber-600" />
          </div>

          <Card className="overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800">Interview schedule</h2>
              <p className="text-[10px] text-slate-400">{new Date().toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
            <Table cols={['Time', 'Candidate & Role', 'Client & Round', 'Recruiter', 'Status', '']} empty={!data.schedule.length && 'No upcoming interviews.'}>
              {data.schedule.map(i => (
                <tr key={i.id} className="hover:bg-slate-50/70 transition">
                  <td className="py-3 px-4 font-mono font-bold text-slate-700">{fmtWhen(i.scheduledTime)}</td>
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">{i.candidateName}</div>
                    <div className="text-[10px] text-slate-400">{i.jobTitle}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-800">{i.clientName}</div>
                    <div className="text-[10px] text-slate-400">{i.roundType}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-600">{i.recruiter.fullName}</td>
                  <td className="py-3 px-4">
                    <select
                      disabled={!can('INTERVIEWS', 'EDIT')}
                      value={i.status}
                      onChange={e => setStatus(i.id, e.target.value)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border-0 cursor-pointer ${TONE[i.status] || 'bg-slate-100 text-slate-600'}`}
                    >
                      {Object.entries(IV_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <DeleteButton module="INTERVIEWS" url={`/interviews/${i.id}`} label={`interview with ${i.candidateName}`} onDone={reload} />
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
