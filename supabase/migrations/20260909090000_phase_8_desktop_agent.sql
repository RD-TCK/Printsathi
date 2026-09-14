-- Migration: 20260909090000_phase_8_desktop_agent.sql
-- Windows Desktop Agent bridge, pairing tokens, job leasing, and atomic claiming

-- 1. Desktop Agents enhancements
alter table public.desktop_agents add column if not exists auth_token_hash text unique;
alter table public.desktop_agents add column if not exists is_revoked boolean not null default false;
alter table public.desktop_agents add column if not exists revoked_at timestamptz;
alter table public.desktop_agents add column if not exists machine_info jsonb not null default '{}'::jsonb;
alter table public.desktop_agents add column if not exists current_job_id uuid references public.print_jobs (id) on delete set null;
alter table public.desktop_agents add column if not exists ip_address text;

create index if not exists desktop_agents_auth_token_idx on public.desktop_agents (auth_token_hash) where auth_token_hash is not null;
create index if not exists desktop_agents_shop_active_idx on public.desktop_agents (shop_id, is_revoked, status);

-- 2. Agent Pairing Codes (Short-lived, single-use pairing codes generated from Shop Portal)
create table if not exists public.agent_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  code_hash text not null unique,
  display_code text not null,
  expires_at timestamptz not null,
  is_used boolean not null default false,
  used_at timestamptz,
  used_by_agent_id uuid references public.desktop_agents (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists agent_pairing_codes_lookup_idx on public.agent_pairing_codes (code_hash, is_used, expires_at);
create index if not exists agent_pairing_codes_shop_idx on public.agent_pairing_codes (shop_id, created_at desc);

alter table public.agent_pairing_codes enable row level security;

create policy agent_pairing_codes_member_select on public.agent_pairing_codes
for select to authenticated
using ((select public.is_shop_member(shop_id)) or (select public.is_admin()));

create policy agent_pairing_codes_owner_insert on public.agent_pairing_codes
for insert to authenticated
with check ((select public.is_shop_owner(shop_id)) or (select public.is_admin()));

create policy agent_pairing_codes_admin_all on public.agent_pairing_codes
for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- 3. Printers table enhancements
alter table public.printers add column if not exists is_default boolean not null default false;
alter table public.printers add column if not exists driver_name text;
alter table public.printers add column if not exists is_online boolean not null default false;

create index if not exists printers_default_idx on public.printers (shop_id, is_default) where is_default = true;

-- 4. Print jobs leasing and retry fields
alter table public.print_jobs add column if not exists claim_expires_at timestamptz;
alter table public.print_jobs add column if not exists print_attempts integer not null default 0;
alter table public.print_jobs add column if not exists max_attempts integer not null default 3;
alter table public.print_jobs add column if not exists printed_at timestamptz;

create index if not exists print_jobs_eligible_queue_idx on public.print_jobs (shop_id, status, created_at)
where status in ('paid', 'queued', 'claimed');

-- 5. Atomic Job Claiming RPC
create or replace function public.claim_next_print_job(
  p_agent_id uuid,
  p_shop_id uuid,
  p_lease_seconds int default 300
)
returns table (
  job_id uuid,
  order_id uuid,
  document_id uuid,
  shop_id uuid,
  status public.print_job_status,
  total_pages int,
  total_amount numeric,
  currency text,
  print_attempts int,
  max_attempts int,
  document_storage_path text,
  document_original_filename text,
  document_mime_type text,
  document_size_bytes bigint,
  document_page_count int,
  claimed_at timestamptz,
  claim_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
  v_agent record;
  v_lease_interval interval := (p_lease_seconds || ' seconds')::interval;
begin
  -- Validate agent authorization and shop match
  select * into v_agent
  from public.desktop_agents
  where id = p_agent_id and desktop_agents.shop_id = p_shop_id and not is_revoked;

  if not found then
    raise exception 'Unauthorized or revoked agent';
  end if;

  -- Select and lock candidate job
  select j.*, d.storage_path, d.original_filename, d.mime_type as doc_mime, d.size_bytes as doc_size, d.page_count as doc_pages
  into v_job
  from public.print_jobs j
  inner join public.orders o on o.id = j.order_id
  inner join public.documents d on d.id = j.document_id
  where j.shop_id = p_shop_id
    and o.shop_id = p_shop_id
    and o.status in ('paid', 'partially_printed', 'printing')
    and (
      -- Fresh unprinted jobs
      j.status in ('paid', 'queued')
      -- Or expired claim from crashed agent within retry limit
      or (j.status = 'claimed' and j.claim_expires_at < now() and j.print_attempts < j.max_attempts)
    )
    and exists (
      select 1 from public.payments p
      where p.order_id = o.id and p.status = 'verified'
    )
  order by j.created_at asc
  for update of j skip locked
  limit 1;

  if not found then
    return;
  end if;

  -- Update job claim lease
  update public.print_jobs
  set
    status = 'claimed',
    claimed_by_agent_id = p_agent_id,
    claimed_at = now(),
    claim_expires_at = now() + v_lease_interval,
    print_attempts = v_job.print_attempts + 1
  where id = v_job.id;

  -- Update agent current job
  update public.desktop_agents
  set current_job_id = v_job.id
  where id = p_agent_id;

  -- Return claimed job details
  job_id := v_job.id;
  order_id := v_job.order_id;
  document_id := v_job.document_id;
  shop_id := v_job.shop_id;
  status := 'claimed';
  total_pages := v_job.total_pages;
  total_amount := v_job.total_amount;
  currency := v_job.currency;
  print_attempts := v_job.print_attempts + 1;
  max_attempts := v_job.max_attempts;
  document_storage_path := v_job.storage_path;
  document_original_filename := v_job.original_filename;
  document_mime_type := v_job.doc_mime;
  document_size_bytes := v_job.doc_size;
  document_page_count := v_job.doc_pages;
  claimed_at := now();
  claim_expires_at := now() + v_lease_interval;
  return next;
end;
$$;

-- 6. Atomic Job Completion RPC
create or replace function public.complete_print_job(
  p_job_id uuid,
  p_agent_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
  v_unprinted_count int;
begin
  select * into v_job
  from public.print_jobs
  where id = p_job_id and claimed_by_agent_id = p_agent_id
  for update;

  if not found then
    return false;
  end if;

  update public.print_jobs
  set
    status = 'completed',
    completed_at = now(),
    printed_at = now(),
    failure_reason = null
  where id = p_job_id;

  -- Reset agent current job
  update public.desktop_agents
  set current_job_id = null
  where id = p_agent_id and current_job_id = p_job_id;

  -- Check if all jobs in this order are completed
  select count(*) into v_unprinted_count
  from public.print_jobs
  where order_id = v_job.order_id and status <> 'completed';

  if v_unprinted_count = 0 then
    update public.orders
    set status = 'completed'
    where id = v_job.order_id;
  else
    update public.orders
    set status = 'partially_printed'
    where id = v_job.order_id and status not in ('completed');
  end if;

  return true;
end;
$$;

-- 7. Atomic Job Failure & Retry RPC
create or replace function public.fail_print_job(
  p_job_id uuid,
  p_agent_id uuid,
  p_reason text,
  p_is_retryable boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
  v_next_status public.print_job_status;
begin
  select * into v_job
  from public.print_jobs
  where id = p_job_id and (claimed_by_agent_id = p_agent_id or claimed_by_agent_id is null)
  for update;

  if not found then
    return false;
  end if;

  -- If retryable and attempts remain, set back to queued with cleared lease
  if p_is_retryable and v_job.print_attempts < v_job.max_attempts then
    v_next_status := 'queued';
  else
    v_next_status := 'failed';
  end if;

  update public.print_jobs
  set
    status = v_next_status,
    failure_reason = p_reason,
    claimed_by_agent_id = case when v_next_status = 'queued' then null else claimed_by_agent_id end,
    claim_expires_at = null
  where id = p_job_id;

  -- Reset agent current job
  update public.desktop_agents
  set current_job_id = null, last_error = p_reason
  where id = p_agent_id and current_job_id = p_job_id;

  return true;
end;
$$;
