create extension if not exists pgcrypto;

create type public.app_role as enum ('customer', 'shop_owner', 'shop_staff', 'admin');
create type public.subscription_status as enum ('trial', 'active', 'expired', 'cancelled', 'past_due');
create type public.agent_status as enum ('online', 'offline', 'error');
create type public.printer_status as enum ('online', 'offline', 'printing', 'error', 'no_printer');
create type public.color_mode as enum ('black_and_white', 'color');
create type public.paper_size as enum ('a4', 'a3', 'letter', 'legal');
create type public.print_job_status as enum ('draft', 'awaiting_payment', 'paid', 'queued', 'claimed', 'printing', 'completed', 'failed', 'cancelled');
create type public.payment_status as enum ('created', 'pending', 'verified', 'failed', 'refunded');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  role public.app_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_length check (full_name is null or char_length(full_name) between 1 and 120)
);

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default encode(gen_random_bytes(8), 'hex'),
  name text not null,
  slug text not null unique,
  phone text,
  email text,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shops_name_length check (char_length(name) between 2 and 160),
  constraint shops_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table public.shop_members (
  shop_id uuid not null references public.shops (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (shop_id, user_id),
  constraint shop_members_role_check check (role in ('shop_owner', 'shop_staff'))
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null unique references public.shops (id) on delete cascade,
  status public.subscription_status not null default 'trial',
  trial_start timestamptz,
  trial_end timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  provider_customer_id text unique,
  provider_subscription_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_trial_dates check (trial_end is null or trial_start is null or trial_end > trial_start),
  constraint subscriptions_period_dates check (current_period_end is null or current_period_start is null or current_period_end > current_period_start)
);

create table public.desktop_agents (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null default 'Windows Agent',
  version text,
  status public.agent_status not null default 'offline',
  last_heartbeat_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.printers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  desktop_agent_id uuid references public.desktop_agents (id) on delete set null,
  name text not null,
  system_identifier text,
  status public.printer_status not null default 'offline',
  capabilities jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, system_identifier)
);

create table public.shop_settings (
  shop_id uuid primary key references public.shops (id) on delete cascade,
  currency text not null default 'INR',
  timezone text not null default 'Asia/Kolkata',
  accepting_orders boolean not null default false,
  max_upload_size_bytes bigint not null default 26214400,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_settings_currency check (currency ~ '^[A-Z]{3}$'),
  constraint shop_settings_upload_size check (max_upload_size_bytes between 1048576 and 104857600)
);

create table public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  color_mode public.color_mode not null,
  paper_size public.paper_size not null,
  min_pages integer not null,
  max_pages integer,
  price_per_page numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pricing_rules_min_pages check (min_pages >= 1),
  constraint pricing_rules_max_pages check (max_pages is null or max_pages >= min_pages),
  constraint pricing_rules_price check (price_per_page >= 0),
  unique (shop_id, color_mode, paper_size, min_pages)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  customer_id uuid references public.profiles (id) on delete set null,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null default 'application/pdf',
  size_bytes bigint not null,
  page_count integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_pdf_only check (mime_type = 'application/pdf'),
  constraint documents_size check (size_bytes between 1 and 104857600),
  constraint documents_page_count check (page_count between 1 and 10000)
);

create table public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete restrict,
  customer_id uuid references public.profiles (id) on delete set null,
  document_id uuid not null references public.documents (id) on delete restrict,
  status public.print_job_status not null default 'draft',
  total_pages integer not null,
  total_amount numeric(12, 2) not null default 0,
  currency text not null default 'INR',
  idempotency_key text not null unique,
  claimed_by_agent_id uuid references public.desktop_agents (id) on delete set null,
  claimed_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint print_jobs_total_pages check (total_pages >= 1),
  constraint print_jobs_total_amount check (total_amount >= 0),
  constraint print_jobs_currency check (currency ~ '^[A-Z]{3}$')
);

create table public.print_job_pages (
  id uuid primary key default gen_random_uuid(),
  print_job_id uuid not null references public.print_jobs (id) on delete cascade,
  start_page integer not null,
  end_page integer not null,
  color_mode public.color_mode not null,
  paper_size public.paper_size not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint print_job_pages_range check (start_page >= 1 and end_page >= start_page)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  print_job_id uuid not null unique references public.print_jobs (id) on delete restrict,
  customer_id uuid references public.profiles (id) on delete set null,
  provider text not null default 'razorpay',
  provider_order_id text unique,
  provider_payment_id text unique,
  provider_signature text,
  status public.payment_status not null default 'created',
  amount numeric(12, 2) not null,
  currency text not null default 'INR',
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_amount check (amount >= 0),
  constraint payments_currency check (currency ~ '^[A-Z]{3}$')
);

create table public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null unique references public.shops (id) on delete cascade,
  public_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index shop_members_user_id_idx on public.shop_members (user_id);
