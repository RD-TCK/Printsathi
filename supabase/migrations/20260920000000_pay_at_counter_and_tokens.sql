-- Migration: Add Pay at Counter and Token Queue System
-- 1. Add payment_mode to shop_settings ('online', 'counter', 'both')
ALTER TABLE public.shop_settings
ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'both';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shop_settings_payment_mode'
  ) THEN
    ALTER TABLE public.shop_settings
    ADD CONSTRAINT shop_settings_payment_mode CHECK (payment_mode IN ('online', 'counter', 'both'));
  END IF;
END $$;

-- 2. Add columns to orders for Pay at Counter token system
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'online';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_mode'
  ) THEN
    ALTER TABLE public.orders
    ADD CONSTRAINT orders_payment_mode CHECK (payment_mode IN ('online', 'counter'));
  END IF;
END $$;

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS token_number integer;

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS orders_counter_queue_idx
ON public.orders (shop_id, payment_mode, status, created_at)
WHERE payment_mode = 'counter';

CREATE INDEX IF NOT EXISTS orders_token_number_idx
ON public.orders (shop_id, token_number, created_at);

-- 3. Update public_shop_directory view to expose payment_mode
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
  coalesce(ss.payment_mode, 'both') AS payment_mode
FROM public.shops s
LEFT JOIN public.shop_settings ss ON ss.shop_id = s.id;

GRANT SELECT ON public.public_shop_directory TO anon, authenticated;

-- 4. Atomic daily sequential token number generation per shop (Asia/Kolkata timezone)
CREATE OR REPLACE FUNCTION public.generate_counter_token(p_shop_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token int;
BEGIN
  SELECT coalesce(max(token_number), 0) + 1 INTO v_token
  FROM public.orders
  WHERE shop_id = p_shop_id
    AND payment_mode = 'counter'
    AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata');
  RETURN v_token;
END;
$$;
