-- Update register_shop to grant a 7-day free trial instead of 15 days
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
  -- 7-day free trial:
  insert into public.subscriptions (shop_id, status, trial_start, trial_end) values (new_shop.id, 'trial', now(), now() + interval '7 days');
  insert into public.qr_codes (shop_id) values (new_shop.id);
  return new_shop;
exception when unique_violation then
  raise exception 'Shop name or slug is already in use';
end;
$$;

revoke all on function public.register_shop(text, text, text) from public;
grant execute on function public.register_shop(text, text, text) to authenticated;
