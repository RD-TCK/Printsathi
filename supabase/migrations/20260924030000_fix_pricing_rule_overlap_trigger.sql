-- Migration: Fix validate_pricing_rule_overlap trigger function to include side_mode
-- This allows shops to configure separate pricing rules for single-sided and double-sided (duplex) printing without triggering overlap exceptions.

CREATE OR REPLACE FUNCTION public.validate_pricing_rule_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
	IF new.is_active AND EXISTS (
		SELECT 1
		FROM public.pricing_rules existing
		WHERE existing.shop_id = new.shop_id
			AND existing.color_mode = new.color_mode
			AND existing.paper_size = new.paper_size
			AND coalesce(existing.side_mode, 'single_sided') = coalesce(new.side_mode, 'single_sided')
			AND existing.is_active
			AND existing.id <> new.id
			AND int4range(existing.min_pages, coalesce(existing.max_pages, 2147483647), '[]')
					&& int4range(new.min_pages, coalesce(new.max_pages, 2147483647), '[]')
	) THEN
		RAISE EXCEPTION 'Active pricing rules cannot overlap';
	END IF;
	RETURN new;
END;
$$;

CREATE INDEX IF NOT EXISTS pricing_rules_active_side_lookup_idx
ON public.pricing_rules (shop_id, is_active, color_mode, paper_size, side_mode, min_pages);
