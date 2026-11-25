-- Full Rollback for 20261125000000_security_and_lifecycle_fixes.sql
-- Run this in Supabase SQL Editor if you want to restore the exact previous policies & triggers.

BEGIN;

-- 1. Remove protect_profile_role trigger & function and restore previous profiles_update RLS policy
DROP TRIGGER IF EXISTS protect_profile_role ON public.profiles;
DROP FUNCTION IF EXISTS public.protect_profile_role();

DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id OR (SELECT public.is_admin()))
  WITH CHECK ((SELECT auth.uid()) = id OR (SELECT public.is_admin()));

-- 2. Restore original validate_print_job_document() from 20260909000000_phase_2_foundation.sql
CREATE OR REPLACE FUNCTION public.validate_print_job_document()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  document_shop_id uuid;
  document_customer_id uuid;
  document_page_count integer;
BEGIN
  SELECT shop_id, customer_id, page_count INTO document_shop_id, document_customer_id, document_page_count
  FROM public.documents WHERE id = new.document_id;
  IF document_shop_id IS null OR document_shop_id <> new.shop_id THEN
    RAISE EXCEPTION 'Document does not belong to this shop';
  END IF;
  IF document_customer_id IS NOT null AND document_customer_id <> new.customer_id THEN
    RAISE EXCEPTION 'Document belongs to another customer';
  END IF;
  IF new.total_pages > document_page_count THEN
    RAISE EXCEPTION 'Print job exceeds document page count';
  END IF;
  RETURN new;
END;
$$;

-- 3. Restore original protect_order_pricing_snapshot() from 20260909060000_pricing_snapshots.sql
CREATE OR REPLACE FUNCTION public.protect_order_pricing_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF old.pricing_snapshot IS NOT null AND new.pricing_snapshot IS DISTINCT FROM old.pricing_snapshot THEN
    RAISE EXCEPTION 'Pricing snapshot cannot be changed after calculation';
  END IF;
  IF old.pricing_calculated_at IS NOT null AND new.pricing_calculated_at IS DISTINCT FROM old.pricing_calculated_at THEN
    RAISE EXCEPTION 'Pricing calculation timestamp cannot be changed';
  END IF;
  RETURN new;
END;
$$;

COMMIT;
