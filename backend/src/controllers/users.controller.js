import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../config/db.js';
import { ACTIONS, MODULES, SCOPES } from '../config/permissions.js';
import { accessInclude, audit, effectivePerms, issueToken } from '../services/access.js';
import { notifyMany } from '../services/notify.js';
import { approvedEmail, inviteEmail, resetEmail } from '../services/emails.js';
import { sendOtp } from '../services/otp.js';
import { PW_ERR, validPassword } from './auth.controller.js';
import { adminAndHrIds } from './notifications.controller.js';

const ROLES = ['OWNER_ADMIN', 'ACCOUNT_MANAGER', 'RECRUITER', 'HR_ADMIN'];
const INVITE_HOURS = 48;

// Mails the invite plus its verification code. The link is still returned so an admin can
// hand it over by hand when SMTP isn't configured or delivery fails.
async function deliverInvite(u, link) {
  const { sent } = await inviteEmail(u, link, INVITE_HOURS);
  if (sent) await sendOtp('email', u.email);
  return sent;
}
const bad = (status, msg) => Object.assign(new Error(msg), { status });

const view = u => ({
  id: u.id, email: u.email, fullName: u.fullName, role: u.role, department: u.department,
  designation: u.designation, phone: u.phone, dateOfJoining: u.dateOfJoining, dateOfExit: u.dateOfExit,
  employeeCode: u.employeeCode, teamTag: u.teamTag, status: u.status, isOnline: u.isOnline,
  accessExpiresAt: u.accessExpiresAt, lastLoginAt: u.lastLoginAt, approvedAt: u.approvedAt, createdAt: u.createdAt,
  manager: u.manager ? { id: u.manager.id, fullName: u.manager.fullName } : null,
  appRole: u.appRole ? { id: u.appRole.id, name: u.appRole.name } : null,
  overrides: (u.permOverrides || []).map(({ module, action, scope, allow }) => ({ module, action, scope, allow })),
  permissions: u.appRole?.permissions ? effectivePerms(u) : undefined
});

const full = { ...accessInclude, manager: { select: { id: true, fullName: true } } };

const isPrivileged = u => u.appRole?.name === 'OWNER_ADMIN' || !!effectivePerms(u)['USER_MANAGEMENT:APPROVE'];
const canApprove = req => !!req.user.perms['USER_MANAGEMENT:APPROVE'];

async function load(id) {
  const u = await prisma.user.findUnique({ where: { id }, include: full });
  if (!u) throw bad(404, 'User not found');
  return u;
}

// Only approvers may touch admins/approvers; nobody changes their own access
async function guard(req, u) {
  if (u.id === req.user.id) throw bad(400, 'You cannot change your own access');
  if (isPrivileged(u) && !canApprove(req)) throw bad(403, 'Only an approver can change an admin account');
}

async function guardRole(req, appRoleId) {
  if (!appRoleId) return null;
  const r = await prisma.appRole.findUnique({ where: { id: appRoleId }, include: { permissions: true } });
  if (!r) throw bad(400, 'Unknown access role');
  const priv = r.name === 'OWNER_ADMIN' || r.permissions.some(p => p.module === 'USER_MANAGEMENT' && p.action === 'APPROVE');
  if (priv && !canApprove(req)) throw bad(403, 'Only an approver can assign this role');
  return r;
}

async function assertNotLastAdmin(u) {
  if (u.appRole?.name !== 'OWNER_ADMIN' || u.status !== 'ACTIVE') return;
  const n = await prisma.user.count({ where: { appRole: { name: 'OWNER_ADMIN' }, status: 'ACTIVE' } });
  if (n <= 1) throw bad(400, 'Cannot remove the last active owner admin');
}

export async function listUsers(req, res, next) {
  try {
    const { q, status, appRoleId, team } = req.query;
    const where = {};
    if (status) where.status = status;
    if (appRoleId) where.appRoleId = appRoleId;
    if (team) where.teamTag = team;
    if (q) where.OR = [
      { fullName: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } }
    ];
    const [rows, counts] = await Promise.all([
      prisma.user.findMany({
        where, orderBy: [{ status: 'asc' }, { fullName: 'asc' }],
        include: { appRole: { select: { id: true, name: true } }, manager: { select: { id: true, fullName: true } }, permOverrides: true }
      }),
      prisma.user.groupBy({ by: ['status'], _count: { id: true } })
    ]);
    res.json({ users: rows.map(view), counts: Object.fromEntries(counts.map(c => [c.status, c._count.id])) });
  } catch (e) {
    next(e);
  }
}

