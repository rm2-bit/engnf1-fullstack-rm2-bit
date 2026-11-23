import { Router } from 'express';
import { query } from '../db/pool.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import {
  BOOKING_SELECT,
  approveBooking,
  cancelBooking,
  createBooking,
  fetchBooking,
  rejectBooking,
} from '../services/bookingService.js';
import { asyncHandler, forbidden, notFound, validationError } from '../utils/errors.js';
import { BOOKING_STATUSES, enumValue, isUuid, isoDate, paginated, parsePaging } from '../utils/validate.js';

const router = Router();
router.use(authenticate);

async function pagedBookings(where, params, paging) {
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [count, rows] = await Promise.all([
    query(`SELECT count(*)::int AS n FROM bookings b ${clause}`, params),
    query(
      `${BOOKING_SELECT} ${clause} ORDER BY b."startTime" DESC, b.id
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, paging.pageSize, paging.offset],
    ),
  ]);
  return paginated(rows.rows, paging, count.rows[0].n);
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    res.status(201).json(await createBooking(req.user, req.body));
  }),
);

// Must be registered before '/:id' so "mine" is not treated as an id.
router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const where = ['b."userId" = $1'];
    const params = [req.user.id];
    if (req.query.status !== undefined) {
      params.push(enumValue(req.query.status, BOOKING_STATUSES, 'status'));
      where.push(`b.status = $${params.length}`);
    }
    res.json(await pagedBookings(where, params, paging));
  }),
);

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const where = [];
    const params = [];
    const add = (sql, v) => {
      params.push(v);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (req.query.status !== undefined) add('b.status = ?', enumValue(req.query.status, BOOKING_STATUSES, 'status'));
    if (req.query.resourceId !== undefined) {
      if (!isUuid(req.query.resourceId)) throw validationError('resourceId must be a valid id');
      add('b."resourceId" = ?', req.query.resourceId);
    }
    const from = req.query.from !== undefined ? isoDate(req.query.from, 'from') : null;
    const to = req.query.to !== undefined ? isoDate(req.query.to, 'to') : null;
    if (from && to && to <= from) throw validationError('to must be after from');
    // "Overlapping from/to": a booking matches if it intersects the window.
    if (from) add('b."endTime" > ?', from.toISOString());
    if (to) add('b."startTime" < ?', to.toISOString());
    res.json(await pagedBookings(where, params, paging));
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound('Booking not found');
    const booking = await fetchBooking({ query }, req.params.id);
    if (!booking) throw notFound('Booking not found');
    if (booking.userId !== req.user.id && req.user.role !== 'ADMIN') throw forbidden('Not your booking');
    res.json(booking);
  }),
);

router.patch(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    res.json(await cancelBooking(req.user, req.params.id));
  }),
);

router.patch(
  '/:id/approve',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await approveBooking(req.params.id));
  }),
);

router.patch(
  '/:id/reject',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await rejectBooking(req.params.id, req.body));
  }),
);

export default router;
