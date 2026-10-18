import prisma from '../config/db.js';
import { dateKey } from '../config/date.js';

const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '0.0%');

const ago = d => {
  if (!d) return 'Never';
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
};

export async function getCommandCenterData(req, res, next) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 86400000);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      totalEmployees,
      onlineEmployees,
      presentToday,
      openReqs,
      clientSubmissionsToday,
      startsThisMonth,
      pipelineGroups,
      todayInterviews,
      criticalReqs,
      priorityReqs,
      followUpsDueToday,
      upcomingInterviewsCount,
      lastCeipal,
      lastEmail,
      lastCall
    ] = await Promise.all([
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isActive: true, isOnline: true } }),
      prisma.attendance.count({ where: { date: dateKey(), status: { in: ['PRESENT', 'LATE', 'HALF_DAY'] } } }),
      prisma.requirement.count({ where: { status: 'OPEN' } }),
      prisma.submission.count({
        where: {
          currentStage: { in: ['CLIENT_SUBMITTED', 'INTERVIEW', 'OFFER', 'START'] },
          updatedAt: { gte: today }
        }
      }),
      prisma.submission.count({ where: { currentStage: 'START', updatedAt: { gte: monthStart } } }),
      prisma.submission.groupBy({ by: ['currentStage'], _count: { id: true } }),
      prisma.interview.findMany({
        where: { scheduledTime: { gte: today }, status: { notIn: ['CANCELLED', 'COMPLETED'] } },
        orderBy: { scheduledTime: 'asc' },
        take: 4
      }),
      prisma.requirement.count({ where: { priority: 'CRITICAL', status: 'OPEN' } }),
      prisma.requirement.count({ where: { priority: { in: ['HOT', 'CRITICAL'] }, status: 'OPEN' } }),
      prisma.submission.count({ where: { actionDueDate: { gte: today, lt: tomorrow } } }),
      prisma.interview.count({
        where: { scheduledTime: { gte: today, lt: tomorrow }, status: { notIn: ['CANCELLED', 'COMPLETED'] } }
      }),
      prisma.ceipalLog.findFirst({ orderBy: { timestamp: 'desc' }, select: { timestamp: true } }),
      prisma.emailLog.findFirst({ orderBy: { timestamp: 'desc' }, select: { timestamp: true } }),
      prisma.callLog.findFirst({ orderBy: { timestamp: 'desc' }, select: { timestamp: true } })
    ]);

    const c = { SOURCED: 0, SCREENED: 0, TIER1_SUBMITTED: 0, CLIENT_SUBMITTED: 0, INTERVIEW: 0, OFFER: 0, START: 0 };
    pipelineGroups.forEach(g => { if (g.currentStage in c) c[g.currentStage] = g._count.id; });

    // cumulative counts: a candidate at a later stage has passed earlier ones
    const reached = s => {
      const keys = Object.keys(c);
      return keys.slice(keys.indexOf(s)).reduce((t, k) => t + c[k], 0);
    };

    const voipLive = lastCall && Date.now() - new Date(lastCall.timestamp).getTime() < 15 * 60000;

    res.json({
      morningBrief: {
        priorityRolesNeedingAction: priorityReqs,
        criticalReqsCount: criticalReqs,
        followUpsDueToday,
        upcomingInterviewsCount
      },
      stats: {
        teamOnline: `${onlineEmployees}/${totalEmployees}`,
        attendancePct: totalEmployees ? Math.round((presentToday / totalEmployees) * 100) : 0,
        openReqs,
        clientSubmissionsToday,
        startsThisMonth
      },
      funnel: {
        stages: [
          { stage: 'Sourced', count: c.SOURCED },
          { stage: 'Screened', count: c.SCREENED },
          { stage: 'Tier-1', count: c.TIER1_SUBMITTED },
          { stage: 'Client', count: c.CLIENT_SUBMITTED },
          { stage: 'Interview', count: c.INTERVIEW },
          { stage: 'Offer', count: c.OFFER },
          { stage: 'Start', count: c.START }
        ],
        conversions: {
          resumeToTier1: pct(reached('TIER1_SUBMITTED'), reached('SOURCED')),
          clientToInterview: pct(reached('INTERVIEW'), reached('CLIENT_SUBMITTED')),
          offerToStart: pct(reached('START'), reached('OFFER'))
        }
      },
      todaySchedule: todayInterviews,
      systemStatus: {
        ceipal: ago(lastCeipal?.timestamp),
        outlook: ago(lastEmail?.timestamp),
        voip: voipLive ? 'Live' : 'Idle',
        desktopAgentsOnline: onlineEmployees
      }
    });
  } catch (err) {
    next(err);
  }
}
