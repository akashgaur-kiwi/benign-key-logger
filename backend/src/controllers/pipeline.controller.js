import prisma from '../config/db.js';
import { scopeIds, actingUserId, assertInScope, audit, httpError } from '../services/access.js';

const STAGES = ['SOURCED', 'SCREENED', 'TIER1_SUBMITTED', 'CLIENT_SUBMITTED', 'INTERVIEW', 'OFFER', 'START', 'REJECTED'];
const IV_STATUS = ['CONFIRMED', 'SCHEDULED', 'AWAITING_CONFIRMATION', 'FEEDBACK_PENDING', 'COMPLETED', 'CANCELLED'];

// Visible when the user (or their team) is the recruiter or the requirement's account manager
const scopeWhere = ids => ids ? { OR: [{ recruiterId: { in: ids } }, { requirement: { accountManagerId: { in: ids } } }] } : {};

async function ownedSubmission(req, id) {
  const s = await prisma.submission.findUnique({ where: { id }, include: { requirement: true } });
  if (!s) throw httpError(404, 'Submission not found');
  await assertInScope(req, [s.recruiterId, s.requirement.accountManagerId]);
  return s;
}

const dayRange = () => {
  const s = new Date();
  s.setHours(0, 0, 0, 0);
  return [s, new Date(s.getTime() + 86400000)];
};

export async function listSubmissions(req, res, next) {
  try {
    const { q, filter, stage } = req.query;
    const where = { AND: [scopeWhere(await scopeIds(req))] };
    if (stage) where.currentStage = stage;
    if (filter === 'interview') where.currentStage = 'INTERVIEW';
    if (filter === 'action') where.actionDueDate = { lt: dayRange()[1] };
    if (q) where.AND.push({ OR: [
      { candidateName: { contains: q, mode: 'insensitive' } },
      { requirement: { jobTitle: { contains: q, mode: 'insensitive' } } },
      { requirement: { clientName: { contains: q, mode: 'insensitive' } } }
    ] });
    const rows = await prisma.submission.findMany({
      where,
      orderBy: [{ actionDueDate: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'desc' }],
      take: 200,
      include: {
        requirement: { select: { id: true, jobTitle: true, clientName: true } },
        recruiter: { select: { id: true, fullName: true } }
      }
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function createSubmission(req, res, next) {
  try {
    const { requirementId, recruiterId, candidateName, candidateEmail, candidatePhone, nextAction, actionDueDate } = req.body || {};
    if (!requirementId || !candidateName) return res.status(400).json({ error: 'requirementId and candidateName required' });
    const rq = await prisma.requirement.findUnique({ where: { id: requirementId }, include: { assignees: true } });
    if (!rq) return res.status(404).json({ error: 'Requirement not found' });
    await assertInScope(req, [rq.accountManagerId, ...rq.assignees.map(a => a.recruiterId)]);
    const s = await prisma.submission.create({
      data: {
        requirementId,
        recruiterId: await actingUserId(req, recruiterId),
        candidateName, candidateEmail, candidatePhone, nextAction,
        actionDueDate: actionDueDate ? new Date(actionDueDate) : null,
        events: { create: { stage: 'SOURCED' } }
      }
    });
    await audit(req, 'SUBMISSION_CREATED', 'Submission', s.id, null, s);
    res.status(201).json(s);
  } catch (e) {
    next(e);
  }
}

export async function moveStage(req, res, next) {
  try {
    const { stage, notes, nextAction, actionDueDate } = req.body || {};
    if (!STAGES.includes(stage)) return res.status(400).json({ error: 'Invalid stage' });
    const before = await ownedSubmission(req, req.params.id);
    const s = await prisma.submission.update({
      where: { id: req.params.id },
      data: {
        currentStage: stage,
        nextAction,
        actionDueDate: actionDueDate ? new Date(actionDueDate) : undefined,
        events: { create: { stage, notes } }
      }
    });
    await audit(req, 'STAGE_CHANGED', 'Submission', s.id, { stage: before.currentStage }, { stage, notes });
    res.json(s);
  } catch (e) {
    next(e);
  }
}

export async function listInterviews(req, res, next) {
  try {
    const [s, e] = dayRange();
    const sc = scopeWhere(await scopeIds(req));
    const [rows, today, confirmed, awaiting, feedback] = await Promise.all([
      prisma.interview.findMany({
        where: { AND: [sc, { OR: [{ scheduledTime: { gte: s } }, { status: 'FEEDBACK_PENDING' }] }], status: { not: 'CANCELLED' } },
        orderBy: { scheduledTime: 'asc' },
        take: 100,
        include: { recruiter: { select: { fullName: true } } }
      }),
      prisma.interview.count({ where: { ...sc, scheduledTime: { gte: s, lt: e }, status: { not: 'CANCELLED' } } }),
      prisma.interview.count({ where: { ...sc, scheduledTime: { gte: s, lt: e }, status: 'CONFIRMED' } }),
      prisma.interview.count({ where: { ...sc, scheduledTime: { gte: s }, status: 'AWAITING_CONFIRMATION' } }),
      prisma.interview.count({ where: { ...sc, status: 'FEEDBACK_PENDING' } })
    ]);
    res.json({ stats: { today, confirmed, awaiting, feedback }, schedule: rows });
  } catch (e) {
    next(e);
  }
}

export async function createInterview(req, res, next) {
  try {
    const { submissionId, roundType, scheduledTime, status } = req.body || {};
    if (!submissionId || !scheduledTime) return res.status(400).json({ error: 'submissionId and scheduledTime required' });
    const sub = await ownedSubmission(req, submissionId);
    const iv = await prisma.interview.create({
      data: {
        submissionId,
        requirementId: sub.requirementId,
        recruiterId: sub.recruiterId,
        candidateName: sub.candidateName,
        jobTitle: sub.requirement.jobTitle,
        clientName: sub.requirement.clientName,
        roundType: roundType || 'Client Interview',
        scheduledTime: new Date(scheduledTime),
        status: IV_STATUS.includes(status) ? status : 'SCHEDULED'
      }
    });
    await audit(req, 'INTERVIEW_CREATED', 'Interview', iv.id, null, iv);
    res.status(201).json(iv);
  } catch (e) {
    next(e);
  }
}

export async function updateInterview(req, res, next) {
  try {
    const { status, scheduledTime } = req.body || {};
    if (status && !IV_STATUS.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const before = await prisma.interview.findUnique({ where: { id: req.params.id }, include: { requirement: true } });
    if (!before) return res.status(404).json({ error: 'Interview not found' });
    await assertInScope(req, [before.recruiterId, before.requirement.accountManagerId]);
    const iv = await prisma.interview.update({
      where: { id: req.params.id },
      data: {
        status,
        feedbackDue: status ? status === 'FEEDBACK_PENDING' : undefined,
        scheduledTime: scheduledTime ? new Date(scheduledTime) : undefined
      }
    });
    await audit(req, 'INTERVIEW_UPDATED', 'Interview', iv.id, { status: before.status, scheduledTime: before.scheduledTime }, { status: iv.status, scheduledTime: iv.scheduledTime });
    res.json(iv);
  } catch (e) {
    next(e);
  }
}
