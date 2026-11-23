-- TriageSync schema. Safe to run repeatedly (IF NOT EXISTS everywhere).
-- Column names are quoted camelCase so API output uses the exact names from the brief.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 50),
  email          text NOT NULL UNIQUE CHECK (email = lower(email) AND char_length(email) <= 254),
  "passwordHash" text NOT NULL,
  role           text NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
  "createdAt"    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tickets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "externalId"      text NOT NULL UNIQUE,
  subject           text NOT NULL CHECK (char_length(subject) BETWEEN 3 AND 150),
  body              text NOT NULL CHECK (char_length(body) BETWEEN 5 AND 2000),
  "autoCategory"    text NOT NULL CHECK ("autoCategory" IN ('BILLING','BUG','FEATURE_REQUEST','LOGIN','DELIVERY')),
  category          text NOT NULL CHECK (category IN ('BILLING','BUG','FEATURE_REQUEST','LOGIN','DELIVERY')),
  "isHumanOverride" boolean NOT NULL DEFAULT false,
  priority          text NOT NULL CHECK (priority IN ('LOW','MEDIUM','HIGH','URGENT')),
  status            text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
  "assigneeId"      uuid REFERENCES users(id) ON DELETE SET NULL,
  "isReviewed"      boolean NOT NULL DEFAULT false,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_events (
  id          bigserial PRIMARY KEY,
  "ticketId"  uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  field       text NOT NULL CHECK (field IN ('category','priority','status','assigneeId')),
  "oldValue"  text,
  "newValue"  text,
  actor       text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket ON ticket_events ("ticketId", id DESC);

CREATE TABLE IF NOT EXISTS resources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 60),
  type        text NOT NULL CHECK (type IN ('ROOM','LAB','EQUIPMENT')),
  capacity    integer NOT NULL CHECK (capacity BETWEEN 1 AND 500),
  description text CHECK (description IS NULL OR char_length(description) <= 300),
  "isActive"  boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
-- Case-insensitive unique name
CREATE UNIQUE INDEX IF NOT EXISTS uq_resources_name_lower ON resources (lower(name));

CREATE TABLE IF NOT EXISTS bookings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "resourceId"   uuid NOT NULL REFERENCES resources(id),
  "userId"       uuid NOT NULL REFERENCES users(id),
  "ticketId"     uuid REFERENCES tickets(id) ON DELETE SET NULL,
  "startTime"    timestamptz NOT NULL,
  "endTime"      timestamptz NOT NULL,
  purpose        text NOT NULL CHECK (char_length(purpose) BETWEEN 5 AND 200),
  status         text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  "decisionNote" text,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  CHECK ("endTime" > "startTime"),
  -- B5/B6: the database itself refuses overlapping active bookings on one resource.
  -- Half-open ranges '[)' make back-to-back bookings legal. REJECTED/CANCELLED rows are excluded.
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
    "resourceId" WITH =,
    tstzrange("startTime", "endTime", '[)') WITH &&
  ) WHERE (status IN ('PENDING','APPROVED'))
);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings ("userId", "startTime");
CREATE INDEX IF NOT EXISTS idx_bookings_resource ON bookings ("resourceId", "startTime");
