-- Migration: 20260924000000_shop_owner_razorpay_gateway.sql
-- Direct Shop Owner Razorpay Account Gateway Integration
-- Allows shop owners to configure their own Razorpay Key ID, Secret, and Webhook Secret
-- so that customer payments are settled directly into the shopkeeper's bank account.

-- 1. Add Razorpay credential columns to public.shop_settings
ALTER TABLE public.shop_settings
ADD COLUMN IF NOT EXISTS razorpay_key_id text,
ADD COLUMN IF NOT EXISTS razorpay_key_secret text,
ADD COLUMN IF NOT EXISTS razorpay_webhook_secret text;

-- 2. Add validation constraint for Razorpay Key ID format (if provided)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shop_settings_razorpay_key_id_format'
  ) THEN
    ALTER TABLE public.shop_settings
    ADD CONSTRAINT shop_settings_razorpay_key_id_format
    CHECK (
      razorpay_key_id IS NULL OR 
      razorpay_key_id ~ '^rzp_(test|live)_[A-Za-z0-9]+$'
    );
  END IF;
END $$;

-- 3. Update public_shop_directory view to include has_online_payment indicator
-- NOTE: Never expose key_secret or webhook_secret in public views.
DROP VIEW IF EXISTS public.public_shop_directory CASCADE;

CREATE VIEW public.public_shop_directory AS
SELECT
  s.public_id,
  s.name,
  s.is_active,
  coalesce(ss.accepting_orders, false) AS accepting_orders,
  CASE
    WHEN NOT s.is_active THEN 'inactive'
    WHEN coalesce(ss.accepting_orders, false) THEN 'available'
    ELSE 'unavailable'
  END AS status,
  CASE
    WHEN exists (SELECT 1 FROM public.printers p WHERE p.shop_id = s.id AND p.status IN ('online', 'printing')) THEN 'ready'
    WHEN exists (SELECT 1 FROM public.desktop_agents a WHERE a.shop_id = s.id) THEN 'offline'
    ELSE 'not_connected'
  END AS printer_status,
  coalesce(ss.payment_mode, 'both') AS payment_mode,
  (ss.razorpay_key_id IS NOT NULL AND ss.razorpay_key_secret IS NOT NULL) AS has_custom_razorpay
FROM public.shops s
LEFT JOIN public.shop_settings ss ON ss.shop_id = s.id;

GRANT SELECT ON public.public_shop_directory TO anon, authenticated;
