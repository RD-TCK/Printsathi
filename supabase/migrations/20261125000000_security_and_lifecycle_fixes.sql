-- Security & lifecycle fixes (atomic transaction):
-- 1. Prevent authenticated users from escalating their own profiles.role directly while allowing register_shop() & service_role
-- 2. Allow multi-copy print_jobs.total_pages within validate_print_job_document
-- 3. Allow re-configuring draft/awaiting_payment orders in protect_order_pricing_snapshot
-- Safe: does NOT drop any tables, columns, or rows. Rollback script saved at supabase/rollbacks/20261125000000_rollback.sql.

BEGIN;

-- 1. Harden profiles_update RLS + add BEFORE UPDATE role protection trigger
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id OR (SELECT public.is_admin()))
  WITH CHECK (
    (SELECT public.is_admin())
    OR (
      (SELECT auth.uid()) = id
      AND role IS NOT DISTINCT FROM (SELECT p.role FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
    )
  );

CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow server/postgres SECURITY DEFINER functions (e.g. register_shop), service_role, and admins.
  -- Direct client calls run as PostgREST role 'authenticated'/'anon' with auth.uid() set.
  IF new.role IS DISTINCT FROM old.role THEN
    IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin')
       AND auth.uid() IS NOT NULL
       AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Unauthorized role change';
    END IF;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_role ON public.profiles;
CREATE TRIGGER protect_profile_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

-- 2. Update validate_print_job_document to allow valid multi-copy page totals (1..100 copies per range)
CREATE OR REPLACE FUNCTION public.validate_print_job_document()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  document_shop_id uuid;
  document_customer_id uuid;
  document_page_count integer;
  max_copies_factor integer := 100;
BEGIN
  SELECT shop_id, customer_id, page_count
  INTO document_shop_id, document_customer_id, document_page_count
  FROM public.documents
  WHERE id = new.document_id;

  IF document_shop_id IS NULL OR document_shop_id <> new.shop_id THEN
    RAISE EXCEPTION 'Document does not belong to this shop';
  END IF;
  IF document_customer_id IS NOT NULL AND document_customer_id <> new.customer_id THEN
    RAISE EXCEPTION 'Document belongs to another customer';
  END IF;
  IF new.total_pages > document_page_count * GREATEST(coalesce(new.copies, 1), max_copies_factor) THEN
    RAISE EXCEPTION 'Print job exceeds document page count';
  END IF;
  RETURN new;
END;
$$;

-- 3. Allow pricing_snapshot updates only while order is still draft / awaiting_payment and unverified
CREATE OR REPLACE FUNCTION public.protect_order_pricing_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF old.status NOT IN ('draft', 'awaiting_payment')
     OR EXISTS (
       SELECT 1 FROM public.payments p
       WHERE p.order_id = old.id AND p.status = 'verified'
     ) THEN
    IF old.pricing_snapshot IS NOT NULL AND new.pricing_snapshot IS DISTINCT FROM old.pricing_snapshot THEN
      RAISE EXCEPTION 'Pricing snapshot cannot be changed after calculation';
    END IF;
    IF old.pricing_calculated_at IS NOT NULL AND new.pricing_calculated_at IS DISTINCT FROM old.pricing_calculated_at THEN
      RAISE EXCEPTION 'Pricing calculation timestamp cannot be changed';
    END IF;
  END IF;
  RETURN new;
END;
$$;

COMMIT;
