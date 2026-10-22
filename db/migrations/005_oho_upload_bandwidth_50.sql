ALTER TABLE plans
  DROP CONSTRAINT IF EXISTS plans_pricing_fields_check;

ALTER TABLE services
  DROP CONSTRAINT IF EXISTS services_negotiated_fields_check;

UPDATE plans
SET download_mbps = 100,
    upload_mbps = 50
WHERE plan_type = 'oho';

UPDATE services s
SET download_mbps = 100,
    upload_mbps = 50
FROM plans p
WHERE s.plan_id = p.id
  AND p.plan_type = 'oho';

ALTER TABLE plans
  ADD CONSTRAINT plans_pricing_fields_check CHECK (
    (
      plan_type = 'standard'
      AND pricing_mode = 'fixed'
      AND download_mbps IS NOT NULL
      AND upload_mbps IS NOT NULL
      AND monthly_price IS NOT NULL
      AND contention_ratio IS NULL
    )
    OR
    (
      plan_type = 'oho'
      AND pricing_mode = 'negotiated'
      AND download_mbps = 100
      AND upload_mbps = 50
      AND monthly_price IS NULL
      AND contention_ratio = '1:2'
    )
    OR
    (
      plan_type = 'dedicated'
      AND pricing_mode = 'negotiated'
      AND download_mbps = 100
      AND upload_mbps = 100
      AND monthly_price IS NULL
      AND contention_ratio = '1:1'
    )
  );

ALTER TABLE services
  ADD CONSTRAINT services_negotiated_fields_check CHECK (
    (
      monthly_price IS NULL
      AND download_mbps IS NULL
      AND upload_mbps IS NULL
      AND contention_ratio IS NULL
    )
    OR
    (
      monthly_price IS NOT NULL
      AND monthly_price >= 0
      AND monthly_price = trunc(monthly_price)
      AND (
        (download_mbps = 100 AND upload_mbps = 50 AND contention_ratio = '1:2')
        OR
        (download_mbps = 100 AND upload_mbps = 100 AND contention_ratio = '1:1')
      )
    )
  );
