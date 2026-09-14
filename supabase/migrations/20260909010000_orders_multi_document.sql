create type public.order_status as enum ('draft', 'awaiting_payment', 'paid', 'partially_printed', 'printing', 'completed', 'failed', 'cancelled');
create type public.document_processing_status as enum ('uploaded', 'validating', 'conversion_required', 'converting', 'ready', 'failed');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default 'PS' || upper(encode(gen_random_bytes(6), 'hex')),
  shop_id uuid not null references public.shops (id) on delete restrict,
  customer_id uuid references public.profiles (id) on delete set null,
  status public.order_status not null default 'draft',
  total_amount numeric(12, 2) not null default 0,
  total_pages integer not null default 0,
  color_pages integer not null default 0,
  black_and_white_pages integer not null default 0,
  currency text not null default 'INR',
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_amount check (total_amount >= 0),
  constraint orders_pages check (total_pages >= 0 and color_pages >= 0 and black_and_white_pages >= 0),
  constraint orders_page_totals check (color_pages + black_and_white_pages <= total_pages),
  constraint orders_currency check (currency ~ '^[A-Z]{3}$')
);

alter table public.documents add column order_id uuid references public.orders (id) on delete cascade;
alter table public.documents add column processing_status public.document_processing_status not null default 'uploaded';
alter table public.documents add column normalized_storage_path text unique;
alter table public.documents add column normalized_mime_type text;
alter table public.documents drop constraint documents_pdf_only;
alter table public.documents add constraint documents_supported_mime check (mime_type in (
  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg', 'image/jpg', 'image/png', 'text/plain'
));

alter table public.print_jobs add column order_id uuid references public.orders (id) on delete cascade;

alter table public.payments add column order_id uuid references public.orders (id) on delete restrict;
alter table public.payments alter column print_job_id drop not null;
alter table public.payments drop constraint payments_print_job_id_key;
alter table public.payments add constraint payments_order_or_legacy_job check (
  (order_id is not null and print_job_id is null) or
  (order_id is null and print_job_id is not null)
);
create unique index payments_order_id_unique_idx on public.payments (order_id) where order_id is not null;

create index orders_shop_status_created_idx on public.orders (shop_id, status, created_at desc);
create index orders_customer_created_idx on public.orders (customer_id, created_at desc);
create index orders_payment_lookup_idx on public.orders (id, shop_id, customer_id, status);
create index documents_order_id_idx on public.documents (order_id, created_at);
create index print_jobs_order_status_idx on public.print_jobs (order_id, status, created_at);
create index payments_order_status_idx on public.payments (order_id, status, created_at);

create trigger orders_updated_at before update on public.orders
for each row execute function public.set_updated_at();

create or replace function public.validate_order_relationships()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  order_shop_id uuid;
  order_customer_id uuid;
  document_order_id uuid;
begin
  if tg_table_name = 'documents' and new.order_id is not null then
    select shop_id, customer_id into order_shop_id, order_customer_id from public.orders where id = new.order_id;
    if order_shop_id is null or order_shop_id <> new.shop_id then raise exception 'Document shop does not match order shop'; end if;
    if order_customer_id is distinct from new.customer_id then raise exception 'Document customer does not match order customer'; end if;
  elsif tg_table_name = 'print_jobs' and new.order_id is not null then
    select shop_id, customer_id into order_shop_id, order_customer_id from public.orders where id = new.order_id;
    select order_id into document_order_id from public.documents where id = new.document_id;
    if order_shop_id is null or order_shop_id <> new.shop_id then raise exception 'Print job shop does not match order shop'; end if;
    if order_customer_id is distinct from new.customer_id then raise exception 'Print job customer does not match order customer'; end if;
    if document_order_id is distinct from new.order_id then raise exception 'Print job document does not belong to order'; end if;
  end if;
  return new;
end;
$$;

create trigger validate_document_order
before insert or update on public.documents
for each row execute function public.validate_order_relationships();

create trigger validate_job_order
before insert or update on public.print_jobs
for each row execute function public.validate_order_relationships();

create or replace function public.protect_order_owned_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select auth.uid()) is not null and not (select public.is_admin()) then
    if tg_table_name = 'documents' and (
      new.shop_id is distinct from old.shop_id or new.order_id is distinct from old.order_id or
      new.customer_id is distinct from old.customer_id or new.storage_path is distinct from old.storage_path or
      new.mime_type is distinct from old.mime_type or new.size_bytes is distinct from old.size_bytes
    ) then raise exception 'Document ownership and source fields cannot be changed'; end if;
    if tg_table_name = 'print_jobs' and (
      new.shop_id is distinct from old.shop_id or new.order_id is distinct from old.order_id or
      new.document_id is distinct from old.document_id or new.customer_id is distinct from old.customer_id or
      new.total_amount is distinct from old.total_amount or new.idempotency_key is distinct from old.idempotency_key
    ) then raise exception 'Print job ownership and price fields cannot be changed'; end if;
  end if;
  return new;
