-- Rollback for 20261125010000_scalability_indexes.sql

drop index if exists public.orders_public_id_lower_idx;
drop index if exists public.orders_shop_payment_mode_created_idx;
drop index if exists public.orders_shop_created_idx;
drop index if exists public.print_jobs_shop_created_idx;
drop index if exists public.printers_shop_agent_online_idx;
drop index if exists public.documents_shop_order_idx;
