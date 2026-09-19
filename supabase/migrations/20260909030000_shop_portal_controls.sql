alter table public.pricing_rules add column is_active boolean not null default true;
create index pricing_rules_active_lookup_idx on public.pricing_rules (shop_id, is_active, color_mode, paper_size, min_pages);

-- Replace broad member write access with read access for staff and owner/admin writes.
drop policy pricing_member_all on public.pricing_rules;
create policy pricing_member_select on public.pricing_rules
for select to authenticated
using ((select public.is_shop_member(shop_id)) or (select public.is_admin()));
create policy pricing_owner_insert on public.pricing_rules
for insert to authenticated
with check ((select public.is_shop_owner(shop_id)) or (select public.is_admin()));
create policy pricing_owner_update on public.pricing_rules
for update to authenticated
using ((select public.is_shop_owner(shop_id)) or (select public.is_admin()))
with check ((select public.is_shop_owner(shop_id)) or (select public.is_admin()));
create policy pricing_owner_delete on public.pricing_rules
for delete to authenticated
using ((select public.is_shop_owner(shop_id)) or (select public.is_admin()));

-- Printer and agent state belongs to the local Agent, not the browser.
drop policy agents_member_all on public.desktop_agents;
create policy agents_member_select on public.desktop_agents
for select to authenticated
using ((select public.is_shop_member(shop_id)) or (select public.is_admin()));
create policy agents_admin_all on public.desktop_agents
for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy printers_member_all on public.printers;
create policy printers_member_select on public.printers
for select to authenticated
using ((select public.is_shop_member(shop_id)) or (select public.is_admin()));
create policy printers_admin_all on public.printers
for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- Shop members can view settings, but only owners/admins can change them.
drop policy settings_member_all on public.shop_settings;
create policy settings_member_select on public.shop_settings
for select to authenticated
using ((select public.is_shop_member(shop_id)) or (select public.is_admin()));
create policy settings_owner_update on public.shop_settings
for update to authenticated
using ((select public.is_shop_owner(shop_id)) or (select public.is_admin()))
with check ((select public.is_shop_owner(shop_id)) or (select public.is_admin()));

create policy qr_member_select on public.qr_codes
for select to authenticated
using ((select public.is_shop_member(shop_id)) or (select public.is_admin()));

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

create trigger protect_shop_public_identifier
before update on public.shops
for each row execute function public.protect_shop_public_id();

create trigger protect_qr_public_token
before update on public.qr_codes
for each row execute function public.protect_qr_public_token();

create or replace function public.validate_pricing_rule_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
	if new.is_active and exists (
		select 1
		from public.pricing_rules existing
		where existing.shop_id = new.shop_id
			and existing.color_mode = new.color_mode
			and existing.paper_size = new.paper_size
			and existing.is_active
			and existing.id <> new.id
			and int4range(existing.min_pages, coalesce(existing.max_pages, 2147483647), '[]')
					&& int4range(new.min_pages, coalesce(new.max_pages, 2147483647), '[]')
	) then
		raise exception 'Active pricing rules cannot overlap';
	end if;
	return new;
end;
$$;

create trigger validate_pricing_rule_overlap
before insert or update on public.pricing_rules
for each row execute function public.validate_pricing_rule_overlap();
