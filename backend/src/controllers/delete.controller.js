import prisma from '../config/db.js';
import { assertInScope, audit } from '../services/access.js';

// Deletable records: route segment -> prisma model, permission module, and the user(s) who own a row (for scope checks).
// Child rows (pipeline events, interviews, assignees...) are removed by the schema's onDelete: Cascade.
export const DELETABLE = {
  requirements: { model: 'requirement', module: 'REQUIREMENTS', entity: 'Requirement', owners: r => [r.accountManagerId] },
  pipeline: { model: 'submission', module: 'PIPELINE', entity: 'Submission', owners: r => [r.recruiterId] },
  interviews: { model: 'interview', module: 'INTERVIEWS', entity: 'Interview', owners: r => [r.recruiterId] },
  calls: { model: 'callLog', module: 'CALL_ACTIVITY', entity: 'CallLog', owners: r => [r.userId] },
  emails: { model: 'emailLog', module: 'OUTLOOK_ACTIVITY', entity: 'EmailLog', owners: r => [r.userId] },
  attendance: { model: 'attendance', module: 'ATTENDANCE', entity: 'Attendance', owners: r => [r.userId] },
  leaves: { model: 'leaveRequest', module: 'LEAVE', entity: 'LeaveRequest', owners: r => [r.userId] },
  'client-activity': { model: 'clientInteraction', module: 'CLIENT_ACTIVITY', entity: 'ClientInteraction', owners: r => [r.userId] }
};

export const deleteRecord = kind => async (req, res, next) => {
  try {
    const t = DELETABLE[kind];
    const row = await prisma[t.model].findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: `${t.entity} not found` });
    await assertInScope(req, t.owners(row));
    await prisma[t.model].delete({ where: { id: row.id } });
    // An approved leave stamped ON_LEAVE attendance rows; drop them so those days are free again.
    if (kind === 'leaves' && row.status === 'APPROVED') {
      await prisma.attendance.deleteMany({
        where: { userId: row.userId, status: 'ON_LEAVE', date: { gte: row.startDate, lte: row.endDate } }
      });
    }
    await audit(req, `${t.entity.toUpperCase()}_DELETED`, t.entity, row.id, row, null);
    res.json({ ok: true });
  } catch (e) { next(e); }
};

// Hard-deletes a user and all their own data (cascade). Requirements they manage must be reassigned or deleted first.
export async function deleteUser(req, res, next) {
  try {
    const u = await prisma.user.findUnique({ where: { id: req.params.id }, include: { _count: { select: { managedReqs: true } } } });
    if (!u) return res.status(404).json({ error: 'User not found' });
    if (u.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
    if (u._count.managedReqs) {
      return res.status(409).json({ error: `${u.fullName} manages ${u._count.managedReqs} requirement(s). Reassign or delete them first.` });
    }
    await prisma.$transaction([
      prisma.user.updateMany({ where: { managerId: u.id }, data: { managerId: null } }),
      prisma.user.delete({ where: { id: u.id } })
    ]);
    await audit(req, 'USER_DELETED', 'User', u.id, { email: u.email, fullName: u.fullName, role: u.role }, null);
    res.json({ ok: true });
  } catch (e) { next(e); }
}

export async function deleteNotification(req, res, next) {
  try {
    const { count } = await prisma.notification.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
    if (!count) return res.status(404).json({ error: 'Notification not found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
}
