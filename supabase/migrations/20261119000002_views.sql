-- =============================================================================
-- Derived views. All are security_invoker so the caller's RLS applies.
-- Balances and statuses are always derived from payments — never stored twice.
-- =============================================================================

-- Loan installments with paid / remaining
create view public.v_loan_installments with (security_invoker = true) as
select i.*,
       coalesce(p.paid, 0)::numeric(14,2)                          as amount_paid,
       greatest(i.amount_due - coalesce(p.paid, 0), 0)::numeric(14,2) as amount_remaining,
       coalesce(p.paid, 0) >= i.amount_due                         as is_paid
from public.loan_installments i
left join lateral (
  select sum(lp.amount) as paid from public.loan_payments lp where lp.installment_id = i.id
) p on true;

-- Loans with computed outstanding principal.
-- Outstanding = baseline (opening or lender-reported balance) minus the principal
-- portion of payments made after the baseline. Payments with an unknown principal
-- portion do NOT change the balance; they are counted so the UI can prompt for a
-- fresh lender-reported balance.
create view public.v_loans with (security_invoker = true) as
select l.*,
       greatest(l.balance_baseline - coalesce(pp.principal_since, 0), 0)::numeric(14,2) as outstanding,
       coalesce(pp.principal_since, 0)::numeric(14,2)   as principal_paid_since_baseline,
       coalesce(pp.unknown_since, 0)::int                as unknown_principal_payments,
       coalesce(pp.total_paid, 0)::numeric(14,2)         as total_paid,
       nx.next_due_date,
       nx.next_amount_remaining,
       coalesce(od.overdue_amount, 0)::numeric(14,2)     as overdue_amount
from public.loans l
left join lateral (
  select sum(lp.principal_part) filter (where after_baseline)                           as principal_since,
         count(*) filter (where after_baseline and lp.principal_part is null)            as unknown_since,
         sum(lp.amount)                                                                  as total_paid
  from (
    select lp.*, (lp.paid_on > l.balance_baseline_on
                  or (lp.paid_on = l.balance_baseline_on and lp.created_at > l.balance_baseline_at)) as after_baseline
    from public.loan_payments lp where lp.loan_id = l.id
  ) lp
) pp on true
left join lateral (
  select vi.due_date as next_due_date, vi.amount_remaining as next_amount_remaining
  from public.v_loan_installments vi
  where vi.loan_id = l.id and not vi.is_paid
  order by vi.due_date limit 1
) nx on true
left join lateral (
  select sum(vi.amount_remaining) as overdue_amount
  from public.v_loan_installments vi
  where vi.loan_id = l.id and not vi.is_paid and vi.due_date < public.app_today()
) od on true;

-- Card statements
create view public.v_card_statements with (security_invoker = true) as
select s.*,
       c.nickname, c.issuer, c.last4,
       coalesce(p.paid, 0)::numeric(14,2)                               as amount_paid,
       greatest(s.total_due - coalesce(p.paid, 0), 0)::numeric(14,2)    as amount_remaining,
       coalesce(p.paid, 0) >= s.minimum_due                             as minimum_covered,
       coalesce(p.paid, 0) >= s.total_due                               as is_paid,
       case when coalesce(p.paid, 0) >= s.total_due then 'paid'
            when coalesce(p.paid, 0) >= s.minimum_due and coalesce(p.paid,0) > 0 then 'minimum_paid'
            when coalesce(p.paid, 0) > 0 then 'part_paid'
            else 'unpaid' end                                           as payment_status
from public.card_statements s
join public.credit_cards c on c.id = s.card_id
left join lateral (select sum(cp.amount) as paid from public.card_payments cp where cp.statement_id = s.id) p on true;

-- Debt installments: payments are allocated to installments oldest-first.
create view public.v_debt_installments with (security_invoker = true) as
select di.*,
       greatest(0, least(di.amount, coalesce(tp.paid, 0) - (x.cum - di.amount)))::numeric(14,2) as amount_paid,
       (di.amount - greatest(0, least(di.amount, coalesce(tp.paid, 0) - (x.cum - di.amount))))::numeric(14,2) as amount_remaining,
       coalesce(tp.paid, 0) >= x.cum as is_paid
