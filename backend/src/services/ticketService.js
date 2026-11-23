import { query, withTransaction } from '../db/pool.js';
import { classify } from '../utils/classifier.js';
import { notFound, validationError } from '../utils/errors.js';
import {
  CATEGORIES,
  PRIORITIES,
  STATUSES,
  enumValue,
  escapeLike,
  isUuid,
  optionalQueryString,
  paginated,
  parsePaging,
  trimmedString,
} from '../utils/validate.js';

const TICKET_COLS = `id, "externalId", subject, body, "autoCategory", category, "isHumanOverride",
  priority, status, "assigneeId", "isReviewed", "createdAt", "updatedAt"`;

// ---------- Import (T-B1, T-B2) ----------

export function validateImportItem(raw, index) {
  if (!raw || typeof raw !== 'object') throw validationError(`tickets[${index}] must be an object`);
  return {
    externalId: trimmedString(raw.externalId, 1, 100, `tickets[${index}].externalId`),
    subject: trimmedString(raw.subject, 3, 150, `tickets[${index}].subject`),
    body: trimmedString(raw.body, 5, 2000, `tickets[${index}].body`),
  };
}

/**
 * Idempotent import. For each externalId:
 *  - INSERT ... ON CONFLICT DO NOTHING decides atomically whether the ticket is new.
 *  - Existing tickets are row-locked, subject/body refreshed, and re-classified ONLY when
 *    isHumanOverride = false. Overridden tickets keep their category and autoCategory.
 * Items are processed in externalId order so concurrent imports lock rows in the same order.
 */
export async function importTickets(rawItems) {
  const unique = [...new Map(rawItems.map((i) => [i.externalId, i])).values()].sort((a, b) =>
    a.externalId < b.externalId ? -1 : 1,
  );
  let importedCount = 0;
  let updatedCount = 0;
  let skippedOverrideCount = 0;

  await withTransaction(async (c) => {
    for (const item of unique) {
      const cls = classify(item.subject, item.body);
      const inserted = await c.query(
        `INSERT INTO tickets ("externalId", subject, body, "autoCategory", category, priority)
         VALUES ($1, $2, $3, $4, $4, $5)
         ON CONFLICT ("externalId") DO NOTHING
         RETURNING id`,
        [item.externalId, item.subject, item.body, cls.category, cls.priority],
      );
      if (inserted.rowCount === 1) {
        importedCount++;
        continue;
      }

      const { rows } = await c.query(
        `SELECT id, subject, body, "autoCategory", category, priority, "isHumanOverride",
                EXISTS (SELECT 1 FROM ticket_events e WHERE e."ticketId" = tickets.id AND e.field = 'priority') AS "priorityEdited"
         FROM tickets WHERE "externalId" = $1 FOR UPDATE`,
        [item.externalId],
      );
      const t = rows[0];

      const changes = {};
      if (t.subject !== item.subject) changes.subject = item.subject;
      if (t.body !== item.body) changes.body = item.body;

      if (t.isHumanOverride) {
        skippedOverrideCount++; // category + autoCategory are protected
      } else {
        if (t.autoCategory !== cls.category || t.category !== cls.category) {
          changes.autoCategory = cls.category;
          changes.category = cls.category;
        }
        // An agent-edited priority is also respected.
        if (!t.priorityEdited && t.priority !== cls.priority) changes.priority = cls.priority;
        if (Object.keys(changes).length > 0) updatedCount++;
      }

      const keys = Object.keys(changes);
      if (keys.length > 0) {
        const sets = keys.map((k, i) => `"${k}" = $${i + 2}`); // keys come from the fixed whitelist above
        await c.query(`UPDATE tickets SET ${sets.join(', ')}, "updatedAt" = now() WHERE id = $1`, [
          t.id,
          ...keys.map((k) => changes[k]),
        ]);
      }
    }
  });

  return { importedCount, updatedCount, skippedOverrideCount, total: rawItems.length };
}

// ---------- List (T-B4) ----------

