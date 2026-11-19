"use client";
// Short forms used by Quick add, list pages and "Needs attention" actions.
// Required fields first; optional details tucked under "More options".
import { useMemo, useState } from "react";
import { ActionForm, Check, DateInput, Field, More, MoneyInput, Row, Select, TextArea, TextInput } from "./forms";
import * as F from "@/app/actions/finance";
import * as W from "@/app/actions/work";
import { BILLING, JSR_STATUSES, OWNERS, PRIORITIES, PROJECT_KINDS } from "@/lib/types";
import type { Lookups } from "@/lib/data";

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
const fmtAmt = (n?: number | null) => (n === undefined || n === null ? undefined : String(Math.round(n * 100) / 100));

// ---------------- Finance ----------------
export function LoanForm({ today }: { today: string }) {
  return (
    <ActionForm action={F.createLoan} submitLabel="Add loan">
      <Row>
        <Field label="Lender"><TextInput name="lender" required placeholder="e.g. HDFC Bank" /></Field>
        <Field label="Loan name"><TextInput name="name" required placeholder="Home loan" /></Field>
      </Row>
      <Row>
        <Field label="EMI"><MoneyInput name="emi_amount" /></Field>
        <Field label="Next due date"><DateInput name="next_due_date" /></Field>
      </Row>
      <Field label="Current outstanding" hint="From your latest statement or lender app.">
        <MoneyInput name="outstanding" />
      </Field>
      <More>
        <Row>
          <Field label="Outstanding as of"><DateInput name="outstanding_on" defaultValue={today} /></Field>
          <Field label="Source">
            <Select name="balance_source" options={[{ value: "lender", label: "Lender reported" }, { value: "opening", label: "My estimate" }]} />
          </Field>
        </Row>
        <Row>
          <Field label="Original principal"><MoneyInput name="original_principal" /></Field>
          <Field label="Interest rate (% p.a.)"><TextInput name="interest_rate" inputMode="decimal" /></Field>
        </Row>
        <Row>
          <Field label="Tenure (months)"><TextInput name="tenure_months" inputMode="numeric" /></Field>
          <Field label="EMIs remaining" hint="Stops scheduling after this many."><TextInput name="emis_remaining" inputMode="numeric" /></Field>
        </Row>
        <Field label="Notes"><TextArea name="notes" /></Field>
      </More>
    </ActionForm>
  );
}

