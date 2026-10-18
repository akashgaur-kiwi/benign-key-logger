import prisma from '../config/db.js';
import { scopeIds, actingUserId } from '../services/access.js';

const since = p => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (p === 'week') d.setDate(d.getDate() - 6);
  if (p === 'month') d.setDate(1);
  return d;
};

const names = async ids => {
  const us = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } });
  return Object.fromEntries(us.map(u => [u.id, u.fullName]));
};

export async function callSummary(req, res, next) {
  try {
    const ids = await scopeIds(req);
    const where = { timestamp: { gte: since(req.query.period) }, ...(ids && { userId: { in: ids } }) };
    const [total, byOutcome, byUser] = await Promise.all([
      prisma.callLog.aggregate({ where, _count: { id: true }, _sum: { durationSec: true } }),
      prisma.callLog.groupBy({ by: ['outcome'], where, _count: { id: true } }),
      prisma.callLog.groupBy({
        by: ['userId'], where, _count: { id: true }, _sum: { durationSec: true },
        orderBy: { _count: { id: 'desc' } }
      })
    ]);
    const connected = await prisma.callLog.groupBy({
      by: ['userId'], where: { ...where, outcome: 'CONNECTED' }, _count: { id: true }
    });
    const cMap = Object.fromEntries(connected.map(c => [c.userId, c._count.id]));
    const n = await names(byUser.map(u => u.userId));
    res.json({
      totalCalls: total._count.id,
      talkMinutes: Math.round((total._sum.durationSec || 0) / 60),
      outcomes: byOutcome.map(o => ({ outcome: o.outcome, count: o._count.id })),
      recruiters: byUser.map(u => ({
        userId: u.userId,
        name: n[u.userId] || 'Unknown',
        calls: u._count.id,
        connected: cMap[u.userId] || 0,
        minutes: Math.round((u._sum.durationSec || 0) / 60)
      }))
    });
  } catch (e) {
    next(e);
  }
}

export async function logCall(req, res, next) {
  try {
    const { userId, targetNumber, durationSec, outcome, timestamp } = req.body || {};
    if (!targetNumber || !outcome) return res.status(400).json({ error: 'targetNumber and outcome required' });
    const c = await prisma.callLog.create({
      data: {
        userId: await actingUserId(req, userId),
        targetNumber,
        durationSec: Number(durationSec) || 0,
        outcome,
        timestamp: timestamp ? new Date(timestamp) : undefined
      }
    });
    res.status(201).json(c);
  } catch (e) {
    next(e);
  }
}

export async function emailSummary(req, res, next) {
  try {
    const ids = await scopeIds(req);
    const where = { timestamp: { gte: since(req.query.period) }, ...(ids && { userId: { in: ids } }) };
    const [byCat, byUserCat] = await Promise.all([
      prisma.emailLog.groupBy({ by: ['category'], where, _count: { id: true } }),
      prisma.emailLog.groupBy({ by: ['userId', 'category'], where, _count: { id: true } })
    ]);
    const n = await names([...new Set(byUserCat.map(r => r.userId))]);
    const users = {};
    byUserCat.forEach(r => {
      const u = (users[r.userId] ||= { userId: r.userId, name: n[r.userId] || 'Unknown', CANDIDATE: 0, CLIENT: 0, INTERNAL: 0 });
      u[r.category] = r._count.id;
    });
    const t = Object.fromEntries(byCat.map(c => [c.category, c._count.id]));
    res.json({
      totals: { candidate: t.CANDIDATE || 0, client: t.CLIENT || 0, internal: t.INTERNAL || 0 },
      users: Object.values(users).sort((a, b) => b.CANDIDATE + b.CLIENT - (a.CANDIDATE + a.CLIENT))
    });
  } catch (e) {
    next(e);
  }
}

export async function logEmail(req, res, next) {
  try {
    const { userId, messageId, recipient, category, timestamp } = req.body || {};
    if (!messageId || !recipient || !category) return res.status(400).json({ error: 'messageId, recipient, category required' });
    const m = await prisma.emailLog.upsert({
      where: { messageId },
      update: {},
      create: {
        userId: await actingUserId(req, userId), messageId, recipient, category,
        timestamp: timestamp ? new Date(timestamp) : undefined
      }
    });
    res.status(201).json(m);
  } catch (e) {
    next(e);
  }
}
