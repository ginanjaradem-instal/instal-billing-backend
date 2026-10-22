ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS plan_type VARCHAR(20) NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS pricing_mode VARCHAR(20) NOT NULL DEFAULT 'fixed';

ALTER TABLE plans
  ALTER COLUMN download_mbps DROP NOT NULL,
  ALTER COLUMN upload_mbps DROP NOT NULL,
  ALTER COLUMN monthly_price DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'plans_plan_type_check'
      AND conrelid = 'plans'::regclass
  ) THEN
    ALTER TABLE plans ADD CONSTRAINT plans_plan_type_check
      CHECK (plan_type IN ('standard', 'oho', 'dedicated'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'plans_pricing_mode_check'
      AND conrelid = 'plans'::regclass
  ) THEN
    ALTER TABLE plans ADD CONSTRAINT plans_pricing_mode_check
      CHECK (pricing_mode IN ('fixed', 'negotiated'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'plans_pricing_fields_check'
      AND conrelid = 'plans'::regclass
  ) THEN
    ALTER TABLE plans ADD CONSTRAINT plans_pricing_fields_check CHECK (
      (pricing_mode = 'fixed'
        AND download_mbps IS NOT NULL
        AND upload_mbps IS NOT NULL
        AND monthly_price IS NOT NULL)
      OR
      (pricing_mode = 'negotiated'
        AND download_mbps IS NULL
        AND upload_mbps IS NULL
        AND monthly_price IS NULL)
    );
  END IF;
END $$;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS monthly_price NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS download_mbps INTEGER,
  ADD COLUMN IF NOT EXISTS upload_mbps INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'services_negotiated_fields_check'
      AND conrelid = 'services'::regclass
  ) THEN
    ALTER TABLE services ADD CONSTRAINT services_negotiated_fields_check CHECK (
      (monthly_price IS NULL AND download_mbps IS NULL AND upload_mbps IS NULL)
      OR
      (monthly_price IS NOT NULL
        AND monthly_price >= 0
        AND monthly_price = trunc(monthly_price)
        AND download_mbps IS NOT NULL
        AND download_mbps > 0
        AND upload_mbps IS NOT NULL
        AND upload_mbps > 0)
    );
  END IF;
END $$;
