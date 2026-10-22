ALTER TABLE services
  DROP CONSTRAINT IF EXISTS services_negotiated_fields_check;

ALTER TABLE services
  ADD CONSTRAINT services_negotiated_fields_check CHECK (
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
