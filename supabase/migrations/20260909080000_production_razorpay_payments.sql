-- Migration: 20260909080000_production_razorpay_payments.sql
-- Production-grade Razorpay payment integration, transaction ledger, and webhook idempotency

alter table public.payments add column if not exists idempotency_key text;
alter table public.payments add column if not exists error_code text;
alter table public.payments add column if not exists error_description text;
alter table public.payments add column if not exists payment_method text;
alter table public.payments add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists payments_provider_order_id_idx on public.payments (provider_order_id);
create index if not exists payments_provider_payment_id_idx on public.payments (provider_payment_id);
create index if not exists payments_idempotency_key_idx on public.payments (idempotency_key);

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments (id) on delete cascade,
  order_id uuid references public.orders (id) on delete cascade,
  provider text not null default 'razorpay',
  provider_order_id text,
  provider_payment_id text,
  provider_signature text,
  event_type text not null,
  status public.payment_status not null,
  amount numeric(12, 2) not null,
  currency text not null default 'INR',
  error_code text,
  error_description text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payment_transactions_order_id_idx on public.payment_transactions (order_id);
create index if not exists payment_transactions_payment_id_idx on public.payment_transactions (payment_id);
create index if not exists payment_transactions_provider_payment_idx on public.payment_transactions (provider_payment_id);
create index if not exists payment_transactions_created_at_idx on public.payment_transactions (created_at desc);

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  provider text not null default 'razorpay',
  payload jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  processing_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists payment_webhook_events_event_id_idx on public.payment_webhook_events (event_id);
create index if not exists payment_webhook_events_created_at_idx on public.payment_webhook_events (created_at desc);

alter table public.payment_transactions enable row level security;
alter table public.payment_webhook_events enable row level security;

create policy payment_transactions_select on public.payment_transactions
for select to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = payment_transactions.order_id
    and (
      o.customer_id = (select auth.uid())
      or (select public.is_shop_member(o.shop_id))
      or (select public.is_admin())
    )
  )
);

create policy payment_transactions_admin_all on public.payment_transactions
for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy webhook_events_admin on public.payment_webhook_events
for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));
