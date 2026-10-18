import prisma from '../config/db.js';
import { dateKey } from '../config/date.js';
import { balanceFor, ENTITLEMENT } from './leave.controller.js';

// Personal dashboard: profile, attendance history, leave balance/requests, and login/logout records.
export async function myDashboard(req, res, next) {
  try {
    const userId = req.user.id;
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const yearStart = new Date(Date.UTC(new Date().getFullYear(), 0, 1));

    const [user, attendance, leaves, leaveRows] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true, fullName: true, email: true, role: true, designation: true, phone: true,
          department: true, teamTag: true, employeeCode: true, dateOfJoining: true, dateOfExit: true,
          status: true, lastLoginAt: true, manager: { select: { fullName: true } }
        }
      }),
      prisma.attendance.findMany({ where: { userId, date: { gte: dateKey(since) } }, orderBy: { date: 'desc' } }),
      prisma.leaveRequest.findMany({
        where: { userId, status: { in: ['APPROVED', 'PENDING'] }, startDate: { gte: yearStart } },
        select: { type: true, days: true, status: true }
      }),
      prisma.leaveRequest.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 10 })
    ]);

    const used = {}, pending = {};
    for (const t of Object.keys(ENTITLEMENT)) { used[t] = 0; pending[t] = 0; }
    for (const l of leaves) (l.status === 'APPROVED' ? used : pending)[l.type] += l.days;

    const logins = attendance
      .filter(a => a.clockIn)
      .map(a => ({ date: a.date, clockIn: a.clockIn, clockOut: a.clockOut, status: a.status, isLate: a.isLate }));

    res.json({
      profile: user,
      balances: balanceFor(used, pending),
      attendance,
      logins,
      leaveRequests: leaveRows
    });
  } catch (e) { next(e); }
}
