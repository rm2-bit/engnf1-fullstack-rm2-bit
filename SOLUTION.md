# SOLUTION.md

## Part A: Architecture and ticket trace

```
 Browser (React SPA)                         Express API                         PostgreSQL
 ┌──────────────────┐   HTTPS + JWT    ┌──────────────────────────┐        ┌──────────────────┐
 │ Triage page      │ ───────────────▶ │ app.js (helmet, cors,    │        │ users            │
 │  - stats strip   │                  │   json, error handler)   │        │ tickets          │
 │  - filters + q   │                  │ routes/*  (thin: parse,  │  SQL   │ ticket_events    │
 │  - ticket panel  │ ◀─────────────── │   authz, call service)   │ ─────▶ │ resources        │
 │  (optimistic UI) │      JSON        │ services/* (rules, txns) │        │ bookings         │
 └──────────────────┘                  │ utils/* (validate,       │        │  + EXCLUDE gist  │
                                       │   classifier, errors)    │        └──────────────────┘
                                       └──────────────────────────┘
```

### Trace of an imported ticket to the dashboard
1. **`Triage.jsx` `reimportSample` / `importFile`** builds `{ tickets: [...] }` and calls `runImport`, which calls `api('/tickets/import')` (`api.js` adds the JWT).
2. **`middleware/auth.js` `authenticate`** verifies the token and sets `req.user`.
3. **`routes/tickets.js` POST `/import`** checks `tickets` is an array (max 2000) and runs `validateImportItem` on each element (400 on bad input).
4. **`services/ticketService.js` `importTickets`** de-duplicates by `externalId`, sorts by it, and opens one transaction. For each item `classify()` (`utils/classifier.js`) returns `{category, priority}`; `INSERT ... ON CONFLICT ("externalId") DO NOTHING` decides atomically whether the ticket is new. Existing rows are locked with `SELECT ... FOR UPDATE` and updated per the override rules (Part B). Counts are returned.
5. **Back in `runImport`** the UI shows the counts and bumps `refreshKey` / `statsKey`.
6. **`listTickets`** (GET `/tickets`) validates filters, builds a parameterised `WHERE`, and returns a paginated page; **`getTicketStats`** (GET `/stats`) computes the counts and `modelAgreementRate` shown in the stats strip.
7. **Rendering**: ticket text is placed in React text nodes, which escape HTML; there is no `dangerouslySetInnerHTML` anywhere.

### Definition of "reviewed"
`isReviewed` becomes `true` when an agent, via `PATCH /api/tickets/:id`, **changes the category** or **moves the status away from `OPEN`**. Priority or assignee changes alone do not mark a ticket reviewed. It never reverts to `false`. Seeded tickets marked reviewed follow the same meaning.

`modelAgreementRate` = reviewed tickets whose `category` equals `autoCategory`, divided by reviewed tickets, as a percentage with one decimal (0 when nothing is reviewed).

## Part B: Concurrency and idempotent override design

### Booking race safety (B6)
Application-level "check then insert" is racy: two requests can both see the slot free and both insert. The guarantee therefore lives in the database:

- `bookings_no_overlap` (`backend/src/db/schema.sql:68`) is `EXCLUDE USING gist ("resourceId" WITH =, tstzrange("startTime","endTime",'[)') WITH &&) WHERE (status IN ('PENDING','APPROVED'))`.
  - Half-open `[)` ranges make back-to-back bookings legal (B5).
  - The `WHERE` clause means REJECTED and CANCELLED rows no longer block the slot.
  - When two transactions insert overlapping rows concurrently, the second waits for the first to finish; if the first commits it fails with SQLSTATE `23P01`.
- `createBooking` (`backend/src/services/bookingService.js:70`) maps `23P01` to a `409 CONFLICT`.
- The "max 3 active future bookings" rule is a count-then-insert, so it is serialised per user with `pg_advisory_xact_lock(hashtextextended(userId, 0))` (`bookingService.js:52`). Different users never block each other.
- `backend/scripts/concurrency-test.js` fires N simultaneous requests from N fresh users for one slot and asserts exactly one `201` and the rest `409`. The constraint itself was also exercised with 10 parallel inserts against PostgreSQL 16 (1 success, 9 exclusion violations).

