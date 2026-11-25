-- Non-destructive additive scalability indexes for hot API query paths.
-- Safe to run online in Supabase SQL Editor without table locks or drops.

create index if not exists orders_public_id_lower_idx
  on public.orders (lower(public_id));

create index if not exists orders_shop_payment_mode_created_idx
  on public.orders (shop_id, payment_mode, created_at desc);

create index if not exists orders_shop_created_idx
  on public.orders (shop_id, created_at desc);

create index if not exists print_jobs_shop_created_idx
  on public.print_jobs (shop_id, created_at desc);

create index if not exists printers_shop_agent_online_idx
  on public.printers (shop_id, desktop_agent_id, is_online);

create index if not exists documents_shop_order_idx
  on public.documents (shop_id, order_id, created_at desc);
