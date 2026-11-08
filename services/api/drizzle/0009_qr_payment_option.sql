-- TQR-029: QR payment is a per-restaurant option, off by default. A restaurant that already saved
-- a bank account (before the option existed) keeps taking QR transfers, so nobody silently loses
-- the VietQR on their bills. `rules_updated_at` is left alone: no rule changes meaning (AC12), the
-- data only states what these restaurants already did. Restaurants without an account stay off.
UPDATE "restaurants"
SET "rules" = "rules" || '{"payment":{"qrEnabled":true}}'::jsonb
WHERE "bank_bin" IS NOT NULL;
