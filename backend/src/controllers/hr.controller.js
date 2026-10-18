import prisma from '../config/db.js';
import { scopeIds, assertInScope, actingUserId, audit } from '../services/access.js';
import { dateKey, deriveStatus, workedMinutes } from '../config/date.js';
import { notify } from '../services/notify.js';

export async function listEmployees(req, res, next) {
  try {
    const { q, role } = req.query;
    const ids = await scopeIds(req);
    const where = ids ? { id: { in: ids } } : {};
    if (role) where.role = role;
    if (q) where.OR = [
      { fullName: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { employeeCode: { contains: q, mode: 'insensitive' } }
    ];
    const rows = await prisma.user.findMany({
      where,
      orderBy: { fullName: 'asc' },
      select: {
        id: true, fullName: true, email: true, role: true, department: true, employeeCode: true,
        designation: true, phone: true, dateOfJoining: true, dateOfExit: true,
        teamTag: true, isActive: true, isOnline: true, productivityScore: true, createdAt: true,
        manager: { select: { id: true, fullName: true } },
        _count: { select: { subordinates: true } }
      }
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function attendanceSummary(req, res, next) {
  try {
    const d = dateKey();
    const ids = await scopeIds(req);
    const [users, recs] = await Promise.all([
      prisma.user.findMany({ where: { isActive: true, ...(ids && { id: { in: ids } }) }, select: { id: true, fullName: true, teamTag: true, isOnline: true } }),
      prisma.attendance.findMany({ where: { date: d } })
    ]);
    const byUser = Object.fromEntries(recs.map(r => [r.userId, r]));
    const rows = users.map(u => {
      const a = byUser[u.id];
      return {
        id: a?.id || null, userId: u.id, name: u.fullName, team: u.teamTag, isOnline: u.isOnline,
        status: a?.status || 'ABSENT', clockIn: a?.clockIn || null, clockOut: a?.clockOut || null, isLate: a?.isLate || false
      };
    });
    const count = s => rows.filter(r => r.status === s).length;
    const present = rows.filter(r => ['PRESENT', 'LATE', 'HALF_DAY'].includes(r.status)).length;
    res.json({
      date: d,
      total: rows.length,
      present,
      pct: rows.length ? Math.round((present / rows.length) * 100) : 0,
      breakdown: { PRESENT: count('PRESENT'), LATE: count('LATE'), HALF_DAY: count('HALF_DAY'), ON_LEAVE: count('ON_LEAVE'), ABSENT: count('ABSENT') },
      rows: rows.sort((a, b) => (a.clockIn ? new Date(a.clockIn) : Infinity) - (b.clockIn ? new Date(b.clockIn) : Infinity))
    });
  } catch (e) {
    next(e);
  }
}

export async function upsertAttendance(req, res, next) {
  try {
    const { userId, date, status, notes } = req.body || {};
    if (!userId || !status) return res.status(400).json({ error: 'userId and status required' });
    await assertInScope(req, [userId]);
    const d = date ? new Date(date) : dateKey();
    const a = await prisma.attendance.upsert({
      where: { userId_date: { userId, date: d } },
      update: { status, notes, isLate: status === 'LATE' },
      create: { userId, date: d, status, notes, isLate: status === 'LATE' }
    });
    await audit(req, 'ATTENDANCE_SET', 'Attendance', a.id, null, { userId, date: d, status, notes });
    res.json(a);
  } catch (e) {
    next(e);
  }
}

// Clock in / out for a day; status is auto-derived from worked hours per the attendance rules.
// Called by the user (self), an admin, or automatically on login. Skips days already on approved leave.
export async function clockAttendance(req, res, next) {
  try {
    const { userId: reqUserId, event } = req.body || {};
    if (!['in', 'out'].includes(event)) return res.status(400).json({ error: "event must be 'in' or 'out'" });
    const userId = await actingUserId(req, reqUserId);
    return res.json(await applyClock(userId, event, new Date()));
  } catch (e) { next(e); }
}

// Shared clock logic reused by the login hook. Returns the attendance row.
export async function applyClock(userId, event, when = new Date()) {
  const d = dateKey(when);
  const existing = await prisma.attendance.findUnique({ where: { userId_date: { userId, date: d } } });
  if (existing?.status === 'ON_LEAVE') return existing; // don't overwrite approved leave
  const clockIn = event === 'in' ? (existing?.clockIn || when) : (existing?.clockIn || null);
  const clockOut = event === 'out' ? when : (existing?.clockOut || null);
  const { status, isLate } = deriveStatus(clockIn, clockOut);
  return prisma.attendance.upsert({
    where: { userId_date: { userId, date: d } },
    update: { clockIn, clockOut, status, isLate },
    create: { userId, date: d, clockIn, clockOut, status, isLate }
  });
}

export async function recruiterLeaderboard(req, res, next) {
  try {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const ids = await scopeIds(req);
    const recs = await prisma.user.findMany({
      where: { role: 'RECRUITER', isActive: true, ...(ids && { id: { in: ids } }) },
      select: {
        id: true, fullName: true, teamTag: true, isOnline: true, productivityScore: true,
        submissions: { where: { createdAt: { gte: monthStart } }, select: { currentStage: true } },
        _count: { select: { callLogs: { where: { timestamp: { gte: d } } } } }
      }
    });
    const rank = ['TIER1_SUBMITTED', 'CLIENT_SUBMITTED', 'INTERVIEW', 'OFFER', 'START'];
    const atLeast = (s, st) => s.filter(x => rank.indexOf(x.currentStage) >= rank.indexOf(st)).length;

    const rows = recs.map(r => {
      const s = r.submissions;
      const client = atLeast(s, 'CLIENT_SUBMITTED');
      const conv = s.length ? Math.round((client / s.length) * 1000) / 10 : 0;
      const alerts = [];
      if (s.length && conv < 20) alerts.push('Low client conversion');
      if (r._count.callLogs < 10) alerts.push('Low call volume today');
      if (!s.length) alerts.push('No submissions this month');
      return {
        id: r.id, name: r.fullName, team: r.teamTag, isOnline: r.isOnline, score: r.productivityScore,
        sourced: s.length, tier1: atLeast(s, 'TIER1_SUBMITTED'), client,
        interviews: atLeast(s, 'INTERVIEW'), starts: atLeast(s, 'START'),
        callsToday: r._count.callLogs, conversion: conv, alerts
      };
    });
    res.json(rows.sort((a, b) => b.client - a.client || b.score - a.score));
  } catch (e) {
    next(e);
  }
}
