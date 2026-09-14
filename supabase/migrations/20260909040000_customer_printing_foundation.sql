insert into storage.buckets (id, name, public)
values ('print-documents', 'print-documents', false)
on conflict (id) do update set public = false;

create or replace view public.public_shop_pricing as
select
  s.public_id,
  pr.color_mode,
  pr.paper_size,
  pr.min_pages,
  pr.max_pages,
  pr.price_per_page
from public.shops s
join public.pricing_rules pr on pr.shop_id = s.id
where s.is_active and pr.is_active;

grant select on public.public_shop_pricing to anon, authenticated;
