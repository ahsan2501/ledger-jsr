-- =============================================================================
-- Business logic: payments, schedules, JSR automation, reminders, snapshots.
-- Every function is SECURITY INVOKER (RLS applies to the caller) unless noted.
-- Payment RPCs run in one transaction: the payment row, derived balances and
-- reminder state all change together or not at all.
-- =============================================================================

-- ---------- helpers ----------------------------------------------------------

-- Indian digit grouping: 1250000.5 -> ₹12,50,000.50
create or replace function public.fmt_inr(n numeric)
returns text language plpgsql immutable set search_path = '' as $$
declare
  v_abs numeric := abs(coalesce(n, 0));
  v_int text := trunc(v_abs)::bigint::text;
  v_frac int := round((v_abs - trunc(v_abs)) * 100)::int;
  v_last3 text; v_rest text; v_out text := '';
begin
  if v_frac = 100 then v_int := (trunc(v_abs)::bigint + 1)::text; v_frac := 0; end if;
  if length(v_int) <= 3 then
    v_out := v_int;
  else
    v_last3 := right(v_int, 3);
    v_rest := left(v_int, length(v_int) - 3);
    while length(v_rest) > 2 loop
      v_out := ',' || right(v_rest, 2) || v_out;
      v_rest := left(v_rest, length(v_rest) - 2);
    end loop;
    v_out := v_rest || v_out || ',' || v_last3;
  end if;
  return case when n < 0 then '-' else '' end || '₹' || v_out
         || case when v_frac > 0 then '.' || lpad(v_frac::text, 2, '0') else '' end;
end $$;

create or replace function public.fmt_day(d date)
returns text language sql immutable set search_path = '' as $$ select to_char(d, 'FMDD Mon') $$;

-- Callers with a user JWT may only act on their own data. Server jobs
-- (service role, no JWT user) may act on any owner.
create or replace function public.assert_owner(p_owner uuid)
returns void language plpgsql stable set search_path = '' as $$
begin
  if auth.uid() is not null and p_owner is distinct from auth.uid() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
end $$;

create or replace function public.sync_suspended()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(current_setting('app.skip_sync', true), '') = 'on'
$$;

-- ---------- reminders --------------------------------------------------------

-- The complete set of reminders that *should* exist right now for an owner.
-- Each money item has exactly one current stage, so the inbox never shows the
-- same bill twice. The dedupe key includes the stage and due date: changing a
-- due date produces a new key (the old one is resolved), and a stage that has
-- already been pushed can never be pushed again.
create or replace function public.desired_reminders(p_owner uuid)
returns table (dedupe_key text, source_type text, source_id uuid, stage text, direction text,
               due_date date, remind_on date, title text, detail text, amount numeric,
               href text, is_demo boolean)
