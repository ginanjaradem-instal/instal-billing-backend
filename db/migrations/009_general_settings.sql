CREATE TABLE IF NOT EXISTS general_settings (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  company_name VARCHAR(160) NOT NULL DEFAULT '',
  company_address TEXT NOT NULL DEFAULT '',
  company_phone VARCHAR(32) NOT NULL DEFAULT '',
  invoice_description TEXT NOT NULL DEFAULT '',
  bank_count SMALLINT NOT NULL DEFAULT 1 CHECK (bank_count IN (1, 2)),
  bank_accounts JSONB NOT NULL DEFAULT '[]'::jsonb,
  invoice_reminder_days SMALLINT NOT NULL DEFAULT 3
    CHECK (invoice_reminder_days IN (3, 5, 7, 10)),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO general_settings (singleton)
VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;