export async function getUser(req, res, next) {
  try {
    res.json(view(await load(req.params.id)));
  } catch (e) {
    next(e);
  }
}

export async function inviteUser(req, res, next) {
  try {
    const { email, fullName, role, appRoleId, managerId, teamTag, department, employeeCode, accessExpiresAt, preApprove,
      designation, phone, dateOfJoining, dateOfExit } = req.body || {};
    if (!email || !fullName) return res.status(400).json({ error: 'email and fullName required' });
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid job role' });
    if (preApprove && !canApprove(req)) return res.status(403).json({ error: 'Only an approver can pre-approve' });
    const ar = (await guardRole(req, appRoleId)) || await prisma.appRole.findUnique({ where: { name: role } });
    if (ar?.name === 'OWNER_ADMIN' && !canApprove(req)) return res.status(403).json({ error: 'Only an approver can assign this role' });
    // While no mailer is wired up, DEFAULT_USER_PASSWORD lets new users sign in straight away
    // instead of going through the invite link. Approval rules still apply.
    const defaultPassword = validPassword(process.env.DEFAULT_USER_PASSWORD) ? process.env.DEFAULT_USER_PASSWORD : null;
    const status = !defaultPassword ? 'INVITED' : preApprove ? 'ACTIVE' : 'PENDING_APPROVAL';
    const u = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(), fullName, role, appRoleId: ar?.id, managerId: managerId || null,
        teamTag, department, employeeCode: employeeCode || null,
        designation: designation || null, phone: phone || null,
        dateOfJoining: dateOfJoining ? new Date(dateOfJoining) : null,
        dateOfExit: dateOfExit ? new Date(dateOfExit) : null,
        accessExpiresAt: accessExpiresAt ? new Date(accessExpiresAt) : null,
        passwordHash: await bcrypt.hash(defaultPassword || crypto.randomBytes(24).toString('hex'), 10),
        status, isActive: status === 'ACTIVE', invitedById: req.user.id, mustChangePassword: !!defaultPassword,
        ...(preApprove ? { approvedById: req.user.id, approvedAt: new Date() } : {})
      }
    });
    const link = defaultPassword ? null : await issueToken(u.id, 'INVITE', INVITE_HOURS);
    const emailed = defaultPassword ? false : await deliverInvite(u, link);
    await audit(req, 'USER_INVITED', 'User', u.id, null, { email: u.email, role, appRole: ar?.name, preApprove: !!preApprove, emailed, defaultPassword: !!defaultPassword });
    const admins = (await adminAndHrIds()).filter(id => id !== req.user.id);
    await notifyMany(admins, 'EMPLOYEE_ADDED', 'New employee added',
      `${u.fullName} (${u.designation || u.role}) was invited to the workspace.`, '/employees');
    res.status(201).json({ user: view(await load(u.id)), link, emailed, defaultPassword });
  } catch (e) {
    next(e);
  }
}

export async function resendInvite(req, res, next) {
  try {
    const u = await load(req.params.id);
    if (u.status !== 'INVITED') return res.status(400).json({ error: 'User has already accepted the invite' });
    const link = await issueToken(u.id, 'INVITE', INVITE_HOURS);
    const emailed = await deliverInvite(u, link);
    await audit(req, 'INVITE_RESENT', 'User', u.id, null, { emailed });
    res.json({ link, emailed });
  } catch (e) {
    next(e);
  }
}

