import prisma from '../config/db.js';
import { scopeIds, actingUserId, assertInScope, audit } from '../services/access.js';

const age = r => ({ ...r, ageInDays: Math.floor((Date.now() - new Date(r.receivedAt).getTime()) / 86400000) });

export async function listRequirements(req, res, next) {
  try {
    const { status, priority, q } = req.query;
    const where = { AND: [] };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (q) where.AND.push({ OR: [
      { jobTitle: { contains: q, mode: 'insensitive' } },
      { clientName: { contains: q, mode: 'insensitive' } }
    ] });
    const ids = await scopeIds(req);
    if (ids) where.AND.push({ OR: [
      { accountManagerId: { in: ids } },
      { assignees: { some: { recruiterId: { in: ids } } } }
    ] });
    const rows = await prisma.requirement.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { receivedAt: 'asc' }],
      include: {
        accountManager: { select: { id: true, fullName: true } },
        assignees: { include: { recruiter: { select: { id: true, fullName: true } } } },
        _count: { select: { submissions: true } }
      }
    });
    res.json(rows.map(age));
  } catch (e) {
    next(e);
  }
}

export async function createRequirement(req, res, next) {
  try {
    const { jobTitle, clientName, accountManagerId, priority, openPositions, description } = req.body || {};
    if (!jobTitle || !clientName) return res.status(400).json({ error: 'jobTitle and clientName required' });
    const r = await prisma.requirement.create({
      data: {
        jobTitle,
        clientName,
        accountManagerId: await actingUserId(req, accountManagerId),
        priority: priority || 'NORMAL',
        openPositions: Number(openPositions) || 1,
        description
      }
    });
    await audit(req, 'REQUIREMENT_CREATED', 'Requirement', r.id, null, r);
    res.status(201).json(age(r));
  } catch (e) {
    next(e);
  }
}

export async function updateRequirement(req, res, next) {
  try {
    const { jobTitle, clientName, priority, status, openPositions, description, accountManagerId } = req.body || {};
    const before = await ownedRequirement(req);
    if (accountManagerId) await actingUserId(req, accountManagerId);
    const r = await prisma.requirement.update({
      where: { id: req.params.id },
      data: {
        jobTitle, clientName, priority, status, description, accountManagerId,
        openPositions: openPositions != null ? Number(openPositions) : undefined
      }
    });
    await audit(req, 'REQUIREMENT_UPDATED', 'Requirement', r.id, before, r);
    res.json(age(r));
  } catch (e) {
    next(e);
  }
}

async function ownedRequirement(req) {
  const r = await prisma.requirement.findUnique({ where: { id: req.params.id }, include: { assignees: true } });
  if (!r) throw Object.assign(new Error('Record not found'), { status: 404 });
  await assertInScope(req, [r.accountManagerId, ...r.assignees.map(a => a.recruiterId)]);
  const { assignees, ...rest } = r;
  return rest;
}

export async function assignRecruiters(req, res, next) {
  try {
    const ids = req.body?.recruiterIds;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'recruiterIds required' });
    await ownedRequirement(req);
    await prisma.requirementAssignee.createMany({
      data: ids.map(recruiterId => ({ requirementId: req.params.id, recruiterId })),
      skipDuplicates: true
    });
    await audit(req, 'RECRUITERS_ASSIGNED', 'Requirement', req.params.id, null, { recruiterIds: ids });
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
}

export async function getAccountManagers(req, res, next) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [ams, openByClient, pending] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'ACCOUNT_MANAGER', isActive: true },
        select: {
          id: true,
          fullName: true,
          managedReqs: {
            select: {
              clientName: true, priority: true, status: true, createdAt: true, updatedAt: true,
              submissions: { select: { currentStage: true } }
            }
          }
        }
      }),
      prisma.requirement.groupBy({
        by: ['clientName'],
        where: { status: 'OPEN' },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 6
      }),
      prisma.clientActionPending.findMany({ orderBy: { dueInHours: 'asc' }, take: 6 })
    ]);

    const rank = ['TIER1_SUBMITTED', 'CLIENT_SUBMITTED', 'INTERVIEW', 'OFFER', 'START'];
    const atLeast = (subs, s) => subs.filter(x => rank.indexOf(x.currentStage) >= rank.indexOf(s)).length;

    const list = ams.map(a => {
      const reqs = a.managedReqs;
      const subs = reqs.flatMap(r => r.submissions);
      return {
        id: a.id,
        name: a.fullName,
        accounts: [...new Set(reqs.map(r => r.clientName))].join(', '),
        newReq: reqs.filter(r => r.createdAt >= today).length,
        oldWorked: reqs.filter(r => r.createdAt < today && r.updatedAt >= today).length,
        hot: reqs.filter(r => r.status === 'OPEN' && r.priority !== 'NORMAL').length,
        tier1: atLeast(subs, 'TIER1_SUBMITTED'),
        clientSubmits: atLeast(subs, 'CLIENT_SUBMITTED'),
        interviews: atLeast(subs, 'INTERVIEW'),
        offers: atLeast(subs, 'OFFER'),
        starts: atLeast(subs, 'START')
      };
    });

    const max = openByClient[0]?._count.id || 1;
    res.json({
      managers: list,
      byAccount: openByClient.map(g => ({ client: g.clientName, count: g._count.id, width: `${Math.round((g._count.id / max) * 100)}%` })),
      pendingActions: pending.map(p => ({
        title: p.actionType,
        sub: [p.clientName, p.candidateRef].filter(Boolean).join(' • '),
        due: p.dueInHours < 24 ? `${p.dueInHours}h` : `${Math.round(p.dueInHours / 24)}d`
      }))
    });
  } catch (e) {
    next(e);
  }
}
