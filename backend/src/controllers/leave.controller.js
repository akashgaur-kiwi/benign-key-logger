import prisma from '../config/db.js';
import { scopeIds, assertInScope, actingUserId, audit, httpError } from '../services/access.js';
import { dateKey } from '../config/date.js';
import { notify } from '../services/notify.js';
import { title } from '../lib/text.js';

// Annual entitlement per paid leave type; UNPAID is not capped.
export const ENTITLEMENT = { CASUAL: 12, SICK: 8, EMERGENCY: 4, UNPAID: null };

const dayCount = (start, end) =>
  Math.floor((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) -
    Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000) + 1;

// Days already consumed (APPROVED) or reserved (PENDING) this calendar year, by type.
async function usageByType(userId, year = new Date().getFullYear()) {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));
  const rows = await prisma.leaveRequest.findMany({
    where: { userId, status: { in: ['APPROVED', 'PENDING'] }, startDate: { gte: yearStart, lte: yearEnd } },
    select: { type: true, days: true, status: true }
  });
  const used = {}, pending = {};
  for (const t of Object.keys(ENTITLEMENT)) { used[t] = 0; pending[t] = 0; }
  for (const r of rows) (r.status === 'APPROVED' ? used : pending)[r.type] += r.days;
  return { used, pending };
}

export function balanceFor(used, pending) {
  return Object.keys(ENTITLEMENT).map(type => {
    const entitled = ENTITLEMENT[type];
    return {
      type,
      entitled,
      used: used[type],
      pending: pending[type],
      remaining: entitled == null ? null : Math.max(0, entitled - used[type] - pending[type])
    };
  });
}

export async function leaveBalance(req, res, next) {
  try {
    const userId = await actingUserId(req, req.query.userId);
    const { used, pending } = await usageByType(userId);
    res.json({ userId, year: new Date().getFullYear(), balances: balanceFor(used, pending) });
  } catch (e) { next(e); }
}

export async function listLeaves(req, res, next) {
  try {
    const { status, mine } = req.query;
    const ids = await scopeIds(req);
    const where = {};
    if (mine === '1') where.userId = req.user.id;
    else if (ids) where.userId = { in: ids };
    if (status) where.status = status;
    const rows = await prisma.leaveRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
      include: {
        user: { select: { id: true, fullName: true, teamTag: true } },
        decidedBy: { select: { id: true, fullName: true } }
      }
    });
    res.json(rows);
  } catch (e) { next(e); }
}

export async function createLeave(req, res, next) {
  try {
    const { userId: reqUserId, type, startDate, endDate, reason } = req.body || {};
    if (!type || !ENTITLEMENT.hasOwnProperty(type)) return res.status(400).json({ error: 'Valid leave type required' });
    if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });
    const userId = await actingUserId(req, reqUserId);
    const start = dateKey(new Date(startDate));
    const end = dateKey(new Date(endDate));
    if (end < start) return res.status(400).json({ error: 'endDate cannot be before startDate' });
    const days = dayCount(start, end);

    if (ENTITLEMENT[type] != null) {
      const { used, pending } = await usageByType(userId, start.getUTCFullYear());
      const remaining = ENTITLEMENT[type] - used[type] - pending[type];
      if (days > remaining) {
        return res.status(400).json({ error: `Insufficient ${type} balance: ${remaining} day(s) left, ${days} requested` });
      }
    }

    const row = await prisma.leaveRequest.create({
      data: { userId, type, startDate: start, endDate: end, days, reason: reason || null },
      include: { user: { select: { fullName: true, managerId: true } } }
    });
    await audit(req, 'LEAVE_REQUESTED', 'LeaveRequest', row.id, null, { userId, type, start, end, days });
    // Notify the approver (reporting manager) that a request awaits their decision.
    await notify(row.user.managerId, 'LEAVE_REQUESTED', 'Leave request awaiting approval',
      `${row.user.fullName} requested ${days} day(s) of ${title(type)} leave.`, '/leave');
    res.status(201).json(row);
  } catch (e) { next(e); }
}

export async function decideLeave(req, res, next) {
  try {
    const { id } = req.params;
    const { decision, note } = req.body || {};
    if (!['APPROVED', 'REJECTED'].includes(decision)) return res.status(400).json({ error: 'decision must be APPROVED or REJECTED' });
    const row = await prisma.leaveRequest.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ error: 'Leave request not found' });
    if (row.status !== 'PENDING') return res.status(409).json({ error: `Request already ${row.status.toLowerCase()}` });
    await assertInScope(req, [row.userId]);
    if (row.userId === req.user.id) throw httpError(403, 'You cannot decide on your own leave request');

    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: { status: decision, decidedById: req.user.id, decidedAt: new Date(), decisionNote: note || null }
    });

    // Approved leave reflects on the attendance sheet for each covered day.
    if (decision === 'APPROVED') {
      for (let d = new Date(row.startDate); d <= row.endDate; d.setUTCDate(d.getUTCDate() + 1)) {
        const day = dateKey(d);
        await prisma.attendance.upsert({
          where: { userId_date: { userId: row.userId, date: day } },
          update: { status: 'ON_LEAVE', notes: `${row.type} leave` },
          create: { userId: row.userId, date: day, status: 'ON_LEAVE', notes: `${row.type} leave` }
        });
      }
    }
    await audit(req, `LEAVE_${decision}`, 'LeaveRequest', id, { status: 'PENDING' }, { status: decision, note });
    await notify(row.userId, decision === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
      `Leave ${decision === 'APPROVED' ? 'approved' : 'rejected'}`,
      `Your ${title(row.type)} leave (${row.days} day(s)) was ${decision.toLowerCase()}.${note ? ' Note: ' + note : ''}`, '/leave');
    res.json(updated);
  } catch (e) { next(e); }
}

export async function cancelLeave(req, res, next) {
  try {
    const { id } = req.params;
    const row = await prisma.leaveRequest.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ error: 'Leave request not found' });
    if (row.userId !== req.user.id) await assertInScope(req, [row.userId]);
    if (!['PENDING', 'APPROVED'].includes(row.status)) return res.status(409).json({ error: `Cannot cancel a ${row.status.toLowerCase()} request` });

    const updated = await prisma.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
    await audit(req, 'LEAVE_CANCELLED', 'LeaveRequest', id, { status: row.status }, { status: 'CANCELLED' });
    res.json(updated);
  } catch (e) { next(e); }
}
