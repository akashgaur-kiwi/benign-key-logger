import jwt from 'jsonwebtoken';
import prisma from '../config/db.js';
import { accessInclude, blockReason, effectivePerms } from '../services/access.js';

// Verifies JWT and re-checks account status + tokenVersion on every request
export async function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  let p;
  try {
    p = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
  try {
    const u = await prisma.user.findUnique({ where: { id: p.id }, include: accessInclude });
    const why = blockReason(u);
    if (why || (p.tv ?? 0) !== u.tokenVersion) return res.status(401).json({ error: why || 'Session expired' });
    req.user = { id: u.id, role: u.role, appRole: u.appRole?.name, perms: effectivePerms(u) };
    next();
  } catch (e) {
    next(e);
  }
}

export function agentKey(req, res, next) {
  if (!process.env.AGENT_API_KEY || req.headers['x-agent-key'] !== process.env.AGENT_API_KEY) {
    return res.status(401).json({ error: 'Invalid agent key' });
  }
  next();
}
