import crypto from 'crypto';
import prisma from '../config/db.js';
import { DEFAULT_ROLES, SCOPE_RANK } from '../config/permissions.js';

export const hashToken = t => crypto.createHash('sha256').update(t).digest('hex');

// No mail service yet: link is returned to the admin and logged
export async function issueToken(userId, type, hours) {
  const raw = crypto.randomBytes(32).toString('hex');
  await prisma.authToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.authToken.create({
    data: { userId, type, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + hours * 3600000) }
  });
  const base = process.env.APP_URL || 'http://localhost:5173';
  const link = `${base}/${type === 'INVITE' ? 'accept-invite' : 'reset-password'}?token=${raw}`;
  console.log(`[access] ${type} link for ${userId}: ${link}`);
  return link;
}

// Role perms + user grants - user denies => { "MODULE:ACTION": scope }
export function effectivePerms(user) {
  const out = {};
  for (const p of user.appRole?.permissions || []) out[`${p.module}:${p.action}`] = p.scope;
  for (const o of user.permOverrides || []) {
    const k = `${o.module}:${o.action}`;
    if (!o.allow) delete out[k];
    else if (!out[k] || SCOPE_RANK[o.scope] > SCOPE_RANK[out[k]]) out[k] = o.scope;
  }
  return out;
}

export const accessInclude = { appRole: { include: { permissions: true } }, permOverrides: true };

export function blockReason(u) {
  if (!u) return 'Invalid credentials';
  if (u.status !== 'ACTIVE') return {
    INVITED: 'Invitation not accepted yet',
    PENDING_APPROVAL: 'Account awaiting admin approval',
    SUSPENDED: 'Account suspended',
    REVOKED: 'Access revoked'
  }[u.status];
  if (u.accessExpiresAt && u.accessExpiresAt < new Date()) return 'Access expired';
  return null;
}

export async function teamIds(rootId) {
  const ids = [rootId];
  let frontier = [rootId];
  while (frontier.length) {
    const kids = await prisma.user.findMany({ where: { managerId: { in: frontier } }, select: { id: true } });
    frontier = kids.map(k => k.id).filter(id => !ids.includes(id));
    ids.push(...frontier);
  }
  return ids;
}

// User ids visible for the request's scope; null = unrestricted
export async function scopeIds(req, scope = req.scope) {
  if (!scope || scope === 'ALL') return null;
  if (scope === 'OWN') return [req.user.id];
  return teamIds(req.user.id);
}

export const httpError = (status, msg) => Object.assign(new Error(msg), { status });
const forbid = msg => httpError(403, msg);

export async function actingUserId(req, requested) {
  if (!requested || requested === req.user.id) return req.user.id;
  const ids = await scopeIds(req);
  if (ids && !ids.includes(requested)) throw forbid('Not allowed to act for this user');
  return requested;
}

export async function assertInScope(req, ownerIds) {
  const ids = await scopeIds(req);
  if (ids && !ownerIds.some(id => ids.includes(id))) throw forbid('Forbidden');
}

export async function audit(req, action, entity, entityId, before, after) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: req?.user?.id || null, action, entity, entityId: entityId || null,
        before: before ?? undefined, after: after ?? undefined, ip: req?.ip || null
      }
    });
  } catch (e) {
    console.error('audit failed', e.message);
  }
}

// Idempotent: creates system roles, grants any newly-added default perms, and links users with no access role
export async function ensureSystemRoles() {
  for (const [name, def] of Object.entries(DEFAULT_ROLES)) {
    let role = await prisma.appRole.findUnique({ where: { name }, include: { permissions: true } });
    if (!role) {
      role = await prisma.appRole.create({
        data: { name, description: def.description, isSystem: true, permissions: { create: def.perms } },
        include: { permissions: true }
      });
    } else {
      // Additively grant default perms the role is missing (e.g. after a new module ships). Never removes admin customizations.
      const have = new Set(role.permissions.map(p => `${p.module}:${p.action}`));
      const missing = def.perms.filter(p => !have.has(`${p.module}:${p.action}`));
      if (missing.length) {
        await prisma.rolePermission.createMany({ data: missing.map(p => ({ ...p, roleId: role.id })), skipDuplicates: true });
      }
    }
    await prisma.user.updateMany({ where: { role: name, appRoleId: null }, data: { appRoleId: role.id } });
  }
}
