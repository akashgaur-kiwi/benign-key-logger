import React from 'react';
import { useApi } from '../lib/api.js';
import { PageHeader, Card, Table, StatTile, Status, Badge } from '../components/ui.jsx';
import { fmtDate, fmtTime, title } from '../lib/format.js';

const STATUS_TONE = { PRESENT: 'emerald', LATE: 'amber', HALF_DAY: 'blue', ON_LEAVE: 'slate', ABSENT: 'rose' };
const LEAVE_TONE = { PENDING: 'amber', APPROVED: 'emerald', REJECTED: 'rose', CANCELLED: 'slate' };

function Field({ label, value }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-slate-400">{label}</div>
      <div className="text-xs font-semibold text-slate-800 mt-0.5">{value || '—'}</div>
    </div>
  );
}

export default function MyDashboard() {
  const { data, error } = useApi('/me/dashboard');
  const p = data?.profile;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Overview" title="My dashboard" sub="Your profile, attendance, leave and login history." />
      <Status error={error} loading={!data && !error} />
      {data && (
        <>
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-800 mb-4">Profile</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="Name" value={p.fullName} />
              <Field label="Employee code" value={p.employeeCode} />
              <Field label="Designation" value={p.designation || title(p.role)} />
              <Field label="Department" value={p.department} />
              <Field label="Email" value={p.email} />
              <Field label="Phone" value={p.phone} />
              <Field label="Reporting manager" value={p.manager?.fullName} />
              <Field label="Team" value={p.teamTag} />
              <Field label="Date of joining" value={p.dateOfJoining ? fmtDate(p.dateOfJoining) : null} />
              <Field label="Status" value={title(p.status)} />
            </div>
          </Card>

          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-3">Leave balance</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {data.balances.map(b => (
                <StatTile key={b.type} label={`${title(b.type)} leave`}
                  value={b.entitled == null ? b.used : b.remaining}
                  sub={b.entitled == null ? `${b.used} taken (uncapped)` : `${b.used} used · ${b.pending} pending · of ${b.entitled}`}
                  tone={b.entitled != null && b.remaining === 0 ? 'text-rose-600' : undefined} />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="overflow-hidden">
              <div className="px-4 pt-4 text-sm font-bold text-slate-800">My leave requests</div>
              <Table cols={['Type', 'From', 'To', 'Days', 'Status']} empty={data.leaveRequests.length ? null : 'No leave requests yet.'}>
                {data.leaveRequests.map(l => (
                  <tr key={l.id}>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">{title(l.type)}</td>
                    <td className="py-2.5 px-4 text-slate-600">{fmtDate(l.startDate)}</td>
                    <td className="py-2.5 px-4 text-slate-600">{fmtDate(l.endDate)}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-700">{l.days}</td>
                    <td className="py-2.5 px-4"><Badge tone={LEAVE_TONE[l.status]}>{title(l.status)}</Badge></td>
                  </tr>
                ))}
              </Table>
            </Card>

            <Card className="overflow-hidden">
              <div className="px-4 pt-4 text-sm font-bold text-slate-800">Login &amp; logout records</div>
              <Table cols={['Date', 'Clock in', 'Clock out', 'Status']} empty={data.logins.length ? null : 'No login records in the last 30 days.'}>
                {data.logins.map((r, i) => (
                  <tr key={i}>
                    <td className="py-2.5 px-4 text-slate-600">{fmtDate(r.date)}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-700">{fmtTime(r.clockIn)}{r.isLate && <span className="ml-1 text-amber-600">late</span>}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-700">{fmtTime(r.clockOut)}</td>
                    <td className="py-2.5 px-4"><Badge tone={STATUS_TONE[r.status]}>{title(r.status)}</Badge></td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="px-4 pt-4 text-sm font-bold text-slate-800">Attendance history (last 30 days)</div>
            <Table cols={['Date', 'Status', 'Clock in', 'Clock out', 'Notes']} empty={data.attendance.length ? null : 'No attendance records.'}>
              {data.attendance.map(a => (
                <tr key={a.id}>
                  <td className="py-2.5 px-4 text-slate-600">{fmtDate(a.date)}</td>
                  <td className="py-2.5 px-4"><Badge tone={STATUS_TONE[a.status]}>{title(a.status)}</Badge></td>
                  <td className="py-2.5 px-4 font-mono text-slate-700">{fmtTime(a.clockIn)}</td>
                  <td className="py-2.5 px-4 font-mono text-slate-700">{fmtTime(a.clockOut)}</td>
                  <td className="py-2.5 px-4 text-slate-500">{a.notes || '—'}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
