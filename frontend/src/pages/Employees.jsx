import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { useApi } from '../lib/api.js';
import { PageHeader, Card, Table, Tabs, Status, Badge, inputCls } from '../components/ui.jsx';
import { title, fmtDate } from '../lib/format.js';

export default function Employees() {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const { data, error } = useApi('/employees', { q: q || undefined, role: role || undefined });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="People" title="Employees" sub="Directory, status and reporting hierarchy." />
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center gap-4">
          <div className="relative w-80">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email or code..." className={`${inputCls} pl-8`} />
          </div>
          <Tabs value={role} onChange={setRole} options={[['', 'All'], ['RECRUITER', 'Recruiters'], ['ACCOUNT_MANAGER', 'Account managers'], ['HR_ADMIN', 'HR'], ['OWNER_ADMIN', 'Admins']]} />
        </div>
        <Status error={error} loading={!data && !error} />
        {data && (
          <Table cols={['Name', 'Code', 'Designation', 'Phone', 'Team', 'Reports to', 'Joined', 'Status']} empty={!data.length && 'No employees found.'}>
            {data.map(u => (
              <tr key={u.id} className="hover:bg-slate-50/70 transition">
                <td className="py-3 px-4">
                  <div className="font-bold text-slate-900">{u.fullName}</div>
                  <div className="text-[10px] text-slate-400">{u.email}</div>
                </td>
                <td className="py-3 px-4 font-mono text-slate-600">{u.employeeCode || '—'}</td>
                <td className="py-3 px-4 text-slate-600">{u.designation || title(u.role)}</td>
                <td className="py-3 px-4 text-slate-600">{u.phone || '—'}</td>
                <td className="py-3 px-4 text-slate-600">{u.teamTag || u.department}</td>
                <td className="py-3 px-4 text-slate-600">{u.manager?.fullName || '—'}</td>
                <td className="py-3 px-4 text-slate-600">{u.dateOfJoining ? fmtDate(u.dateOfJoining) : '—'}</td>
                <td className="py-3 px-4">
                  {!u.isActive ? <Badge>Inactive</Badge> : u.isOnline ? <Badge tone="emerald">● Online</Badge> : <Badge>○ Offline</Badge>}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
