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
  end as status,
  case
    when exists (select 1 from public.printers p where p.shop_id = s.id and p.status in ('online', 'printing')) then 'ready'
    when exists (select 1 from public.desktop_agents a where a.shop_id = s.id) then 'offline'
    else 'not_connected'
  end as printer_status
from public.shops s
left join public.shop_settings ss on ss.shop_id = s.id;

grant select on public.public_shop_directory to anon, authenticated;