export function CardBillForm({ lookups, cardId }: { lookups: Lookups; cardId?: string }) {
  const [card, setCard] = useState(cardId ?? lookups.cards[0]?.id ?? "__new");
  const selected = lookups.cards.find((c) => c.id === card);
  const guessDue = useMemo(() => {
    if (!selected?.due_day) return undefined;
    const t = lookups.today; const d = new Date(t + "T00:00:00Z");
    d.setUTCDate(selected.due_day); if (d.toISOString().slice(0, 10) < t) d.setUTCMonth(d.getUTCMonth() + 1);
    return d.toISOString().slice(0, 10);
  }, [selected, lookups.today]);
  return (
    <ActionForm action={F.createStatement} submitLabel="Add bill">
      {cardId ? <input type="hidden" name="card_id" value={cardId} /> : (
        <Field label="Card">
          <Select name="card_id" value={card} onChange={(e) => setCard(e.target.value)}
            options={[...lookups.cards.map((c) => ({ value: c.id, label: c.nickname })), { value: "__new", label: "+ New card" }]} />
        </Field>
      )}
      {card === "__new" && !cardId ? (
        <Row>
          <Field label="Card nickname"><TextInput name="new_card_nickname" required placeholder="Travel card" /></Field>
          <Field label="Issuer"><TextInput name="new_card_issuer" placeholder="Bank" /></Field>
        </Row>
      ) : null}
      <Row>
        <Field label="Statement total"><MoneyInput name="total_due" required /></Field>
        <Field label="Minimum due"><MoneyInput name="minimum_due" /></Field>
      </Row>
      <Field label="Payment due date"><DateInput name="due_date" required key={guessDue} defaultValue={guessDue} /></Field>
      <More>
        <Field label="Statement date"><DateInput name="statement_date" /></Field>
        {card === "__new" && !cardId ? <Field label="Last 4 digits (optional)" hint="Never enter the full card number or CVV."><TextInput name="new_card_last4" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" /></Field> : null}
        <Field label="Notes"><TextArea name="notes" /></Field>
      </More>
    </ActionForm>
  );
}

export function CardForm() {
  return (
    <ActionForm action={F.createCard} submitLabel="Add card">
      <Row>
        <Field label="Nickname"><TextInput name="nickname" required placeholder="Travel card" /></Field>
        <Field label="Issuer"><TextInput name="issuer" placeholder="Bank" /></Field>
      </Row>
      <Row>
        <Field label="Statement day"><TextInput name="statement_day" inputMode="numeric" placeholder="1–31" /></Field>
        <Field label="Due day"><TextInput name="due_day" inputMode="numeric" placeholder="1–31" /></Field>
      </Row>
      <More>
        <Row>
          <Field label="Last 4 digits" hint="Optional. No full numbers or CVV."><TextInput name="last4" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" /></Field>
          <Field label="Credit limit"><MoneyInput name="credit_limit" /></Field>
        </Row>
        <Field label="Notes"><TextArea name="notes" /></Field>
      </More>
    </ActionForm>
  );
}

export function DebtForm({ defaultDirection = "owed_to_me", today }: { defaultDirection?: "i_owe" | "owed_to_me"; today: string }) {
  const [dir, setDir] = useState(defaultDirection);
  return (
    <ActionForm action={F.createDebt} submitLabel="Save">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 text-sm">
        {(["owed_to_me", "i_owe"] as const).map((d) => (
          <label key={d} className={`cursor-pointer rounded-lg py-2 text-center ${dir === d ? "bg-surface font-medium shadow-sm" : "text-muted"}`}>
            <input type="radio" name="direction" value={d} checked={dir === d} onChange={() => setDir(d)} className="sr-only" />
            {d === "owed_to_me" ? "Owed to me" : "I owe"}
          </label>
        ))}
      </div>
      <Row>
        <Field label={dir === "i_owe" ? "Owed to" : "Owed by"}><TextInput name="counterparty" required placeholder="Person or company" /></Field>
        <Field label="Amount"><MoneyInput name="original_amount" required /></Field>
      </Row>
      <Field label="Reason"><TextInput name="reason" placeholder="What it's for" /></Field>
      <Row>
        <Field label="Agreed due date" hint="Leave blank if none."><DateInput name="due_date" /></Field>
        <Field label="Follow-up date"><DateInput name="follow_up_date" /></Field>
      </Row>
      <More>
        <Field label="Started on"><DateInput name="started_on" defaultValue={today} /></Field>
        <Row>
          <Field label="Split into instalments"><TextInput name="installments" inputMode="numeric" placeholder="e.g. 3" /></Field>
          <Field label="First instalment"><DateInput name="first_installment" /></Field>
        </Row>
        <Field label="Notes"><TextArea name="notes" /></Field>
      </More>
    </ActionForm>
  );
}

export function LoanPaymentForm({ loanId, amount, today }: { loanId: string; amount?: number; today: string }) {
  const [kind, setKind] = useState("emi");
  const [amt, setAmt] = useState(fmtAmt(amount) ?? "");
  const prepay = kind === "prepayment" || kind === "part_payment";
  return (
    <ActionForm action={F.recordLoanPayment} submitLabel="Record payment">
      <input type="hidden" name="loan_id" value={loanId} />
      <Row>
        <Field label="Amount paid"><MoneyInput name="amount" required value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
        <Field label="Paid on"><DateInput name="paid_on" defaultValue={today} /></Field>
      </Row>
      <Field label="Type">
        <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} options={[
          { value: "emi", label: "EMI" }, { value: "part_payment", label: "Part-payment" }, { value: "prepayment", label: "Prepayment" },
          { value: "fee", label: "Fee / charges" }, { value: "other", label: "Other" },
        ]} />
      </Field>
      {prepay ? (
        <Field label="Principal portion" hint="Usually the full amount for a prepayment. Only a known principal changes the balance.">
          <MoneyInput name="principal_part" key="pp" defaultValue={amt} />
        </Field>
      ) : null}
      <More label={prepay ? "More options" : "Principal / interest split (if known)"}>
        {!prepay ? (
          <>
            <p className="text-xs text-muted">The outstanding balance changes only when the principal portion is known. EMIs include interest and fees.</p>
            <Row>
              <Field label="Principal"><MoneyInput name="principal_part" /></Field>
              <Field label="Interest"><MoneyInput name="interest_part" /></Field>
            </Row>
            <Field label="Fees"><MoneyInput name="fees_part" /></Field>
          </>
        ) : null}
        <Field label="Notes"><TextInput name="notes" /></Field>
      </More>
    </ActionForm>
  );
}

