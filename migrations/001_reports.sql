-- LandCheck reports: each one bought (counted against the organization's monthly allowance), numbered, and kept
-- exactly as issued, with a public code anyone can use to confirm it is genuine.
CREATE TABLE settings (
  org_id uuid PRIMARY KEY,
  org_name text NOT NULL DEFAULT '',
  report_next int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  number text NOT NULL,                     -- LC-2026-000123
  verify_code text NOT NULL UNIQUE,          -- for /verify/<code>
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  place text NOT NULL,
  title text NOT NULL DEFAULT '',            -- the client's own reference, e.g. "Plot 12, Kabusa for Mr Ade"
  score int,
  result jsonb NOT NULL,                     -- the analysis as issued
  created_by text NOT NULL,
  created_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, number)
);
CREATE INDEX reports_org_idx ON reports (org_id, created_at DESC);

-- Batch checks run (Advanced plan), for the record.
CREATE TABLE batch_runs (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL,
  rows int NOT NULL,
  by_name text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
