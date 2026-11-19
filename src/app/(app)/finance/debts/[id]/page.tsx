import { notFound } from "next/navigation";
import { Activity as ActivityList } from "@/components/activity";
import { DebtPaymentForm, FollowUpForm, SetFollowUpForm } from "@/components/entry-forms";
import { ActionForm, Check, CopyButton, DateInput, Field, MoneyInput, More, Row, SheetButton, TextArea, TextInput } from "@/components/forms";
import { DeleteButton } from "@/components/row-actions";
import { Badge, Card, CardHeader, Empty, PageHeader, Stat, btn } from "@/components/ui";
import { addDebtInstallment, updateDebt } from "@/app/actions/finance";
import { debtWhatsApp } from "@/lib/messages";
import { fmtDate, inr, toNum, todayIST } from "@/lib/format";
import type { Activity, Debt } from "@/lib/types";
import { requireUser } from "@/lib/supabase/server";

export default async function DebtDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const today = todayIST();
  const [{ data }, inst, pays, acts] = await Promise.all([
    supabase.from("v_debts").select("*").eq("id", id).maybeSingle(),
    supabase.from("v_debt_installments").select("*").eq("debt_id", id).order("due_date"),
    supabase.from("debt_payments").select("*").eq("debt_id", id).order("paid_on", { ascending: false }),
    supabase.from("activities").select("*").eq("entity_type", "debt").eq("entity_id", id).order("occurred_at", { ascending: false }),
  ]);
  if (!data) notFound();
  const d = data as Debt;
  const owe = d.direction === "i_owe";
  return (
    <div className="space-y-4">
      <PageHeader title={d.counterparty} sub={`${owe ? "I owe" : "Owes me"}${d.reason ? ` · ${d.reason}` : ""}`} action={
        <div className="flex gap-2">
          <SheetButton className={btn.secondary} label="Edit" title="Edit">
            <ActionForm action={updateDebt}>
              <input type="hidden" name="id" value={d.id} />
              <Row>
                <Field label="Person or company"><TextInput name="counterparty" defaultValue={d.counterparty} required /></Field>
                <Field label="Original amount"><MoneyInput name="original_amount" defaultValue={String(toNum(d.original_amount))} required /></Field>
              </Row>
              <Field label="Reason"><TextInput name="reason" defaultValue={d.reason ?? ""} /></Field>
              <Row>
                <Field label="Agreed due date"><DateInput name="due_date" defaultValue={d.due_date ?? ""} /></Field>
                <Field label="Follow-up date"><DateInput name="follow_up_date" defaultValue={d.follow_up_date ?? ""} /></Field>
              </Row>
              <More>
                <Field label="Notes"><TextArea name="notes" defaultValue={d.notes ?? ""} /></Field>
                <Check name="closed" label="Close / write off (stops reminders)" defaultChecked={d.closed} />
              </More>
            </ActionForm>
          </SheetButton>
          {!d.is_settled && !d.closed ? (
            <SheetButton className={btn.primary} label={owe ? "Record payment" : "Record receipt"} title={d.counterparty}>
              <DebtPaymentForm debtId={d.id} direction={d.direction} amount={toNum(d.next_due_amount ?? d.amount_remaining)} today={today} />
            </SheetButton>
          ) : null}
        </div>} />
      <Card className="p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Remaining" value={inr(d.amount_remaining)} sub={`of ${inr(d.original_amount)}`} />
          <Stat label={owe ? "Paid" : "Received"} value={inr(d.amount_paid)} />
          <Stat label="Agreed due" value={d.due_date ? fmtDate(d.due_date, today) : "None"} />
          <Stat label="Follow-up" value={d.follow_up_date ? fmtDate(d.follow_up_date, today) : "Not set"} />
        </div>
        {!d.is_settled && !d.closed ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <SheetButton label="Log follow-up" title="Log follow-up"><FollowUpForm entity="debt" id={d.id} today={today} /></SheetButton>
            <SheetButton label="Set follow-up date" title="Follow-up date"><SetFollowUpForm entity="debt" id={d.id} current={d.follow_up_date} today={today} /></SheetButton>
            <CopyButton text={debtWhatsApp(d, today)} label="Copy WhatsApp message" />
          </div>
        ) : null}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Instalments" sub="Payments are applied to the oldest instalment first" action={
            <SheetButton label="Add" title="Add instalment">
              <ActionForm action={addDebtInstallment}>
                <input type="hidden" name="debt_id" value={d.id} />
                <Row>
                  <Field label="Due date"><DateInput name="due_date" required /></Field>
                  <Field label="Amount"><MoneyInput name="amount" required /></Field>
                </Row>
              </ActionForm>
            </SheetButton>} />
          {(inst.data ?? []).length ? (
            <ul className="divide-y divide-line">
              {(inst.data ?? []).map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span>{fmtDate(i.due_date, today)}</span><span className="tabular">{inr(i.amount)}</span>
                  {toNum(i.amount_remaining) === 0 ? <Badge tone="ok">Paid</Badge> : toNum(i.amount_paid) > 0 ? <Badge tone="warn">{inr(i.amount_remaining)} left</Badge> : i.due_date < today ? <Badge tone="danger">Overdue</Badge> : <Badge>Upcoming</Badge>}
                  <DeleteButton table="debt_installments" id={i.id} label="×" what="this instalment" />
                </li>
              ))}
            </ul>
          ) : <Empty title="No instalment plan">Single repayment{d.due_date ? ` due ${fmtDate(d.due_date, today)}` : " with no agreed date"}.</Empty>}
        </Card>
        <Card>
          <CardHeader title={owe ? "Payments" : "Receipts"} />
          {(pays.data ?? []).length ? (
            <ul className="divide-y divide-line">
              {(pays.data ?? []).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span>{fmtDate(p.paid_on, today)}{p.reference ? <span className="text-muted"> · {p.reference}</span> : null}</span>
                  <span className="tabular font-medium">{inr(p.amount)}</span>
                  <DeleteButton table="debt_payments" id={p.id} label="×" what="this payment" />
                </li>
              ))}
            </ul>
          ) : <Empty title="Nothing recorded yet" />}
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Follow-up history" />
          <ActivityList items={(acts.data ?? []) as Activity[]} />
        </Card>
      </div>
      {d.notes ? <Card className="p-4 text-sm"><p className="text-xs text-muted">Notes</p><p className="whitespace-pre-wrap">{d.notes}</p></Card> : null}
      <div className="text-right"><DeleteButton table="debts" id={d.id} label="Delete record" what="this record and its history" /></div>
    </div>
  );
}
