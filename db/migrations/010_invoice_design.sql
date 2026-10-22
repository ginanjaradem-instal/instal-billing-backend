CREATE TABLE IF NOT EXISTS invoice_design_settings (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  logo_left BYTEA,
  logo_left_mime VARCHAR(32),
  logo_right BYTEA,
  logo_right_mime VARCHAR(32),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((logo_left IS NULL) = (logo_left_mime IS NULL)),
  CHECK ((logo_right IS NULL) = (logo_right_mime IS NULL))
);

INSERT INTO invoice_design_settings (singleton)
VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;
