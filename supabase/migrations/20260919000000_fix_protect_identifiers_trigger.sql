-- 1. Fix trigger functions for protecting public identifiers on shops and qr_codes
-- Previously, referencing both new.public_id and new.public_token in the same trigger function caused
-- runtime PostgreSQL error 42703 (record "new" has no field "public_token") when updating the shops table.

create or replace function public.protect_shop_public_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
	if new.public_id is distinct from old.public_id then
		raise exception 'Shop public identifier cannot be changed';
	end if;
	return new;
end;
$$;

create or replace function public.protect_qr_public_token()
returns trigger
language plpgsql
set search_path = public
as $$
begin
	if new.public_token is distinct from old.public_token then
		raise exception 'QR public token cannot be changed';
	end if;
	return new;
end;
$$;

-- Recreate trigger on shops
drop trigger if exists protect_shop_public_identifier on public.shops;
create trigger protect_shop_public_identifier
before update on public.shops
for each row execute function public.protect_shop_public_id();

-- Recreate trigger on qr_codes
drop trigger if exists protect_qr_public_token on public.qr_codes;
create trigger protect_qr_public_token
before update on public.qr_codes
for each row execute function public.protect_qr_public_token();

-- 2. Ensure shop_settings has default accepting_orders = true
alter table public.shop_settings alter column accepting_orders set default true;

-- 3. Allow shop owners/admins to insert settings if missing
drop policy if exists settings_owner_insert on public.shop_settings;
create policy settings_owner_insert on public.shop_settings
for insert to authenticated
with check ((select public.is_shop_owner(shop_id)) or (select public.is_admin()));

-- 4. Create missing shop_settings rows for any shops that don't have one
insert into public.shop_settings (shop_id, accepting_orders)
select id, true from public.shops s
where not exists (
  select 1 from public.shop_settings ss where ss.shop_id = s.id
);

-- 5. Update existing shop_settings to accepting_orders = true by default
update public.shop_settings set accepting_orders = true where accepting_orders = false;

-- 6. Ensure shop owners can manage their desktop agents
drop policy if exists agents_owner_all on public.desktop_agents;
create policy agents_owner_all on public.desktop_agents
for all to authenticated
using ((select public.is_shop_owner(shop_id)) or (select public.is_admin()))
with check ((select public.is_shop_owner(shop_id)) or (select public.is_admin()));
