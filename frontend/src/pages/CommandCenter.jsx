import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ArrowRight } from 'lucide-react';
import { useApi, getUser, can } from '../lib/api.js';
import { StatTile, Card, Status, btnCls } from '../components/ui.jsx';
import { fmtTime } from '../lib/format.js';

const greet = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export default function CommandCenter() {
  const nav = useNavigate();
  const { data, error } = useApi('/command-center');
  const first = getUser()?.fullName?.split(' ')[0] || '';
  const b = data?.morningBrief;
  const s = data?.stats;
  const max = Math.max(1, ...(data?.funnel.stages.map(x => x.count) || [1]));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <span className="text-[10px] font-bold tracking-wider uppercase text-blue-600">Global Recruitment Operations</span>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">{greet()}, {first}.</h1>
          <p className="text-xs text-slate-500">Here is what needs your attention across WorkNovas today.</p>
        </div>
        {can('REQUIREMENTS', 'CREATE') && (
          <button onClick={() => nav('/requirements?new=1')} className={btnCls}>
            <Plus size={14} /> New requirement
          </button>
        )}
      </div>

      <Status error={error} loading={!data && !error} />

      {data && (
        <>
          <div className="bg-[#0b1b36] rounded-xl p-5 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-blue-400">⚡ Morning brief</div>
              <h2 className="text-base font-bold mt-1">
                {b.priorityRolesNeedingAction} priority roles need recruiter action before noon.
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                {b.followUpsDueToday} candidate follow-ups and {b.upcomingInterviewsCount} interviews are on today's calendar.
              </p>
              <button onClick={() => nav('/requirements')} className="mt-3 text-xs text-blue-300 hover:text-white font-semibold flex items-center gap-1">
                Review priorities <ArrowRight size={14} />
              </button>
            </div>
            <div className="flex gap-8 border-t md:border-t-0 md:border-l border-slate-700/60 pt-3 md:pt-0 md:pl-8 text-center">
              <BriefNum v={b.criticalReqsCount} l="Critical requirements" c="text-rose-400" />
              <BriefNum v={b.followUpsDueToday} l="Due today follow-ups" c="text-amber-400" />
              <BriefNum v={b.upcomingInterviewsCount} l="Upcoming interviews" c="text-emerald-400" />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatTile label="Team online" value={s.teamOnline.replace('/', ' / ')} sub={`${s.attendancePct}% attendance`} />
            <StatTile label="Open requirements" value={s.openReqs} sub="Across all accounts" />
            <StatTile label="Client submissions" value={s.clientSubmissionsToday} sub={`${data.funnel.conversions.resumeToTier1} resume → Tier-1`} />
            <StatTile label="Starts this month" value={s.startsThisMonth} sub={`${data.funnel.conversions.offerToStart} offer → start`} highlight />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="p-5 space-y-4 lg:col-span-2">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Recruitment funnel</h3>
                  <p className="text-[11px] text-slate-400">Candidate movement</p>
                </div>
                <button onClick={() => nav('/pipeline')} className="text-xs text-blue-600 font-semibold">Open report →</button>
              </div>
              <div className="grid grid-cols-7 gap-2 text-center pt-2">
                {data.funnel.stages.map(f => <FunnelNode key={f.stage} stage={f.stage} count={f.count} pct={(f.count / max) * 100} />)}
              </div>
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-100 text-center">
                <Conv v={data.funnel.conversions.resumeToTier1} l="Resumes → Tier-1" />
                <Conv v={data.funnel.conversions.clientToInterview} l="Client → Interview" />
                <Conv v={data.funnel.conversions.offerToStart} l="Offer → Start" />
              </div>
            </Card>

            <Card className="p-5 space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-800">Today's schedule</h3>
                <button onClick={() => nav('/interviews')} className="text-xs text-blue-600 font-semibold">All →</button>
              </div>
              {data.todaySchedule.length === 0 && <p className="text-xs text-slate-400">No interviews scheduled.</p>}
              {data.todaySchedule.map(i => (
                <div key={i.id} className="flex gap-3 text-xs py-1.5 border-b border-slate-100 last:border-0">
                  <span className="font-mono font-bold text-slate-700 w-16 shrink-0">{fmtTime(i.scheduledTime)}</span>
                  <div>
                    <div className="font-semibold text-slate-800">{i.candidateName}</div>
                    <div className="text-[10px] text-slate-400">{i.clientName} • {i.roundType}</div>
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-1 text-[10px] text-slate-500">
                <span>CEIPAL: {data.systemStatus.ceipal}</span>
                <span>Outlook: {data.systemStatus.outlook}</span>
                <span>VoIP: {data.systemStatus.voip}</span>
                <span>Agents online: {data.systemStatus.desktopAgentsOnline}</span>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

const BriefNum = ({ v, l, c }) => (
  <div>
    <div className={`text-2xl font-black ${c}`}>{v}</div>
    <div className="text-[10px] text-slate-400 uppercase font-semibold">{l}</div>
  </div>
);

const Conv = ({ v, l }) => (
  <div>
    <div className="text-lg font-black text-slate-800">{v}</div>
    <div className="text-[10px] text-slate-400 uppercase font-semibold">{l}</div>
  </div>
);

function FunnelNode({ stage, count, pct }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-[11px] font-medium text-slate-500 mb-1">{stage}</div>
      <div className="w-full bg-slate-100 h-2 rounded-full mb-1.5 overflow-hidden">
        <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.max(pct, 4)}%` }} />
      </div>
      <div className="text-base font-black text-slate-800">{count}</div>
    </div>
  );
}
