// The API speaks UTC ISO strings; the UI shows the viewer's local time.

export const fmtDateTime = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
export const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const pad = (n) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD (what <input type="date"> uses). */
export function localDateValue(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function localDayRange(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { start: new Date(y, m - 1, d, 0, 0, 0, 0), end: new Date(y, m - 1, d + 1, 0, 0, 0, 0) };
}

const STEP = 30 * 60_000;

/**
 * 30-minute grid points covering one local day. Points are aligned to :00/:30 in UTC (epoch
 * multiples of 30 min), which is what the API requires, so this is correct even in time zones
 * with 45-minute offsets. Labels are in local time. The last point is the next local midnight
 * (usable only as an end time).
 */
export function slotsForDate(dateStr) {
  const { start, end } = localDayRange(dateStr);
  const out = [];
  for (let t = Math.ceil(start.getTime() / STEP) * STEP; t <= end.getTime(); t += STEP) {
    out.push({ ms: t, iso: new Date(t).toISOString(), label: fmtTime(new Date(t).toISOString()) });
  }
  return out;
}

/** Local date -> UTC ISO for start (or end) of day. Used by admin date filters. */
export const startOfDayIso = (dateStr) => localDayRange(dateStr).start.toISOString();
export const endOfDayIso = (dateStr) => localDayRange(dateStr).end.toISOString();
