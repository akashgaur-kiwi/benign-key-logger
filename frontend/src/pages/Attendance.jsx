import React from 'react';
import api, { useApi, can } from '../lib/api.js';
import { PageHeader, Card, Table, StatTile, Status, DeleteButton } from '../components/ui.jsx';
import { fmtTime, title } from '../lib/format.js';

const TONE = {
  PRESENT: 'bg-emerald-50 text-emerald-700', LATE: 'bg-amber-50 text-amber-700', HALF_DAY: 'bg-blue-50 text-blue-700',
  ON_LEAVE: 'bg-slate-100 text-slate-600', ABSENT: 'bg-rose-50 text-rose-700'
};

function Ring({ pct }) {
  const r = 42, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" className="w-28 h-28" role="img" aria-label={`${pct}% attendance`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="#2563eb" strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 50 50)" />
      <text x="50" y="55" textAnchor="middle" className="fill-slate-900 font-black" fontSize="18">{pct}%</text>
    </svg>
  );
}

export default function Attendance() {
  const { data, error, reload } = useApi('/attendance');

  const setStatus = async (userId, status) => {
    await api.put('/attendance', { userId, status });
    reload();
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="People" title="HR & attendance" sub="Today's attendance, logins and status." />
      <Status error={error} loading={!data && !error} />
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="p-4 flex items-center justify-center md:row-span-1"><Ring pct={data.pct} /></Card>
            <StatTile label="Present" value={data.breakdown.PRESENT} sub={`of ${data.total}`} />
            <StatTile label="Late" value={data.breakdown.LATE} tone="text-amber-600" />
            <StatTile label="On leave / half day" value={data.breakdown.ON_LEAVE + data.breakdown.HALF_DAY} />
            <StatTile label="Absent" value={data.breakdown.ABSENT} tone="text-rose-600" />
          </div>
          <Card className="overflow-hidden">
            <Table cols={['Employee', 'Team', 'Clock in', 'Last activity', 'Online', 'Status', '']}>
              {data.rows.map(r => (
                <tr key={r.userId} className="hover:bg-slate-50/70 transition">
                  <td className="py-3 px-4 font-bold text-slate-900">{r.name}</td>
                  <td className="py-3 px-4 text-slate-600">{r.team || '—'}</td>
                  <td className="py-3 px-4 font-mono text-slate-700">{fmtTime(r.clockIn)}</td>
                  <td className="py-3 px-4 font-mono text-slate-700">{fmtTime(r.clockOut)}</td>
                  <td className="py-3 px-4 text-slate-600">{r.isOnline ? '● Yes' : '○ No'}</td>
                  <td className="py-3 px-4">
                    <select value={r.status} disabled={!can('ATTENDANCE', 'EDIT')} onChange={e => setStatus(r.userId, e.target.value)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border-0 cursor-pointer ${TONE[r.status]}`}>
                      {Object.keys(TONE).map(s => <option key={s} value={s}>{title(s)}</option>)}
                    </select>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {r.id && <DeleteButton module="ATTENDANCE" url={`/attendance/${r.id}`} label={`today's attendance for ${r.name}`} onDone={reload} />}
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