from public.debt_installments di
join lateral (
  select sum(d2.amount) as cum from public.debt_installments d2
  where d2.debt_id = di.debt_id and (d2.due_date, d2.id) <= (di.due_date, di.id)
) x on true
left join lateral (select sum(dp.amount) as paid from public.debt_payments dp where dp.debt_id = di.debt_id) tp on true;

create view public.v_debts with (security_invoker = true) as
select d.*,
       coalesce(p.paid, 0)::numeric(14,2)                                   as amount_paid,
       greatest(d.original_amount - coalesce(p.paid, 0), 0)::numeric(14,2)  as amount_remaining,
       (coalesce(p.paid, 0) >= d.original_amount)                           as is_settled,
       coalesce(ic.n, 0)::int                                               as installment_count,
       case when coalesce(ic.n, 0) > 0 then ni.due_date else d.due_date end as next_due_date,
       case when coalesce(ic.n, 0) > 0 then ni.amount_remaining
            else greatest(d.original_amount - coalesce(p.paid, 0), 0) end   as next_due_amount,
       la.last_followup_at
from public.debts d
left join lateral (select sum(dp.amount) as paid from public.debt_payments dp where dp.debt_id = d.id) p on true
left join lateral (select count(*) as n from public.debt_installments di where di.debt_id = d.id) ic on true
left join lateral (
  select vdi.due_date, vdi.amount_remaining from public.v_debt_installments vdi
  where vdi.debt_id = d.id and vdi.amount_remaining > 0 order by vdi.due_date, vdi.id limit 1
) ni on true
left join lateral (
  select max(a.occurred_at) as last_followup_at from public.activities a
  where a.entity_type = 'debt' and a.entity_id = d.id and a.kind = 'follow_up'
) la on true;

-- Invoices: gross total, receipts, confirmed TDS and the NET cash still expected.
create view public.v_invoices with (security_invoker = true) as
with base as (
  select i.*,
         c.name as client_name,
         pr.name as project_name,
         (i.amount + coalesce(i.gst_amount, 0))::numeric(14,2)  as total,
         coalesce(r.bank, 0)::numeric(14,2)                      as received_bank,
         coalesce(r.tds, 0)::numeric(14,2)                       as tds_confirmed,
         r.last_received_on
  from public.invoices i
  join public.clients c on c.id = i.client_id
  left join public.projects pr on pr.id = i.project_id
  left join lateral (
    select sum(ir.bank_amount) as bank, sum(ir.tds_amount) as tds, max(ir.received_on) as last_received_on
    from public.invoice_receipts ir where ir.invoice_id = i.id
  ) r on true
), calc as (
  select b.*,
         greatest(b.total - b.received_bank - b.tds_confirmed, 0)::numeric(14,2)       as outstanding_gross,
         greatest(coalesce(b.tds_amount, 0) - b.tds_confirmed, 0)::numeric(14,2)       as tds_pending
  from base b
)
select c.*,
       greatest(c.outstanding_gross - c.tds_pending, 0)::numeric(14,2) as net_expected,
       (c.total - coalesce(c.tds_amount, 0))::numeric(14,2)            as net_total,
       case
         when c.cancelled then 'cancelled'
         when (c.received_bank + c.tds_confirmed) > 0
              and greatest(c.outstanding_gross - c.tds_pending, 0) = 0 then 'paid'
         when c.stage in ('draft','ready') and (c.received_bank + c.tds_confirmed) = 0 then c.stage
         when c.due_date is not null and c.due_date < public.app_today() then 'overdue'
         when (c.received_bank + c.tds_confirmed) > 0 then 'part_paid'
         else 'sent'
       end as status,
       (c.received_bank + c.tds_confirmed) > 0
         and greatest(c.outstanding_gross - c.tds_pending, 0) > 0     as is_part_paid
from calc c;