export function LenderBalanceForm({ loanId, today }: { loanId: string; today: string }) {
  return (
    <ActionForm action={F.updateLenderBalance} submitLabel="Save balance">
      <input type="hidden" name="loan_id" value={loanId} />
      <Row>
        <Field label="Lender-reported outstanding"><MoneyInput name="balance" required /></Field>
        <Field label="As of"><DateInput name="as_of" defaultValue={today} /></Field>
      </Row>
      <Field label="Notes"><TextInput name="notes" placeholder="e.g. from loan statement" /></Field>
    </ActionForm>
  );
}

export function CardPaymentForm({ statementId, amount, minimum, today }: { statementId: string; amount?: number; minimum?: number; today: string }) {
  const [amt, setAmt] = useState(fmtAmt(amount) ?? "");
  return (
    <ActionForm action={F.recordCardPayment} submitLabel="Record payment">
      <input type="hidden" name="statement_id" value={statementId} />
      <Row>
        <Field label="Amount paid"><MoneyInput name="amount" required value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
        <Field label="Paid on"><DateInput name="paid_on" defaultValue={today} /></Field>
      </Row>
      {amount !== undefined ? (
        <div className="flex flex-wrap gap-2 text-xs">
          <button type="button" className="rounded-full border border-line px-2.5 py-1" onClick={() => setAmt(fmtAmt(amount)!)}>Full remaining</button>
          {minimum && minimum > 0 && minimum < amount ? <button type="button" className="rounded-full border border-line px-2.5 py-1" onClick={() => setAmt(fmtAmt(minimum)!)}>Minimum</button> : null}
        </div>
      ) : null}
      <More><Field label="Notes"><TextInput name="notes" /></Field></More>
    </ActionForm>
  );
}

export function DebtPaymentForm({ debtId, direction, amount, today }: { debtId: string; direction: "i_owe" | "owed_to_me"; amount?: number; today: string }) {
  return (
    <ActionForm action={F.recordDebtPayment} submitLabel={direction === "i_owe" ? "Record payment" : "Record receipt"}>
      <input type="hidden" name="debt_id" value={debtId} />
      <Row>
        <Field label={direction === "i_owe" ? "Amount paid" : "Amount received"}><MoneyInput name="amount" required defaultValue={fmtAmt(amount)} /></Field>
        <Field label="Date"><DateInput name="paid_on" defaultValue={today} /></Field>
      </Row>
      <Field label="Receipt / reference" hint="UPI ref, cheque no., etc."><TextInput name="reference" /></Field>
      <More><Field label="Notes"><TextInput name="notes" /></Field></More>
    </ActionForm>
  );
}

export function FollowUpForm({ entity, id, today, defaultNext }: { entity: "jsr_item" | "debt"; id: string; today: string; defaultNext?: string }) {
  return (
    <ActionForm action={F.logFollowUp} submitLabel="Log follow-up">
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="id" value={id} />
      <Field label="What happened?"><TextInput name="note" placeholder="Called / messaged / emailed…" /></Field>
      <Row>
        <Field label="Channel">
          <Select name="channel" options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "call", label: "Call" }, { value: "email", label: "Email" }, { value: "meeting", label: "Meeting" }]} />
        </Field>
        <Field label="Next follow-up" hint="Blank = no further follow-up"><DateInput name="next_follow_up" defaultValue={defaultNext ?? addDays(today, 3)} /></Field>
      </Row>
    </ActionForm>
  );
}

export function SetFollowUpForm({ entity, id, current, today }: { entity: "jsr_item" | "debt"; id: string; current?: string | null; today: string }) {
  return (
    <ActionForm action={F.setFollowUpDate} submitLabel="Set follow-up">
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="id" value={id} />
      <Field label="Next follow-up date"><DateInput name="follow_up_date" defaultValue={current ?? addDays(today, 2)} /></Field>
      <div className="flex flex-wrap gap-2 text-xs text-muted">Reminder arrives at your reminder time on that day.</div>
    </ActionForm>
  );
}

/** Quick add: a follow-up on an existing JSR item or personal record. */
export function QuickFollowUpForm({ lookups }: { lookups: Lookups }) {
  const opts = [
    ...lookups.jsr.map((j) => ({ value: `jsr_item:${j.id}`, label: `${j.client_name} — ${j.title}` })),
    ...lookups.debts.map((d) => ({ value: `debt:${d.id}`, label: `${d.counterparty} (${d.direction === "i_owe" ? "I owe" : "owes me"})` })),
  ];
  const [sel, setSel] = useState(opts[0]?.value ?? "");
  const [entity, id] = sel.split(":");
  if (!opts.length) return <p className="text-sm text-muted">Add a JSR item or a money record first.</p>;
  return (
    <ActionForm action={F.setFollowUpDate} submitLabel="Set follow-up">
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="id" value={id} />
      <Field label="Follow up on"><Select value={sel} onChange={(e) => setSel(e.target.value)} options={opts} /></Field>
      <Field label="Date"><DateInput name="follow_up_date" defaultValue={addDays(lookups.today, 1)} required /></Field>
    </ActionForm>
  );
}

