# TriageSync

## 1. Overview
TriageSync is a full-stack support-triage and resource-slot scheduling app. Incoming tickets are auto-categorised and prioritised by a deterministic classifier, reviewed by agents (human overrides are protected, every change is audited), and tickets that need live troubleshooting can be linked to 30-minute bookings on shared rooms, labs and equipment that an admin approves.

Monorepo layout: `frontend/` (React + Vite) and `backend/` (Node + Express + PostgreSQL).

## 2. Live links
> Fill in after deploying. Keep them live for at least 14 days after the deadline.
- Frontend: `https://engnf1-fullstack-rm2-bit.vercel.app/`
- Backend API: `https://engnf1-fullstack-rm2-bit.onrender.com` (health check: `/api/health`)
- Repository: `https://github.com/rm2-bit/engnf1-fullstack-rm2-bit`

## 3. Seeded credentials
| Role | Email | Password |
| --- | --- | --- |
| ADMIN | admin@triagesync.test | Admin@123 |
| USER | user@triagesync.test | User@123 |

Public registration only ever creates `USER` accounts; admins exist only via the seed script.

## 4. Tech stack
- Frontend: React 18, React Router 6, Vite, plain CSS
- Backend: Node 18+ (ESM), Express 4, `pg`, `bcryptjs` (cost 10), `jsonwebtoken` (12h expiry), `helmet`, `cors`
- Database: PostgreSQL (hosted, e.g. Neon) with `btree_gist` (booking exclusion constraint) and `pg_trgm` (search index)
- Suggested hosting: Neon (DB), Render (API), Vercel or Netlify (frontend)

## 5. Folder structure
```
backend/
  src/
    app.js, server.js, config.js
    db/         pool.js, schema.sql, indexes.sql, migrate.js, seed.js
    middleware/ auth.js (JWT + role guard)
    routes/     auth, tickets (+stats), resources, bookings, admin
    services/   ticketService, bookingService, statsService
    utils/      classifier, validate, slots, errors
  scripts/      concurrency-test.js, benchmark.js
frontend/
  public/       sample-feed.json, _redirects
  src/          App.jsx, api.js, auth.jsx, hooks.js, styles.css
    components/ ui.jsx
    lib/        time.js
    pages/      Login, Register, Triage, Resources, ResourceDetail,
                MyBookings, AdminResources, AdminBookings, AdminAnalytics
SOLUTION.md, AI_USAGE.md, README.md
```

## 6. Local setup and idempotent seed
Prerequisites: Node 18+, a PostgreSQL database (local or hosted) that allows the `btree_gist` and `pg_trgm` extensions.

```bash
# Backend
cd backend
cp .env.example .env          # set DATABASE_URL and JWT_SECRET (DB_SSL=false for local Postgres)
npm install
npm run db:setup              # creates tables + indexes (safe to re-run)
npm run seed                  # idempotent: running it twice creates no duplicates
npm run dev                   # http://localhost:4000

# Frontend (second terminal)
cd frontend
cp .env.example .env          # leave VITE_API_URL empty locally; the Vite dev server proxies /api
npm install
npm run dev                   # http://localhost:5173
```

Seed data: 2 users, 8 resources (3 rooms, 2 labs, 3 equipment; `Archive Room` is inactive), 16 tickets covering every category and priority, 4 already reviewed, and 1 ticket with raw `<script>` / HTML in its subject and body.

Deploy: set `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN` (frontend URL) on the API host and run `npm run db:setup && npm run seed` once against the hosted database. Set `VITE_API_URL` (backend origin, without `/api`) on the frontend host at build time.

Checks: `API_URL=<api> npm run test:concurrency` (10 simultaneous bookings for one slot) and `npm run bench` (latency before/after indexes).

## 7. DB schema
Column names are quoted camelCase so API output matches the brief exactly.
- `users(id, name, email unique lowercase, passwordHash, role, createdAt)`
- `tickets(id, externalId unique, subject, body, autoCategory, category, isHumanOverride, priority, status, assigneeId, isReviewed, createdAt, updatedAt)`
- `ticket_events(id, ticketId, field, oldValue, newValue, actor, createdAt)`
- `resources(id, name unique case-insensitive, type, capacity, description, isActive, createdAt)`
- `bookings(id, resourceId, userId, ticketId, startTime, endTime, purpose, status, decisionNote, createdAt)` with `EXCLUDE USING gist` preventing overlapping PENDING/APPROVED bookings per resource.

Full DDL: `backend/src/db/schema.sql`, `backend/src/db/indexes.sql`.

## 8. API summary
All routes are under `/api`. Errors: `{ error: { code, message } }`. Check order: 401, 403 (role), 404 (path id), 403 (ownership), 400, 404 (referenced id), 409.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Tickets | `POST /tickets/import`, `GET /tickets`, `GET /tickets/:id`, `PATCH /tickets/:id`, `GET /stats` |
| Resources | `GET /resources`, `GET /resources/:id`, `POST /resources` (admin), `PATCH /resources/:id` (admin), `GET /resources/:id/availability` |
| Bookings | `POST /bookings`, `GET /bookings/mine`, `GET /bookings/:id`, `GET /bookings` (admin), `PATCH /bookings/:id/cancel`, `/approve` (admin), `/reject` (admin) |
| Admin | `GET /admin/stats` |

## 9. Completed features checklist
Tick these yourself after testing on the live URL.
- [ ] Register / login / auth redirects
- [ ] Idempotent import + auto-triage + human-override protection
- [ ] Agent PATCH with audit trail (`ticket_events`)
- [ ] Combined, injection-safe filters and search
- [ ] Stats strip with Model Agreement Rate
- [ ] Optimistic UI with rollback and visible error
- [ ] XSS-safe ticket rendering
- [ ] Resources list, filters, pagination, detail, availability
- [ ] Booking form with 30-minute grid and all rules
- [ ] My Bookings with cancel confirmation
- [ ] Admin: resources CRUD/toggle, bookings approve/reject with note, analytics
- [ ] Race-safe booking (10 concurrent requests, one 201)
- [ ] Responsive at 375 / 768 / 1280 px

## 10. Known limitations
- Assignee control is "me / unassigned" only, because the API contract has no user-listing endpoint.
- `Re-Import Feed` posts a bundled sample feed (`frontend/public/sample-feed.json`) or a JSON file you pick.
- The JWT lives in `localStorage`; there is no refresh-token flow (tokens last 12 hours).
- The auth rate limiter is in-memory, so each server instance counts separately.
- Frontend has no automated tests.
