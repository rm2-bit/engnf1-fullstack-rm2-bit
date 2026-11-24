import { query, withTransaction } from '../db/pool.js';
import { conflict, forbidden, notFound, validationError } from '../utils/errors.js';
import { validateSlot } from '../utils/slots.js';
import { isUuid, trimmedString } from '../utils/validate.js';

const MAX_ACTIVE_PER_USER = 3;

export const BOOKING_SELECT = `
  SELECT b.id, b."resourceId", b."userId", b."ticketId", b."startTime", b."endTime", b.purpose,
         b.status, b."decisionNote", b."createdAt",
         r.name AS "resourceName", u.name AS "userName", u.email AS "userEmail"
  FROM bookings b
  JOIN resources r ON r.id = b."resourceId"
  JOIN users u ON u.id = b."userId"`;

export async function fetchBooking(client, id) {
  const { rows } = await client.query(`${BOOKING_SELECT} WHERE b.id = $1`, [id]);
  return rows[0] ?? null;
}

/**
 * Race-safe creation (B6).
 *  - The EXCLUDE USING gist constraint on bookings is the real guard: two overlapping active
 *    rows can never both commit, whatever the interleaving. Violation 23P01 -> 409.
 *  - A per-user advisory lock serialises the "max 3 active" count + insert for one user.
 * Check order: 400 validation -> 404 referenced ids -> 409 conflicts.
 */
export async function createBooking(user, body) {
  if (!body || typeof body !== 'object') throw validationError('Body must be an object');
  if (typeof body.resourceId !== 'string') throw validationError('resourceId is required');
  const { start, end } = validateSlot(body.startTime, body.endTime);
  const purpose = trimmedString(body.purpose, 5, 200, 'purpose');
  let ticketId = null;
  if (body.ticketId !== undefined && body.ticketId !== null) {
    if (typeof body.ticketId !== 'string') throw validationError('ticketId must be a string');
    ticketId = body.ticketId;
  }

  const bookingId = await withTransaction(async (c) => {
    const resource = isUuid(body.resourceId)
      ? (await c.query('SELECT id, "isActive" FROM resources WHERE id = $1', [body.resourceId])).rows[0]
      : null;
    if (!resource) throw notFound('Resource not found');

    if (ticketId !== null) {
      const t = isUuid(ticketId) ? await c.query('SELECT 1 FROM tickets WHERE id = $1', [ticketId]) : { rowCount: 0 };
      if (t.rowCount === 0) throw notFound('Ticket not found');
    }

    if (!resource.isActive) throw conflict('Resource is not active');

    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [user.id]);
    const active = await c.query(
      `SELECT count(*)::int AS n FROM bookings
       WHERE "userId" = $1 AND status IN ('PENDING','APPROVED') AND "startTime" > now()`,
      [user.id],
    );
    if (active.rows[0].n >= MAX_ACTIVE_PER_USER) {
      throw conflict(`You already have ${MAX_ACTIVE_PER_USER} active future bookings`);
    }

    try {
      const ins = await c.query(
        `INSERT INTO bookings ("resourceId", "userId", "ticketId", "startTime", "endTime", purpose)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [body.resourceId, user.id, ticketId, start.toISOString(), end.toISOString(), purpose],
      );
      return ins.rows[0].id;
    } catch (err) {
      if (err.code === '23P01') throw conflict('That time slot is already booked');
      throw err;
    }
  });

  return fetchBooking({ query }, bookingId);
}

/** Loads + locks a booking for a state transition. 404 (path id) happens here. */
async function lockBooking(c, id) {
  if (!isUuid(id)) throw notFound('Booking not found');
  const { rows } = await c.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [id]);
  if (!rows[0]) throw notFound('Booking not found');
  return rows[0];
}

const isFuture = (b) => new Date(b.startTime) > new Date();

export async function cancelBooking(user, id) {
  await withTransaction(async (c) => {
    const b = await lockBooking(c, id);
    if (b.userId !== user.id) throw forbidden('You can only cancel your own bookings');
    if (!['PENDING', 'APPROVED'].includes(b.status)) throw conflict(`A ${b.status} booking cannot be cancelled`);
    if (!isFuture(b)) throw conflict('Only future bookings can be cancelled');
    await c.query(`UPDATE bookings SET status = 'CANCELLED' WHERE id = $1`, [id]);
  });
  return fetchBooking({ query }, id);
}

export async function approveBooking(id) {
  await withTransaction(async (c) => {
    const b = await lockBooking(c, id);
    if (b.status !== 'PENDING') throw conflict(`A ${b.status} booking cannot be approved`);
    if (!isFuture(b)) throw conflict('Only future bookings can be approved');
    await c.query(`UPDATE bookings SET status = 'APPROVED' WHERE id = $1`, [id]);
  });
  return fetchBooking({ query }, id);
}

/** Check order: 404 -> 400 (note) -> 409. */
export async function rejectBooking(id, body) {
  await withTransaction(async (c) => {
    const b = await lockBooking(c, id);
    const note = trimmedString(body?.note, 5, 200, 'note');
    if (b.status !== 'PENDING') throw conflict(`A ${b.status} booking cannot be rejected`);
    if (!isFuture(b)) throw conflict('Only future bookings can be rejected');
    await c.query(`UPDATE bookings SET status = 'REJECTED', "decisionNote" = $2 WHERE id = $1`, [id, note]);
  });
  return fetchBooking({ query }, id);
}
