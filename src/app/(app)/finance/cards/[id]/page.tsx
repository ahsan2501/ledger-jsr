import { notFound } from "next/navigation";
import { CardBillForm, CardPaymentForm } from "@/components/entry-forms";
import { ActionForm, Check, DateInput, Field, More, MoneyInput, Row, SheetButton, TextArea, TextInput } from "@/components/forms";
import { DeleteButton } from "@/components/row-actions";
import { Card, CardHeader, Empty, PageHeader, btn } from "@/components/ui";
import { updateCard, updateStatement } from "@/app/actions/finance";
import { getLookups } from "@/lib/data";
import { fmtDate, inr, toNum, todayIST } from "@/lib/format";
import type { CardStatement } from "@/lib/types";
import { requireUser } from "@/lib/supabase/server";
import { StatementBadge } from "@/components/statement-badge";

export default async function CardDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const today = todayIST();
  const [{ data: card }, { data: stmts }, { data: pays }, lookups] = await Promise.all([
    supabase.from("credit_cards").select("*").eq("id", id).maybeSingle(),
    supabase.from("v_card_statements").select("*").eq("card_id", id).order("statement_date", { ascending: false }),
    supabase.from("card_payments").select("*, card_statements!inner(card_id)").eq("card_statements.card_id", id).order("paid_on", { ascending: false }),
    getLookups(supabase),
  ]);
  if (!card) notFound();
  const statements = (stmts ?? []) as CardStatement[];
  return (
    <div className="space-y-4">
      <PageHeader title={card.nickname} sub={`${card.issuer}${card.last4 ? ` ·· ${card.last4}` : ""}${card.statement_day ? ` · statement day ${card.statement_day}` : ""}${card.due_day ? ` · due day ${card.due_day}` : ""}`}
        action={<div className="flex gap-2">
          <SheetButton className={btn.secondary} label="Edit" title="Edit card">
            <ActionForm action={updateCard}>
              <input type="hidden" name="id" value={card.id} />
              <Row>
                <Field label="Nickname"><TextInput name="nickname" defaultValue={card.nickname} required /></Field>
                <Field label="Issuer"><TextInput name="issuer" defaultValue={card.issuer} /></Field>
              </Row>
              <Row>
                <Field label="Statement day"><TextInput name="statement_day" inputMode="numeric" defaultValue={card.statement_day ?? ""} /></Field>
                <Field label="Due day"><TextInput name="due_day" inputMode="numeric" defaultValue={card.due_day ?? ""} /></Field>
              </Row>
              <More>
                <Row>
                  <Field label="Last 4 digits"><TextInput name="last4" inputMode="numeric" maxLength={4} defaultValue={card.last4 ?? ""} /></Field>
                  <Field label="Credit limit"><MoneyInput name="credit_limit" defaultValue={card.credit_limit ? String(toNum(card.credit_limit)) : ""} /></Field>
                </Row>
                <Check name="inactive" label="Card no longer in use" defaultChecked={!card.active} />
                <Field label="Notes"><TextArea name="notes" defaultValue={card.notes ?? ""} /></Field>
              </More>
            </ActionForm>
          </SheetButton>
          <SheetButton className={btn.primary} label="New statement" title="New statement"><CardBillForm lookups={lookups} cardId={card.id} /></SheetButton>
        </div>} />
      <Card>
        <CardHeader title="Statements" sub="A bill is marked paid only once its full statement amount is covered" />
        {statements.length ? (
          <ul className="divide-y divide-line">
            {statements.map((s) => (
              <li key={s.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Statement {fmtDate(s.statement_date, today)} · due {fmtDate(s.due_date, today)}</p>
                    <p className="tabular text-xs text-muted">Total {inr(s.total_due)} · min {inr(s.minimum_due)} · paid {inr(s.amount_paid)} · <span className="font-medium text-ink">remaining {inr(s.amount_remaining)}</span> · minimum {s.minimum_covered ? "covered ✓" : "not covered"}</p>
                  </div>
                  <StatementBadge s={s} today={today} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {!s.is_paid ? (
                    <SheetButton label="Record payment" title="Record card payment">
                      <CardPaymentForm statementId={s.id} amount={toNum(s.amount_remaining)} minimum={s.minimum_covered ? undefined : toNum(s.minimum_due) - toNum(s.amount_paid)} today={today} />
                    </SheetButton>
                  ) : null}
                  <SheetButton label="Edit" title="Edit statement">
                    <ActionForm action={updateStatement}>
                      <input type="hidden" name="id" value={s.id} />
                      <Row>
                        <Field label="Statement date"><DateInput name="statement_date" defaultValue={s.statement_date} required /></Field>
                        <Field label="Due date"><DateInput name="due_date" defaultValue={s.due_date} required /></Field>
                      </Row>
                      <Row>
                        <Field label="Total due"><MoneyInput name="total_due" defaultValue={String(toNum(s.total_due))} required /></Field>
                        <Field label="Minimum due"><MoneyInput name="minimum_due" defaultValue={String(toNum(s.minimum_due))} /></Field>
                      </Row>
                      <Field label="Notes"><TextInput name="notes" defaultValue={s.notes ?? ""} /></Field>
                    </ActionForm>
                  </SheetButton>
                  <DeleteButton table="card_statements" id={s.id} what="this statement and its payments" />
                </div>
                <ul className="mt-2 space-y-0.5 text-xs text-muted">
                  {(pays ?? []).filter((p) => p.statement_id === s.id).map((p) => (
                    <li key={p.id} className="flex items-center gap-2">Paid {inr(p.amount)} on {fmtDate(p.paid_on, today)}{p.notes ? ` · ${p.notes}` : ""} <DeleteButton table="card_payments" id={p.id} label="×" what="this payment" /></li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : <Empty title="No statements yet" />}
      </Card>
      <div className="text-right"><DeleteButton table="credit_cards" id={card.id} label="Delete card" what="this card and all its statements" /></div>
    </div>
  );
}