export async function updateUser(req, res, next) {
  try {
    const u = await load(req.params.id);
    const { fullName, role, appRoleId, managerId, teamTag, department, employeeCode, accessExpiresAt,
      designation, phone, dateOfJoining, dateOfExit } = req.body || {};
    const accessChange = (appRoleId && appRoleId !== u.appRoleId) || (role && role !== u.role);
    if (accessChange) {
      await guard(req, u);
      if (appRoleId && appRoleId !== u.appRoleId) await assertNotLastAdmin(u);
    }
    if (role && !ROLES.includes(role)) return res.status(400).json({ error: 'Invalid job role' });
    if (managerId && managerId === u.id) return res.status(400).json({ error: 'User cannot manage themselves' });
    await guardRole(req, appRoleId !== u.appRoleId ? appRoleId : null);
    const data = {
      fullName, role, appRoleId, teamTag, department,
      designation: designation === undefined ? undefined : designation || null,
      phone: phone === undefined ? undefined : phone || null,
      dateOfJoining: dateOfJoining === undefined ? undefined : dateOfJoining ? new Date(dateOfJoining) : null,
      dateOfExit: dateOfExit === undefined ? undefined : dateOfExit ? new Date(dateOfExit) : null,
      managerId: managerId === undefined ? undefined : managerId || null,
      employeeCode: employeeCode === undefined ? undefined : employeeCode || null,
      accessExpiresAt: accessExpiresAt === undefined ? undefined : accessExpiresAt ? new Date(accessExpiresAt) : null,
      ...(accessChange ? { tokenVersion: { increment: 1 } } : {})
    };
    await prisma.user.update({ where: { id: u.id }, data });
    const after = await load(u.id);
    await audit(req, 'USER_UPDATED', 'User', u.id,
      { role: u.role, appRole: u.appRole?.name, managerId: u.managerId, teamTag: u.teamTag, accessExpiresAt: u.accessExpiresAt },
      { role: after.role, appRole: after.appRole?.name, managerId: after.managerId, teamTag: after.teamTag, accessExpiresAt: after.accessExpiresAt });
    res.json(view(after));
  } catch (e) {
    next(e);
  }
}

// from: allowed current statuses, to: new status, extra: additional data
const TRANSITIONS = {
  approve: { from: ['PENDING_APPROVAL', 'INVITED'], needsApprove: true },
  reject: { from: ['PENDING_APPROVAL', 'INVITED'], to: 'REVOKED', needsApprove: true },
  suspend: { from: ['ACTIVE'], to: 'SUSPENDED', removesAccess: true },
  restore: { from: ['SUSPENDED', 'REVOKED'], to: 'ACTIVE' },
  revoke: { from: ['ACTIVE', 'SUSPENDED', 'INVITED', 'PENDING_APPROVAL'], to: 'REVOKED', removesAccess: true }
};

export const changeStatus = op => async (req, res, next) => {
  try {
    const t = TRANSITIONS[op];
    const u = await load(req.params.id);
    await guard(req, u);
    if (t.needsApprove && !canApprove(req)) return res.status(403).json({ error: 'Missing permission USER_MANAGEMENT:APPROVE' });
    if (!t.from.includes(u.status)) return res.status(400).json({ error: `Cannot ${op} a user who is ${u.status}` });
    if (t.removesAccess) await assertNotLastAdmin(u);

    const data = {};
    if (op === 'approve') {
      data.approvedById = req.user.id;
      data.approvedAt = new Date();
      if (u.status === 'PENDING_APPROVAL') data.status = 'ACTIVE';
    } else {
      data.status = t.to;
    }
    if (data.status) {
      data.isActive = data.status === 'ACTIVE';
      if (data.status !== 'ACTIVE') data.tokenVersion = { increment: 1 };
      // Revoking access = employee exit: stamp the exit date if not already set.
      if (data.status === 'REVOKED' && !u.dateOfExit) data.dateOfExit = new Date();
    }
    await prisma.user.update({ where: { id: u.id }, data });
    const after = await load(u.id);
    await audit(req, `USER_${op.toUpperCase()}`, 'User', u.id, { status: u.status }, { status: after.status, reason: req.body?.reason });
    if (op === 'approve' && after.status === 'ACTIVE') await approvedEmail(after);
    if (data.status === 'REVOKED') {
      const admins = (await adminAndHrIds()).filter(id => id !== req.user.id && id !== u.id);
      await notifyMany(admins, 'EMPLOYEE_EXIT', 'Employee exit',
        `${u.fullName} has been offboarded (access revoked).`, '/employees');
    }
    res.json(view(after));
  } catch (e) {
    next(e);
  }
};

