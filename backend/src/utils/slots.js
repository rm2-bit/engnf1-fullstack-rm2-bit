import { validationError } from './errors.js';
import { isoDate } from './validate.js';

export const MIN_MS = 30 * 60_000;
export const MAX_MS = 240 * 60_000;
export const MAX_AHEAD_MS = 30 * 24 * 3_600_000;

/** B1-B4. All failures are 400s. `now` is injectable so the rules can be tested. */
export function validateSlot(startRaw, endRaw, now = new Date()) {
  const start = isoDate(startRaw, 'startTime');
  const end = isoDate(endRaw, 'endTime');
  for (const [label, d] of [['startTime', start], ['endTime', end]]) {
    if (d.getUTCMinutes() % 30 !== 0 || d.getUTCSeconds() !== 0 || d.getUTCMilliseconds() !== 0) {
      throw validationError(`${label} must fall on :00 or :30 UTC with zero seconds`);
    }
  }
  const duration = end - start;
  if (duration <= 0) throw validationError('endTime must be after startTime');
  if (duration < MIN_MS || duration > MAX_MS) throw validationError('Duration must be 30 to 240 minutes');
  if (start <= now) throw validationError('startTime must be in the future');
  if (start - now > MAX_AHEAD_MS) throw validationError('startTime must be within the next 30 days');
  return { start, end };
}
