import React from 'react';

export function PageHeader({ eyebrow, title, sub, children }) {
  return (
    <div className="flex justify-between items-start">
      <div>
        {eyebrow && <span className="text-[10px] font-bold tracking-wider uppercase text-blue-600">{eyebrow}</span>}
        <h1 className="text-xl font-bold text-slate-900 mt-0.5">{title}</h1>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function Card({ className = '', children }) {
  return <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>{children}</div>;
}

export function StatTile({ label, value, sub, highlight, tone }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] font-medium text-slate-400">{label}</div>
      <div className={`text-2xl font-black mt-1 ${tone || 'text-slate-900'}`}>{value ?? '—'}</div>
      {sub && <div className={`text-[10px] mt-0.5 ${highlight ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>{sub}</div>}
    </Card>
  );
}

export function Table({ cols, children, empty }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
          <tr>{cols.map((c, i) => <th key={i} className="py-2.5 px-4 whitespace-nowrap">{c}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 font-medium">{children}</tbody>
      </table>
      {empty && <div className="p-6 text-center text-xs text-slate-400">{empty}</div>}
    </div>
  );
}

export function Badge({ tone = 'slate', children }) {
  const t = {
    slate: 'bg-slate-100 text-slate-600', blue: 'bg-blue-50 text-blue-700', indigo: 'bg-indigo-50 text-indigo-700',
    amber: 'bg-amber-50 text-amber-700', emerald: 'bg-emerald-50 text-emerald-700', rose: 'bg-rose-50 text-rose-700'
  }[tone];
  return <span className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${t}`}>{children}</span>;
}

export function Tabs({ value, onChange, options }) {
  return (
    <div className="flex gap-1.5 text-xs">
      {options.map(([v, l]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-2.5 py-1 rounded ${value === v ? 'bg-slate-100 text-slate-800 font-semibold' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function Status({ error, loading }) {
  if (error) return <div className="p-4 text-xs text-rose-600 bg-rose-50 rounded-lg">{error}</div>;
  if (loading) return <div className="p-4 text-xs text-slate-400">Loading…</div>;
  return null;
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-white rounded-xl shadow-xl w-full ${wide ? 'max-w-4xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto p-5 space-y-4`} onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export const inputCls = 'w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500';
export const btnCls = 'px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50';
export const ghostBtn = 'px-2 py-1 rounded-md text-[11px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50';
