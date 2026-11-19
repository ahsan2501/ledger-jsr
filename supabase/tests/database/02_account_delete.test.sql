begin;
create extension if not exists pgtap with schema extensions;
select plan(4);
insert into auth.users (id, email, aud, role, instance_id) values
  ('cccccccc-0000-0000-0000-000000000003', 'gone@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}', true);
select public.load_demo_data();
select ok((select count(*) from public.reminders) > 0, 'demo data creates reminders');
-- deleting a parent re-syncs reminders once
delete from public.credit_cards;
select is((select count(*)::int from public.reminders where source_type = 'card_statement' and status = 'active'), 0,
          'deleting a card resolves its bill reminders');
reset role;
select set_config('request.jwt.claims', '', true);
-- account deletion cascades cleanly (the real Auth admin API path is covered by the e2e suite)
select lives_ok($$ delete from auth.users where id = 'cccccccc-0000-0000-0000-000000000003' $$, 'auth user can be deleted');
select is((select count(*)::int from public.loans where owner_id = 'cccccccc-0000-0000-0000-000000000003'), 0, 'all owned rows removed');
select * from finish();
rollback;