language sql stable set search_path = '' as $$
  with prof as (
    select coalesce(p.advance_days, 5) as advance_days,
           coalesce(p.alert_on_due, true) as alert_on_due,
           coalesce(p.alert_overdue, true) as alert_overdue,
           coalesce(p.remind_receipts, true) as remind_receipts,
           coalesce(p.remind_work, true) as remind_work
    from (select 1) one left join public.profiles p on p.owner_id = p_owner
  ),
  t as (select public.app_today() as today),
  ob as (
    select o.* from public.v_obligations o
    where o.owner_id = p_owner and o.amount_remaining > 0 and o.due_date is not null
  ),
  outgoing as (
    select o.*,
      case
        when t.today < o.due_date then 'advance'
        when t.today = o.due_date then case when pr.alert_on_due then 'due' else 'advance' end
        else case when pr.alert_overdue then 'overdue' when pr.alert_on_due then 'due' else 'advance' end
      end as stage, pr.advance_days
    from ob o cross join t cross join prof pr
    where o.direction = 'out'
  ),
  incoming as (
    select o.*,
      case when t.today <= o.due_date or not pr.alert_overdue then 'expected' else 'overdue' end as stage
    from ob o cross join t cross join prof pr
    where o.direction = 'in' and pr.remind_receipts
  )
  select o.source_type || ':' || o.source_id || ':' || o.stage || ':' || o.due_date,
         o.source_type, o.source_id, o.stage, 'out', o.due_date,
         case o.stage when 'advance' then o.due_date - o.advance_days
                      when 'due' then o.due_date
                      else o.due_date + 1 end,
         case o.stage when 'overdue' then 'Overdue: ' else 'Pay ' end || o.title
           || case o.stage when 'overdue' then ' (was due ' else ' by ' end || public.fmt_day(o.due_date)
           || case o.stage when 'overdue' then ')' else '' end,
         public.fmt_inr(o.amount_remaining) || ' to pay'
           || case when o.amount_paid > 0 then ' (' || public.fmt_inr(o.amount_paid) || ' of '
                   || public.fmt_inr(o.amount_total) || ' already paid)' else '' end
           || case when o.source_type = 'card_statement' then
                case when o.minimum_covered then ' · minimum covered'
                     else ' · minimum ' || public.fmt_inr(o.minimum_due) || ' not yet covered' end
              else '' end
           || ' · ' || o.counterparty,
         o.amount_remaining, o.href, o.is_demo
  from outgoing o
  union all
  select o.source_type || ':' || o.source_id || ':' || o.stage || ':' || o.due_date,
         o.source_type, o.source_id, o.stage, 'in', o.due_date,
         case o.stage when 'expected' then o.due_date else o.due_date + 1 end,
         case o.stage when 'overdue' then 'Chase: ' else 'Expect: ' end || o.title || ' from ' || o.counterparty,
         public.fmt_inr(o.amount_remaining) || ' expected'
           || case o.stage when 'overdue' then ' · was due ' else ' · due ' end || public.fmt_day(o.due_date),
         o.amount_remaining, o.href, o.is_demo
  from incoming o
  union all
  -- Personal debt follow-ups (either direction)
  select 'debt:' || d.id || ':follow_up:' || d.follow_up_date, 'debt', d.id, 'follow_up',
         case when d.direction = 'i_owe' then 'out' else 'in' end,
         d.follow_up_date, d.follow_up_date,
         'Follow up with ' || d.counterparty,
         public.fmt_inr(d.amount_remaining) || case when d.direction = 'i_owe' then ' you owe' else ' owed to you' end
           || coalesce(' · ' || nullif(d.reason, ''), ''),
         d.amount_remaining, '/finance/debts/' || d.id, d.is_demo
  from public.v_debts d
  where d.owner_id = p_owner and d.follow_up_date is not null and not d.is_settled and not d.closed
  union all
  -- JSR action due dates
  select 'jsr_item:' || j.id || ':action_due:' || j.action_due, 'jsr_item', j.id, 'action_due', 'work',
         j.action_due, j.action_due,
         j.client_name || ': ' || j.title,
         coalesce(nullif(j.next_action, ''), 'Next action due') || ' · ' ||
           case j.next_owner when 'me' then 'you' when 'team' then 'team' else 'client' end,
         null::numeric, '/work/items/' || j.id, j.is_demo
  from public.v_jsr_items j cross join prof pr
  where j.owner_id = p_owner and pr.remind_work and j.is_active and j.action_due is not null
  union all
  -- JSR client follow-ups
  select 'jsr_item:' || j.id || ':follow_up:' || j.follow_up_date, 'jsr_item', j.id, 'follow_up', 'work',
         j.follow_up_date, j.follow_up_date,
         'Follow up: ' || j.client_name || ' — ' || j.title,
         coalesce(nullif(j.next_action, ''), 'Client follow-up')
           || case when j.waiting_days is not null then ' · waiting ' || j.waiting_days || ' days' else '' end,
         null::numeric, '/work/items/' || j.id, j.is_demo
  from public.v_jsr_items j cross join prof pr
  where j.owner_id = p_owner and pr.remind_work and j.is_active and j.follow_up_date is not null
$$;

