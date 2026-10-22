ALTER TABLE mikrotik_routers
  ADD COLUMN IF NOT EXISTS radius_server_address VARCHAR(255),
  ADD COLUMN IF NOT EXISTS radius_client_address VARCHAR(255),
  ADD COLUMN IF NOT EXISTS radius_secret_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS radius_secret_iv VARCHAR(32),
  ADD COLUMN IF NOT EXISTS radius_secret_auth_tag VARCHAR(32),
  ADD COLUMN IF NOT EXISTS timezone_name VARCHAR(100) NOT NULL DEFAULT 'Asia/Jakarta',
  ADD COLUMN IF NOT EXISTS isolation_info_url TEXT;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS pppoe_password_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS pppoe_password_iv VARCHAR(32),
  ADD COLUMN IF NOT EXISTS pppoe_password_auth_tag VARCHAR(32);

CREATE TABLE IF NOT EXISTS radius_accounting_sessions (
  router_id UUID NOT NULL REFERENCES mikrotik_routers(id),
  accounting_session_id VARCHAR(255) NOT NULL,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  username VARCHAR(128) NOT NULL,
  framed_ip_address INET,
  status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'stopped')),
  started_at TIMESTAMPTZ,
  last_accounting_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stopped_at TIMESTAMPTZ,
  session_seconds BIGINT,
  input_octets BIGINT,
  output_octets BIGINT,
  terminate_cause VARCHAR(64),
  PRIMARY KEY (router_id, accounting_session_id)
);

CREATE INDEX IF NOT EXISTS radius_accounting_username_idx
  ON radius_accounting_sessions (username, last_accounting_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS mikrotik_routers_radius_client_address_idx
  ON mikrotik_routers (radius_client_address)
  WHERE radius_secret_ciphertext IS NOT NULL;
