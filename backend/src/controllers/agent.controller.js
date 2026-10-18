import prisma from '../config/db.js';
import { dateKey } from '../config/date.js';

const ACTIONS = ['APP_OPENED', 'APP_CLOSED', 'WINDOW_FOCUSED'];

export async function logAppEvent(req, res, next) {
  try {
    const { userId, appName, windowTitle, action, durationSec, isIdle } = req.body || {};
    if (!userId || !appName) return res.status(400).json({ error: 'userId and appName required' });
    if (action && !ACTIONS.includes(action)) return res.status(400).json({ error: 'Invalid action' });

    const now = new Date();
    const today = dateKey(now);
    const dur = Number(durationSec) || 0;

    await prisma.appLifecycleEvent.create({
      data: { userId, appName, windowTitle: windowTitle || 'Workstation App', action: action || 'WINDOW_FOCUSED', timestamp: now }
    });

    if (dur > 0) {
      await prisma.appUsageSummary.upsert({
        where: { userId_appName_date: { userId, appName, date: today } },
        update: {
          durationSec: { increment: isIdle ? 0 : dur },
          idleSec: { increment: isIdle ? dur : 0 }
        },
        create: { userId, appName, durationSec: isIdle ? 0 : dur, idleSec: isIdle ? dur : 0, date: today }
      });
    }

    const existing = await prisma.attendance.findUnique({ where: { userId_date: { userId, date: today } } });
    if (!existing) {
      const isLate = now.getHours() >= 10;
      await prisma.attendance.create({
        data: { userId, date: today, clockIn: now, status: isLate ? 'LATE' : 'PRESENT', isLate }
      });
    } else {
      await prisma.attendance.update({ where: { id: existing.id }, data: { clockOut: now } });
    }

    await prisma.user.update({ where: { id: userId }, data: { isOnline: true } });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
