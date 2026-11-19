begin;
create extension if not exists pgtap with schema extensions;
select plan(9);
insert into auth.users (id, email, aud, role, instance_id) values
  ('dddddddd-0000-0000-0000-000000000004', 'spender@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('eeeeeeee-0000-0000-0000-000000000005', 'nosy@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-000000000004","role":"authenticated"}', true);

insert into public.expenses (amount, category, payment_mode) values (850, 'Grocery', 'upi');
select is((select spent_on from public.expenses), public.app_today(), 'date defaults to today in IST');
select is((select owner_id from public.expenses), 'dddddddd-0000-0000-0000-000000000004'::uuid, 'owner set from session');
select throws_ok($$ insert into public.expenses (amount, category) values (0, 'Grocery') $$, '23514', null, 'amount must be > 0');
select throws_ok($$ insert into public.expenses (amount, category, payment_mode) values (10, 'Grocery', 'bitcoin') $$, '23514', null, 'unknown payment mode rejected');

select public.load_demo_data();
select is((select count(*)::int from public.expenses where is_demo), 10, 'demo spending loaded');
create temp table _b as select public.export_backup() as b;
select is((select jsonb_array_length(b->'tables'->'expenses') from _b), 11, 'backup includes spending');
select public.clear_demo_data();
select is((select count(*)::int from public.expenses), 1, 'clearing demo keeps real spending');

select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000005","role":"authenticated"}', true);
select is((select count(*)::int from public.expenses), 0, 'other account cannot see spending');
update public.expenses set amount = 1;
reset role;
select is((select amount from public.expenses where owner_id = 'dddddddd-0000-0000-0000-000000000004'), 850.00::numeric, 'other account cannot change spending');
select * from finish();
rollback;
