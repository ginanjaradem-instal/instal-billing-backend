CREATE TABLE IF NOT EXISTS mikrotik_routers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL UNIQUE,
  host VARCHAR(255) NOT NULL,
  port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
  username VARCHAR(128) NOT NULL,
  password_ciphertext TEXT NOT NULL,
  password_iv VARCHAR(32) NOT NULL,
  password_auth_tag VARCHAR(32) NOT NULL,
  use_tls BOOLEAN NOT NULL DEFAULT TRUE,
  timeout_seconds SMALLINT NOT NULL DEFAULT 5
    CHECK (timeout_seconds BETWEEN 1 AND 30),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS router_id UUID
    REFERENCES mikrotik_routers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS services_router_id_idx ON services (router_id);
