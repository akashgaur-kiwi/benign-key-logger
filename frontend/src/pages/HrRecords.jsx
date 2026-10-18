import React from 'react';
import { useApi } from '../lib/api.js';
import { PageHeader, Card, Table, Status } from '../components/ui.jsx';
import { title } from '../lib/format.js';

export default function HrRecords() {
  const { data, error } = useApi('/employees');

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="People" title="HR records & documents" sub="Employee master records." />
      <Card className="overflow-hidden">
        <Status error={error} loading={!data && !error} />
        {data && (
          <Table cols={['Code', 'Name', 'Department', 'Role', 'Manager', 'Joined', 'Productivity']} empty={!data.length && 'No records.'}>
            {data.map(u => (
              <tr key={u.id} className="hover:bg-slate-50/70 transition">
                <td className="py-3 px-4 font-mono text-slate-600">{u.employeeCode || '—'}</td>
                <td className="py-3 px-4 font-bold text-slate-900">{u.fullName}</td>
                <td className="py-3 px-4 text-slate-600">{u.department}</td>
                <td className="py-3 px-4 text-slate-600">{title(u.role)}</td>
                <td className="py-3 px-4 text-slate-600">{u.manager?.fullName || '—'}</td>
                <td className="py-3 px-4 text-slate-600">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="py-3 px-4 font-semibold text-slate-800">{u.productivityScore}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
