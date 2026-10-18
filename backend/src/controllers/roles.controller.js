import prisma from '../config/db.js';
import { ACTIONS, MODULES, SCOPES } from '../config/permissions.js';
import { audit } from '../services/access.js';

const bad = (status, msg) => Object.assign(new Error(msg), { status });
const inc = { permissions: { select: { module: true, action: true, scope: true } }, _count: { select: { users: true } } };

function clean(perms) {
  if (!Array.isArray(perms)) throw bad(400, 'permissions array required');
  const seen = new Set();
  return perms.filter(p => {
    if (!MODULES.includes(p.module) || !ACTIONS.includes(p.action) || !SCOPES.includes(p.scope)) {
      throw bad(400, `Invalid permission ${p.module}:${p.action}:${p.scope}`);
    }
    const k = `${p.module}:${p.action}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map(({ module, action, scope }) => ({ module, action, scope }));
}

export function catalog(req, res) {
  res.json({ modules: MODULES, actions: ACTIONS, scopes: SCOPES });
}

export async function listRoles(req, res, next) {
  try {
    res.json(await prisma.appRole.findMany({ orderBy: [{ isSystem: 'desc' }, { name: 'asc' }], include: inc }));
  } catch (e) {
    next(e);
  }
}

export async function createRole(req, res, next) {
  try {
    const { name, description, permissions, cloneFromId } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });
    let perms = permissions ? clean(permissions) : [];
    if (cloneFromId) {
      const src = await prisma.appRole.findUnique({ where: { id: cloneFromId }, include: { permissions: true } });
      if (!src) return res.status(404).json({ error: 'Source role not found' });
      perms = src.permissions.map(({ module, action, scope }) => ({ module, action, scope }));
    }
    const r = await prisma.appRole.create({
      data: { name: name.trim().toUpperCase().replace(/\s+/g, '_'), description, permissions: { create: perms } },
      include: inc
    });
    await audit(req, 'ROLE_CREATED', 'AppRole', r.id, null, { name: r.name, permissions: perms });
    res.status(201).json(r);
  } catch (e) {
    next(e);
  }
}

export async function updateRole(req, res, next) {
  try {
    const r = await prisma.appRole.findUnique({ where: { id: req.params.id }, include: inc });
    if (!r) return res.status(404).json({ error: 'Role not found' });
    if (r.name === 'OWNER_ADMIN') return res.status(400).json({ error: 'Owner admin role cannot be edited' });
    const { name, description, permissions } = req.body || {};
    if (r.isSystem && name && name !== r.name) return res.status(400).json({ error: 'System roles cannot be renamed' });
    const perms = permissions ? clean(permissions) : null;
    await prisma.$transaction([
      prisma.appRole.update({
        where: { id: r.id },
        data: { description, name: !r.isSystem && name ? name.trim().toUpperCase().replace(/\s+/g, '_') : undefined }
      }),
      ...(perms ? [
        prisma.rolePermission.deleteMany({ where: { roleId: r.id } }),
        prisma.rolePermission.createMany({ data: perms.map(p => ({ ...p, roleId: r.id })) })
      ] : [])
    ]);
    const after = await prisma.appRole.findUnique({ where: { id: r.id }, include: inc });
    await audit(req, 'ROLE_UPDATED', 'AppRole', r.id,
      { name: r.name, permissions: r.permissions }, { name: after.name, permissions: after.permissions });
    res.json(after);
  } catch (e) {
    next(e);
  }
}

export async function deleteRole(req, res, next) {
  try {
    const r = await prisma.appRole.findUnique({ where: { id: req.params.id }, include: inc });
    if (!r) return res.status(404).json({ error: 'Role not found' });
    if (r.isSystem) return res.status(400).json({ error: 'System roles cannot be deleted' });
    if (r._count.users) return res.status(400).json({ error: `Role is assigned to ${r._count.users} user(s)` });
    await prisma.appRole.delete({ where: { id: r.id } });
    await audit(req, 'ROLE_DELETED', 'AppRole', r.id, { name: r.name, permissions: r.permissions });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}
