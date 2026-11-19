import { notFound } from "next/navigation";
import { LenderBalanceForm, LoanPaymentForm } from "@/components/entry-forms";
import { ActionForm, DateInput, Field, More, MoneyInput, Row, Select, SheetButton, TextArea, TextInput } from "@/components/forms";
import { DeleteButton } from "@/components/row-actions";
import { Activity as ActivityList } from "@/components/activity";
import { Badge, Card, CardHeader, Empty, PageHeader, Stat, btn } from "@/components/ui";
import { updateLoan } from "@/app/actions/finance";
import { fmtDate, inr, relDue, toNum, todayIST, titleCase } from "@/lib/format";
import type { Activity, Loan } from "@/lib/types";
import { requireUser } from "@/lib/supabase/server";

export default async function LoanDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const today = todayIST();
  const [{ data: loan }, inst, pays, bals, acts] = await Promise.all([
    supabase.from("v_loans").select("*").eq("id", id).maybeSingle(),
    supabase.from("v_loan_installments").select("*").eq("loan_id", id).order("due_date", { ascending: false }).limit(24),
    supabase.from("loan_payments").select("*").eq("loan_id", id).order("paid_on", { ascending: false }),
    supabase.from("loan_balance_updates").select("*").eq("loan_id", id).order("as_of", { ascending: false }),
    supabase.from("activities").select("*").eq("entity_type", "loan").eq("entity_id", id).order("occurred_at", { ascending: false }).limit(30),
  ]);
  if (!loan) notFound();
  const l = loan as Loan;
  return (
    <div className="space-y-4">
      <PageHeader title={l.name} sub={`${l.lender}${l.status === "closed" ? " · closed" : ""}`} action={
        <div className="flex gap-2">
          <SheetButton className={btn.secondary} label="Edit" title="Edit loan">
            <ActionForm action={updateLoan}>
              <input type="hidden" name="id" value={l.id} />
              <input type="hidden" name="prev_next_due_date" value={l.next_due_date ?? ""} />
              <Row>
                <Field label="Lender"><TextInput name="lender" defaultValue={l.lender} required /></Field>
                <Field label="Loan name"><TextInput name="name" defaultValue={l.name} required /></Field>
              </Row>
              <Row>
                <Field label="EMI" hint="Applies to future unpaid EMIs"><MoneyInput name="emi_amount" defaultValue={l.emi_amount ? String(toNum(l.emi_amount)) : ""} /></Field>
                <Field label="Next due date" hint="Moves the schedule"><DateInput name="next_due_date" defaultValue={l.next_due_date ?? ""} /></Field>
              </Row>
              <More>
                <Row>
                  <Field label="Original principal"><MoneyInput name="original_principal" defaultValue={l.original_principal ? String(toNum(l.original_principal)) : ""} /></Field>
                  <Field label="Interest % p.a."><TextInput name="interest_rate" inputMode="decimal" defaultValue={l.interest_rate ? String(toNum(l.interest_rate)) : ""} /></Field>
                </Row>
                <Row>
                  <Field label="Tenure (months)"><TextInput name="tenure_months" inputMode="numeric" defaultValue={l.tenure_months ?? ""} /></Field>
                  <Field label="EMIs remaining"><TextInput name="emis_remaining" inputMode="numeric" defaultValue={l.emis_remaining ?? ""} /></Field>
                </Row>
                <Field label="Status"><Select name="status" defaultValue={l.status} options={[{ value: "active", label: "Active" }, { value: "closed", label: "Closed" }]} /></Field>
                <Field label="Notes"><TextArea name="notes" defaultValue={l.notes ?? ""} /></Field>
              </More>
            </ActionForm>
          </SheetButton>
          {l.status === "active" ? (
            <SheetButton className={btn.primary} label="Record payment" title={`Pay ${l.name}`}>
              <LoanPaymentForm loanId={l.id} amount={toNum(l.next_amount_remaining) || toNum(l.emi_amount) || undefined} today={today} />
            </SheetButton>
          ) : null}
        </div>
      } />

      <Card className="p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Outstanding principal" value={inr(l.outstanding)} sub={`${l.balance_source === "lender" ? "Lender-reported" : "Opening estimate"} ${inr(l.balance_baseline)} on ${fmtDate(l.balance_baseline_on, today)}${toNum(l.principal_paid_since_baseline) ? ` − principal ${inr(l.principal_paid_since_baseline)}` : ""}`} />
          <Stat label="Next EMI" value={l.next_due_date ? inr(l.next_amount_remaining) : "—"} sub={l.next_due_date ? `${fmtDate(l.next_due_date, today)} · ${relDue(l.next_due_date, today)}` : undefined} />
          <Stat label="Overdue" value={inr(l.overdue_amount)} tone={toNum(l.overdue_amount) ? "danger" : undefined} />
          <Stat label="Paid so far (tracked)" value={inr(l.total_paid)} sub={l.emi_amount ? `EMI ${inr(l.emi_amount)}` : undefined} />
        </div>
        {l.unknown_principal_payments > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-info-soft px-3 py-2 text-xs text-info">
            <span>{l.unknown_principal_payments} payment{l.unknown_principal_payments === 1 ? "" : "s"} since the last balance had no principal split, so the balance hasn&apos;t been reduced for {l.unknown_principal_payments === 1 ? "it" : "them"}. Update with the lender&apos;s figure.</span>
          </div>
        ) : null}
        <div className="mt-3">
          <SheetButton label="Update lender balance" title="Lender-reported outstanding"><LenderBalanceForm loanId={l.id} today={today} /></SheetButton>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="EMI schedule" sub="Generated monthly from the next due date" />
          {(inst.data ?? []).length ? (
            <ul className="divide-y divide-line">
              {(inst.data ?? []).map((i) => (
                <li key={i.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span>{fmtDate(i.due_date, today)}</span>
                  <span className="tabular">{inr(i.amount_due)}</span>
                  {i.is_paid ? <Badge tone="ok">Paid</Badge> : toNum(i.amount_paid) > 0 ? <Badge tone="warn">{inr(i.amount_remaining)} left</Badge>
                    : i.due_date < today ? <Badge tone="danger">Overdue</Badge> : <Badge>Upcoming</Badge>}
                </li>
              ))}
            </ul>
          ) : <Empty title="No EMI schedule">Set an EMI and next due date to schedule EMIs.</Empty>}
        </Card>
        <Card>
          <CardHeader title="Payment history" />
          {(pays.data ?? []).length ? (
            <ul className="divide-y divide-line">
              {(pays.data ?? []).map((p) => (
                <li key={p.id} className="px-4 py-2.5 text-sm">
                  <div className="flex justify-between gap-2"><span>{fmtDate(p.paid_on, today)} · {titleCase(p.kind)}</span><span className="tabular font-medium">{inr(p.amount)}</span></div>
                  <div className="flex justify-between gap-2 text-xs text-muted">
                    <span>{p.principal_part !== null ? `Principal ${inr(p.principal_part)}` : "Principal not known"}{p.interest_part !== null ? ` · interest ${inr(p.interest_part)}` : ""}{p.fees_part !== null ? ` · fees ${inr(p.fees_part)}` : ""}{p.notes ? ` · ${p.notes}` : ""}</span>
                    <DeleteButton table="loan_payments" id={p.id} what="this payment" />
                  </div>
                </li>
              ))}
            </ul>
          ) : <Empty title="No payments recorded yet" />}
        </Card>
        <Card>
          <CardHeader title="Lender-reported balances" />
          {(bals.data ?? []).length ? (
            <ul className="divide-y divide-line">
              {(bals.data ?? []).map((b) => (
                <li key={b.id} className="flex justify-between px-4 py-2.5 text-sm"><span>{fmtDate(b.as_of, today)}{b.notes ? ` · ${b.notes}` : ""}</span><span className="tabular">{inr(b.balance)}</span></li>
              ))}
            </ul>
          ) : <Empty title="None yet">Record the balance your lender reports to keep the outstanding accurate.</Empty>}
        </Card>
        <Card>
          <CardHeader title="Activity" />
          <ActivityList items={(acts.data ?? []) as Activity[]} />
        </Card>
      </div>
      {l.notes ? <Card className="p-4 text-sm"><p className="text-xs text-muted">Notes</p><p className="whitespace-pre-wrap">{l.notes}</p></Card> : null}
      <div className="text-right"><DeleteButton table="loans" id={l.id} label="Delete loan" what="this loan and all its payments" /></div>
    </div>
  );
}
