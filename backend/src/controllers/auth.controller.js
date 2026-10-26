import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/db.js';
import { accessInclude, audit, blockReason, effectivePerms, hashToken, issueToken } from '../services/access.js';
import { applyClock } from './hr.controller.js';
import { notify } from '../services/notify.js';
import { sendOtp, verifyOtp } from '../services/otp.js';
import { mailEnabled } from '../services/mailer.js';
import { passwordChangedEmail, resetEmail } from '../services/emails.js';

const MAX_FAILS = 5, LOCK_MIN = 15;

export const pub = u => ({
  id: u.id, email: u.email, fullName: u.fullName, role: u.role, teamTag: u.teamTag,
  status: u.status, appRole: u.appRole?.name || null, permissions: effectivePerms(u)
});

export const validPassword = p => typeof p === 'string' && p.length >= 8 && /[a-z]/i.test(p) && /\d/.test(p);
export const PW_ERR = 'Password must be at least 8 characters with a letter and a number';

const sign = u => jwt.sign({ id: u.id, role: u.role, tv: u.tokenVersion }, process.env.JWT_SECRET, {
  expiresIn: process.env.JWT_EXPIRES_IN || '12h'
});

export async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, include: accessInclude });
    if (!u) return res.status(401).json({ error: 'Invalid credentials' });
    if (u.lockedUntil && u.lockedUntil > new Date()) {
      return res.status(423).json({ error: `Account locked. Try again after ${u.lockedUntil.toLocaleTimeString()}` });
    }
    if (!(await bcrypt.compare(password, u.passwordHash))) {
      const fails = u.failedLogins + 1;
      await prisma.user.update({
        where: { id: u.id },
        data: fails >= MAX_FAILS
          ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MIN * 60000) }
          : { failedLogins: fails }
      });
      await audit({ ip: req.ip, user: { id: u.id } }, 'LOGIN_FAILED', 'User', u.id);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const why = blockReason(u);
    if (why) return res.status(403).json({ error: why });
    await prisma.user.update({ where: { id: u.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await audit({ ip: req.ip, user: { id: u.id } }, 'LOGIN', 'User', u.id);
    // Automatic attendance: first login of the day clocks the employee in.
    try {
      const att = await applyClock(u.id, 'in');
      if (att?.isLate) await notify(u.id, 'LATE_LOGIN', 'Late login recorded',
        `You clocked in at ${new Date(att.clockIn).toLocaleTimeString()} today.`);
    } catch (e) { console.error('auto clock-in failed', e.message); }
    res.json({ token: sign(u), user: pub(u) });
  } catch (e) {
    next(e);
  }
}

export async function me(req, res, next) {
  try {
    const u = await prisma.user.findUnique({ where: { id: req.user.id }, include: accessInclude });
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json(pub(u));
  } catch (e) {
    next(e);
  }
}

async function useToken(raw, type) {
  if (!raw) return null;
  const t = await prisma.authToken.findUnique({ where: { tokenHash: hashToken(raw) }, include: { user: true } });
  if (!t || t.type !== type || t.usedAt || t.expiresAt < new Date()) return null;
  return t;
}

export async function checkToken(req, res, next) {
  try {
    const t = await useToken(req.query.token, req.query.type === 'RESET' ? 'RESET' : 'INVITE');
    if (!t) return res.status(400).json({ error: 'Link is invalid or expired' });
    res.json({
      email: t.user.email, fullName: t.user.fullName,
      needsSmsOtp: t.type === 'INVITE' && !!t.user.phone,
      // Tells the client whether codes can be emailed on demand or are the fixed dev codes.
      canSendOtp: mailEnabled()
    });
  } catch (e) {
    next(e);
  }
}

// Emails a verification code for an invite/reset in progress. The address comes from the
// token, never from the request, so this cannot be used to mail arbitrary recipients.
export async function requestOtp(req, res, next) {
  try {
    const { token, type } = req.body || {};
    const t = await useToken(token, type === 'RESET' ? 'RESET' : 'INVITE');
    if (!t) return res.status(400).json({ error: 'Link is invalid or expired' });
    const { delivered } = await sendOtp('email', t.user.email);
    res.json({
      sent: delivered,
      message: delivered
        ? `Verification code sent to ${t.user.email}.`
        : 'Email delivery is not configured. Use the code provided by your administrator.'
    });
  } catch (e) {
    next(e);
  }
}

// Invite accepted -> PENDING_APPROVAL, unless admin pre-approved at invite time
export async function acceptInvite(req, res, next) {
  try {
    const { token, password, fullName, emailOtp, smsOtp } = req.body || {};
    if (!validPassword(password)) return res.status(400).json({ error: PW_ERR });
    const t = await useToken(token, 'INVITE');
    if (!t) return res.status(400).json({ error: 'Invite link is invalid or expired' });
    if (!verifyOtp('email', emailOtp, t.user.email)) return res.status(400).json({ error: 'Invalid email verification code' });
    if (t.user.phone && !verifyOtp('sms', smsOtp, t.user.phone)) return res.status(400).json({ error: 'Invalid SMS verification code' });
    const status = t.user.approvedAt ? 'ACTIVE' : 'PENDING_APPROVAL';
    await prisma.$transaction([
      prisma.authToken.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
      prisma.user.update({
        where: { id: t.userId },
        data: {
          passwordHash: await bcrypt.hash(password, 10), status, isActive: status === 'ACTIVE',
          fullName: fullName?.trim() || undefined
        }
      })
    ]);
    await audit({ ip: req.ip, user: { id: t.userId } }, 'INVITE_ACCEPTED', 'User', t.userId, null, { status });
    res.json({
      status,
      message: status === 'ACTIVE' ? 'Your account is ready. You can sign in now.' : 'Password set. An admin will approve your access shortly.'
    });
  } catch (e) {
    next(e);
  }
}

export async function register(req, res, next) {
  try {
    if (process.env.ALLOW_SIGNUP !== 'true') return res.status(403).json({ error: 'Self sign-up is disabled' });
    const { email, password, fullName } = req.body || {};
    if (!email || !fullName) return res.status(400).json({ error: 'email and fullName required' });
    if (!validPassword(password)) return res.status(400).json({ error: PW_ERR });
    const role = await prisma.appRole.findUnique({ where: { name: 'RECRUITER' } });
    const u = await prisma.user.create({
      data: {
        email: email.toLowerCase(), fullName, role: 'RECRUITER', appRoleId: role?.id,
        passwordHash: await bcrypt.hash(password, 10), status: 'PENDING_APPROVAL', isActive: false
      }
    });
    await audit({ ip: req.ip, user: { id: u.id } }, 'SIGNUP', 'User', u.id);
    res.status(201).json({ status: u.status, message: 'Request submitted. An admin will review your access.' });
  } catch (e) {
    next(e);
  }
}

export async function forgotPassword(req, res, next) {
  try {
    const email = req.body?.email?.toLowerCase();
    const u = email && await prisma.user.findUnique({ where: { email } });
    let link, sent = false;
    if (u && u.status === 'ACTIVE') {
      link = await issueToken(u.id, 'RESET', 1);
      ({ sent } = await resetEmail(u, link));
      // The code is only useful once the link is open, but sending both now saves a round trip.
      if (sent) await sendOtp('email', u.email);
    }
    // Same response whether or not the account exists. The link is only handed back when it
    // could not be emailed (or outside production / EXPOSE_RESET_LINKS, for manual delivery).
    const expose = !sent && (process.env.NODE_ENV !== 'production' || process.env.EXPOSE_RESET_LINKS === 'true');
    res.json({
      ok: true,
      message: sent
        ? 'If that account exists, a reset link is on its way by email.'
        : 'If that account exists, a reset link has been issued.',
      ...(expose && link ? { link } : {})
    });
  } catch (e) {
    next(e);
  }
}

export async function resetPassword(req, res, next) {
  try {
    const { token, password, emailOtp } = req.body || {};
    if (!validPassword(password)) return res.status(400).json({ error: PW_ERR });
    const t = await useToken(token, 'RESET');
    if (!t) return res.status(400).json({ error: 'Reset link is invalid or expired' });
    if (!verifyOtp('email', emailOtp, t.user.email)) return res.status(400).json({ error: 'Invalid email verification code' });
    await prisma.$transaction([
      prisma.authToken.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
      prisma.user.update({
        where: { id: t.userId },
        data: { passwordHash: await bcrypt.hash(password, 10), tokenVersion: { increment: 1 }, failedLogins: 0, lockedUntil: null }
      })
    ]);
    await audit({ ip: req.ip, user: { id: t.userId } }, 'PASSWORD_RESET', 'User', t.userId);
    await passwordChangedEmail(t.user);
    res.json({ ok: true, message: 'Password updated. You can sign in now.' });
  } catch (e) {
    next(e);
  }
}

export async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!validPassword(newPassword)) return res.status(400).json({ error: PW_ERR });
    const u = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!(await bcrypt.compare(currentPassword || '', u.passwordHash))) return res.status(400).json({ error: 'Current password is incorrect' });
    const nu = await prisma.user.update({
      where: { id: u.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 10), tokenVersion: { increment: 1 } }
    });
    await audit(req, 'PASSWORD_CHANGED', 'User', u.id);
    await passwordChangedEmail(u);
    res.json({ token: sign(nu) });
  } catch (e) {
    next(e);
  }
}
