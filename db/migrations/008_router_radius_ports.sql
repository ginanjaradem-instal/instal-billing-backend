ALTER TABLE mikrotik_routers
  ADD COLUMN IF NOT EXISTS radius_auth_port INTEGER NOT NULL DEFAULT 1812
    CHECK (radius_auth_port BETWEEN 1 AND 65535),
  ADD COLUMN IF NOT EXISTS radius_accounting_port INTEGER NOT NULL DEFAULT 1813
    CHECK (radius_accounting_port BETWEEN 1 AND 65535);