### Idempotent re-import with human-override protection (T-B2)
- `externalId` is `UNIQUE`; `INSERT ... ON CONFLICT DO NOTHING` (`ticketService.js:52`) makes "is this new?" atomic, so two concurrent imports cannot create duplicates.
- For existing rows, `SELECT ... FOR UPDATE` (`ticketService.js:64`) locks the row; items are processed in `externalId` order so concurrent imports lock in a consistent order and cannot deadlock.
- If `isHumanOverride = true` (`ticketService.js:73`) only `subject`/`body` may change; `category` and `autoCategory` are never touched and the ticket is counted in `skippedOverrideCount`.
- If `isHumanOverride = false` the classifier re-runs and may update `autoCategory`, `category`, and `priority` (priority is left alone if an agent ever edited it, which is detectable from `ticket_events`).
- Import never writes `ticket_events`; that table is the audit trail of agent actions only.
- Counts: `importedCount` = new, `updatedCount` = existing non-overridden tickets that changed, `skippedOverrideCount` = existing overridden tickets, `total` = items in the request.

### Other safety notes
- Search (`q`) uses a bound parameter plus `ILIKE ... ESCAPE '\'` with `%`, `_` and `\` escaped (`ticketService.js:119`), so it is injection-safe and treats wildcards literally.
- PATCH runs in a transaction with `SELECT ... FOR UPDATE`, so two agents editing one ticket produce a consistent event log.

## Part C: Measure first, then optimise

**Method.** `npm run bench` (`backend/scripts/benchmark.js`) inserts 5,000 synthetic tickets (`bench-*`), drops the ticket indexes, measures `GET /api/tickets?limit=100` and two variants over 30 runs each (after a warm-up), applies `backend/src/db/indexes.sql`, runs `ANALYZE`, and measures again. It also prints `EXPLAIN (ANALYZE, BUFFERS)` plans before and after. Run it against the **deployed** API and database so network and DB conditions match the live app.

**Changes under test** (`backend/src/db/indexes.sql`):
- btree on `("createdAt" DESC, id DESC)` to serve the default ordering with `LIMIT` without a sort;
- btree indexes on `status`, `category`, `priority` for equality filters;
- GIN trigram indexes on `subject` and `body` for `ILIKE '%term%'`.

**Results.** *Fill in from your own run; do not submit numbers you did not measure.*

| Request | p50 before (ms) | p50 after (ms) | p95 before | p95 after |
| --- | --- | --- | --- | --- |
| `GET /api/tickets?limit=100` | _ | _ | _ | _ |
| `...&status=OPEN&category=BUG` | _ | _ | _ | _ |
| `...&q=refund` | _ | _ | _ | _ |

Rows in the table: _ (e.g. 5,000). Environment: _ (host, region, DB tier). Plan changes observed in EXPLAIN: _.

**Trade-off.** Indexes make reads faster but every import and PATCH must now maintain six more index structures, and the two GIN trigram indexes over `body` (up to 2,000 chars) are large and slow bulk inserts the most. That is acceptable for a read-heavy triage queue but would need revisiting for a very write-heavy feed. Also, at only hundreds of rows PostgreSQL may keep choosing a sequential scan; the benefit shows as the table grows.

## Part D: One more day
> Replace with your own priorities after reviewing the code. Candidates, with where they would go:

- Tighten TLS to the database: `backend/src/db/pool.js:6` currently sets `rejectUnauthorized: false`; supply the provider CA instead.
- Move import to a bulk `INSERT ... SELECT unnest(...)` plus one set-based update, instead of per-ticket statements (`ticketService.js:47`), for large feeds.
- Add a user-lookup endpoint so the Assignee control can pick any agent (`frontend/src/pages/Triage.jsx`, `TicketPanel`).
- Move the in-memory auth rate limiter to a shared store so limits hold across instances (`backend/src/middleware/rateLimit.js`).
- Add automated API tests (override protection, check order, race test in CI) and frontend component tests.
