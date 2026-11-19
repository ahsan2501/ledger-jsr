-- =============================================================================
-- Day-to-day spending log (grocery, meat & fish, fuel, …) with payment mode.
-- Additive migration: no existing table or record is changed.
-- =============================================================================
create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  spent_on      date not null default public.app_today(),
  amount        numeric(14,2) not null check (amount > 0),
  category      text not null check (length(trim(category)) between 1 and 40),
  payment_mode  text not null default 'upi'
                check (payment_mode in ('upi','cash','debit_card','credit_card','net_banking','wallet','other')),
  note          text,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index expenses_owner_date_idx on public.expenses (owner_id, spent_on desc);
create trigger expenses_touch before update on public.expenses for each row execute function public.touch_updated_at();

alter table public.expenses enable row level security;
revoke all on public.expenses from anon;
grant select, insert, update, delete on public.expenses to authenticated;
create policy owner_all on public.expenses for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Include spending in full backups / restore (older backups without it still restore).
create or replace function public.backup_tables()
returns text[] language sql immutable set search_path = '' as $$
  select array['clients','projects','jsr_items','invoices','invoice_receipts',
               'loans','loan_balance_updates','loan_installments','loan_payments',
               'credit_cards','card_statements','card_payments',
               'debts','debt_installments','debt_payments',
               'activities','balance_snapshots','reminders','expenses']
$$;

-- Demo mode: remove demo spending too.
create or replace function public.clear_demo_data()
returns void language plpgsql set search_path = '' as $$
declare v_uid uuid := auth.uid(); t text;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  foreach t in array array['activities','reminders','balance_snapshots','invoice_receipts','invoices','jsr_items',
                           'projects','clients','loan_payments','loan_balance_updates','loan_installments','loans',
                           'card_payments','card_statements','credit_cards','debt_payments','debt_installments','debts',
                           'expenses'] loop
    execute format('delete from public.%I where owner_id = $1 and is_demo', t) using v_uid;
  end loop;
  perform public.sync_reminders(v_uid);
end $$;

-- Demo mode: add some sample spending after the existing demo data.
alter function public.load_demo_data() rename to load_demo_data_core;
create or replace function public.load_demo_data()
returns void language plpgsql set search_path = '' as $$
declare d date := public.app_today(); v_had boolean := public.has_demo_data();
begin
  perform public.load_demo_data_core();
  if v_had then return; end if;
  insert into public.expenses (spent_on, amount, category, payment_mode, note, is_demo) values
    (d,      1240, 'Grocery',             'upi',         'DEMO — weekly groceries', true),
    (d,       680, 'Meat & fish',         'cash',        'DEMO', true),
    (d - 1,   420, 'Vegetables & fruits', 'upi',         'DEMO', true),
    (d - 1,  2500, 'Fuel',                'credit_card', 'DEMO', true),
    (d - 2,   899, 'Food delivery',       'upi',         'DEMO', true),
    (d - 3,  3200, 'Bills & utilities',   'net_banking', 'DEMO — electricity', true),
    (d - 5,  1850, 'Eating out',          'debit_card',  'DEMO', true),
    (d - 6,   540, 'Meat & fish',         'upi',         'DEMO', true),
    (d - 8,  2210, 'Grocery',             'upi',         'DEMO', true),
    (d - 12, 1499, 'Health & medicine',   'cash',        'DEMO', true);
end $$;

revoke execute on function public.load_demo_data_core() from public, anon;
grant execute on function public.load_demo_data_core() to authenticated;
grant execute on function public.load_demo_data() to authenticated;
revoke execute on function public.load_demo_data() from public, anon;