export async function forceLogout(req, res, next) {
  try {
    const u = await load(req.params.id);
    await guard(req, u);
    await prisma.user.update({ where: { id: u.id }, data: { tokenVersion: { increment: 1 }, isOnline: false } });
    await audit(req, 'USER_FORCE_LOGOUT', 'User', u.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function unlockUser(req, res, next) {
  try {
    const u = await load(req.params.id);
    await guard(req, u);
    await prisma.user.update({ where: { id: u.id }, data: { failedLogins: 0, lockedUntil: null } });
    await audit(req, 'USER_UNLOCK', 'User', u.id);
    res.json(view(await load(u.id)));
  } catch (e) {
    next(e);
  }
}

export async function adminResetLink(req, res, next) {
  try {
    const u = await load(req.params.id);
    await guard(req, u);
    if (u.status !== 'ACTIVE') return res.status(400).json({ error: 'User is not active' });
    const resetLink = await issueToken(u.id, 'RESET', 24);
    const { sent: emailed } = await resetEmail(u, resetLink, 24);
    if (emailed) await sendOtp('email', u.email);
    await audit(req, 'PASSWORD_RESET_ISSUED', 'User', u.id, null, { emailed });
    res.json({ resetLink, emailed });
  } catch (e) {
    next(e);
  }
}

// Manual alternative to the invite email: the admin sets the password and hands it over out of band.
// An approver doing this also activates the account, since the manual step is the approval.
export async function setUserPassword(req, res, next) {
  try {
    const u = await load(req.params.id);
    await guard(req, u);
    const { password } = req.body || {};
    if (!validPassword(password)) return res.status(400).json({ error: PW_ERR });
    if (['REVOKED', 'SUSPENDED'].includes(u.status)) {
      return res.status(400).json({ error: `Restore the account before setting a password (currently ${u.status.toLowerCase()})` });
    }
    const activate = u.status !== 'ACTIVE' && canApprove(req);
    await prisma.$transaction([
      // Any invite or reset link already issued must stop working once a password is set by hand.
      prisma.authToken.updateMany({ where: { userId: u.id, usedAt: null }, data: { usedAt: new Date() } }),
      prisma.user.update({
        where: { id: u.id },
        data: {
          passwordHash: await bcrypt.hash(password, 10),
          failedLogins: 0, lockedUntil: null,
          tokenVersion: { increment: 1 },
          // The admin knows this password, so the user picks their own on next sign-in.
          mustChangePassword: true,
          ...(activate
            ? { status: 'ACTIVE', isActive: true, approvedById: u.approvedById || req.user.id, approvedAt: u.approvedAt || new Date() }
            : u.status === 'INVITED' ? { status: 'PENDING_APPROVAL' } : {})
        }
      })
    ]);
    await audit(req, 'PASSWORD_SET_BY_ADMIN', 'User', u.id, null, { activated: activate });
    const user = view(await load(u.id));
    res.json({
      user,
      message: user.status === 'ACTIVE'
        ? `Password set. ${u.fullName} can sign in with ${u.email} now.`
        : 'Password set. An approver still has to approve this account before sign-in.'
    });
  } catch (e) {
    next(e);
  }
}

// Replaces all per-user overrides: [{ module, action, scope, allow }]
export async function setUserPermissions(req, res, next) {
  try {
    const u = await load(req.params.id);
    await guard(req, u);
    const list = req.body?.overrides;
    if (!Array.isArray(list)) return res.status(400).json({ error: 'overrides array required' });
    for (const o of list) {
      if (!MODULES.includes(o.module) || !ACTIONS.includes(o.action) || (o.allow !== false && !SCOPES.includes(o.scope))) {
        return res.status(400).json({ error: `Invalid override ${o.module}:${o.action}` });
      }
      if (o.allow !== false && o.module === 'USER_MANAGEMENT' && o.action === 'APPROVE' && !canApprove(req)) {
        return res.status(403).json({ error: 'Only an approver can grant approve rights' });
      }
    }
    const before = u.permOverrides.map(({ module, action, scope, allow }) => ({ module, action, scope, allow }));
    await prisma.$transaction([
      prisma.userPermission.deleteMany({ where: { userId: u.id } }),
      prisma.userPermission.createMany({
        data: list.map(o => ({ userId: u.id, module: o.module, action: o.action, scope: o.scope || 'ALL', allow: o.allow !== false }))
      })
    ]);
    const after = await load(u.id);
    await audit(req, 'USER_PERMISSIONS_CHANGED', 'User', u.id, before, view(after).overrides);
    res.json(view(after));
  } catch (e) {
    next(e);
  }
}
