-- Migration: 20260924010000_both_sided_printing.sql
-- Both-Sided (Duplex) Printing Support and Separate Pricing

-- 1. Add side_mode column to pricing_rules
ALTER TABLE public.pricing_rules
ADD COLUMN IF NOT EXISTS side_mode text NOT NULL DEFAULT 'single_sided';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pricing_rules_side_mode_check'
  ) THEN
    ALTER TABLE public.pricing_rules
    ADD CONSTRAINT pricing_rules_side_mode_check CHECK (side_mode IN ('single_sided', 'double_sided'));
  END IF;
END $$;

-- 2. Drop existing unique constraint on pricing_rules and add new unique constraint including side_mode
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pricing_rules_shop_id_color_mode_paper_size_min_pages_key'
  ) THEN
    ALTER TABLE public.pricing_rules
    DROP CONSTRAINT pricing_rules_shop_id_color_mode_paper_size_min_pages_key;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pricing_rules_unique_slab'
  ) THEN
    ALTER TABLE public.pricing_rules
    ADD CONSTRAINT pricing_rules_unique_slab UNIQUE (shop_id, color_mode, paper_size, side_mode, min_pages);
  END IF;
END $$;

-- 3. Add side_mode column to print_job_pages
ALTER TABLE public.print_job_pages
ADD COLUMN IF NOT EXISTS side_mode text NOT NULL DEFAULT 'single_sided';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'print_job_pages_side_mode_check'
  ) THEN
    ALTER TABLE public.print_job_pages
    ADD CONSTRAINT print_job_pages_side_mode_check CHECK (side_mode IN ('single_sided', 'double_sided'));
  END IF;
END $$;

-- 4. Update public_shop_pricing view to include side_mode
DROP VIEW IF EXISTS public.public_shop_pricing CASCADE;

CREATE VIEW public.public_shop_pricing AS
SELECT
  s.public_id,
  pr.color_mode,
  pr.paper_size,
  pr.side_mode,
  pr.min_pages,
  pr.max_pages,
  pr.price_per_page
FROM public.shops s
JOIN public.pricing_rules pr ON pr.shop_id = s.id
WHERE s.is_active AND pr.is_active;

GRANT SELECT ON public.public_shop_pricing TO anon, authenticated;
