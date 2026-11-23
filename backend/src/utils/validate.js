import { validationError } from './errors.js';

export const CATEGORIES = ['BILLING', 'BUG', 'FEATURE_REQUEST', 'LOGIN', 'DELIVERY'];
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
export const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
export const RESOURCE_TYPES = ['ROOM', 'LAB', 'EQUIPMENT'];
export const BOOKING_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]00:?00)$/;

export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

export function trimmedString(value, min, max, label) {
  if (typeof value !== 'string') throw validationError(`${label} must be a string`);
  const v = value.trim();
  if (v.length < min || v.length > max) {
    throw validationError(`${label} must be ${min}-${max} characters`);
  }
  return v;
}

export function enumValue(value, allowed, label) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw validationError(`${label} must be one of ${allowed.join(', ')}`);
  }
  return value;
}

export function validateEmail(value) {
  if (typeof value !== 'string') throw validationError('Email must be a string');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) throw validationError('Email is invalid');
  return email;
}

export function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 64) {
    throw validationError('Password must be 8-64 characters');
  }
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    throw validationError('Password must contain at least one letter and one digit');
  }
  return value;
}

/** Strict ISO 8601 UTC timestamp -> Date. */
export function isoDate(value, label) {
  if (typeof value !== 'string' || !ISO_UTC_RE.test(value)) {
    throw validationError(`${label} must be an ISO 8601 UTC timestamp`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw validationError(`${label} is not a valid date`);
  return d;
}

export function positiveInt(value, label, { min = 1, max = 1_000_000 } = {}) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw validationError(`${label} must be an integer`);
  const n = Number(value);
  if (n < min || n > max) throw validationError(`${label} must be between ${min} and ${max}`);
  return n;
}

/** Parses ?page and (optionally) ?limit. */
export function parsePaging(q, { defaultSize = 10, maxSize = 100, allowLimit = false } = {}) {
  const page = q.page === undefined ? 1 : positiveInt(q.page, 'page');
  let pageSize = defaultSize;
  if (allowLimit && q.limit !== undefined) pageSize = positiveInt(q.limit, 'limit', { max: maxSize });
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export const paginated = (data, { page, pageSize }, total) => ({
  data,
  page,
  pageSize,
  total,
  totalPages: Math.ceil(total / pageSize),
});

/** Escapes LIKE wildcards so user input is matched literally. Use with ESCAPE '\'. */
export const escapeLike = (s) => s.replace(/[\\%_]/g, '\\$&');

export function optionalQueryString(value, label, max = 200) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw validationError(`${label} must be a string`);
  const v = value.trim();
  if (v.length > max) throw validationError(`${label} must be at most ${max} characters`);
  return v === '' ? undefined : v;
}
