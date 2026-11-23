import { query } from '../db/pool.js';
import { CATEGORIES, PRIORITIES, STATUSES } from '../utils/validate.js';

async function countBy(column, keys) {
  const { rows } = await query(`SELECT ${column} AS key, count(*)::int AS n FROM tickets GROUP BY ${column}`);
  const out = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const r of rows) out[r.key] = r.n;
  return out;
}

/**
 * modelAgreementRate = % of REVIEWED tickets where the agent's final category equals the
 * classifier's autoCategory. 0 when nothing has been reviewed yet.
 */
export async function getTicketStats() {
  const [byCategory, byPriority, byStatus, review] = await Promise.all([
    countBy('category', CATEGORIES),
    countBy('priority', PRIORITIES),
    countBy('status', STATUSES),
    query(`SELECT count(*) FILTER (WHERE "isReviewed")::int AS reviewed,
                  count(*) FILTER (WHERE "isReviewed" AND category = "autoCategory")::int AS agreed
           FROM tickets`),
  ]);
  const { reviewed, agreed } = review.rows[0];
  return {
    byCategory,
    byPriority,
    byStatus,
    reviewedCount: reviewed,
    modelAgreementRate: reviewed === 0 ? 0 : Math.round((agreed / reviewed) * 1000) / 10,
  };
}
