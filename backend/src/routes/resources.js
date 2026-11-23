import { Router } from 'express';
import { query } from '../db/pool.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { asyncHandler, conflict, notFound, validationError } from '../utils/errors.js';
import {
  RESOURCE_TYPES,
  enumValue,
  escapeLike,
  isUuid,
  isoDate,
  optionalQueryString,
  paginated,
  parsePaging,
  positiveInt,
  trimmedString,
} from '../utils/validate.js';

const router = Router();
router.use(authenticate);

const COLS = 'id, name, type, capacity, description, "isActive", "createdAt"';
const DAY_MS = 24 * 3_600_000;

async function findResource(id, user) {
  if (!isUuid(id)) throw notFound('Resource not found');
  const { rows } = await query(`SELECT ${COLS} FROM resources WHERE id = $1`, [id]);
  const r = rows[0];
  // Inactive resources are invisible (404) to non-admins.
  if (!r || (!r.isActive && user.role !== 'ADMIN')) throw notFound('Resource not found');
  return r;
}

function parseResourceBody(body, { partial }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw validationError('Body must be an object');
  const out = {};
  const want = (k) => (partial ? body[k] !== undefined : true);

  if (want('name')) out.name = trimmedString(body.name, 3, 60, 'name');
  if (want('type')) out.type = enumValue(body.type, RESOURCE_TYPES, 'type');
  if (want('capacity')) {
    if (!Number.isInteger(body.capacity) || body.capacity < 1 || body.capacity > 500) {
      throw validationError('capacity must be an integer between 1 and 500');
    }
    out.capacity = body.capacity;
  }
  if (body.description !== undefined) {
    if (body.description === null) out.description = null;
    else {
      const d = trimmedString(body.description, 0, 300, 'description');
      out.description = d === '' ? null : d;
    }
  }
  if (partial && body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') throw validationError('isActive must be a boolean');
    out.isActive = body.isActive;
  }
  if (partial && Object.keys(out).length === 0) throw validationError('No valid fields to update');
  return out;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const where = [];
    const params = [];
    const add = (sql, v) => {
      params.push(v);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (req.user.role !== 'ADMIN') where.push('"isActive" = true');

    const search = optionalQueryString(req.query.search, 'search', 100);
    if (search) add(`name ILIKE ? ESCAPE '\\'`, `%${escapeLike(search)}%`);
    if (req.query.type !== undefined) add('type = ?', enumValue(req.query.type, RESOURCE_TYPES, 'type'));
    if (req.query.minCapacity !== undefined) {
      add('capacity >= ?', positiveInt(req.query.minCapacity, 'minCapacity', { max: 500 }));
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [count, rows] = await Promise.all([
      query(`SELECT count(*)::int AS n FROM resources ${clause}`, params),
      query(
        `SELECT ${COLS} FROM resources ${clause} ORDER BY lower(name) ASC, id
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, paging.pageSize, paging.offset],
      ),
    ]);
    res.json(paginated(rows.rows, paging, count.rows[0].n));
  }),
);

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const r = parseResourceBody(req.body, { partial: false });
    try {
      const { rows } = await query(
        `INSERT INTO resources (name, type, capacity, description) VALUES ($1, $2, $3, $4) RETURNING ${COLS}`,
        [r.name, r.type, r.capacity, r.description ?? null],
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23505') throw conflict('A resource with that name already exists');
      throw err;
    }
  }),
);

router.get(
  '/:id/availability',
  asyncHandler(async (req, res) => {
    const resource = await findResource(req.params.id, req.user);
    const from = isoDate(req.query.from, 'from');
    const to = isoDate(req.query.to, 'to');
    if (to <= from) throw validationError('to must be after from');
    if (to - from > 7 * DAY_MS) throw validationError('Range must not exceed 7 days');
    // Privacy: only times and status are exposed, never who booked or why.
    const { rows } = await query(
      `SELECT "startTime", "endTime", status FROM bookings
       WHERE "resourceId" = $1 AND status IN ('PENDING','APPROVED')
         AND "startTime" < $3 AND "endTime" > $2
       ORDER BY "startTime"`,
      [resource.id, from.toISOString(), to.toISOString()],
    );
    res.json({ resourceId: resource.id, from: from.toISOString(), to: to.toISOString(), bookings: rows });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await findResource(req.params.id, req.user));
  }),
);

router.patch(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound('Resource not found');
    const exists = await query('SELECT 1 FROM resources WHERE id = $1', [req.params.id]);
    if (exists.rowCount === 0) throw notFound('Resource not found');

    const patch = parseResourceBody(req.body, { partial: true });
    const keys = Object.keys(patch);
    const sets = keys.map((k, i) => `"${k}" = $${i + 2}`); // keys are whitelisted by parseResourceBody
    try {
      const { rows } = await query(`UPDATE resources SET ${sets.join(', ')} WHERE id = $1 RETURNING ${COLS}`, [
        req.params.id,
        ...keys.map((k) => patch[k]),
      ]);
      res.json(rows[0]);
    } catch (err) {
      if (err.code === '23505') throw conflict('A resource with that name already exists');
      throw err;
    }
  }),
);

export default router;