-- Reconcile stored reminders with the desired set. Idempotent: running it any
-- number of times leaves exactly one row per dedupe key.
create or replace function public.sync_reminders(p_owner uuid)
returns void language plpgsql set search_path = '' as $$
declare v_time time;
begin
  if public.sync_suspended() or p_owner is null then return; end if;
  perform public.assert_owner(p_owner);
  select reminder_time into v_time from public.profiles where owner_id = p_owner;
  v_time := coalesce(v_time, '09:00'::time);

  insert into public.reminders as r
    (owner_id, dedupe_key, source_type, source_id, stage, direction, due_date, remind_on, fire_at,
     title, detail, amount, href, is_demo)
  select p_owner, d.dedupe_key, d.source_type, d.source_id, d.stage, d.direction, d.due_date, d.remind_on,
         ((d.remind_on + v_time)::timestamp at time zone 'Asia/Kolkata'),
         d.title, d.detail, d.amount, d.href, d.is_demo
  from public.desired_reminders(p_owner) d
  on conflict (owner_id, dedupe_key) do update set
    title = excluded.title, detail = excluded.detail, amount = excluded.amount, href = excluded.href,
    remind_on = excluded.remind_on, fire_at = excluded.fire_at,
    status = case when r.status = 'resolved' then 'active' else r.status end,
    resolved_at = case when r.status = 'resolved' then null else r.resolved_at end
  where r.status <> 'dismissed'
    and (r.title, r.detail, r.amount, r.href, r.remind_on, r.fire_at, r.status)
        is distinct from (excluded.title, excluded.detail, excluded.amount, excluded.href,
                          excluded.remind_on, excluded.fire_at, 'active');

  update public.reminders r set status = 'resolved', resolved_at = now()
  where r.owner_id = p_owner and r.status = 'active'
    and not exists (select 1 from public.desired_reminders(p_owner) d where d.dedupe_key = r.dedupe_key);
end $$;

create or replace function public.trg_sync_reminders()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_reminders(old.owner_id);
  else
    perform public.sync_reminders(new.owner_id);
    if tg_op = 'UPDATE' and old.owner_id is distinct from new.owner_id then
      perform public.sync_reminders(old.owner_id);
    end if;
  end if;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','loans','loan_installments','loan_payments','card_statements','card_payments',
                           'credit_cards','debts','debt_installments','debt_payments','invoices','invoice_receipts',
                           'jsr_items','clients','projects'] loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.trg_sync_reminders()', t || '_sync_reminders', t);
  end loop;
end $$;

-- ---------- activity helper --------------------------------------------------

create or replace function public.log_activity(p_owner uuid, p_type text, p_id uuid, p_kind text,
                                               p_note text default null, p_meta jsonb default '{}'::jsonb,
                                               p_demo boolean default false)
returns void language sql set search_path = '' as $$
  insert into public.activities (owner_id, entity_type, entity_id, kind, note, meta, is_demo)
  values (p_owner, p_type, p_id, p_kind, p_note, coalesce(p_meta, '{}'::jsonb), coalesce(p_demo, false));
$$;

-- ---------- loans -----------------------------------------------------------

-- Keep the EMI schedule materialised: there is always an unpaid installment
-- on or after today while the loan is active (until EMIs run out).
create or replace function public.ensure_loan_installments(p_loan uuid)
returns void language plpgsql set search_path = '' as $$
declare
  l public.loans;
  v_last date; v_count int; v_guard int := 0; v_out numeric; v_next date;
begin
  select * into l from public.loans where id = p_loan;
  if not found or l.status <> 'active' or l.emi_amount is null or l.first_due_date is null then return; end if;
  loop
    v_guard := v_guard + 1;
    exit when v_guard > 480;
    select max(due_date), count(*) into v_last, v_count from public.loan_installments where loan_id = p_loan;
    exit when l.emis_remaining is not null and v_count >= l.emis_remaining;
    if v_last is not null then
      exit when v_last >= public.app_today()
            and exists (select 1 from public.v_loan_installments where loan_id = p_loan and not is_paid);
      select outstanding into v_out from public.v_loans where id = p_loan;
      exit when l.balance_baseline > 0 and v_out <= 0;
    end if;
    v_next := (l.first_due_date + make_interval(months => v_count))::date;
    if v_last is not null and v_next <= v_last then
      v_next := (v_last + interval '1 month')::date;
    end if;
    insert into public.loan_installments (owner_id, loan_id, due_date, amount_due, is_demo)
    values (l.owner_id, l.id, v_next, l.emi_amount, l.is_demo)
    on conflict (loan_id, due_date) do nothing;
  end loop;
end $$;

