// SOLUTION.md Part C: latency of GET /api/tickets before vs after indexes.
// Usage: API_URL=... DATABASE_URL=... node scripts/benchmark.js [rows=5000] [runs=30] [--cleanup]
// Point API_URL at the same database as DATABASE_URL (local server, or the deployed API).
import { pool } from '../src/db/pool.js';

const API = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '') + '/api';
const args = process.argv.slice(2);
const rows = Number(args.find((a) => /^\d+$/.test(a)) || 5000);
const runs = Number(args.filter((a) => /^\d+$/.test(a))[1] || 30);

if (args.includes('--cleanup')) {
  const r = await pool.query(`DELETE FROM tickets WHERE "externalId" LIKE 'bench-%'`);
  console.log(`Removed ${r.rowCount} benchmark tickets.`);
  await pool.end();
  process.exit(0);
}

const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@triagesync.test', password: 'User@123' }),
});
const { token } = await login.json();

await pool.query(
  `INSERT INTO tickets ("externalId", subject, body, "autoCategory", category, priority, status, "createdAt")
   SELECT 'bench-' || g,
          'Benchmark ticket ' || g || ' ' || (ARRAY['refund','password','package','crash','feature'])[1 + g % 5],
          repeat('lorem ipsum dolor sit amet ', 8) || g,
          (ARRAY['BILLING','LOGIN','DELIVERY','BUG','FEATURE_REQUEST'])[1 + g % 5],
          (ARRAY['BILLING','LOGIN','DELIVERY','BUG','FEATURE_REQUEST'])[1 + g % 5],
          (ARRAY['LOW','MEDIUM','HIGH','URGENT'])[1 + g % 4],
          (ARRAY['OPEN','IN_PROGRESS','RESOLVED','CLOSED'])[1 + g % 4],
          now() - (g || ' minutes')::interval
   FROM generate_series(1, $1) g ON CONFLICT ("externalId") DO NOTHING`,
  [rows],
);
const total = (await pool.query('SELECT count(*)::int AS n FROM tickets')).rows[0].n;
console.log(`Tickets in database: ${total}\n`);

const ENDPOINTS = [
  ['limit=100', '/tickets?limit=100'],
  ['limit=100 + status & category', '/tickets?limit=100&status=OPEN&category=BUG'],
  ['limit=100 + q=refund', '/tickets?limit=100&q=refund'],
];

async function measure(path) {
  const times = [];
  await fetch(API + path, { headers: { Authorization: `Bearer ${token}` } }); // warm-up
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    const res = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` } });
    await res.json();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const pct = (p) => times[Math.min(times.length - 1, Math.floor(times.length * p))];
  return { p50: pct(0.5), p95: pct(0.95), mean: times.reduce((a, b) => a + b, 0) / times.length };
}

async function phase(label) {
  await pool.query('ANALYZE tickets');
  const out = {};
  for (const [name, path] of ENDPOINTS) out[name] = await measure(path);
  console.log(`--- ${label} (${runs} runs each, ms) ---`);
  console.table(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { p50: v.p50.toFixed(1), p95: v.p95.toFixed(1), mean: v.mean.toFixed(1) }])));
  return out;
}

async function explain(sql) {
  const { rows: r } = await pool.query(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`);
  return r.map((x) => x['QUERY PLAN']).join('\n');
}
const LIST_SQL = `SELECT * FROM tickets WHERE status = 'OPEN' AND category = 'BUG' ORDER BY "createdAt" DESC, id DESC LIMIT 100`;
const SEARCH_SQL = `SELECT * FROM tickets WHERE subject ILIKE '%refund%' OR body ILIKE '%refund%' ORDER BY "createdAt" DESC, id DESC LIMIT 100`;

await pool.query(`
  DROP INDEX IF EXISTS idx_tickets_created; DROP INDEX IF EXISTS idx_tickets_status;
  DROP INDEX IF EXISTS idx_tickets_category; DROP INDEX IF EXISTS idx_tickets_priority;
  DROP INDEX IF EXISTS idx_tickets_subject_trgm; DROP INDEX IF EXISTS idx_tickets_body_trgm;`);
const before = await phase('BEFORE indexes');
const planBefore = await explain(LIST_SQL);
const searchBefore = await explain(SEARCH_SQL);

const { readFile } = await import('node:fs/promises');
await pool.query(await readFile(new URL('../src/db/indexes.sql', import.meta.url), 'utf8'));
const after = await phase('AFTER indexes');
const planAfter = await explain(LIST_SQL);
const searchAfter = await explain(SEARCH_SQL);

console.log('\nSpeed-up (p50):');
for (const [name] of ENDPOINTS) console.log(`  ${name}: ${before[name].p50.toFixed(1)} ms -> ${after[name].p50.toFixed(1)} ms`);
console.log('\n=== EXPLAIN ANALYZE, filtered list, BEFORE ===\n' + planBefore);
console.log('\n=== EXPLAIN ANALYZE, filtered list, AFTER ===\n' + planAfter);
console.log('\n=== EXPLAIN ANALYZE, q search, BEFORE ===\n' + searchBefore);
console.log('\n=== EXPLAIN ANALYZE, q search, AFTER ===\n' + searchAfter);
console.log('\nRun with --cleanup to delete the bench-* tickets.');
await pool.end();