// ---------------- Work ----------------
function ClientPicker({ lookups, value, onChange }: { lookups: Lookups; value: string; onChange: (v: string) => void }) {
  return (
    <>
      <Field label="Client">
        <Select name="client_id" value={value} onChange={(e) => onChange(e.target.value)}
          options={[...lookups.clients.map((c) => ({ value: c.id, label: c.name })), { value: "__new", label: "+ New client" }]} />
      </Field>
      {value === "__new" ? <Field label="New client name"><TextInput name="new_client_name" required /></Field> : null}
    </>
  );
}

export function JsrItemForm({ lookups, clientId, projectId }: { lookups: Lookups; clientId?: string; projectId?: string }) {
  const [client, setClient] = useState(clientId ?? lookups.clients[0]?.id ?? "__new");
  const projects = lookups.projects.filter((p) => p.client_id === client);
  return (
    <ActionForm action={W.createJsrItem} submitLabel="Add to JSR">
      <ClientPicker lookups={lookups} value={client} onChange={setClient} />
      {projects.length ? (
        <Field label="Project / retainer">
          <Select name="project_id" defaultValue={projectId ?? "__none"} options={[{ value: "__none", label: "— None —" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} />
        </Field>
      ) : null}
      <Field label="Deliverable"><TextInput name="title" required placeholder="e.g. Diwali KV options" /></Field>
      <Field label="What happens next"><TextInput name="next_action" placeholder="e.g. Send v2 after internal review" /></Field>
      <Row>
        <Field label="Status"><Select name="status" defaultValue="to_send" options={JSR_STATUSES} /></Field>
        <Field label="Next move"><Select name="next_owner" defaultValue="me" options={OWNERS} /></Field>
      </Row>
      <Row>
        <Field label="Action due"><DateInput name="action_due" defaultValue={lookups.today} /></Field>
        <Field label="Priority"><Select name="priority" defaultValue="medium" options={PRIORITIES} /></Field>
      </Row>
      <More>
        <Field label="Follow-up date"><DateInput name="follow_up_date" /></Field>
        <Field label="Billing"><Select name="billing" defaultValue="pending" options={BILLING} /></Field>
        <Field label="Links"><TextArea name="links" rows={2} placeholder="Drive / Figma links, one per line" /></Field>
        <Field label="Notes"><TextArea name="notes" rows={2} /></Field>
      </More>
    </ActionForm>
  );
}

export function InvoiceForm({ lookups, clientId, projectId, jsrItemId }: { lookups: Lookups; clientId?: string; projectId?: string | null; jsrItemId?: string }) {
  const [client, setClient] = useState(clientId ?? lookups.clients[0]?.id ?? "__new");
  const projects = lookups.projects.filter((p) => p.client_id === client);
  const [amount, setAmount] = useState("");
  const [gst, setGst] = useState("18");
  const [tds, setTds] = useState("");
  const a = Number(amount.replace(/,/g, "")) || 0;
  const g = (a * (Number(gst) || 0)) / 100;
  const t = (a * (Number(tds) || 0)) / 100;
  const f = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
  return (
    <ActionForm action={W.createInvoice} submitLabel="Save invoice">
      {jsrItemId ? <input type="hidden" name="jsr_item_id" value={jsrItemId} /> : null}
      <ClientPicker lookups={lookups} value={client} onChange={setClient} />
      {projects.length ? (
        <Field label="Project">
          <Select name="project_id" defaultValue={projectId ?? "__none"} options={[{ value: "__none", label: "— None —" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} />
        </Field>
      ) : null}
      <Row>
        <Field label="Invoice no."><TextInput name="invoice_number" required defaultValue={lookups.nextInvoiceNumber} /></Field>
        <Field label="Amount (before GST)"><MoneyInput name="amount" required value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      </Row>
      <Row>
        <Field label="Invoice date"><DateInput name="invoice_date" defaultValue={lookups.today} /></Field>
        <Field label="Due date"><DateInput name="due_date" defaultValue={addDays(lookups.today, 30)} /></Field>
      </Row>
      <Field label="Status">
        <Select name="stage" defaultValue="draft" options={[{ value: "draft", label: "Draft" }, { value: "ready", label: "Ready to send" }, { value: "sent", label: "Sent (today)" }]} />
      </Field>
      <More label="GST, TDS & notes">
        <Row>
          <Field label="GST %"><TextInput name="gst_rate" inputMode="decimal" value={gst} onChange={(e) => setGst(e.target.value)} /></Field>
          <Field label="TDS % expected"><TextInput name="tds_rate" inputMode="decimal" value={tds} onChange={(e) => setTds(e.target.value)} placeholder="e.g. 2 or 10" /></Field>
        </Row>
        <Field label="Notes"><TextArea name="notes" rows={2} /></Field>
      </More>
      {a > 0 ? (
        <p className="tabular rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
          Total {f(a + g)}{g ? ` (incl. GST ${f(g)})` : ""}{t ? ` · TDS ${f(t)} · net cash expected ${f(a + g - t)}` : ""}
        </p>
      ) : null}
    </ActionForm>
  );
}

export function ReceiptForm({ invoiceId, amount, tdsPending, today }: { invoiceId: string; amount?: number; tdsPending?: number; today: string }) {
  return (
    <ActionForm action={W.recordReceipt} submitLabel="Record receipt">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <Row>
        <Field label="Received in bank"><MoneyInput name="bank_amount" defaultValue={fmtAmt(amount)} /></Field>
        <Field label="Date"><DateInput name="received_on" defaultValue={today} /></Field>
      </Row>
      <Field label="TDS confirmed" hint={tdsPending ? `Expected TDS still unconfirmed: ₹${tdsPending.toLocaleString("en-IN")}. Enter it when it shows in 26AS / Form 16A.` : "Enter only when the deduction is confirmed (26AS / Form 16A)."}>
        <MoneyInput name="tds_amount" />
      </Field>
      <More>
        <Field label="Reference"><TextInput name="reference" placeholder="UTR / NEFT ref" /></Field>
        <Field label="Notes"><TextInput name="notes" /></Field>
      </More>
    </ActionForm>
  );
}

export function MarkSentForm({ id, today, waitDays }: { id: string; today: string; waitDays: number }) {
  return (
    <ActionForm action={W.markSent} submitLabel="Mark sent">
      <input type="hidden" name="id" value={id} />
      <Field label="Follow up on" hint="Status → Sent to client; next move → client."><DateInput name="follow_up_date" defaultValue={addDays(today, waitDays)} /></Field>
      <Field label="What's needed from the client"><TextInput name="next_action" placeholder="e.g. Feedback on v2" /></Field>
      <Field label="Note"><TextInput name="note" placeholder="e.g. Shared via email with drive link" /></Field>
    </ActionForm>
  );
}

export function ClientForm() {
  return (
    <ActionForm action={W.createClientRecord} submitLabel="Add client">
      <Field label="Client name"><TextInput name="name" required /></Field>
      <Row>
        <Field label="Contact person"><TextInput name="contact_name" /></Field>
        <Field label="Phone (WhatsApp)"><TextInput name="phone" type="tel" /></Field>
      </Row>
      <More><Field label="Email"><TextInput name="email" type="email" /></Field><Field label="Notes"><TextArea name="notes" rows={2} /></Field></More>
    </ActionForm>
  );
}

export function ProjectForm({ lookups, clientId }: { lookups: Lookups; clientId?: string }) {
  const [client, setClient] = useState(clientId ?? lookups.clients[0]?.id ?? "__new");
  return (
    <ActionForm action={W.createProject} submitLabel="Add project">
      {clientId ? <input type="hidden" name="client_id" value={clientId} /> : <ClientPicker lookups={lookups} value={client} onChange={setClient} />}
      <Row>
        <Field label="Project / retainer"><TextInput name="name" required /></Field>
        <Field label="Type"><Select name="kind" defaultValue="campaign" options={PROJECT_KINDS} /></Field>
      </Row>
      <More label="Expected billing">
        <Row>
          <Field label="Expected invoice"><MoneyInput name="expected_invoice_amount" /></Field>
          <Field label="Expected on"><DateInput name="expected_invoice_date" /></Field>
        </Row>
        <p className="text-xs text-muted">Shown on the dashboard as expected project billing until an invoice is raised.</p>
        <Field label="Notes"><TextArea name="notes" rows={2} /></Field>
      </More>
    </ActionForm>
  );
}

export { Check };
