-- pgTAP tests for money logic, reminders and owner-only access.
-- Run with:  npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(59);

-- two users
insert into auth.users (id, email, aud, role, instance_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'owner@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'intruder@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

create or replace function pg_temp.act_as(p uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
end $$;

select ok(exists(select 1 from public.profiles where owner_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
          'profile auto-created on signup');

-- ===== Flow 1: bill due in five days → exactly one reminder ==================
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');

insert into public.credit_cards (id, nickname, issuer, last4) values
  ('c0000000-0000-0000-0000-000000000001', 'Test card', 'Test Bank', '1234');
insert into public.card_statements (id, card_id, statement_date, due_date, total_due, minimum_due) values
  ('50000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   public.app_today() - 15, public.app_today() + 5, 30000, 1500);

select public.run_maintenance('aaaaaaaa-0000-0000-0000-000000000001');
select public.run_maintenance('aaaaaaaa-0000-0000-0000-000000000001');

select is((select count(*)::int from public.reminders where source_id = '50000000-0000-0000-0000-000000000001'),
          1, 'exactly one reminder row after running the scheduler twice');
select is((select remind_on from public.reminders where source_id = '50000000-0000-0000-0000-000000000001'),
          public.app_today(), 'reminder is scheduled five calendar days before the due date');
select is((select stage from public.reminders where source_id = '50000000-0000-0000-0000-000000000001'),
          'advance', 'stage is advance');
select is((select fire_at from public.reminders where source_id = '50000000-0000-0000-0000-000000000001'),
          ((public.app_today() + time '09:00')::timestamp at time zone 'Asia/Kolkata'),
          'fires at 09:00 IST');

-- ===== Flow 2: partial payment then settle ===================================
select public.record_card_payment('50000000-0000-0000-0000-000000000001', 10000, null, 'part');
select is((select amount_remaining from public.v_card_statements where id = '50000000-0000-0000-0000-000000000001'),
          20000.00::numeric, 'remaining after partial payment');
select ok((select minimum_covered and not is_paid from public.v_card_statements where id = '50000000-0000-0000-0000-000000000001'),
          'minimum covered but bill not marked paid');
select is((select payment_status from public.v_card_statements where id = '50000000-0000-0000-0000-000000000001'),
          'minimum_paid', 'payment status minimum_paid');
select is((select count(*)::int from public.reminders where source_id = '50000000-0000-0000-0000-000000000001' and status = 'active'),
          1, 'reminder still active after partial payment');
select matches((select detail from public.reminders where source_id = '50000000-0000-0000-0000-000000000001'),
          '^₹20,000 to pay \(₹10,000 of ₹30,000 already paid\)', 'reminder shows remaining amount in INR');

select public.record_card_payment('50000000-0000-0000-0000-000000000001', 20000);
select ok((select is_paid from public.v_card_statements where id = '50000000-0000-0000-0000-000000000001'),
          'bill fully paid once the full statement amount is covered');
select is((select count(*)::int from public.reminders where source_id = '50000000-0000-0000-0000-000000000001' and status = 'active'),
          0, 'no active reminder after settlement');
select is((select status from public.reminders where source_id = '50000000-0000-0000-0000-000000000001'),
          'resolved', 'reminder resolved after settlement');
select public.run_maintenance('aaaaaaaa-0000-0000-0000-000000000001');
select is((select count(*)::int from public.reminders where source_id = '50000000-0000-0000-0000-000000000001'),
          1, 'scheduler does not recreate reminders for a paid bill');

-- ===== Due date change recalculates ==========================================
insert into public.card_statements (id, card_id, statement_date, due_date, total_due, minimum_due) values
  ('50000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
   public.app_today() - 3, public.app_today() + 20, 5000, 250);
select is((select remind_on from public.reminders where source_id = '50000000-0000-0000-0000-000000000002' and status = 'active'),
          public.app_today() + 15, 'new statement reminder 5 days before');
update public.card_statements set due_date = public.app_today() + 10 where id = '50000000-0000-0000-0000-000000000002';
select is((select remind_on from public.reminders where source_id = '50000000-0000-0000-0000-000000000002' and status = 'active'),
          public.app_today() + 5, 'reminder moved when due date changed');
select is((select count(*)::int from public.reminders where source_id = '50000000-0000-0000-0000-000000000002' and status = 'active'),
          1, 'only one active reminder after due date change');

-- advance days setting
update public.profiles set advance_days = 3 where owner_id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is((select remind_on from public.reminders where source_id = '50000000-0000-0000-0000-000000000002' and status = 'active'),
          public.app_today() + 7, 'changing advance days recalculates');
update public.profiles set advance_days = 5 where owner_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- overdue stage
update public.card_statements set statement_date = public.app_today() - 30, due_date = public.app_today() - 2
 where id = '50000000-0000-0000-0000-000000000002';
select is((select stage from public.reminders where source_id = '50000000-0000-0000-0000-000000000002' and status = 'active'),
          'overdue', 'overdue alert once past due');
update public.profiles set alert_overdue = false where owner_id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is((select stage from public.reminders where source_id = '50000000-0000-0000-0000-000000000002' and status = 'active'),
          'due', 'overdue alert can be turned off');
update public.profiles set alert_overdue = true where owner_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- ===== Loans =================================================================
insert into public.loans (id, lender, name, original_principal, emi_amount, first_due_date, balance_baseline, balance_baseline_on)
values ('10000000-0000-0000-0000-000000000001', 'Bank', 'Test loan', 500000, 10000, public.app_today() + 5, 300000, public.app_today() - 10);
select is((select count(*)::int from public.loan_installments where loan_id = '10000000-0000-0000-0000-000000000001'),
          1, 'first EMI materialised');
select is((select stage from public.reminders where source_type = 'loan_installment' and status = 'active'),
          'advance', 'EMI gets an advance reminder');
select public.record_loan_payment('10000000-0000-0000-0000-000000000001', 10000);
select is((select outstanding from public.v_loans where id = '10000000-0000-0000-0000-000000000001'),
          300000.00::numeric, 'EMI without known principal does not change outstanding');
select is((select unknown_principal_payments from public.v_loans where id = '10000000-0000-0000-0000-000000000001'),
          1, 'payment with unknown principal is counted');
select is((select count(*)::int from public.loan_installments where loan_id = '10000000-0000-0000-0000-000000000001'),
          2, 'next EMI generated when current one is paid');
select is((select next_due_date from public.v_loans where id = '10000000-0000-0000-0000-000000000001'),
          (public.app_today() + 5 + interval '1 month')::date, 'next due date rolls forward a month');
select public.record_loan_payment('10000000-0000-0000-0000-000000000001', 50000, null, 'prepayment', null, 50000);
select is((select outstanding from public.v_loans where id = '10000000-0000-0000-0000-000000000001'),
          250000.00::numeric, 'prepayment with known principal reduces outstanding');
select public.record_loan_payment('10000000-0000-0000-0000-000000000001', 10000, null, 'emi', null, 7000, 2800, 200);
select is((select outstanding from public.v_loans where id = '10000000-0000-0000-0000-000000000001'),
          243000.00::numeric, 'EMI with principal split reduces outstanding by principal only');
select public.update_lender_balance('10000000-0000-0000-0000-000000000001', 245500, public.app_today());
select is((select outstanding from public.v_loans where id = '10000000-0000-0000-0000-000000000001'),
          245500.00::numeric, 'lender-reported balance becomes the new baseline');
select is((select balance_source from public.loans where id = '10000000-0000-0000-0000-000000000001'),
          'lender', 'balance source is lender');
select throws_ok($$ select public.record_loan_payment('10000000-0000-0000-0000-000000000001', 100, null, 'emi', null, 90, 20, 0) $$,
          '23514', null, 'principal + interest cannot exceed payment');

-- ===== Personal debts ========================================================
insert into public.debts (id, direction, counterparty, original_amount) values
  ('d0000000-0000-0000-0000-000000000001', 'owed_to_me', 'Friend', 9000);
select is((select count(*)::int from public.reminders where source_id = 'd0000000-0000-0000-0000-000000000001'),
          0, 'no reminder for a debt with no due date or follow-up');
update public.debts set follow_up_date = public.app_today() + 2 where id = 'd0000000-0000-0000-0000-000000000001';
select is((select stage from public.reminders where source_id = 'd0000000-0000-0000-0000-000000000001' and status = 'active'),
          'follow_up', 'separate follow-up date creates a follow-up reminder');
insert into public.debt_installments (debt_id, due_date, amount) values
  ('d0000000-0000-0000-0000-000000000001', public.app_today() + 10, 3000),
  ('d0000000-0000-0000-0000-000000000001', public.app_today() + 40, 6000);
select public.record_debt_payment('d0000000-0000-0000-0000-000000000001', 4000, null, 'UPI-1');
select is((select array_agg(amount_remaining order by due_date) from public.v_debt_installments
           where debt_id = 'd0000000-0000-0000-0000-000000000001'),
          array[0.00, 5000.00]::numeric[], 'payments allocated to instalments oldest first');
select is((select amount_remaining from public.v_debts where id = 'd0000000-0000-0000-0000-000000000001'),
          5000.00::numeric, 'debt remaining after partial repayment');
select public.record_debt_payment('d0000000-0000-0000-0000-000000000001', 5000);
select is((select count(*)::int from public.reminders where source_id = 'd0000000-0000-0000-0000-000000000001' and status = 'active'),
          0, 'settled debt has no active reminders');

-- ===== JSR flow ===============================================================
insert into public.clients (id, name) values ('cc000000-0000-0000-0000-000000000001', 'Client A');
insert into public.jsr_items (id, client_id, title, status) values
  ('ee000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000001', 'KV options', 'to_send');
update public.jsr_items set status = 'waiting_for_client', follow_up_date = public.app_today() + 3
 where id = 'ee000000-0000-0000-0000-000000000001';
select is((select next_owner from public.jsr_items where id = 'ee000000-0000-0000-0000-000000000001'),
          'client', 'waiting for client moves the next move to the client');
select is((select waiting_since from public.jsr_items where id = 'ee000000-0000-0000-0000-000000000001'),
          public.app_today(), 'waiting_since stamped');
select ok(exists(select 1 from public.activities where entity_id = 'ee000000-0000-0000-0000-000000000001' and kind = 'status'
                 and meta->>'from' = 'to_send' and meta->>'to' = 'waiting_for_client'), 'status change logged with timestamp');
select is((select remind_on from public.reminders where source_id = 'ee000000-0000-0000-0000-000000000001'
           and stage = 'follow_up' and status = 'active'), public.app_today() + 3, 'follow-up reminder scheduled');
select public.log_follow_up('jsr_item', 'ee000000-0000-0000-0000-000000000001', 'Called Vikram', public.app_today() + 7, 'call');
select is((select remind_on from public.reminders where source_id = 'ee000000-0000-0000-0000-000000000001'
           and stage = 'follow_up' and status = 'active'), public.app_today() + 7, 'logging a follow-up reschedules the reminder');
update public.jsr_items set status = 'approved' where id = 'ee000000-0000-0000-0000-000000000001';
select is((select billing from public.jsr_items where id = 'ee000000-0000-0000-0000-000000000001'),
          'to_invoice', 'approval marks billing as invoice to send');

-- ===== Invoices: once in cash flow, net of receipts and TDS ===================
insert into public.invoices (id, client_id, jsr_item_id, invoice_number, due_date, amount, gst_amount, tds_amount)
values ('ff000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000001',
        'ee000000-0000-0000-0000-000000000001', 'INV-1', public.app_today() + 15, 100000, 18000, 2000);
select is((select count(*)::int from public.v_obligations where source_id = 'ff000000-0000-0000-0000-000000000001'),
          0, 'draft invoice is not an expected inflow');
select public.mark_invoice_sent('ff000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.v_obligations where source_id = 'ff000000-0000-0000-0000-000000000001'),
          1, 'sent invoice appears exactly once in obligations');
select is((select amount_remaining from public.v_obligations where source_id = 'ff000000-0000-0000-0000-000000000001'),
          116000.00::numeric, 'expected = total incl. GST minus expected TDS');
select is((select billing from public.jsr_items where id = 'ee000000-0000-0000-0000-000000000001'),
          'invoiced', 'linked JSR item marked invoiced');
select public.record_invoice_receipt('ff000000-0000-0000-0000-000000000001', 50000, 0);
select is((select net_expected from public.v_invoices where id = 'ff000000-0000-0000-0000-000000000001'),
          66000.00::numeric, 'only the remaining amount is expected after a receipt');
select is((select status from public.v_invoices where id = 'ff000000-0000-0000-0000-000000000001'),
          'part_paid', 'invoice part-paid');
select public.record_invoice_receipt('ff000000-0000-0000-0000-000000000001', 66000, 0);
select is((select status from public.v_invoices where id = 'ff000000-0000-0000-0000-000000000001'),
          'paid', 'paid once net cash received (TDS still to confirm)');
select is((select tds_pending from public.v_invoices where id = 'ff000000-0000-0000-0000-000000000001'),
          2000.00::numeric, 'TDS still pending confirmation is tracked separately');

-- ===== Backup / restore round trip ===========================================
create temp table _bk as select public.export_backup() as b;
select is((select jsonb_array_length(b->'tables'->'invoices') from _bk), 1, 'backup contains invoices');
delete from public.clients;
select is((select count(*)::int from public.invoices), 0, 'data deleted');
select public.restore_backup((select b from _bk));
select is((select net_expected from public.v_invoices where id = 'ff000000-0000-0000-0000-000000000001'),
          0.00::numeric, 'restored invoice with receipts intact');
select is((select count(*)::int from public.activities where entity_id = 'ee000000-0000-0000-0000-000000000001' and kind = 'created'),
          1, 'restore does not duplicate history');

-- ===== Owner-only access =====================================================
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select is((select count(*)::int from public.card_statements), 0, 'other account sees no statements');
select is((select count(*)::int from public.v_obligations), 0, 'other account sees no obligations');
select is((select count(*)::int from public.reminders), 0, 'other account sees no reminders');
select throws_ok($$ select public.sync_reminders('aaaaaaaa-0000-0000-0000-000000000001') $$, '42501', 'Not allowed',
                 'other account cannot run reminder sync for the owner');
select throws_ok($$ insert into public.card_statements (card_id, statement_date, due_date, total_due)
                    values ('c0000000-0000-0000-0000-000000000001', current_date, current_date, 1) $$,
                 '23503', null, 'other account cannot attach rows to the owner''s card');

select * from finish();
rollback;