create or replace function public.trg_loans_schedule()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.sync_suspended() then return null; end if;
  if tg_op = 'UPDATE' and new.emi_amount is distinct from old.emi_amount and new.emi_amount is not null then
    -- Future unpaid EMIs with no payments yet pick up the new EMI amount.
    update public.loan_installments i set amount_due = new.emi_amount
    where i.loan_id = new.id and i.due_date >= public.app_today()
      and not exists (select 1 from public.loan_payments p where p.installment_id = i.id);
  end if;
  if tg_op = 'UPDATE' and new.status = 'closed' and old.status <> 'closed' then
    delete from public.loan_installments i where i.loan_id = new.id
      and not exists (select 1 from public.loan_payments p where p.installment_id = i.id);
  end if;
  perform public.ensure_loan_installments(new.id);
  return null;
end $$;

create trigger loans_schedule after insert or update of emi_amount, first_due_date, emis_remaining, status, balance_baseline
on public.loans for each row execute function public.trg_loans_schedule();

-- Move the next unpaid EMI to a new date and re-anchor the schedule on it.
create or replace function public.loan_reschedule_next(p_loan uuid, p_date date)
returns void language plpgsql set search_path = '' as $$
declare v_inst public.loan_installments; v_idx int;
begin
  select i.* into v_inst from public.loan_installments i
  join public.v_loan_installments v on v.id = i.id
  where i.loan_id = p_loan and not v.is_paid order by i.due_date limit 1;
  if not found then
    update public.loans set first_due_date = p_date where id = p_loan;
    return;
  end if;
  select count(*) into v_idx from public.loan_installments where loan_id = p_loan and due_date < v_inst.due_date;
  -- delete later unpaid, untouched installments; they are regenerated from the new anchor
  delete from public.loan_installments i where i.loan_id = p_loan and i.due_date > v_inst.due_date
    and not exists (select 1 from public.loan_payments p where p.installment_id = i.id);
  update public.loan_installments set due_date = p_date where id = v_inst.id;
  update public.loans set first_due_date = (p_date - make_interval(months => v_idx))::date where id = p_loan;
  perform public.ensure_loan_installments(p_loan);
end $$;

create or replace function public.record_loan_payment(
  p_loan uuid, p_amount numeric, p_paid_on date default null, p_kind text default 'emi',
  p_installment uuid default null, p_principal numeric default null, p_interest numeric default null,
  p_fees numeric default null, p_notes text default null)
returns uuid language plpgsql set search_path = '' as $$
declare
  l public.loans; v_first uuid; v_id uuid; v_left numeric := p_amount; v_take numeric; r record;
  v_on date := coalesce(p_paid_on, public.app_today());
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be more than zero'; end if;
  select * into l from public.loans where id = p_loan;
  if not found then raise exception 'Loan not found'; end if;

  if p_kind = 'emi' and p_installment is null and p_principal is null and p_interest is null and p_fees is null then
    -- Split across unpaid EMIs, oldest first.
    for r in select id, amount_remaining from public.v_loan_installments
             where loan_id = p_loan and not is_paid order by due_date loop
      exit when v_left <= 0;
      v_take := least(v_left, r.amount_remaining);
      insert into public.loan_payments (owner_id, loan_id, installment_id, paid_on, amount, kind, notes, is_demo)
      values (l.owner_id, p_loan, r.id, v_on, v_take, 'emi', p_notes, l.is_demo) returning id into v_id;
      v_first := coalesce(v_first, v_id);
      v_left := v_left - v_take;
    end loop;
    if v_left > 0 then
      insert into public.loan_payments (owner_id, loan_id, paid_on, amount, kind, notes, is_demo)
      values (l.owner_id, p_loan, v_on, v_left, 'emi', coalesce(p_notes, 'Paid ahead of schedule'), l.is_demo)
      returning id into v_id;
      v_first := coalesce(v_first, v_id);
    end if;
  else
    if p_kind = 'emi' and p_installment is null then
      select id into p_installment from public.v_loan_installments
      where loan_id = p_loan and not is_paid order by due_date limit 1;
    end if;
    insert into public.loan_payments (owner_id, loan_id, installment_id, paid_on, amount, kind,
                                      principal_part, interest_part, fees_part, notes, is_demo)
    values (l.owner_id, p_loan, case when p_kind = 'emi' then p_installment end, v_on, p_amount, p_kind,
            p_principal, p_interest, p_fees, p_notes, l.is_demo)
    returning id into v_first;
  end if;

  perform public.ensure_loan_installments(p_loan);
  perform public.log_activity(l.owner_id, 'loan', p_loan, 'payment',
    'Paid ' || public.fmt_inr(p_amount) || ' (' || replace(p_kind, '_', ' ') || ')'
      || coalesce(' · principal ' || public.fmt_inr(p_principal), ''),
    jsonb_build_object('amount', p_amount, 'kind', p_kind), l.is_demo);
  perform public.sync_reminders(l.owner_id);
  return v_first;
