import { ApiError } from '../utils/errors.js';

/**
 * Small in-memory fixed-window limiter keyed by client IP.
 * State lives in this process only, so each server instance counts separately.
 */
export function rateLimit({ windowMs, max, message = 'Too many requests. Try again later.' }) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    let entry = hits.get(req.ip);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(req.ip, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return next(new ApiError(429, 'RATE_LIMITED', message));
    }
    return next();
  };
}
