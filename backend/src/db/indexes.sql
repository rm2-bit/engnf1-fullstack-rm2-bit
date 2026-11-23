-- Ticket read-path indexes (SOLUTION.md Part C). Applied separately from schema.sql so the
-- "before" latency can be measured without them: npm run db:drop-indexes / db:indexes.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Default list order: newest first, with id as a stable tiebreaker.
CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets ("createdAt" DESC, id DESC);
-- Equality filters.
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets (category);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets (priority);
-- ILIKE '%term%' search on subject and body.
CREATE INDEX IF NOT EXISTS idx_tickets_subject_trgm ON tickets USING gin (subject gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tickets_body_trgm ON tickets USING gin (body gin_trgm_ops);
