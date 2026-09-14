-- Run against a disposable Supabase project after creating two authenticated users and two shops.
-- Replace the UUID placeholders with seeded auth.users/profile/shop values.
-- This file is intentionally executable SQL for psql/Supabase SQL Editor; it does not create fixtures in production.

begin;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- User 1 must see Shop 1 data and no Shop 2 data.
select count(*) = 1 as user_one_sees_own_shop
from public.shop_members
where user_id = '00000000-0000-0000-0000-000000000001';

select count(*) = 0 as user_one_cannot_read_other_shop_jobs
from public.print_jobs
where shop_id = '00000000-0000-0000-0000-000000000002';

select count(*) = 0 as user_one_cannot_read_other_shop_orders
from public.orders
where shop_id = '00000000-0000-0000-0000-000000000002';

select count(*) = 0 as user_one_cannot_read_other_shop_documents
from public.documents
where shop_id = '00000000-0000-0000-0000-000000000002';

-- Change to User 2 and confirm the inverse boundary.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);

select count(*) = 0 as user_two_cannot_read_other_shop_jobs
from public.print_jobs
where shop_id = '00000000-0000-0000-0000-000000000001';

select count(*) = 0 as user_two_cannot_read_other_shop_settings
from public.shop_settings
where shop_id = '00000000-0000-0000-0000-000000000001';

select count(*) = 0 as user_two_cannot_read_other_shop_orders
from public.orders
where shop_id = '00000000-0000-0000-0000-000000000001';

select count(*) = 0 as user_two_cannot_read_other_shop_pricing
from public.pricing_rules
where shop_id = '00000000-0000-0000-0000-000000000001';

select count(*) = 0 as user_two_cannot_read_other_shop_printers
from public.printers
where shop_id = '00000000-0000-0000-0000-000000000001';

rollback;
