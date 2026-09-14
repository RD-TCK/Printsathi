create or replace view public.public_shop_directory as
select
  s.public_id,
  s.name,
  s.is_active,
  coalesce(ss.accepting_orders, false) as accepting_orders,
  case
    when not s.is_active then 'inactive'
    when coalesce(ss.accepting_orders, false) then 'available'
    else 'unavailable'
  end as status
from public.shops s
left join public.shop_settings ss on ss.shop_id = s.id;

grant select on public.public_shop_directory to anon, authenticated;
