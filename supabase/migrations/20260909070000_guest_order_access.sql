alter table public.orders add column guest_access_token_hash text unique;
create index orders_guest_access_hash_idx on public.orders (guest_access_token_hash) where guest_access_token_hash is not null;
