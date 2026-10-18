import prisma from '../config/db.js';

export async function listAudit(req, res, next) {
  try {
    const { actorId, entity, entityId, action, from, to } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.min(100, Number(req.query.size) || 50);
    const where = {};
    if (actorId) where.actorId = actorId;
    if (entity) where.entity = entity;
    if (entityId) where.entityId = entityId;
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (from || to) where.createdAt = { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined };
    const [rows, total, distinct] = await Promise.all([
      prisma.auditLog.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * size, take: size,
        include: { actor: { select: { id: true, fullName: true, email: true } } }
      }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } })
    ]);
    const ids = [...new Set(rows.filter(r => r.entity === 'User' && r.entityId).map(r => r.entityId))];
    const targets = Object.fromEntries((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }))
      .map(u => [u.id, u.fullName]));
    res.json({
      total, page, size,
      actions: distinct.map(d => d.action),
      rows: rows.map(r => ({ ...r, targetName: targets[r.entityId] || null }))
    });
  } catch (e) {
    next(e);
  }
}