end;
$$;

create trigger protect_document_owned_fields
before update on public.documents
for each row execute function public.protect_order_owned_fields();

create trigger protect_job_owned_fields
before update on public.print_jobs
for each row execute function public.protect_order_owned_fields();

create or replace function public.create_order(target_shop_id uuid, request_idempotency_key text)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  new_order public.orders;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  select * into new_order from public.orders where customer_id = current_user_id and idempotency_key = request_idempotency_key;
  if new_order.id is not null then return new_order; end if;
  if not exists (select 1 from public.shops where id = target_shop_id and is_active = true) then raise exception 'Shop is not accepting orders'; end if;
  insert into public.orders (shop_id, customer_id, idempotency_key) values (target_shop_id, current_user_id, request_idempotency_key) returning * into new_order;
  return new_order;
end;
$$;

grant execute on function public.create_order(uuid, text) to authenticated;

create or replace function public.unlock_order_jobs_after_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.order_id is not null and new.status = 'verified' and (old.status is distinct from new.status) then
    update public.print_jobs
    set status = case when status in ('draft', 'awaiting_payment') then 'paid' else status end
    where order_id = new.order_id;
    update public.orders set status = 'paid' where id = new.order_id and status in ('draft', 'awaiting_payment');
  end if;
  return new;
end;
$$;

create trigger unlock_order_jobs_after_payment
after insert or update on public.payments
for each row execute function public.unlock_order_jobs_after_payment();

create or replace view public.order_summary with (security_invoker = true) as
select
  o.id,
  o.public_id,
  o.shop_id,
  o.customer_id,
  o.status,
  o.total_amount,
  o.currency,
  o.created_at,
  coalesce(dt.document_count, 0)::integer as document_count,
  coalesce(jt.print_job_count, 0)::integer as print_job_count,
  coalesce(dt.total_pages, 0)::integer as total_pages,
  coalesce(jt.color_pages, 0)::integer as color_pages,
  coalesce(jt.black_and_white_pages, 0)::integer as black_and_white_pages,
  coalesce(jt.completed_job_count, 0)::integer as completed_job_count,
  coalesce(jt.failed_job_count, 0)::integer as failed_job_count
from public.orders o
left join (
  select order_id, count(*) as document_count, sum(page_count) as total_pages
  from public.documents
  group by order_id
) dt on dt.order_id = o.id
left join (
  select
    j.order_id,
    count(distinct j.id) as print_job_count,
    coalesce(sum(case when p.color_mode = 'color' then p.end_page - p.start_page + 1 else 0 end), 0) as color_pages,
    coalesce(sum(case when p.color_mode = 'black_and_white' then p.end_page - p.start_page + 1 else 0 end), 0) as black_and_white_pages,
    count(distinct j.id) filter (where j.status = 'completed') as completed_job_count,
    count(distinct j.id) filter (where j.status = 'failed') as failed_job_count
  from public.print_jobs j
  left join public.print_job_pages p on p.print_job_id = j.id
  group by j.order_id
) jt on jt.order_id = o.id;

alter table public.orders enable row level security;

create policy orders_customer_shop_select on public.orders
for select to authenticated
using (customer_id = (select auth.uid()) or (select public.is_shop_member(shop_id)) or (select public.is_admin()));

create policy orders_admin_all on public.orders
for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy documents_owner_insert on public.documents;
create policy documents_owner_insert on public.documents
for insert to authenticated
with check (
  exists (
    select 1 from public.orders o
    where o.id = order_id and o.shop_id = documents.shop_id and o.customer_id = (select auth.uid()) and o.status = 'draft'
  )
  or (select public.is_shop_member(shop_id))
  or (select public.is_admin())
);

drop policy documents_owner_update on public.documents;
create policy documents_member_update on public.documents
for update to authenticated
using ((select public.is_shop_member(shop_id)) or (select public.is_admin()))
with check ((select public.is_shop_member(shop_id)) or (select public.is_admin()));

drop policy jobs_customer_insert on public.print_jobs;

create policy jobs_member_insert on public.print_jobs
for insert to authenticated
with check ((select public.is_shop_member(shop_id)) or (select public.is_admin()));

drop policy payments_job_access on public.payments;
create policy payments_order_access on public.payments
for select to authenticated
using (
  customer_id = (select auth.uid())
  or (order_id is not null and exists (select 1 from public.orders o where o.id = order_id and ((select public.is_shop_member(o.shop_id)) or (select public.is_admin()))))
  or (print_job_id is not null and exists (select 1 from public.print_jobs j where j.id = print_job_id and ((select public.is_shop_member(j.shop_id)) or (select public.is_admin()))))
);

create policy payments_admin_insert on public.payments
for insert to authenticated
with check ((select public.is_admin()));

create policy payments_admin_update on public.payments
for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));
