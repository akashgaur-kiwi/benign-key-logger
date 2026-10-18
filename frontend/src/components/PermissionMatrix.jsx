import React from 'react';
import { MODULE_LABEL } from '../lib/nav.js';
import { title } from '../lib/format.js';

const SCOPE_TONE = { OWN: 'bg-sky-50 text-sky-700', TEAM: 'bg-indigo-50 text-indigo-700', ALL: 'bg-emerald-50 text-emerald-700', DENY: 'bg-rose-50 text-rose-700' };

// value: { "MODULE:ACTION": option }, options: [[value, label]] or k => [[value, label]]
export default function PermissionMatrix({ catalog, value, options, onChange, readOnly }) {
  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px]">
          <tr>
            <th className="py-2 px-3 text-left">Module</th>
            {catalog.actions.map(a => <th key={a} className="py-2 px-2 text-center">{title(a)}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {catalog.modules.map(m => (
            <tr key={m}>
              <td className="py-1.5 px-3 font-semibold text-slate-700 whitespace-nowrap">{MODULE_LABEL[m] || title(m)}</td>
              {catalog.actions.map(a => {
                const k = `${m}:${a}`;
                const v = value[k] || '';
                return (
                  <td key={a} className="py-1 px-1 text-center">
                    <select
                      value={v}
                      disabled={readOnly}
                      onChange={e => onChange(k, e.target.value)}
                      className={`w-full px-1 py-0.5 rounded text-[10px] font-bold border-0 cursor-pointer disabled:cursor-default ${SCOPE_TONE[v] || 'bg-slate-50 text-slate-400'}`}
                    >
                      {(typeof options === 'function' ? options(k) : options).map(([ov, ol]) => <option key={ov} value={ov}>{ol}</option>)}
                    </select>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
