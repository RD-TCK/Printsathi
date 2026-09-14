alter table public.orders add column pricing_snapshot jsonb;
alter table public.orders add column pricing_calculated_at timestamptz;

create index orders_pricing_calculated_idx on public.orders (pricing_calculated_at);

create or replace function public.protect_order_pricing_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.pricing_snapshot is not null and new.pricing_snapshot is distinct from old.pricing_snapshot then
    raise exception 'Pricing snapshot cannot be changed after calculation';
  end if;
  if old.pricing_calculated_at is not null and new.pricing_calculated_at is distinct from old.pricing_calculated_at then
    raise exception 'Pricing calculation timestamp cannot be changed';
  end if;
  return new;
end;
$$;

create trigger protect_order_pricing_snapshot
before update on public.orders
for each row execute function public.protect_order_pricing_snapshot();
