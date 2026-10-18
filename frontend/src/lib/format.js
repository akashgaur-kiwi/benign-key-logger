export const STAGE_LABEL = {
  SOURCED: 'Sourced', SCREENED: 'Screened', TIER1_SUBMITTED: 'Tier-1', CLIENT_SUBMITTED: 'Client',
  INTERVIEW: 'Interview', OFFER: 'Offer', START: 'Start', REJECTED: 'Rejected'
};

export const IV_LABEL = {
  CONFIRMED: 'Confirmed', SCHEDULED: 'Scheduled', AWAITING_CONFIRMATION: 'Awaiting',
  FEEDBACK_PENDING: 'Feedback pending', COMPLETED: 'Completed', CANCELLED: 'Cancelled'
};

export const title = s => (s || '').toLowerCase().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

const sameDay = (a, b) => a.toDateString() === b.toDateString();

export const fmtTime = v => (v ? new Date(v).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—');

export const fmtWhen = v => {
  if (!v) return '—';
  const d = new Date(v);
  const now = new Date();
  const tmr = new Date(now.getTime() + 86400000);
  if (sameDay(d, now)) return fmtTime(d);
  if (sameDay(d, tmr)) return 'Tomorrow';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export const initials = n => (n || '?').split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();

export const fmtDate = v => (v ? new Date(v).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
