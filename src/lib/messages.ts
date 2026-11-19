// Follow-up message templates (copied to clipboard; the user sends them).
import { fmtDate, inr, relDue, todayIST } from "./format";
import type { Debt, Invoice, JsrItem } from "./types";

function firstName(contact: string | null | undefined, fallback: string) {
  const c = (contact ?? "").replace(/\(.*?\)/g, "").trim();
  return c ? c.split(/\s+/)[0] : fallback;
}

export function jsrWhatsApp(j: JsrItem, today = todayIST()): string {
  const hi = `Hi ${firstName(j.client_contact, "there")},`;
  const what = j.project_name ? `${j.title} (${j.project_name})` : j.title;
  if (j.next_owner === "client" || j.status === "sent_to_client" || j.status === "waiting_for_client") {
    const since = j.waiting_since ? ` we shared on ${fmtDate(j.waiting_since, today)}` : "";
    const need = j.next_action ? ` — ${j.next_action.charAt(0).toLowerCase()}${j.next_action.slice(1)}` : "";
    const by = j.action_due ? ` Could we close this by ${fmtDate(j.action_due, today)}?` : " Could you share your feedback when you get a moment?";
    return `${hi} just following up on ${what}${since}${need}.${by} Thanks!`;
  }
  const by = j.action_due ? ` We're on track for ${fmtDate(j.action_due, today)}.` : "";
  return `${hi} quick update on ${what}: ${j.next_action || "work is in progress"}.${by} Will share shortly.`;
}

export function jsrEmail(j: JsrItem, today = todayIST()): string {
  const what = j.project_name ? `${j.title} — ${j.project_name}` : j.title;
  const waiting = j.next_owner === "client" || j.status === "sent_to_client" || j.status === "waiting_for_client";
  const lines = [
    `Subject: ${waiting ? "Following up" : "Update"}: ${what}`,
    "",
    `Hi ${firstName(j.client_contact, "team")},`,
    "",
    waiting
      ? `Following up on ${what}${j.waiting_since ? `, which we shared on ${fmtDate(j.waiting_since, today)}` : ""}.`
      : `A quick update on ${what}.`,
    j.next_action ? `Pending: ${j.next_action}` : null,
    j.action_due ? `Target date: ${fmtDate(j.action_due, today)} (${relDue(j.action_due, today)})` : null,
    "",
    waiting ? "Could you please share your feedback or approval so we can keep things moving?" : "We'll share the next version shortly.",
    "",
    "Thanks,",
  ];
  return lines.filter((l) => l !== null).join("\n");
}

export function invoiceWhatsApp(inv: Invoice, contact: string | null, today = todayIST()): string {
  const due = inv.due_date ? (inv.due_date < today ? `was due on ${fmtDate(inv.due_date, today)}` : `is due on ${fmtDate(inv.due_date, today)}`) : "is pending";
  return `Hi ${firstName(contact, "there")}, a gentle reminder that invoice ${inv.invoice_number} for ${inr(inv.total)} ${due}. ${inv.is_part_paid ? `We've received part of it — ${inr(inv.net_expected)} is still pending. ` : ""}Could you please share the payment status? Thanks!`;
}

export function invoiceEmail(inv: Invoice, contact: string | null, today = todayIST()): string {
  return [
    `Subject: Payment reminder — Invoice ${inv.invoice_number}`,
    "",
    `Hi ${firstName(contact, "team")},`,
    "",
    `This is a reminder for invoice ${inv.invoice_number} dated ${fmtDate(inv.invoice_date, today)}${inv.project_name ? ` (${inv.project_name})` : ""}.`,
    `Invoice total: ${inr(inv.total)}`,
    inv.is_part_paid ? `Received so far: ${inr(inv.received_bank)}\nBalance pending: ${inr(inv.net_expected)}` : `Amount pending: ${inr(inv.net_expected)}`,
    inv.due_date ? `Due date: ${fmtDate(inv.due_date, today)} (${relDue(inv.due_date, today)})` : "",
    "",
    "Could you please confirm when we can expect the payment? If TDS has been deducted, please share the TDS details as well.",
    "",
    "Thanks,",
  ].join("\n");
}

export function debtWhatsApp(d: Debt, today = todayIST()): string {
  if (d.direction === "owed_to_me") {
    return `Hi ${firstName(d.counterparty, "there")}, just checking in about the ${inr(d.amount_remaining)}${d.reason ? ` for ${d.reason.toLowerCase()}` : ""}${d.next_due_date ? ` (due ${fmtDate(d.next_due_date, today)})` : ""}. Let me know when works for you. Thanks!`;
  }
  return `Hi ${firstName(d.counterparty, "there")}, I'll send the next ${inr(d.next_due_amount ?? d.amount_remaining)}${d.next_due_date ? ` by ${fmtDate(d.next_due_date, today)}` : " soon"}. Thanks for your patience!`;
}