end $$;

create or replace function public.update_lender_balance(p_loan uuid, p_balance numeric, p_as_of date default null,
                                                        p_notes text default null)
returns void language plpgsql set search_path = '' as $$
declare l public.loans; v_on date := coalesce(p_as_of, public.app_today());
begin
  select * into l from public.loans where id = p_loan;
  if not found then raise exception 'Loan not found'; end if;
  insert into public.loan_balance_updates (owner_id, loan_id, balance, as_of, notes, is_demo)
  values (l.owner_id, p_loan, p_balance, v_on, p_notes, l.is_demo);
  if l.balance_source = 'opening' or v_on >= l.balance_baseline_on then
    update public.loans set balance_baseline = p_balance, balance_baseline_on = v_on,
           balance_baseline_at = now(), balance_source = 'lender'
    where id = p_loan;
  end if;
  perform public.log_activity(l.owner_id, 'loan', p_loan, 'balance',
    'Lender balance ' || public.fmt_inr(p_balance) || ' as of ' || public.fmt_day(v_on), '{}'::jsonb, l.is_demo);
end $$;

-- ---------- cards, debts, invoices ------------------------------------------

create or replace function public.record_card_payment(p_statement uuid, p_amount numeric,
                                                      p_paid_on date default null, p_notes text default null)
returns uuid language plpgsql set search_path = '' as $$
declare s public.card_statements; v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be more than zero'; end if;
  select * into s from public.card_statements where id = p_statement;
  if not found then raise exception 'Statement not found'; end if;
  insert into public.card_payments (owner_id, statement_id, paid_on, amount, notes, is_demo)
  values (s.owner_id, p_statement, coalesce(p_paid_on, public.app_today()), p_amount, p_notes, s.is_demo)
  returning id into v_id;
  perform public.log_activity(s.owner_id, 'card_statement', p_statement, 'payment',
    'Paid ' || public.fmt_inr(p_amount), jsonb_build_object('amount', p_amount), s.is_demo);
  return v_id;
end $$;

create or replace function public.record_debt_payment(p_debt uuid, p_amount numeric, p_paid_on date default null,
                                                      p_reference text default null, p_notes text default null)
returns uuid language plpgsql set search_path = '' as $$
declare d public.debts; v_id uuid; v_left numeric;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be more than zero'; end if;
  select * into d from public.debts where id = p_debt;
  if not found then raise exception 'Record not found'; end if;
  insert into public.debt_payments (owner_id, debt_id, paid_on, amount, reference, notes, is_demo)
  values (d.owner_id, p_debt, coalesce(p_paid_on, public.app_today()), p_amount, p_reference, p_notes, d.is_demo)
  returning id into v_id;
  select amount_remaining into v_left from public.v_debts where id = p_debt;
  if v_left = 0 then
    update public.debts set follow_up_date = null where id = p_debt;
  end if;
  perform public.log_activity(d.owner_id, 'debt', p_debt, 'payment',
    case when d.direction = 'i_owe' then 'Paid ' else 'Received ' end || public.fmt_inr(p_amount)
      || coalesce(' · ref ' || nullif(p_reference, ''), '') || ' · ' || public.fmt_inr(v_left) || ' left',
    jsonb_build_object('amount', p_amount), d.is_demo);
  return v_id;
end $$;

create or replace function public.record_invoice_receipt(p_invoice uuid, p_bank numeric, p_tds numeric default 0,
                                                         p_received_on date default null, p_reference text default null,
                                                         p_notes text default null)
