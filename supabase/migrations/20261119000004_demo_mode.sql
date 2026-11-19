-- =============================================================================
-- Demo mode: clearly-flagged sample data (is_demo = true) that can be loaded
-- and removed without touching real records.
-- =============================================================================

create or replace function public.has_demo_data()
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from public.clients where is_demo and owner_id = auth.uid())
      or exists (select 1 from public.loans where is_demo and owner_id = auth.uid())
      or exists (select 1 from public.debts where is_demo and owner_id = auth.uid())
$$;

create or replace function public.clear_demo_data()
returns void language plpgsql set search_path = '' as $$
declare v_uid uuid := auth.uid(); t text;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  foreach t in array array['activities','reminders','balance_snapshots','invoice_receipts','invoices','jsr_items',
                           'projects','clients','loan_payments','loan_balance_updates','loan_installments','loans',
                           'card_payments','card_statements','credit_cards','debt_payments','debt_installments','debts'] loop
    execute format('delete from public.%I where owner_id = $1 and is_demo', t) using v_uid;
  end loop;
  perform public.sync_reminders(v_uid);
end $$;

create or replace function public.load_demo_data()
returns void language plpgsql set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  d date := public.app_today();
  l_home uuid; l_car uuid; c1 uuid; c2 uuid; s1 uuid; s2 uuid; db1 uuid; db2 uuid; db3 uuid;
  cl1 uuid; cl2 uuid; cl3 uuid; p1 uuid; p2 uuid; p3 uuid; j1 uuid; j2 uuid; j3 uuid; j4 uuid; j5 uuid; j6 uuid;
  i1 uuid; i2 uuid; i3 uuid; k int;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if public.has_demo_data() then return; end if;

  -- Loans
  insert into public.loans (lender, name, original_principal, interest_rate, emi_amount, first_due_date,
                            tenure_months, emis_remaining, balance_baseline, balance_baseline_on, notes, is_demo)
  values ('Demo Bank', 'Home loan', 4500000, 8.6, 42800, d + 3, 240, 180, 3842500, d - 20,
          'DEMO — sample home loan', true) returning id into l_home;
  insert into public.loans (lender, name, original_principal, interest_rate, emi_amount, first_due_date,
                            tenure_months, emis_remaining, balance_baseline, balance_baseline_on, notes, is_demo)
  values ('Demo Finance', 'Car loan', 700000, 9.25, 18450, d - 2, 60, 26, 410000, d - 40,
          'DEMO — sample car loan', true) returning id into l_car;

  -- Cards
  insert into public.credit_cards (nickname, issuer, last4, credit_limit, statement_day, due_day, is_demo)
  values ('Travel card', 'Demo Bank', '4321', 300000, extract(day from d - 15)::int, extract(day from d + 5)::int, true)
  returning id into c1;
  insert into public.credit_cards (nickname, issuer, last4, credit_limit, statement_day, due_day, is_demo)
  values ('Shopping card', 'Sample Bank', '9876', 150000, extract(day from d - 8)::int, extract(day from d + 12)::int, true)
  returning id into c2;
  insert into public.card_statements (card_id, statement_date, due_date, total_due, minimum_due, is_demo)
  values (c1, d - 15, d + 5, 42300, 2115, true) returning id into s1;
  insert into public.card_payments (statement_id, paid_on, amount, notes, is_demo) values (s1, d - 3, 10000, 'Part payment', true);
  insert into public.card_statements (card_id, statement_date, due_date, total_due, minimum_due, is_demo)
  values (c2, d - 8, d + 12, 8900, 450, true) returning id into s2;

  -- Personal money
  insert into public.debts (direction, counterparty, reason, original_amount, started_on, due_date, is_demo)
  values ('i_owe', 'Demo Cousin', 'Short-term loan for laptop', 50000, d - 60, d + 20, true) returning id into db1;
  insert into public.debt_payments (debt_id, paid_on, amount, reference, is_demo) values (db1, d - 30, 20000, 'UPI demo-001', true);
  insert into public.debts (direction, counterparty, reason, original_amount, started_on, follow_up_date, is_demo)
  values ('owed_to_me', 'Demo Friend A', 'Lent for travel booking', 25000, d - 45, d, true) returning id into db2;
  insert into public.debts (direction, counterparty, reason, original_amount, started_on, due_date, is_demo)
  values ('owed_to_me', 'Demo Friend B', 'Concert tickets', 12000, d - 40, d - 10, true) returning id into db3;
  insert into public.debt_payments (debt_id, paid_on, amount, is_demo) values (db3, d - 12, 4000, true);

  -- Agency
  insert into public.clients (name, contact_name, phone, email, is_demo)
  values ('Demo Foods Co', 'Anjali (demo)', '+91 90000 00001', 'anjali@example.com', true) returning id into cl1;
  insert into public.clients (name, contact_name, phone, email, is_demo)
  values ('Demo Apparel', 'Vikram (demo)', '+91 90000 00002', 'vikram@example.com', true) returning id into cl2;
  insert into public.clients (name, contact_name, phone, email, is_demo)
  values ('Demo Fintech', 'Meera (demo)', '+91 90000 00003', 'meera@example.com', true) returning id into cl3;

  insert into public.projects (client_id, name, kind, expected_invoice_amount, expected_invoice_date, is_demo)
  values (cl1, 'Monthly social retainer', 'retainer', 150000, d + 10, true) returning id into p1;
  insert into public.projects (client_id, name, kind, is_demo)
  values (cl2, 'Winter campaign', 'campaign', true) returning id into p2;
  insert into public.projects (client_id, name, kind, expected_invoice_amount, expected_invoice_date, is_demo)
  values (cl3, 'Brand film pitch', 'pitch', 350000, d + 25, true) returning id into p3;

  insert into public.jsr_items (client_id, project_id, title, status, next_action, next_owner, action_due, priority, is_demo)
  values (cl1, p1, 'December social calendar', 'in_progress', 'Finish copy for week 1 posts', 'me', d, 'high', true)
  returning id into j1;
  insert into public.jsr_items (client_id, project_id, title, status, next_action, next_owner, follow_up_date,
                                waiting_since, last_contact_on, priority, is_demo)
  values (cl2, p2, 'Winter key visual options', 'waiting_for_client', 'Client to pick a KV route', 'client', d,
          d - 6, d - 6, 'high', true) returning id into j2;
  insert into public.jsr_items (client_id, project_id, title, status, next_action, next_owner, action_due, priority, is_demo)
  values (cl3, p3, 'Pitch deck v2', 'internal_review', 'Design team to finalise film references', 'team', d + 2, 'medium', true)
  returning id into j3;
  insert into public.jsr_items (client_id, project_id, title, status, next_action, next_owner, action_due, priority, is_demo)
  values (cl2, p2, 'Product shoot edit', 'revisions_needed', 'Apply round-2 colour feedback', 'me', d - 1, 'high', true)
  returning id into j4;
  insert into public.jsr_items (client_id, project_id, title, status, next_action, next_owner, billing, priority, is_demo)
  values (cl1, p1, 'Website banners', 'approved', 'Raise invoice', 'me', 'to_invoice', 'medium', true)
  returning id into j5;
  insert into public.jsr_items (client_id, project_id, title, status, next_action, next_owner, action_due, priority, is_demo)
  values (cl3, null, 'Reel series — 6 cuts', 'to_send', 'Send final cuts via drive link', 'me', d + 1, 'medium', true)
  returning id into j6;

  insert into public.invoices (client_id, project_id, invoice_number, invoice_date, due_date, amount, gst_rate, gst_amount,
                               tds_rate, tds_amount, stage, sent_on, is_demo)
  values (cl2, p2, 'DEMO-041', d - 35, d - 5, 200000, 18, 36000, 2, 4000, 'sent', d - 35, true) returning id into i1;
  insert into public.invoice_receipts (invoice_id, received_on, bank_amount, reference, is_demo)
  values (i1, d - 3, 100000, 'NEFT demo-77', true);
  insert into public.invoices (client_id, project_id, invoice_number, invoice_date, due_date, amount, gst_rate, gst_amount,
                               tds_rate, tds_amount, stage, sent_on, is_demo)
  values (cl1, p1, 'DEMO-044', d - 2, d + 13, 150000, 18, 27000, 2, 3000, 'sent', d - 2, true) returning id into i2;
  insert into public.invoices (client_id, project_id, jsr_item_id, invoice_number, invoice_date, due_date, amount,
                               gst_rate, gst_amount, stage, is_demo)
  values (cl1, p1, null, 'DEMO-045', d, d + 30, 75000, 18, 13500, 'ready', true) returning id into i3;

  -- Month-end debt history (six months)
  for k in 1..6 loop
    insert into public.balance_snapshots (snapshot_on, loans_total, cards_total, owe_total, source, notes, is_demo)
    values ((date_trunc('month', d) - make_interval(months => k - 1) - interval '1 day')::date,
            3842500 + 410000 + k * 52000, 38000 + (k % 3) * 9000, 30000 + k * 2500, 'manual', 'DEMO', true)
    on conflict (owner_id, snapshot_on) do nothing;
  end loop;

  perform public.sync_reminders(v_uid);
end $$;

grant execute on function public.has_demo_data(), public.clear_demo_data(), public.load_demo_data() to authenticated;
revoke execute on function public.has_demo_data(), public.clear_demo_data(), public.load_demo_data() from anon, public;
