import { Router } from 'express';
import { query } from '../db/pool.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { getTicketStats } from '../services/statsService.js';
import { asyncHandler } from '../utils/errors.js';
import { BOOKING_STATUSES } from '../utils/validate.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const [active, byStatus, top, ticketStats] = await Promise.all([
      query('SELECT count(*)::int AS n FROM resources WHERE "isActive" = true'),
      query('SELECT status, count(*)::int AS n FROM bookings GROUP BY status'),
      // "Top" = most bookings of any status; ties broken by name for a stable order.
      query(
        `SELECT r.id AS "resourceId", r.name, r.type, count(b.id)::int AS "bookingCount"
         FROM resources r JOIN bookings b ON b."resourceId" = r.id
         GROUP BY r.id ORDER BY "bookingCount" DESC, lower(r.name) LIMIT 3`,
      ),
      getTicketStats(),
    ]);
    const bookingsByStatus = Object.fromEntries(BOOKING_STATUSES.map((s) => [s, 0]));
    for (const r of byStatus.rows) bookingsByStatus[r.status] = r.n;
    res.json({
      activeResources: active.rows[0].n,
      bookingsByStatus,
      topResources: top.rows,
      ticketStats,
    });
  }),
);

export default router;
