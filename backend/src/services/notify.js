import prisma from '../config/db.js';

// Fire-and-forget: a failed notification must never break the business action that triggered it.
export async function notify(userId, type, title, body = null, link = null) {
  if (!userId) return;
  try {
    await prisma.notification.create({ data: { userId, type, title, body, link } });
  } catch (e) {
    console.error('notify failed', e.message);
  }
}

export async function notifyMany(userIds, type, title, body = null, link = null) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return;
  try {
    await prisma.notification.createMany({ data: ids.map(userId => ({ userId, type, title, body, link })) });
  } catch (e) {
    console.error('notifyMany failed', e.message);
  }
}

// Recipients for people-wide events: owners/HR who hold USER_MANAGEMENT access.
export async function adminAndHrIds() {
  const rows = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { appRole: { permissions: { some: { module: 'USER_MANAGEMENT', action: 'VIEW' } } } }
      ]
    },
    select: { id: true }
  });
  return rows.map(r => r.id);
}
