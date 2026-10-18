import prisma from '../config/db.js';
import { scopeIds } from '../services/access.js';
import { dateKey } from '../config/date.js';

// Returns [start, end) for a daily/weekly/monthly window anchored on `date` (default today).
function windowFor(period, dateStr) {
  const base = dateStr ? new Date(dateStr) : new Date();
  base.setHours(0, 0, 0, 0);
  if (period === 'monthly') {
    const start = new Date(base.getFullYear(), base.getMonth(), 1);
    return [start, new Date(base.getFullYear(), base.getMonth() + 1, 1)];
  }
  if (period === 'weekly') {
    const day = (base.getDay() + 6) % 7; // Monday-start week
    const start = new Date(base); start.setDate(base.getDate() - day);
    const end = new Date(start); end.setDate(start.getDate() + 7);
    return [start, end];
  }
  const end = new Date(base); end.setDate(base.getDate() + 1);
  return [base, end];
}

const STATUSES = ['PRESENT', 'LATE', 'HALF_DAY', 'ON_LEAVE', 'ABSENT'];

export async function attendanceReport(req, res, next) {
  try {
    const period = ['daily', 'weekly', 'monthly'].includes(req.query.period) ? req.query.period : 'daily';
    const [start, end] = windowFor(period, req.query.date);
    const ids = await scopeIds(req);

    const [users, recs] = await Promise.all([
      prisma.user.findMany({ where: { isActive: true, ...(ids && { id: { in: ids } }) }, select: { id: true, fullName: true, teamTag: true } }),
      prisma.attendance.findMany({ where: { date: { gte: dateKey(start), lt: dateKey(end) }, ...(ids && { userId: { in: ids } }) } })
    ]);

    const byUser = {};
    for (const u of users) byUser[u.id] = { userId: u.id, name: u.fullName, team: u.teamTag, PRESENT: 0, LATE: 0, HALF_DAY: 0, ON_LEAVE: 0, ABSENT: 0, workingDays: 0 };
    for (const r of recs) {
      const row = byUser[r.userId];
      if (!row) continue;
      row[r.status] = (row[r.status] || 0) + 1;
      if (['PRESENT', 'LATE', 'HALF_DAY'].includes(r.status)) row.workingDays += 1;
    }

    const rows = Object.values(byUser);
    const totals = STATUSES.reduce((t, s) => ({ ...t, [s]: rows.reduce((n, r) => n + r[s], 0) }), {});
    res.json({ period, start, end, totals, rows: rows.sort((a, b) => a.name.localeCompare(b.name)) });
  } catch (e) { next(e); }
}

// kind: joining | exit | active
export async function employeeReport(req, res, next) {
  try {
    const kind = ['joining', 'exit', 'active'].includes(req.query.kind) ? req.query.kind : 'active';
    const ids = await scopeIds(req);
    const scope = ids ? { id: { in: ids } } : {};
    const select = {
      id: true, fullName: true, email: true, role: true, designation: true, department: true,
      teamTag: true, employeeCode: true, status: true, dateOfJoining: true, dateOfExit: true,
      manager: { select: { fullName: true } }
    };

    let where = scope;
    let orderBy = { fullName: 'asc' };
    if (kind === 'joining') {
      const [start, end] = windowFor(req.query.period || 'monthly', req.query.date);
      where = { ...scope, dateOfJoining: { gte: start, lt: end } };
      orderBy = { dateOfJoining: 'desc' };
    } else if (kind === 'exit') {
      where = { ...scope, dateOfExit: { not: null } };
      orderBy = { dateOfExit: 'desc' };
    } else {
      where = { ...scope, status: 'ACTIVE' };
    }

    const rows = await prisma.user.findMany({ where, orderBy, select });
    res.json({ kind, count: rows.length, rows });
  } catch (e) { next(e); }
}
