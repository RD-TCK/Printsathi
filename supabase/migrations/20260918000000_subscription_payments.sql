-- Service-only payment ledger makes callback/webhook retries safe, including old payments.
create table public.shop_subscription_payments (
  payment_id text primary key,
  order_id text not null unique,
  shop_id uuid not null references public.shops(id),
  plan text not null check (plan in ('monthly', 'yearly')),
  period_end timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.shop_subscription_payments enable row level security;

create function public.activate_shop_subscription(p_shop_id uuid, p_plan text, p_payment_id text, p_order_id text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  existing public.shop_subscription_payments;
  current_sub public.subscriptions;
  period_end timestamptz;
begin
  if p_plan not in ('monthly', 'yearly') then raise exception 'Invalid plan'; end if;
  -- Serialize renewals for the same shop; unique ledger keys also prevent reuse across shops.
  perform 1 from public.shops where id = p_shop_id for update;
  select * into existing from public.shop_subscription_payments where payment_id = p_payment_id or order_id = p_order_id;
  if found then
    if existing.shop_id <> p_shop_id or existing.plan <> p_plan or existing.payment_id <> p_payment_id then
      raise exception 'Payment mismatch';
    end if;
    select * into current_sub from public.subscriptions where shop_id = p_shop_id;
    return greatest(existing.period_end, current_sub.current_period_end);
  end if;
  select * into current_sub from public.subscriptions where shop_id = p_shop_id for update;
  period_end := greatest(now(), case
      when current_sub.status = 'active' then current_sub.current_period_end
      when current_sub.status = 'trial' then current_sub.trial_end
    end)
    + case when p_plan = 'monthly' then interval '1 month' else interval '1 year' end;
  insert into public.shop_subscription_payments(payment_id, order_id, shop_id, plan, period_end)
    values(p_payment_id, p_order_id, p_shop_id, p_plan, period_end);
  insert into public.subscriptions(shop_id, status, current_period_start, current_period_end, provider_subscription_id)
    values(p_shop_id, 'active', now(), period_end, p_payment_id)
    on conflict (shop_id) do update set status = 'active', current_period_start = now(),
      current_period_end = excluded.current_period_end, provider_subscription_id = p_payment_id;
  update public.shop_settings set billing_mode = 'shop_subscription' where shop_id = p_shop_id;
  if not found then raise exception 'Shop settings missing'; end if;
  return period_end;
end;
$$;
revoke all on function public.activate_shop_subscription(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.activate_shop_subscription(uuid, text, text, text) to service_role;
