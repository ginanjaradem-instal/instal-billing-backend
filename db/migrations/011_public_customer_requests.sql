CREATE TABLE IF NOT EXISTS installation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(32) NOT NULL,
  address TEXT NOT NULL,
  preferred_plan VARCHAR(120),
  status VARCHAR(24) NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'survey_scheduled', 'approved', 'rejected', 'completed')),
  staff_notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS installation_requests_status_created_idx
  ON installation_requests (status, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_trouble_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  customer_code VARCHAR(32),
  category VARCHAR(32) NOT NULL
    CHECK (category IN ('connection_down', 'slow_connection', 'unstable_connection', 'other')),
  subject VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'need_customer', 'resolved', 'closed')),
  staff_notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_trouble_reports_status_created_idx
  ON customer_trouble_reports (status, created_at DESC);