create index subscriptions_status_idx on public.subscriptions (status);
create index desktop_agents_shop_id_idx on public.desktop_agents (shop_id);
create index desktop_agents_heartbeat_idx on public.desktop_agents (shop_id, last_heartbeat_at);
create index printers_shop_id_idx on public.printers (shop_id);
create index printers_agent_id_idx on public.printers (desktop_agent_id);
create index pricing_rules_lookup_idx on public.pricing_rules (shop_id, color_mode, paper_size, min_pages);
create index documents_shop_id_idx on public.documents (shop_id);
create index documents_customer_id_idx on public.documents (customer_id);
create index print_jobs_shop_status_idx on public.print_jobs (shop_id, status, created_at);
create index print_jobs_customer_id_idx on public.print_jobs (customer_id, created_at);
create index print_jobs_document_id_idx on public.print_jobs (document_id);
create index print_jobs_agent_id_idx on public.print_jobs (claimed_by_agent_id);
create index print_job_pages_job_id_idx on public.print_job_pages (print_job_id, start_page);
create index payments_customer_id_idx on public.payments (customer_id);
create index payments_status_idx on public.payments (status);
create index audit_logs_shop_created_idx on public.audit_logs (shop_id, created_at desc);
create index audit_logs_actor_created_idx on public.audit_logs (actor_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['profiles', 'shops', 'shop_members', 'subscriptions', 'desktop_agents', 'printers', 'shop_settings', 'pricing_rules', 'documents', 'print_jobs', 'print_job_pages', 'payments', 'qr_codes'] loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do update set full_name = excluded.full_name;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;

create or replace function public.is_shop_member(target_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.shop_members
    where shop_id = target_shop_id and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_shop_owner(target_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.shop_members
    where shop_id = target_shop_id and user_id = (select auth.uid()) and role = 'shop_owner'
  );
$$;

create or replace function public.register_shop(shop_name text, shop_slug text, shop_phone text default null)
returns public.shops
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  new_shop public.shops;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if exists (select 1 from public.shop_members where user_id = current_user_id and role = 'shop_owner') then
    select s.* into new_shop
    from public.shops s join public.shop_members sm on sm.shop_id = s.id
    where sm.user_id = current_user_id and sm.role = 'shop_owner'
    limit 1;
    return new_shop;
  end if;
  insert into public.shops (name, slug, phone) values (shop_name, shop_slug, shop_phone) returning * into new_shop;
  insert into public.shop_members (shop_id, user_id, role) values (new_shop.id, current_user_id, 'shop_owner');
  insert into public.profiles (id, role) values (current_user_id, 'shop_owner') on conflict (id) do update set role = 'shop_owner';
  insert into public.shop_settings (shop_id) values (new_shop.id);
  insert into public.subscriptions (shop_id, status, trial_start, trial_end) values (new_shop.id, 'trial', now(), now() + interval '15 days');
  insert into public.qr_codes (shop_id) values (new_shop.id);
  return new_shop;
exception when unique_violation then
  raise exception 'Shop name or slug is already in use';
end;
$$;

grant execute on function public.register_shop(text, text, text) to authenticated;

create or replace function public.validate_print_job_document()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  document_shop_id uuid;
  document_customer_id uuid;
  document_page_count integer;
begin
  select shop_id, customer_id, page_count into document_shop_id, document_customer_id, document_page_count
  from public.documents where id = new.document_id;
  if document_shop_id is null or document_shop_id <> new.shop_id then raise exception 'Document does not belong to this shop'; end if;
  if document_customer_id is not null and document_customer_id <> new.customer_id then raise exception 'Document belongs to another customer'; end if;
  if new.total_pages > document_page_count then raise exception 'Print job exceeds document page count'; end if;
  return new;
end;
$$;

create trigger validate_print_job_document
before insert or update on public.print_jobs
for each row execute function public.validate_print_job_document();

create or replace function public.validate_print_job_pages()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  job_page_count integer;
begin
  select d.page_count into job_page_count
  from public.print_jobs j join public.documents d on d.id = j.document_id
  where j.id = new.print_job_id;
  if job_page_count is null or new.end_page > job_page_count then raise exception 'Page range exceeds document page count'; end if;
  if exists (
    select 1 from public.print_job_pages p
    where p.print_job_id = new.print_job_id and p.id <> new.id
      and int4range(p.start_page, p.end_page, '[]') && int4range(new.start_page, new.end_page, '[]')
  ) then raise exception 'Page ranges cannot overlap'; end if;
  return new;
end;
$$;

create trigger validate_print_job_pages
before insert or update on public.print_job_pages
for each row execute function public.validate_print_job_pages();

alter table public.profiles enable row level security;
alter table public.shops enable row level security;
alter table public.shop_members enable row level security;
alter table public.subscriptions enable row level security;
alter table public.desktop_agents enable row level security;
alter table public.printers enable row level security;
alter table public.shop_settings enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.documents enable row level security;
alter table public.print_jobs enable row level security;
alter table public.print_job_pages enable row level security;
alter table public.payments enable row level security;
alter table public.qr_codes enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select on public.profiles for select to authenticated using ((select auth.uid()) = id or (select public.is_admin()));
create policy profiles_update on public.profiles for update to authenticated using ((select auth.uid()) = id or (select public.is_admin())) with check ((select auth.uid()) = id or (select public.is_admin()));
create policy profiles_admin_all on public.profiles for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy shops_public_select on public.shops for select to anon, authenticated using (is_active = true);
create policy shops_member_select on public.shops for select to authenticated using ((select public.is_shop_member(id)) or (select public.is_admin()));
create policy shops_owner_update on public.shops for update to authenticated using ((select public.is_shop_owner(id)) or (select public.is_admin())) with check ((select public.is_shop_owner(id)) or (select public.is_admin()));
create policy shops_admin_all on public.shops for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy shop_members_select on public.shop_members for select to authenticated using (user_id = (select auth.uid()) or (select public.is_shop_member(shop_id)) or (select public.is_admin()));
create policy shop_members_admin_all on public.shop_members for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy subscriptions_member_select on public.subscriptions for select to authenticated using ((select public.is_shop_member(shop_id)) or (select public.is_admin()));
create policy subscriptions_admin_all on public.subscriptions for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy agents_member_all on public.desktop_agents for all to authenticated using ((select public.is_shop_member(shop_id)) or (select public.is_admin())) with check ((select public.is_shop_member(shop_id)) or (select public.is_admin()));
create policy printers_member_all on public.printers for all to authenticated using ((select public.is_shop_member(shop_id)) or (select public.is_admin())) with check ((select public.is_shop_member(shop_id)) or (select public.is_admin()));
create policy settings_member_all on public.shop_settings for all to authenticated using ((select public.is_shop_member(shop_id)) or (select public.is_admin())) with check ((select public.is_shop_member(shop_id)) or (select public.is_admin()));
create policy pricing_member_all on public.pricing_rules for all to authenticated using ((select public.is_shop_member(shop_id)) or (select public.is_admin())) with check ((select public.is_shop_member(shop_id)) or (select public.is_admin()));

create policy documents_owner_select on public.documents for select to authenticated using (customer_id = (select auth.uid()) or (select public.is_shop_member(shop_id)) or (select public.is_admin()));
create policy documents_owner_insert on public.documents for insert to authenticated with check ((customer_id = (select auth.uid()) and exists (select 1 from public.shops s where s.id = shop_id and s.is_active = true)) or (select public.is_shop_member(shop_id)) or (select public.is_admin()));
create policy documents_owner_update on public.documents for update to authenticated using (customer_id = (select auth.uid()) or (select public.is_shop_member(shop_id)) or (select public.is_admin())) with check (customer_id = (select auth.uid()) or (select public.is_shop_member(shop_id)) or (select public.is_admin()));
create policy documents_admin_all on public.documents for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy jobs_customer_select on public.print_jobs for select to authenticated using (customer_id = (select auth.uid()) or (select public.is_shop_member(shop_id)) or (select public.is_admin()));
create policy jobs_customer_insert on public.print_jobs for insert to authenticated with check (customer_id = (select auth.uid()) and (select public.is_shop_member(shop_id)) or (select public.is_admin()));
create policy jobs_member_update on public.print_jobs for update to authenticated using ((select public.is_shop_member(shop_id)) or (select public.is_admin())) with check ((select public.is_shop_member(shop_id)) or (select public.is_admin()));
create policy jobs_admin_all on public.print_jobs for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy pages_job_access on public.print_job_pages for all to authenticated using (exists (select 1 from public.print_jobs j where j.id = print_job_id and (j.customer_id = (select auth.uid()) or (select public.is_shop_member(j.shop_id)) or (select public.is_admin()))) ) with check (exists (select 1 from public.print_jobs j where j.id = print_job_id and (j.customer_id = (select auth.uid()) or (select public.is_shop_member(j.shop_id)) or (select public.is_admin()))) );
create policy payments_job_access on public.payments for select to authenticated using (customer_id = (select auth.uid()) or exists (select 1 from public.print_jobs j where j.id = print_job_id and ((select public.is_shop_member(j.shop_id)) or (select public.is_admin()))));
create policy payments_admin_all on public.payments for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy qr_public_select on public.qr_codes for select to anon, authenticated using (is_active = true);
create policy qr_member_update on public.qr_codes for update to authenticated using ((select public.is_shop_owner(shop_id)) or (select public.is_admin())) with check ((select public.is_shop_owner(shop_id)) or (select public.is_admin()));
create policy qr_admin_all on public.qr_codes for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy audit_member_select on public.audit_logs for select to authenticated using ((select public.is_shop_member(shop_id)) or (select public.is_admin()));
create policy audit_admin_insert on public.audit_logs for insert to authenticated with check ((select public.is_admin()) or actor_id = (select auth.uid()));
create policy audit_admin_all on public.audit_logs for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on public.register_shop from public;
grant execute on function public.register_shop(text, text, text) to authenticated;
