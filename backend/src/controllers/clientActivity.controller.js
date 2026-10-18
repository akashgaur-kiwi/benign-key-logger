import prisma from '../config/db.js';
import { scopeIds, actingUserId, audit } from '../services/access.js';

const TYPES = ['CALL', 'MEETING', 'NEW_CLIENT'];

export async function logClientInteraction(req, res, next) {
  try {
    const { userId: reqUserId, clientName, type, notes } = req.body || {};
    if (!TYPES.includes(type)) return res.status(400).json({ error: 'type must be CALL, MEETING or NEW_CLIENT' });
    if (!clientName) return res.status(400).json({ error: 'clientName required' });
    const userId = await actingUserId(req, reqUserId);
    const row = await prisma.clientInteraction.create({ data: { userId, clientName, type, notes: notes || null } });
    await audit(req, 'CLIENT_INTERACTION_LOGGED', 'ClientInteraction', row.id, null, { userId, clientName, type });
    res.status(201).json(row);
  } catch (e) { next(e); }
}

// Per-BDM productivity for the current month: calls, meetings, new clients, plus requirement & delivery activity.
export async function bdmSummary(req, res, next) {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const ids = await scopeIds(req);

    const bdms = await prisma.user.findMany({
      where: { role: 'ACCOUNT_MANAGER', isActive: true, ...(ids && { id: { in: ids } }) },
      select: {
        id: true, fullName: true, teamTag: true,
        clientInteractions: { where: { timestamp: { gte: monthStart } }, select: { type: true } },
        managedReqs: { select: { receivedAt: true, status: true, submissions: { select: { currentStage: true } } } }
      }
    });

    const rank = ['CLIENT_SUBMITTED', 'INTERVIEW', 'OFFER', 'START'];
    const rows = bdms.map(b => {
      const calls = b.clientInteractions.filter(i => i.type === 'CALL').length;
      const meetings = b.clientInteractions.filter(i => i.type === 'MEETING').length;
      const newClients = b.clientInteractions.filter(i => i.type === 'NEW_CLIENT').length;
      const newReqs = b.managedReqs.filter(r => r.receivedAt >= monthStart).length;
      const existingReqs = b.managedReqs.filter(r => r.receivedAt < monthStart && r.status === 'OPEN').length;
      const subs = b.managedReqs.flatMap(r => r.submissions);
      const atLeast = st => subs.filter(s => rank.indexOf(s.currentStage) >= rank.indexOf(st)).length;
      return {
        id: b.id, name: b.fullName, team: b.teamTag,
        calls, meetings, newClients, newReqs, existingReqs,
        placements: atLeast('OFFER'), starts: atLeast('START')
      };
    });

    const totals = rows.reduce((t, r) => ({
      calls: t.calls + r.calls, meetings: t.meetings + r.meetings, newClients: t.newClients + r.newClients,
      newReqs: t.newReqs + r.newReqs, starts: t.starts + r.starts, placements: t.placements + r.placements
    }), { calls: 0, meetings: 0, newClients: 0, newReqs: 0, starts: 0, placements: 0 });

    res.json({ month: monthStart, totals, rows: rows.sort((a, b) => b.starts - a.starts || b.newClients - a.newClients) });
  } catch (e) { next(e); }
}
