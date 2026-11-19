import { addDays, fmtDate, inr, relDue, toNum, todayIST } from "./format";
import { statusLabel, type Invoice, type JsrItem } from "./types";

/** Plain-text weekly JSR summary for pasting into WhatsApp / email / Slack. */
export function weeklySummary(jsr: JsrItem[], invoices: Invoice[], today = todayIST()): string {
  const weekEnd = addDays(today, 6);
  const active = jsr.filter((j) => j.is_active);
  const due = (d: string | null) => (d ? ` (${relDue(d, today)}, ${fmtDate(d, today)})` : "");

  const pending = active
    .filter((j) => j.next_owner !== "client" && !["sent_to_client", "waiting_for_client"].includes(j.status))
    .sort((a, b) => (a.action_due ?? "9999").localeCompare(b.action_due ?? "9999"));
  const waiting = active
    .filter((j) => j.next_owner === "client" || ["sent_to_client", "waiting_for_client"].includes(j.status))
    .sort((a, b) => (b.waiting_days ?? 0) - (a.waiting_days ?? 0));
  const toInvoice = jsr.filter((j) => j.billing === "to_invoice");
  const drafts = invoices.filter((i) => i.status === "draft" || i.status === "ready");
  const chase = invoices
    .filter((i) => ["sent", "part_paid", "overdue"].includes(i.status) && toNum(i.net_expected) > 0)
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));

  const L: string[] = [];
  L.push(`JSR — week of ${fmtDate(today, today)} to ${fmtDate(weekEnd, today)}`);
  L.push("");
  L.push(`PENDING DELIVERABLES (${pending.length})`);
  if (!pending.length) L.push("• None");
  for (const j of pending) {
    L.push(`• ${j.client_name} — ${j.title} [${statusLabel(j.status)}; ${j.next_owner === "me" ? "me" : "team"}]: ${j.next_action || "next step TBD"}${due(j.action_due)}`);
  }
  L.push("");
  L.push(`WAITING ON CLIENT (${waiting.length})`);
  if (!waiting.length) L.push("• None");
  for (const j of waiting) {
    const parts = [j.next_action || "awaiting feedback"];
    if (j.waiting_days !== null) parts.push(`waiting ${j.waiting_days} day${j.waiting_days === 1 ? "" : "s"}`);
    if (j.follow_up_date) parts.push(`follow up ${fmtDate(j.follow_up_date, today)}`);
    L.push(`• ${j.client_name} — ${j.title}: ${parts.join("; ")}`);
  }
  L.push("");
  L.push(`INVOICES TO SEND (${toInvoice.length + drafts.length})`);
  if (!toInvoice.length && !drafts.length) L.push("• None");
  for (const j of toInvoice) L.push(`• ${j.client_name} — ${j.title} (not yet invoiced)`);
  for (const i of drafts) L.push(`• ${i.client_name} — ${i.invoice_number} ${inr(i.total)} (${i.status === "ready" ? "ready to send" : "draft"})`);
  L.push("");
  const total = chase.reduce((s, i) => s + toNum(i.net_expected), 0);
  L.push(`PAYMENTS TO CHASE (${chase.length}${chase.length ? `, ${inr(total)}` : ""})`);
  if (!chase.length) L.push("• None");
  for (const i of chase) {
    L.push(`• ${i.client_name} — ${i.invoice_number}: ${inr(i.net_expected)} expected${i.due_date ? `, ${relDue(i.due_date, today)}` : ""}${i.is_part_paid ? " (part-paid)" : ""}`);
  }
  return L.join("\n");
}
