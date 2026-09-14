-- Migration: 20260909100000_print_submitted_state.sql
-- Production fix for PART 10 (Print Idempotency).
-- Adds an explicit 'print_submitted' intermediate state so the system can
-- distinguish "the Windows Print Spooler accepted the job" (potentially
-- physically printed) from "the job was only claimed". Jobs that reach the
-- spooler are NEVER automatically re-claimed, which prevents a duplicate
-- physical print after an Agent crash between spooler submission and
-- completion confirmation.

-- 1. Extend the print job status enum with 'print_submitted'
alter type public.print_job_status add value if not exists 'print_submitted';

-- 2. Atomic Mark-Submitted RPC
-- Called by the Agent *after* the Windows Print Spooler accepts the job.
-- Once submitted, the job is no longer available for automatic reclaim by any
-- agent (including the same one after a crash), which is the documented
-- duplicate-print guard.
create or replace function public.submit_print_job(
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
begin
  select * into v_job
  from public.print_jobs
  where id = p_job_id and claimed_by_agent_id = p_agent_id and status = 'claimed'
  for update;

  if not found then
    return false;
  end if;

  update public.print_jobs
  set
    status = 'print_submitted',
    failure_reason = null,
    printed_at = now(),
    claim_expires_at = null
  where id = p_job_id;

  return true;
end;
$$;

-- 3. Adjust completion so it accepts jobs in 'print_submitted' as well as
--    'claimed'. Completion is only accepted while the job is still leased to
--    the reporting agent (claimed_by_agent_id must match), preserving the
--    single-agent completion invariant.
drop function if exists public.complete_print_job(uuid, uuid);
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
  where id = p_job_id
    and claimed_by_agent_id = p_agent_id
    and status in ('claimed', 'print_submitted')
  for update;

  if not found then
    return false;
  end if;

  update public.print_jobs
  set
    status = 'completed',
    completed_at = now(),
    printed_at = now(),
    failure_reason = null,
    claim_expires_at = null
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

-- 4. Reject duplicately claiming jobs that were already submitted to a
--    printer. This is the core duplicate-print guard:
--    only 'claimed' (never yet accepted by a printer) jobs with an expired
--    lease may be reclaimed, and only while attempts remain.
drop function if exists public.claim_next_print_job(uuid, uuid, int);
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

  -- Select and lock candidate job.
  -- 'print_submitted' jobs are intentionally EXCLUDED: a printer may already
  -- have consumed them, so they require shop/admin reconciliation, never blind
  -- automatic resubmission.
  select j.*, d.storage_path, d.original_filename, d.mime_type as doc_mime,
         d.size_bytes as doc_size, d.page_count as doc_pages
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
      -- Or expired claim from crashed agent within retry limit (printer had
      -- NOT yet accepted the job, so a retry cannot duplicate physical output)
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