returns uuid language plpgsql set search_path = '' as $$
declare i public.invoices; v_id uuid; v_on date := coalesce(p_received_on, public.app_today()); v_left numeric;
begin
  if coalesce(p_bank, 0) < 0 or coalesce(p_tds, 0) < 0 or coalesce(p_bank, 0) + coalesce(p_tds, 0) <= 0 then
    raise exception 'Enter a bank receipt or confirmed TDS amount';
  end if;
  select * into i from public.invoices where id = p_invoice;
  if not found then raise exception 'Invoice not found'; end if;
  insert into public.invoice_receipts (owner_id, invoice_id, received_on, bank_amount, tds_amount, reference, notes, is_demo)
  values (i.owner_id, p_invoice, v_on, coalesce(p_bank, 0), coalesce(p_tds, 0), p_reference, p_notes, i.is_demo)
  returning id into v_id;
  if i.stage <> 'sent' then
    update public.invoices set stage = 'sent', sent_on = coalesce(sent_on, v_on) where id = p_invoice;
  end if;
  select net_expected into v_left from public.v_invoices where id = p_invoice;
  perform public.log_activity(i.owner_id, 'invoice', p_invoice, 'receipt',
    'Received ' || public.fmt_inr(coalesce(p_bank, 0))
      || case when coalesce(p_tds, 0) > 0 then ' + TDS confirmed ' || public.fmt_inr(p_tds) else '' end
      || ' · ' || public.fmt_inr(v_left) || ' still expected',
    jsonb_build_object('bank', p_bank, 'tds', p_tds), i.is_demo);
  return v_id;
end $$;

create or replace function public.mark_invoice_sent(p_invoice uuid, p_sent_on date default null)
returns void language plpgsql set search_path = '' as $$
declare i public.invoices; v_on date := coalesce(p_sent_on, public.app_today());
begin
  select * into i from public.invoices where id = p_invoice;
  if not found then raise exception 'Invoice not found'; end if;
  update public.invoices set stage = 'sent', sent_on = v_on where id = p_invoice;
  if i.jsr_item_id is not null then
    update public.jsr_items set billing = 'invoiced' where id = i.jsr_item_id and billing in ('pending','to_invoice');
  end if;
  perform public.log_activity(i.owner_id, 'invoice', p_invoice, 'sent',
    'Invoice ' || i.invoice_number || ' sent on ' || public.fmt_day(v_on), '{}'::jsonb, i.is_demo);
end $$;

create or replace function public.trg_invoice_link()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.sync_suspended() then return null; end if;
  if new.jsr_item_id is not null then
    update public.jsr_items set billing = 'invoiced' where id = new.jsr_item_id and billing in ('pending','to_invoice');
  end if;
  perform public.log_activity(new.owner_id, 'invoice', new.id, 'created',
    'Invoice ' || new.invoice_number || ' created (' || public.fmt_inr(new.amount + coalesce(new.gst_amount, 0)) || ')',
    '{}'::jsonb, new.is_demo);
  return null;
end $$;
create trigger invoices_link after insert on public.invoices for each row execute function public.trg_invoice_link();

-- ---------- JSR automation ---------------------------------------------------

create or replace function public.trg_jsr_before()
returns trigger language plpgsql set search_path = '' as $$
declare v_waiting boolean := new.status in ('sent_to_client','waiting_for_client');
begin
  if public.sync_suspended() then return new; end if;
  if tg_op = 'INSERT' then
    if v_waiting then
      new.waiting_since := coalesce(new.waiting_since, public.app_today());
      if new.next_owner = 'me' then new.next_owner := 'client'; end if;
    end if;
    if new.status = 'approved' and new.billing = 'pending' then new.billing := 'to_invoice'; end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    if v_waiting then
      if old.status not in ('sent_to_client','waiting_for_client') or old.waiting_since is null then
        new.waiting_since := public.app_today();
      end if;
      if new.next_owner = old.next_owner then new.next_owner := 'client'; end if;
    else
      new.waiting_since := null;
      if new.next_owner = old.next_owner and old.next_owner = 'client' then new.next_owner := 'me'; end if;
    end if;
    if new.status = 'sent_to_client' and new.last_contact_on is not distinct from old.last_contact_on then
      new.last_contact_on := public.app_today();
    end if;
    if new.status = 'approved' and new.billing = 'pending' then new.billing := 'to_invoice'; end if;
    if new.status = 'closed' then new.follow_up_date := null; end if;
  end if;
  return new;
end $$;
create trigger jsr_before before insert or update on public.jsr_items
for each row execute function public.trg_jsr_before();

