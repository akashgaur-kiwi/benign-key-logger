import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { useApi, can } from '../lib/api.js';
import { PageHeader, Card, Table, Tabs, Status, Badge, ghostBtn } from '../components/ui.jsx';
import { fmtDate, title } from '../lib/format.js';

function toCsv(rows, cols) {
  const head = cols.map(c => c.label).join(',');
  const body = rows.map(r => cols.map(c => {
    const v = c.get(r);
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
  return `${head}\n${body}`;
}

function download(name, csv) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function ExportBtn({ rows, cols, name }) {
  if (!can('REPORTS', 'EXPORT') || !rows?.length) return null;
  return <button className={ghostBtn} onClick={() => download(name, toCsv(rows, cols))}><Download size={12} /> Export CSV</button>;
}

function AttendanceReport() {
  const [period, setPeriod] = useState('daily');
  const { data, error } = useApi('/reports/attendance', { period });
  const cols = [
    { label: 'Employee', get: r => r.name }, { label: 'Team', get: r => r.team || '' },
    { label: 'Present', get: r => r.PRESENT }, { label: 'Late', get: r => r.LATE },
    { label: 'Half day', get: r => r.HALF_DAY }, { label: 'On leave', get: r => r.ON_LEAVE },
    { label: 'Absent', get: r => r.ABSENT }, { label: 'Working days', get: r => r.workingDays }
  ];
  return (
    <>
      <div className="flex items-center justify-between">
        <Tabs value={period} onChange={setPeriod} options={[['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']]} />
        <ExportBtn rows={data?.rows} cols={cols} name={`attendance-${period}.csv`} />
      </div>
      <Status error={error} loading={!data && !error} />
      {data && (
        <Card className="overflow-hidden">
          <div className="px-4 pt-3 text-[11px] text-slate-400">{fmtDate(data.start)} — {fmtDate(new Date(new Date(data.end).getTime() - 86400000))}</div>
          <Table cols={['Employee', 'Team', 'Present', 'Late', 'Half day', 'On leave', 'Absent', 'Working days']} empty={data.rows.length ? null : 'No data.'}>
            {data.rows.map(r => (
              <tr key={r.userId} className="hover:bg-slate-50/70">
                <td className="py-2.5 px-4 font-semibold text-slate-800">{r.name}</td>
                <td className="py-2.5 px-4 text-slate-600">{r.team || '—'}</td>
                <td className="py-2.5 px-4 text-emerald-700">{r.PRESENT}</td>
                <td className="py-2.5 px-4 text-amber-700">{r.LATE}</td>
                <td className="py-2.5 px-4 text-blue-700">{r.HALF_DAY}</td>
                <td className="py-2.5 px-4 text-slate-600">{r.ON_LEAVE}</td>
                <td className="py-2.5 px-4 text-rose-700">{r.ABSENT}</td>
                <td className="py-2.5 px-4 font-bold text-slate-800">{r.workingDays}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}

function EmployeeReport() {
  const [kind, setKind] = useState('active');
  const { data, error } = useApi('/reports/employees', { kind });
  const cols = [
    { label: 'Name', get: r => r.fullName }, { label: 'Code', get: r => r.employeeCode || '' },
    { label: 'Designation', get: r => r.designation || r.role }, { label: 'Department', get: r => r.department },
    { label: 'Team', get: r => r.teamTag || '' }, { label: 'Manager', get: r => r.manager?.fullName || '' },
    { label: 'Joined', get: r => r.dateOfJoining ? fmtDate(r.dateOfJoining) : '' },
    { label: 'Exited', get: r => r.dateOfExit ? fmtDate(r.dateOfExit) : '' }, { label: 'Status', get: r => r.status }
  ];
  return (
    <>
      <div className="flex items-center justify-between">
        <Tabs value={kind} onChange={setKind} options={[['active', 'Active employees'], ['joining', 'Joining (this month)'], ['exit', 'Exits']]} />
        <ExportBtn rows={data?.rows} cols={cols} name={`employees-${kind}.csv`} />
      </div>
      <Status error={error} loading={!data && !error} />
      {data && (
        <Card className="overflow-hidden">
          <div className="px-4 pt-3 text-[11px] text-slate-400">{data.count} employee(s)</div>
          <Table cols={['Name', 'Code', 'Designation', 'Team', 'Manager', 'Joined', 'Exited', 'Status']} empty={data.rows.length ? null : 'No employees.'}>
            {data.rows.map(r => (
              <tr key={r.id} className="hover:bg-slate-50/70">
                <td className="py-2.5 px-4">
                  <div className="font-semibold text-slate-800">{r.fullName}</div>
                  <div className="text-[10px] text-slate-400">{r.email}</div>
                </td>
                <td className="py-2.5 px-4 font-mono text-slate-600">{r.employeeCode || '—'}</td>
                <td className="py-2.5 px-4 text-slate-600">{r.designation || title(r.role)}</td>
                <td className="py-2.5 px-4 text-slate-600">{r.teamTag || '—'}</td>
                <td className="py-2.5 px-4 text-slate-600">{r.manager?.fullName || '—'}</td>
                <td className="py-2.5 px-4 text-slate-600">{r.dateOfJoining ? fmtDate(r.dateOfJoining) : '—'}</td>
                <td className="py-2.5 px-4 text-slate-600">{r.dateOfExit ? fmtDate(r.dateOfExit) : '—'}</td>
                <td className="py-2.5 px-4"><Badge tone={r.status === 'ACTIVE' ? 'emerald' : 'slate'}>{title(r.status)}</Badge></td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}

export default function Reports() {
  const [tab, setTab] = useState('attendance');
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Productivity" title="Reports" sub="Attendance and workforce reports, with CSV export." />
      <Tabs value={tab} onChange={setTab} options={[['attendance', 'Attendance'], ['employees', 'Employees']]} />
      {tab === 'attendance' ? <AttendanceReport /> : <EmployeeReport />}
    </div>
  );
}
