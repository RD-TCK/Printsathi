-- Migration: Add billing_mode to shop_settings
-- 'customer_fee': Platform convenience fee added to customer print orders (0.50 for <= 5 pages, 1.50 for >= 6 pages).
-- 'shop_subscription': Zero platform convenience fee for customers; shop pays subscription.

ALTER TABLE public.shop_settings
ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'customer_fee';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shop_settings_billing_mode'
  ) THEN
    ALTER TABLE public.shop_settings
    ADD CONSTRAINT shop_settings_billing_mode CHECK (billing_mode IN ('customer_fee', 'shop_subscription'));
  END IF;
END $$;
