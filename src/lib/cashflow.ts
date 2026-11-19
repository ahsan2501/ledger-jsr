// Pure builders for the dashboard. No I/O here, so they are unit-tested directly.
import { addDays, diffDays, toNum } from "./format";
import type { Obligation } from "./types";

export type ActualPayment = { date: string; direction: "in" | "out"; amount: number; label: string };
export type PipelineItem = { id: string; date: string | null; amount: number; label: string; kind: "project" | "invoice_draft" };

export type CashDay = {
  date: string;
  past: boolean;
  isToday: boolean;
  actualIn: number;
  actualOut: number;
  scheduledOut: number;     // loans, cards, money I owe
  expectedInvoices: number; // invoices already sent (net cash still expected)
  expectedPersonal: number; // personal money owed to me
  pipeline: number;         // expected project invoices / drafts not yet sent
  overdueOut: number;       // part of scheduledOut that was already overdue (shown on today)
  overdueIn: number;
  items: { label: string; amount: number; kind: string }[];
};

export const PAST_DAYS = 7;
export const FUTURE_DAYS = 31; // today + the next 30 days

/**
 * Build the cash-flow window: last 7 days use actual payments; today + next 29 days
 * use scheduled outgoing and expected incoming. Overdue unpaid items are placed on
 * today so nothing silently drops off. Each obligation (and so each invoice) is
 * counted exactly once.
 */
export function buildCashFlow(input: {
  today: string;
  obligations: Obligation[];
  actuals: ActualPayment[];
  pipeline: PipelineItem[];
}): CashDay[] {
  const { today } = input;
  const days: CashDay[] = [];
  const idx = new Map<string, CashDay>();
  for (let i = -PAST_DAYS; i < FUTURE_DAYS; i++) {
    const date = addDays(today, i);
    const d: CashDay = {
      date, past: i < 0, isToday: i === 0, actualIn: 0, actualOut: 0, scheduledOut: 0,
      expectedInvoices: 0, expectedPersonal: 0, pipeline: 0, overdueOut: 0, overdueIn: 0, items: [],
    };
    days.push(d);
    idx.set(date, d);
  }
  const last = addDays(today, FUTURE_DAYS - 1);

  for (const a of input.actuals) {
    const d = idx.get(a.date);
    if (!d || !d.past && !d.isToday) continue;
    if (a.direction === "in") d.actualIn += a.amount; else d.actualOut += a.amount;
    d.items.push({ label: a.label, amount: a.amount, kind: a.direction === "in" ? "received" : "paid" });
  }

  const seen = new Set<string>();
  for (const o of input.obligations) {
    const key = `${o.source_type}:${o.source_id}`;
    if (seen.has(key)) continue; // never double count
    seen.add(key);
    const remaining = toNum(o.amount_remaining);
    if (remaining <= 0 || !o.due_date) continue;
    const overdue = o.due_date < today;
    const date = overdue ? today : o.due_date;
    if (date > last) continue;
    const d = idx.get(date)!;
    const label = `${o.title} · ${o.counterparty}`;
    if (o.direction === "out") {
      d.scheduledOut += remaining;
      if (overdue) d.overdueOut += remaining;
      d.items.push({ label, amount: remaining, kind: overdue ? "overdue payment" : "scheduled" });
    } else {
      if (o.category === "agency_receivable") d.expectedInvoices += remaining;
      else d.expectedPersonal += remaining;
      if (overdue) d.overdueIn += remaining;
      d.items.push({ label, amount: remaining, kind: overdue ? "overdue receipt" : "expected" });
    }
  }

  for (const p of input.pipeline) {
    if (!p.date || p.amount <= 0) continue;
    const date = p.date < today ? today : p.date;
    if (date > last) continue;
    const d = idx.get(date)!;
    d.pipeline += p.amount;
    d.items.push({ label: p.label, amount: p.amount, kind: p.kind === "project" ? "project (not invoiced)" : "draft invoice" });
  }
  return days;
}

export function summariseCashFlow(days: CashDay[]) {
  const fut = days.filter((d) => !d.past);
  const sum = (f: (d: CashDay) => number, arr = fut) => arr.reduce((s, d) => s + f(d), 0);
  return {
    out: sum((d) => d.scheduledOut),
    inInvoices: sum((d) => d.expectedInvoices),
    inPersonal: sum((d) => d.expectedPersonal),
    pipeline: sum((d) => d.pipeline),
    paidLast7: sum((d) => d.actualOut, days.filter((d) => d.past)),
    receivedLast7: sum((d) => d.actualIn, days.filter((d) => d.past)),
  };
}

/** Project pipeline: expected project billing not yet covered by any invoice. */
export function projectPipeline(
  projects: { id: string; name: string; client_name: string; status: string; expected_invoice_amount: unknown; expected_invoice_date: string | null }[],
  invoices: { project_id: string | null; total: unknown; tds_amount?: unknown; cancelled: boolean; stage: string; id: string; invoice_number: string; client_name: string; due_date: string | null; invoice_date: string }[],
): PipelineItem[] {
  const invoicedByProject = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.cancelled || !inv.project_id) continue;
    invoicedByProject.set(inv.project_id, (invoicedByProject.get(inv.project_id) ?? 0) + toNum(inv.total));
  }
  const items: PipelineItem[] = [];
  for (const p of projects) {
    if (p.status === "closed") continue;
    const left = toNum(p.expected_invoice_amount) - (invoicedByProject.get(p.id) ?? 0);
    if (left > 0 && p.expected_invoice_date) {
      items.push({ id: p.id, date: p.expected_invoice_date, amount: left, label: `${p.client_name} — ${p.name} (to invoice)`, kind: "project" });
    }
  }
  // Draft / ready invoices are not yet sent, so they are pipeline, not expected cash.
  // They are subtracted from the project above, so they are not double counted.
  for (const inv of invoices) {
    if (inv.cancelled || inv.stage === "sent") continue;
    items.push({
      id: inv.id, date: inv.due_date ?? inv.invoice_date, amount: toNum(inv.total) - toNum(inv.tds_amount),
      label: `${inv.client_name} — ${inv.invoice_number} (${inv.stage === "ready" ? "ready to send" : "draft"})`, kind: "invoice_draft",
    });
  }
  return items;
}

export function daysBetween(a: string, b: string) {
  return diffDays(a, b);
}
