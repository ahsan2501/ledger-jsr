-- =============================================================================
-- Ledger + JSR: core schema
-- Single-user personal finance + agency Job Status Report.
-- Every row carries owner_id and is protected by owner-only RLS.
-- Dates are calendar dates in Asia/Kolkata. Money is numeric(14,2) in INR.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- "Today" in India. Every due-date comparison in the database uses this.
create or replace function public.app_today()
returns date language sql stable
set search_path = ''
as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;

-- -----------------------------------------------------------------------------
-- Profile / settings (one row per user)
-- -----------------------------------------------------------------------------
create table public.profiles (
  owner_id        uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name    text,
  reminder_time   time not null default '09:00',
  advance_days    smallint not null default 5 check (advance_days between 0 and 30),
  alert_on_due    boolean not null default true,
  alert_overdue   boolean not null default true,
  remind_receipts boolean not null default true,
  remind_work     boolean not null default true,
  discreet_push   boolean not null default true,
  client_wait_days smallint not null default 3 check (client_wait_days between 1 and 60),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Loans
-- -----------------------------------------------------------------------------
create table public.loans (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lender              text not null check (length(trim(lender)) > 0),
  name                text not null check (length(trim(name)) > 0),
  original_principal  numeric(14,2) check (original_principal >= 0),
  interest_rate       numeric(6,3) check (interest_rate >= 0),
  emi_amount          numeric(14,2) check (emi_amount > 0),
  first_due_date      date,               -- anchor for the EMI schedule
  tenure_months       integer check (tenure_months > 0),
  emis_remaining      integer check (emis_remaining >= 0),  -- caps how many future EMIs are generated
  -- Outstanding balance = baseline - principal portions recorded after the baseline.
  balance_baseline    numeric(14,2) not null default 0 check (balance_baseline >= 0),
  balance_baseline_on date not null default public.app_today(),
  balance_baseline_at timestamptz not null default now(),
  balance_source      text not null default 'opening' check (balance_source in ('opening','lender')),
  status              text not null default 'active' check (status in ('active','closed')),
  notes               text,
  is_demo             boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.loan_balance_updates (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  loan_id     uuid not null,
  balance     numeric(14,2) not null check (balance >= 0),
  as_of       date not null,
  notes       text,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  foreign key (loan_id, owner_id) references public.loans(id, owner_id) on delete cascade
);

create table public.loan_installments (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  loan_id     uuid not null,
  due_date    date not null,
  amount_due  numeric(14,2) not null check (amount_due > 0),
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (loan_id, due_date),
  unique (id, owner_id),
  foreign key (loan_id, owner_id) references public.loans(id, owner_id) on delete cascade
);

create table public.loan_payments (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  loan_id         uuid not null,
  installment_id  uuid references public.loan_installments(id) on delete set null,
  paid_on         date not null default public.app_today(),
  amount          numeric(14,2) not null check (amount > 0),
  kind            text not null default 'emi' check (kind in ('emi','part_payment','prepayment','fee','other')),
  principal_part  numeric(14,2) check (principal_part >= 0),
  interest_part   numeric(14,2) check (interest_part >= 0),
  fees_part       numeric(14,2) check (fees_part >= 0),
  notes           text,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now(),
  check (coalesce(principal_part,0) + coalesce(interest_part,0) + coalesce(fees_part,0) <= amount),
  foreign key (loan_id, owner_id) references public.loans(id, owner_id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- Credit cards (no full card numbers, no CVV — only optional last four)
-- -----------------------------------------------------------------------------
create table public.credit_cards (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nickname      text not null check (length(trim(nickname)) > 0),
  issuer        text not null default '',
  last4         text check (last4 ~ '^[0-9]{4}$'),
  credit_limit  numeric(14,2) check (credit_limit >= 0),
  statement_day smallint check (statement_day between 1 and 31),
  due_day       smallint check (due_day between 1 and 31),
  active        boolean not null default true,
  notes         text,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.card_statements (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id         uuid not null,
  statement_date  date not null,
  due_date        date not null,
  total_due       numeric(14,2) not null check (total_due >= 0),
  minimum_due     numeric(14,2) not null default 0 check (minimum_due >= 0),
  notes           text,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (minimum_due <= total_due),
  check (due_date >= statement_date),
  unique (card_id, statement_date),
  unique (id, owner_id),
  foreign key (card_id, owner_id) references public.credit_cards(id, owner_id) on delete cascade
);

create table public.card_payments (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  statement_id  uuid not null,
  paid_on       date not null default public.app_today(),
  amount        numeric(14,2) not null check (amount > 0),
  notes         text,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  foreign key (statement_id, owner_id) references public.card_statements(id, owner_id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- Personal money: I owe / owed to me
-- -----------------------------------------------------------------------------
create table public.debts (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  direction       text not null check (direction in ('i_owe','owed_to_me')),
  counterparty    text not null check (length(trim(counterparty)) > 0),
  reason          text,
  original_amount numeric(14,2) not null check (original_amount > 0),
  started_on      date not null default public.app_today(),
  due_date        date,           -- agreed due date; optional
  follow_up_date  date,           -- separate "chase / check in" date
  closed          boolean not null default false,  -- written off / forgiven
  notes           text,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.debt_installments (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  debt_id     uuid not null,
  due_date    date not null,
  amount      numeric(14,2) not null check (amount > 0),
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  foreign key (debt_id, owner_id) references public.debts(id, owner_id) on delete cascade
);

create table public.debt_payments (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  debt_id     uuid not null,
  paid_on     date not null default public.app_today(),
  amount      numeric(14,2) not null check (amount > 0),
  reference   text,     -- receipt / UPI ref
  notes       text,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  foreign key (debt_id, owner_id) references public.debts(id, owner_id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- Agency: clients → projects/retainers → JSR items; invoices
-- -----------------------------------------------------------------------------
create table public.clients (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null check (length(trim(name)) > 0),
  contact_name  text,
  phone         text,
  email         text,
  notes         text,
  archived      boolean not null default false,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.projects (
  id                      uuid primary key default gen_random_uuid(),
  owner_id                uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id               uuid not null,
  name                    text not null check (length(trim(name)) > 0),
  kind                    text not null default 'campaign'
                          check (kind in ('pitch','retainer','campaign','production','servicing','other')),
  status                  text not null default 'active' check (status in ('active','on_hold','closed')),
  expected_invoice_amount numeric(14,2) check (expected_invoice_amount >= 0),
  expected_invoice_date   date,
  notes                   text,
  is_demo                 boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (client_id, owner_id) references public.clients(id, owner_id) on delete cascade
);

create table public.jsr_items (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id        uuid not null,
  project_id       uuid references public.projects(id) on delete set null,
  title            text not null check (length(trim(title)) > 0),
  status           text not null default 'to_send' check (status in (
                     'to_send','in_progress','internal_review','sent_to_client','waiting_for_client',
                     'revisions_needed','approved','delivered','closed')),
  next_action      text,
  next_owner       text not null default 'me' check (next_owner in ('me','team','client')),
  action_due       date,
  follow_up_date   date,
  priority         text not null default 'medium' check (priority in ('high','medium','low')),
  last_contact_on  date,
  waiting_since    date,
  billing          text not null default 'pending' check (billing in ('na','pending','to_invoice','invoiced')),
  links            text,
  notes            text,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (client_id, owner_id) references public.clients(id, owner_id) on delete cascade
);

create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id       uuid not null,
  project_id      uuid references public.projects(id) on delete set null,
  jsr_item_id     uuid references public.jsr_items(id) on delete set null,
  invoice_number  text not null check (length(trim(invoice_number)) > 0),
  invoice_date    date not null default public.app_today(),
  due_date        date,
  amount          numeric(14,2) not null check (amount >= 0),   -- taxable value
  gst_rate        numeric(5,2) check (gst_rate >= 0),
  gst_amount      numeric(14,2) check (gst_amount >= 0),
  tds_rate        numeric(5,2) check (tds_rate >= 0),
  tds_amount      numeric(14,2) check (tds_amount >= 0),        -- TDS expected to be deducted
  stage           text not null default 'draft' check (stage in ('draft','ready','sent')),
  sent_on         date,
  cancelled       boolean not null default false,
  notes           text,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (owner_id, invoice_number),
  unique (id, owner_id),
  foreign key (client_id, owner_id) references public.clients(id, owner_id) on delete cascade
);

create table public.invoice_receipts (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  invoice_id    uuid not null,
  received_on   date not null default public.app_today(),
  bank_amount   numeric(14,2) not null default 0 check (bank_amount >= 0),
  tds_amount    numeric(14,2) not null default 0 check (tds_amount >= 0),  -- TDS confirmed (e.g. 26AS / Form 16A)
  reference     text,
  notes         text,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  check (bank_amount + tds_amount > 0),
  foreign key (invoice_id, owner_id) references public.invoices(id, owner_id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- Activity history (JSR items, debts, invoices, loans, cards)
-- -----------------------------------------------------------------------------
create table public.activities (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entity_type  text not null check (entity_type in ('jsr_item','debt','invoice','loan','card_statement','project','client')),
  entity_id    uuid not null,
  kind         text not null,     -- created, status, sent, follow_up, next_follow_up, approved, payment, receipt, note
  note         text,
  meta         jsonb not null default '{}'::jsonb,
  occurred_at  timestamptz not null default now(),
  is_demo      boolean not null default false
);
create index activities_entity_idx on public.activities (owner_id, entity_type, entity_id, occurred_at desc);

-- -----------------------------------------------------------------------------
-- Reminders, push subscriptions, deliveries
-- -----------------------------------------------------------------------------
create table public.reminders (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  dedupe_key    text not null,
  source_type   text not null,
  source_id     uuid not null,
  stage         text not null,       -- advance | due | overdue | expected | follow_up | action_due
  direction     text,                -- out | in | work
  due_date      date not null,
  remind_on     date not null,
  fire_at       timestamptz not null,
  title         text not null,
  detail        text not null,
  amount        numeric(14,2),
  href          text,
  status        text not null default 'active' check (status in ('active','resolved','dismissed')),
  pushed_at     timestamptz,
  read_at       timestamptz,
  resolved_at   timestamptz,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner_id, dedupe_key)
);
create index reminders_due_idx on public.reminders (status, fire_at) where pushed_at is null;

create table public.push_subscriptions (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint       text not null unique,
  p256dh         text not null,
  auth           text not null,
  user_agent     text,
  created_at     timestamptz not null default now(),
  last_success_at timestamptz
);

create table public.push_deliveries (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  reminder_id     uuid not null references public.reminders(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status          text not null default 'sending' check (status in ('sending','sent','failed')),
  attempts        smallint not null default 1,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (reminder_id, subscription_id)
);

-- -----------------------------------------------------------------------------
-- Debt trend: month-end balance snapshots
-- -----------------------------------------------------------------------------
create table public.balance_snapshots (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  snapshot_on   date not null,
  loans_total   numeric(14,2) not null default 0,
  cards_total   numeric(14,2) not null default 0,
  owe_total     numeric(14,2) not null default 0,
  source        text not null default 'manual' check (source in ('auto','manual')),
  notes         text,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (owner_id, snapshot_on)
);

-- -----------------------------------------------------------------------------
-- Indexes for owner-scoped lookups
-- -----------------------------------------------------------------------------
create index on public.loans (owner_id);
create index on public.loan_installments (owner_id, due_date);
create index on public.loan_payments (loan_id);
create index on public.loan_payments (installment_id);
create index on public.credit_cards (owner_id);
create index on public.card_statements (owner_id, due_date);
create index on public.card_payments (statement_id);
create index on public.debts (owner_id);
create index on public.debt_installments (debt_id);
create index on public.debt_payments (debt_id);
create index on public.clients (owner_id);
create index on public.projects (client_id);
create index on public.jsr_items (owner_id, status);
create index on public.jsr_items (client_id);
create index on public.invoices (owner_id, stage);
create index on public.invoice_receipts (invoice_id);
create index on public.push_subscriptions (owner_id);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['profiles','loans','loan_installments','credit_cards','card_statements','debts',
                           'clients','projects','jsr_items','invoices','reminders','push_deliveries'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
                   t || '_touch', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Row level security: owner-only, everywhere
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','loans','loan_balance_updates','loan_installments','loan_payments',
                           'credit_cards','card_statements','card_payments','debts','debt_installments',
                           'debt_payments','clients','projects','jsr_items','invoices','invoice_receipts',
                           'activities','reminders','push_subscriptions','push_deliveries','balance_snapshots'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format($p$create policy owner_all on public.%I for all to authenticated
                      using (owner_id = (select auth.uid()))
                      with check (owner_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

-- Auto-create a profile for each new user
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (owner_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();
