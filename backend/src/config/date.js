// UTC-midnight key for @db.Date columns, based on the server's local calendar day
export const dateKey = (d = new Date()) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

// Attendance rules (spec): < 3h30m worked = Half Day, >= 3h30m = Present, no record = Absent.
export const HALF_DAY_MINUTES = 210;
// Clock-in after this local hour:minute counts as a late arrival.
export const LATE_AFTER = { hour: 10, minute: 0 };

export function workedMinutes(clockIn, clockOut) {
  if (!clockIn || !clockOut) return 0;
  return Math.max(0, Math.round((new Date(clockOut) - new Date(clockIn)) / 60000));
}

export function isLateArrival(clockIn) {
  if (!clockIn) return false;
  const d = new Date(clockIn);
  return d.getHours() > LATE_AFTER.hour || (d.getHours() === LATE_AFTER.hour && d.getMinutes() > LATE_AFTER.minute);
}

// Derive attendance status from clock times. Returns { status, isLate }.
export function deriveStatus(clockIn, clockOut) {
  if (!clockIn) return { status: 'ABSENT', isLate: false };
  const late = isLateArrival(clockIn);
  if (!clockOut) return { status: late ? 'LATE' : 'PRESENT', isLate: late };
  const mins = workedMinutes(clockIn, clockOut);
  if (mins < HALF_DAY_MINUTES) return { status: 'HALF_DAY', isLate: late };
  return { status: late ? 'LATE' : 'PRESENT', isLate: late };
}