create or replace function public.trg_jsr_after()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.sync_suspended() then return null; end if;
  if tg_op = 'INSERT' then
    perform public.log_activity(new.owner_id, 'jsr_item', new.id, 'created', 'Created · ' || replace(new.status, '_', ' '),
                                jsonb_build_object('status', new.status), new.is_demo);
    return null;
  end if;
  if new.status is distinct from old.status then
    perform public.log_activity(new.owner_id, 'jsr_item', new.id,
      case new.status when 'sent_to_client' then 'sent' when 'approved' then 'approved' else 'status' end,
      initcap(replace(old.status, '_', ' ')) || ' → ' || initcap(replace(new.status, '_', ' ')),
      jsonb_build_object('from', old.status, 'to', new.status), new.is_demo);
  end if;
  if new.follow_up_date is distinct from old.follow_up_date and new.follow_up_date is not null then
    perform public.log_activity(new.owner_id, 'jsr_item', new.id, 'next_follow_up',
      'Next follow-up set for ' || public.fmt_day(new.follow_up_date), '{}'::jsonb, new.is_demo);
  end if;
  if new.next_owner is distinct from old.next_owner then
    perform public.log_activity(new.owner_id, 'jsr_item', new.id, 'owner',
      'Next move: ' || new.next_owner, '{}'::jsonb, new.is_demo);
  end if;
  return null;
end $$;
create trigger jsr_after after insert or update on public.jsr_items
for each row execute function public.trg_jsr_after();

-- Log a follow-up (call / message / email) on a JSR item or personal debt and
-- optionally set the next follow-up date — atomically.
create or replace function public.log_follow_up(p_entity_type text, p_entity_id uuid, p_note text default null,
                                                p_next date default null, p_channel text default null)
returns void language plpgsql set search_path = '' as $$
declare v_owner uuid; v_demo boolean;
begin
  if p_entity_type = 'jsr_item' then
    select owner_id, is_demo into v_owner, v_demo from public.jsr_items where id = p_entity_id;
    if v_owner is null then raise exception 'Item not found'; end if;
    perform public.log_activity(v_owner, 'jsr_item', p_entity_id, 'follow_up',
      coalesce(nullif(p_note, ''), 'Followed up') || coalesce(' (' || p_channel || ')', ''),
      jsonb_build_object('channel', p_channel), v_demo);
    update public.jsr_items set last_contact_on = public.app_today(), follow_up_date = p_next where id = p_entity_id;
  elsif p_entity_type = 'debt' then
    select owner_id, is_demo into v_owner, v_demo from public.debts where id = p_entity_id;
    if v_owner is null then raise exception 'Record not found'; end if;
    perform public.log_activity(v_owner, 'debt', p_entity_id, 'follow_up',
      coalesce(nullif(p_note, ''), 'Followed up') || coalesce(' (' || p_channel || ')', ''),
      jsonb_build_object('channel', p_channel), v_demo);
    update public.debts set follow_up_date = p_next where id = p_entity_id;
  else
    raise exception 'Unsupported entity %', p_entity_type;
  end if;
end $$;

-- ---------- snapshots & maintenance -----------------------------------------

create or replace function public.take_balance_snapshot(p_owner uuid, p_on date default null, p_source text default 'auto')
returns void language plpgsql set search_path = '' as $$
declare v_on date := coalesce(p_on, public.app_today());
begin
  perform public.assert_owner(p_owner);
  insert into public.balance_snapshots as b (owner_id, snapshot_on, loans_total, cards_total, owe_total, source)
  select p_owner, v_on,
    coalesce((select sum(outstanding) from public.v_loans where owner_id = p_owner and status = 'active' and not is_demo), 0),
    coalesce((select sum(amount_remaining) from public.v_card_statements where owner_id = p_owner and not is_demo), 0),
    coalesce((select sum(amount_remaining) from public.v_debts
              where owner_id = p_owner and direction = 'i_owe' and not closed and not is_demo), 0),
    p_source
  on conflict (owner_id, snapshot_on) do update set
    loans_total = excluded.loans_total, cards_total = excluded.cards_total, owe_total = excluded.owe_total
  where b.source = 'auto';
end $$;