-- JSR items with names and "waiting on client" age
create view public.v_jsr_items with (security_invoker = true) as
select j.*,
       c.name  as client_name,
       c.phone as client_phone,
       c.email as client_email,
       c.contact_name as client_contact,
       p.name  as project_name,
       p.kind  as project_kind,
       case when j.status in ('sent_to_client','waiting_for_client') and j.waiting_since is not null
            then public.app_today() - j.waiting_since end as waiting_days,
       j.status not in ('delivered','closed') as is_active
from public.jsr_items j
join public.clients c on c.id = j.client_id
left join public.projects p on p.id = j.project_id;

-- -----------------------------------------------------------------------------
-- v_obligations: one row per thing that moves money on a date.
-- direction out = I pay; in = I receive. Each invoice appears exactly once here,
-- and is the single source for the dashboard cash flow (agency receivable).
-- -----------------------------------------------------------------------------
create view public.v_obligations with (security_invoker = true) as
-- Loan EMIs
select i.owner_id, 'loan_installment'::text as source_type, i.id as source_id, l.id as parent_id,
       'out'::text as direction, 'loan'::text as category,
       l.name || ' EMI' as title, l.lender as counterparty, i.due_date,
       i.amount_due as amount_total, i.amount_paid, i.amount_remaining,
       null::numeric(14,2) as minimum_due, null::boolean as minimum_covered,
       i.is_paid, '/finance/loans/' || l.id as href, i.is_demo
from public.v_loan_installments i
join public.loans l on l.id = i.loan_id
where l.status = 'active' or i.amount_paid > 0
union all
-- Credit card statements
select s.owner_id, 'card_statement', s.id, s.card_id, 'out', 'card',
       s.nickname || ' bill', s.issuer, s.due_date,
       s.total_due, s.amount_paid, s.amount_remaining, s.minimum_due, s.minimum_covered,
       s.is_paid, '/finance/cards/' || s.card_id, s.is_demo
from public.v_card_statements s
union all
-- Personal debts without an installment plan
select d.owner_id, 'debt', d.id, d.id,
       case when d.direction = 'i_owe' then 'out' else 'in' end,
       case when d.direction = 'i_owe' then 'personal_payable' else 'personal_receivable' end,
       coalesce(nullif(d.reason, ''), case when d.direction = 'i_owe' then 'Repay ' else 'From ' end || d.counterparty),
       d.counterparty, d.due_date,
       d.original_amount, d.amount_paid, d.amount_remaining, null, null,
       d.is_settled, '/finance/debts/' || d.id, d.is_demo
from public.v_debts d
where d.installment_count = 0 and not d.closed
union all
-- Personal debts with an installment plan
select di.owner_id, 'debt_installment', di.id, d.id,
       case when d.direction = 'i_owe' then 'out' else 'in' end,
       case when d.direction = 'i_owe' then 'personal_payable' else 'personal_receivable' end,
       coalesce(nullif(d.reason, ''), d.counterparty) || ' (instalment)',
       d.counterparty, di.due_date,
       di.amount, di.amount_paid, di.amount_remaining, null, null,
       di.amount_remaining = 0, '/finance/debts/' || d.id, di.is_demo
from public.v_debt_installments di
join public.debts d on d.id = di.debt_id
where not d.closed
union all
-- Agency invoices that have been sent (or received money). Amount = net cash.
select v.owner_id, 'invoice', v.id, v.client_id, 'in', 'agency_receivable',
       'Invoice ' || v.invoice_number, v.client_name, v.due_date,
       v.net_total, v.received_bank, v.net_expected, null, null,
       v.net_expected = 0, '/work/invoices/' || v.id, v.is_demo
from public.v_invoices v
where not v.cancelled and (v.stage = 'sent' or (v.received_bank + v.tds_confirmed) > 0);

grant select on public.v_loan_installments, public.v_loans, public.v_card_statements,
  public.v_debt_installments, public.v_debts, public.v_invoices, public.v_jsr_items,
  public.v_obligations to authenticated;
revoke all on public.v_loan_installments, public.v_loans, public.v_card_statements,
  public.v_debt_installments, public.v_debts, public.v_invoices, public.v_jsr_items,
  public.v_obligations from anon;
