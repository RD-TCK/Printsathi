-- Migration: Atomic Counter Token Generation
-- Replaces the non-atomic MAX+1 scan in generate_counter_token() with a
-- true atomic per-shop daily counter using INSERT ... ON CONFLICT DO UPDATE
-- ... RETURNING. This eliminates the TOCTOU race where two concurrent
-- requests for the same shop could receive the same token number.
--
-- Strategy:
--   A dedicated table `shop_daily_token_counters` holds one row per
--   (shop_id, day_ist). Incrementing the counter is a single atomic
--   statement that either inserts the first token (value = 1) or
--   increments the existing counter and returns the new value.
--   No SELECT is needed before the UPDATE; the database handles it all
--   under SERIALIZABLE-equivalent semantics for this single row.

-- 1. Counter table --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shop_daily_token_counters (
  shop_id    uuid        NOT NULL REFERENCES public.shops (id) ON DELETE CASCADE,
  day_ist    date        NOT NULL,
  last_token integer     NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_id, day_ist)
);

ALTER TABLE public.shop_daily_token_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop_owners_read_own_counters"
  ON public.shop_daily_token_counters
  FOR SELECT
  TO authenticated
  USING (
    shop_id IN (
      SELECT shop_id FROM public.shop_members WHERE user_id = auth.uid()
    )
  );

-- 2. Atomic token increment function -------------------------------------
CREATE OR REPLACE FUNCTION public.generate_counter_token(p_shop_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_ist date;
  v_token     integer;
BEGIN
  v_today_ist := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  INSERT INTO public.shop_daily_token_counters (shop_id, day_ist, last_token, updated_at)
  VALUES (p_shop_id, v_today_ist, 1, now())
  ON CONFLICT (shop_id, day_ist) DO UPDATE
    SET last_token  = shop_daily_token_counters.last_token + 1,
        updated_at  = now()
  RETURNING last_token INTO v_token;

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_counter_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_counter_token(uuid) TO service_role;

-- 3. Index for counter table cleanup / analytics -------------------------
CREATE INDEX IF NOT EXISTS shop_daily_token_counters_day_idx
  ON public.shop_daily_token_counters (day_ist);

-- 4. Backfill: seed counter from existing orders so new tokens start above
--    the highest already-issued token for each shop-day.
INSERT INTO public.shop_daily_token_counters (shop_id, day_ist, last_token, updated_at)
SELECT
  o.shop_id,
  (o.created_at AT TIME ZONE 'Asia/Kolkata')::date AS day_ist,
  MAX(o.token_number)                              AS last_token,
  now()
FROM public.orders o
WHERE o.payment_mode = 'counter'
  AND o.token_number IS NOT NULL
  AND o.token_number > 0
GROUP BY o.shop_id, (o.created_at AT TIME ZONE 'Asia/Kolkata')::date
ON CONFLICT (shop_id, day_ist) DO UPDATE
  SET last_token  = GREATEST(shop_daily_token_counters.last_token, EXCLUDED.last_token),
      updated_at  = now();
