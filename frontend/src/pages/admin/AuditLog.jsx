import React, { useState } from 'react';
import { useApi } from '../../lib/api.js';
import { PageHeader, Card, Table, Status, inputCls, ghostBtn } from '../../components/ui.jsx';
import { title } from '../../lib/format.js';

const TONE = a => /FAILED|REVOKED|REJECTED|SUSPENDED|DELETED/.test(a) ? 'text-rose-700' : /LOGIN$/.test(a) ? 'text-slate-500' : 'text-slate-800';

export default function AuditLog() {
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const { data, error } = useApi('/audit-logs', { action: action || undefined, entity: entity || undefined, page });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Administration" title="Audit log" sub="Who did what, and when. Sign-ins, access changes and record edits." />
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex gap-3">
          <select className={`${inputCls} w-56`} value={action} onChange={e => { setAction(e.target.value); setPage(1); }}>
            <option value="">All actions</option>
            {data?.actions?.map(a => <option key={a} value={a}>{title(a)}</option>)}
          </select>
          <select className={`${inputCls} w-48`} value={entity} onChange={e => { setEntity(e.target.value); setPage(1); }}>
            <option value="">All records</option>
            {['User', 'AppRole', 'Requirement', 'Submission', 'Interview', 'Attendance'].map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <Status error={error} loading={!data && !error} />
        {data && (
          <>
            <Table cols={['When', 'Who', 'Action', 'Record', 'IP', '']} empty={!data.rows.length && 'No entries.'}>
              {data.rows.map(r => (
                <React.Fragment key={r.id}>
                  <tr className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono text-slate-600 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="py-2.5 px-4 text-slate-800">{r.actor?.fullName || 'System'}</td>
                    <td className={`py-2.5 px-4 font-semibold ${TONE(r.action)}`}>{title(r.action)}</td>
                    <td className="py-2.5 px-4 text-slate-600">{r.entity}{r.targetName ? `: ${r.targetName}` : ''}</td>
                    <td className="py-2.5 px-4 font-mono text-[10px] text-slate-400">{r.ip || '—'}</td>
                    <td className="py-2.5 px-4 text-right">
                      {(r.before || r.after) && <button className={ghostBtn} onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Hide' : 'Details'}</button>}
                    </td>
                  </tr>
                  {open === r.id && (
                    <tr>
                      <td colSpan={6} className="px-4 pb-3">
                        <div className="grid grid-cols-2 gap-3">
                          {['before', 'after'].map(k => (
                            <div key={k}>
                              <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">{k}</div>
                              <pre className="bg-slate-50 rounded p-2 text-[10px] overflow-auto max-h-64">{r[k] ? JSON.stringify(r[k], null, 2) : '—'}</pre>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </Table>
            <div className="p-3 flex justify-between items-center text-xs text-slate-500 border-t border-slate-100">
              <span>{data.total} entries</span>
              <div className="flex gap-2 items-center">
                <button className={ghostBtn} disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
                <span>{page} / {pages}</span>
                <button className={ghostBtn} disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
