import prisma from '../config/db.js';
import { notifyMany, adminAndHrIds } from '../services/notify.js';

export async function listNotifications(req, res, next) {
  try {
    const { unread } = req.query;
    const where = { userId: req.user.id, ...(unread === '1' ? { readAt: null } : {}) };
    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.notification.count({ where: { userId: req.user.id, readAt: null } })
    ]);
    res.json({ notifications: rows, unread: unreadCount });
  } catch (e) { next(e); }
}

export async function markRead(req, res, next) {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user.id, readAt: null },
      data: { readAt: new Date() }
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
}

export async function markAllRead(req, res, next) {
  try {
    await prisma.notification.updateMany({ where: { userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
    res.json({ ok: true });
  } catch (e) { next(e); }
}

// Broadcast an announcement to all active users (admin only).
export async function broadcast(req, res, next) {
  try {
    const { title, body } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title required' });
    const recipients = await prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    await notifyMany(recipients.map(r => r.id), 'ANNOUNCEMENT', title, body || null);
    res.status(201).json({ ok: true, sent: recipients.length });
  } catch (e) { next(e); }
}

export { adminAndHrIds };
