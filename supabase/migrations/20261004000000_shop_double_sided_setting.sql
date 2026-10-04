-- Migration: 20261004000000_shop_double_sided_setting.sql
-- Allow shop owners to toggle double-sided (both-sided) printing option for customers

-- 1. Add allow_double_sided column to public.shop_settings
ALTER TABLE public.shop_settings
ADD COLUMN IF NOT EXISTS allow_double_sided boolean NOT NULL DEFAULT true;

-- 2. Update public_shop_directory view to include allow_double_sided
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
  coalesce(ss.allow_double_sided, true) AS allow_double_sided,
  (ss.razorpay_key_id IS NOT NULL AND ss.razorpay_key_secret IS NOT NULL) AS has_custom_razorpay
FROM public.shops s
LEFT JOIN public.shop_settings ss ON ss.shop_id = s.id;

GRANT SELECT ON public.public_shop_directory TO anon, authenticated;