-- Daily/hourly job body for one owner (called by the server-side scheduler).
create or replace function public.run_maintenance(p_owner uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare r record; v_today date := public.app_today(); v_snap boolean := false;
begin
  perform public.assert_owner(p_owner);
  for r in select id from public.loans where owner_id = p_owner and status = 'active' loop
    perform public.ensure_loan_installments(r.id);
  end loop;
  perform public.sync_reminders(p_owner);
  if v_today = (date_trunc('month', v_today) + interval '1 month - 1 day')::date then
    perform public.take_balance_snapshot(p_owner, v_today, 'auto');
    v_snap := true;
  end if;
  return jsonb_build_object('owner', p_owner, 'snapshot', v_snap,
    'active_reminders', (select count(*) from public.reminders where owner_id = p_owner and status = 'active'));
end $$;

-- ---------- backup / restore -------------------------------------------------

create or replace function public.backup_tables()
returns text[] language sql immutable set search_path = '' as $$
  select array['clients','projects','jsr_items','invoices','invoice_receipts',
               'loans','loan_balance_updates','loan_installments','loan_payments',
               'credit_cards','card_statements','card_payments',
               'debts','debt_installments','debt_payments',
               'activities','balance_snapshots','reminders']
$$;

create or replace function public.export_backup()
returns jsonb language plpgsql stable set search_path = '' as $$
declare v_uid uuid := auth.uid(); t text; v_rows jsonb; v_out jsonb := '{}'::jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  foreach t in array public.backup_tables() loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb)
                    from public.%I x where x.owner_id = $1', t) into v_rows using v_uid;
    v_out := v_out || jsonb_build_object(t, v_rows);
  end loop;
  return jsonb_build_object(
    'app', 'ledger-jsr', 'version', 1, 'exported_at', now(),
    'profile', (select to_jsonb(p) - 'owner_id' from public.profiles p where p.owner_id = v_uid),
    'tables', v_out);
end $$;

-- Replace ALL of the caller's data with the backup, atomically.
create or replace function public.restore_backup(p_backup jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); t text; v_rows jsonb; v_counts jsonb := '{}'::jsonb; v_n int; r record;
  v_tables text[] := public.backup_tables();
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if p_backup->>'app' is distinct from 'ledger-jsr' or (p_backup->>'version')::int <> 1 then
    raise exception 'This file is not a Ledger + JSR backup (version 1)';
  end if;
  perform set_config('app.skip_sync', 'on', true);
  -- delete children first
  for i in reverse array_length(v_tables, 1) .. 1 loop
    execute format('delete from public.%I where owner_id = $1', v_tables[i]) using v_uid;
  end loop;
  foreach t in array v_tables loop
    select coalesce(jsonb_agg(e || jsonb_build_object('owner_id', v_uid)), '[]'::jsonb) into v_rows
    from jsonb_array_elements(coalesce(p_backup->'tables'->t, '[]'::jsonb)) e;
    execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)', t, t)
      using v_rows;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object(t, v_n);
  end loop;
  if p_backup ? 'profile' and jsonb_typeof(p_backup->'profile') = 'object' then
    update public.profiles p set
      display_name = coalesce(p_backup->'profile'->>'display_name', p.display_name),
      reminder_time = coalesce((p_backup->'profile'->>'reminder_time')::time, p.reminder_time),
      advance_days = coalesce((p_backup->'profile'->>'advance_days')::smallint, p.advance_days),
      alert_on_due = coalesce((p_backup->'profile'->>'alert_on_due')::boolean, p.alert_on_due),
      alert_overdue = coalesce((p_backup->'profile'->>'alert_overdue')::boolean, p.alert_overdue),
      remind_receipts = coalesce((p_backup->'profile'->>'remind_receipts')::boolean, p.remind_receipts),
      remind_work = coalesce((p_backup->'profile'->>'remind_work')::boolean, p.remind_work),
      discreet_push = coalesce((p_backup->'profile'->>'discreet_push')::boolean, p.discreet_push),
      client_wait_days = coalesce((p_backup->'profile'->>'client_wait_days')::smallint, p.client_wait_days)
    where p.owner_id = v_uid;
  end if;
  perform set_config('app.skip_sync', 'off', true);
  for r in select id from public.loans where owner_id = v_uid and status = 'active' loop
    perform public.ensure_loan_installments(r.id);
  end loop;
  perform public.sync_reminders(v_uid);
  return v_counts;
end $$;

-- ---------- grants ------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
-- the signup trigger function is only for the auth system
revoke execute on function public.handle_new_user() from authenticated;