export async function listTickets(q) {
  const paging = parsePaging(q, { defaultSize: 10, maxSize: 100, allowLimit: true });
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };

  if (q.status !== undefined) add('status = ?', enumValue(q.status, STATUSES, 'status'));
  if (q.category !== undefined) add('category = ?', enumValue(q.category, CATEGORIES, 'category'));
  if (q.priority !== undefined) add('priority = ?', enumValue(q.priority, PRIORITIES, 'priority'));

  const term = optionalQueryString(q.q, 'q');
  if (term) {
    // Parameterised + wildcard-escaped: the term is data, never SQL, and % _ \ match literally.
    params.push(`%${escapeLike(term)}%`);
    const n = params.length;
    where.push(`(subject ILIKE $${n} ESCAPE '\\' OR body ILIKE $${n} ESCAPE '\\')`);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [count, rows] = await Promise.all([
    query(`SELECT count(*)::int AS n FROM tickets ${clause}`, params),
    query(
      `SELECT ${TICKET_COLS} FROM tickets ${clause}
       ORDER BY "createdAt" DESC, id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, paging.pageSize, paging.offset],
    ),
  ]);
  return paginated(rows.rows, paging, count.rows[0].n);
}

// ---------- Detail + PATCH (T-B3) ----------

async function loadEvents(client, ticketId) {
  const { rows } = await client.query(
    `SELECT id, "ticketId", field, "oldValue", "newValue", actor, "createdAt"
     FROM ticket_events WHERE "ticketId" = $1 ORDER BY "createdAt" DESC, id DESC`,
    [ticketId],
  );
  return rows;
}

export async function getTicketWithEvents(id) {
  if (!isUuid(id)) throw notFound('Ticket not found');
  const { rows } = await query(`SELECT ${TICKET_COLS} FROM tickets WHERE id = $1`, [id]);
  if (!rows[0]) throw notFound('Ticket not found');
  return { ticket: rows[0], events: await loadEvents({ query }, id) };
}

function validatePatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw validationError('Body must be an object');
  const patch = {};
  if (body.category !== undefined) patch.category = enumValue(body.category, CATEGORIES, 'category');
  if (body.priority !== undefined) patch.priority = enumValue(body.priority, PRIORITIES, 'priority');
  if (body.status !== undefined) patch.status = enumValue(body.status, STATUSES, 'status');
  if (body.assigneeId !== undefined) {
    if (body.assigneeId !== null && typeof body.assigneeId !== 'string') {
      throw validationError('assigneeId must be a user id or null');
    }
    patch.assigneeId = body.assigneeId;
  }
  if (Object.keys(patch).length === 0) {
    throw validationError('Provide at least one of category, priority, status, assigneeId');
  }
  return patch;
}

/**
 * Check order: ticket 404 (path id) -> 400 (validation) -> 404 (referenced assignee).
 * "Reviewed" definition: isReviewed becomes true when an agent changes the category, or moves
 * the status away from OPEN. It never reverts to false.
 */
export async function patchTicket(id, body, actor) {
  if (!isUuid(id)) throw notFound('Ticket not found');

  return withTransaction(async (c) => {
    const { rows } = await c.query(`SELECT ${TICKET_COLS} FROM tickets WHERE id = $1 FOR UPDATE`, [id]);
    const current = rows[0];
    if (!current) throw notFound('Ticket not found');

    const patch = validatePatch(body);

    if (typeof patch.assigneeId === 'string') {
      const ok = isUuid(patch.assigneeId)
        ? (await c.query('SELECT 1 FROM users WHERE id = $1', [patch.assigneeId])).rowCount === 1
        : false;
      if (!ok) throw notFound('Assignee not found');
    }

    const changed = {};
    for (const field of ['category', 'priority', 'status', 'assigneeId']) {
      if (field in patch && patch[field] !== current[field]) changed[field] = patch[field];
    }

    if (Object.keys(changed).length > 0) {
      const sets = [];
      const params = [id];
      const set = (col, value) => {
        params.push(value);
        sets.push(`"${col}" = $${params.length}`);
      };
      for (const [field, value] of Object.entries(changed)) set(field, value);
      if ('category' in changed) set('isHumanOverride', true);
      if ('category' in changed || ('status' in changed && current.status === 'OPEN')) set('isReviewed', true);

      await c.query(`UPDATE tickets SET ${sets.join(', ')}, "updatedAt" = now() WHERE id = $1`, params);

      for (const [field, newValue] of Object.entries(changed)) {
        await c.query(
          `INSERT INTO ticket_events ("ticketId", field, "oldValue", "newValue", actor)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, field, current[field] ?? null, newValue ?? null, actor],
        );
      }
    }

    const updated = await c.query(`SELECT ${TICKET_COLS} FROM tickets WHERE id = $1`, [id]);
    return { ticket: updated.rows[0], events: await loadEvents(c, id) };
  });
}
