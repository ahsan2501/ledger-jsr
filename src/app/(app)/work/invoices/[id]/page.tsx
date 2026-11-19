import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity as ActivityList } from "@/components/activity";
import { ReceiptForm } from "@/components/entry-forms";
import { ActionForm, Check, CopyButton, DateInput, Field, InlineAction, More, MoneyInput, Row, SheetButton, TextArea, TextInput } from "@/components/forms";
import { InvoiceBadge } from "@/components/invoice-badge";
import { DeleteButton } from "@/components/row-actions";
import { Card, CardHeader, Empty, PageHeader, Stat, btn } from "@/components/ui";
import { markInvoiceReady, markInvoiceSent, updateInvoice } from "@/app/actions/work";
import { invoiceEmail, invoiceWhatsApp } from "@/lib/messages";
import { fmtDate, inr, toNum, todayIST } from "@/lib/format";
import type { Activity, Invoice } from "@/lib/types";
import { requireUser } from "@/lib/supabase/server";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const today = todayIST();
  const [{ data }, rec, acts] = await Promise.all([
    supabase.from("v_invoices").select("*").eq("id", id).maybeSingle(),
    supabase.from("invoice_receipts").select("*").eq("invoice_id", id).order("received_on", { ascending: false }),
    supabase.from("activities").select("*").eq("entity_type", "invoice").eq("entity_id", id).order("occurred_at", { ascending: false }),
  ]);
  if (!data) notFound();
  const i = data as Invoice;
  const { data: client } = await supabase.from("clients").select("contact_name").eq("id", i.client_id).maybeSingle();
  const open = ["sent", "part_paid", "overdue"].includes(i.status);
  const n = (v: unknown) => (v === null || v === undefined ? "" : String(toNum(v)));
  return (
    <div className="space-y-4">
      <PageHeader title={`Invoice ${i.invoice_number}`} sub={<><Link className="hover:underline" href={`/work/clients/${i.client_id}`}>{i.client_name}</Link>{i.project_name ? ` · ${i.project_name}` : ""}</>} action={
        <div className="flex flex-wrap justify-end gap-2">
          <SheetButton className={btn.secondary} label="Edit" title="Edit invoice">
            <ActionForm action={updateInvoice}>
              <input type="hidden" name="id" value={i.id} />
              <Row>
                <Field label="Invoice no."><TextInput name="invoice_number" defaultValue={i.invoice_number} required /></Field>
                <Field label="Amount (before GST)"><MoneyInput name="amount" defaultValue={n(i.amount)} required /></Field>
              </Row>
              <Row>
                <Field label="Invoice date"><DateInput name="invoice_date" defaultValue={i.invoice_date} required /></Field>
                <Field label="Due date"><DateInput name="due_date" defaultValue={i.due_date ?? ""} /></Field>
              </Row>
              <More label="GST, TDS & more">
                <Row>
                  <Field label="GST %"><TextInput name="gst_rate" inputMode="decimal" defaultValue={n(i.gst_rate)} /></Field>
                  <Field label="GST amount" hint="Blank = from %"><MoneyInput name="gst_amount" /></Field>
                </Row>
                <Row>
                  <Field label="TDS % expected"><TextInput name="tds_rate" inputMode="decimal" defaultValue={n(i.tds_rate)} /></Field>
                  <Field label="TDS amount" hint="Blank = from %"><MoneyInput name="tds_amount" /></Field>
                </Row>
                <Field label="Sent on"><DateInput name="sent_on" defaultValue={i.sent_on ?? ""} /></Field>
                <Field label="Notes"><TextArea name="notes" defaultValue={i.notes ?? ""} /></Field>
                <Check name="cancelled" label="Cancelled (removes it from expected cash)" defaultChecked={i.cancelled} />
              </More>
            </ActionForm>
          </SheetButton>
          {i.status === "draft" ? <InlineAction action={markInvoiceReady} fields={{ id: i.id }} label="Ready to send" className={btn.secondary} /> : null}
          {i.status === "draft" || i.status === "ready" ? <InlineAction action={markInvoiceSent} fields={{ id: i.id }} label="Mark sent" className={btn.primary} /> : null}
          {open ? <SheetButton className={btn.primary} label="Record receipt" title="Record receipt"><ReceiptForm invoiceId={i.id} amount={toNum(i.net_expected)} tdsPending={toNum(i.tds_pending)} today={today} /></SheetButton> : null}
        </div>} />
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2"><InvoiceBadge s={i.status} />{toNum(i.tds_pending) > 0 && i.status === "paid" ? <span className="text-xs text-muted">TDS {inr(i.tds_pending)} still to confirm</span> : null}</div>
        <div className="tabular grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Invoice total" value={inr(i.total)} sub={`${inr(i.amount)}${toNum(i.gst_amount) ? ` + GST ${inr(i.gst_amount)}` : ""}`} />
          <Stat label="Received in bank" value={inr(i.received_bank)} />
          <Stat label="TDS" value={inr(i.tds_confirmed)} sub={`confirmed of ${inr(i.tds_amount ?? 0)} expected`} />
          <Stat label="Net cash still expected" value={inr(i.net_expected)} tone={i.status === "overdue" ? "danger" : undefined} />
        </div>
        <p className="mt-3 text-xs text-muted">Dated {fmtDate(i.invoice_date, today)} · due {fmtDate(i.due_date, today)}{i.sent_on ? ` · sent ${fmtDate(i.sent_on, today)}` : " · not sent yet"}</p>
        {open ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <CopyButton text={invoiceWhatsApp(i, client?.contact_name ?? null, today)} label="Copy WhatsApp follow-up" />
            <CopyButton text={invoiceEmail(i, client?.contact_name ?? null, today)} label="Copy email follow-up" />
          </div>
        ) : null}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Receipts" sub="Bank receipts and confirmed TDS, recorded separately" />
          {(rec.data ?? []).length ? (
            <ul className="divide-y divide-line">
              {(rec.data ?? []).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span>{fmtDate(r.received_on, today)}{r.reference ? <span className="text-muted"> · {r.reference}</span> : null}</span>
                  <span className="tabular">{toNum(r.bank_amount) ? `Bank ${inr(r.bank_amount)}` : ""}{toNum(r.tds_amount) ? ` TDS ${inr(r.tds_amount)}` : ""}</span>
                  <DeleteButton table="invoice_receipts" id={r.id} label="×" what="this receipt" />
                </li>
              ))}
            </ul>
          ) : <Empty title="Nothing received yet" />}
        </Card>
        <Card><CardHeader title="History" /><ActivityList items={(acts.data ?? []) as Activity[]} /></Card>
      </div>
      {i.notes ? <Card className="p-4 text-sm"><p className="text-xs text-muted">Notes</p><p className="whitespace-pre-wrap">{i.notes}</p></Card> : null}
      <div className="text-right"><DeleteButton table="invoices" id={i.id} label="Delete invoice" what="this invoice and its receipts" /></div>
    </div>
  );
}
