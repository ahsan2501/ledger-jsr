// "Needs attention": one list, grouped Overdue / Today / Next 7 days, each with a reason and a direct action.
import { addDays, diffDays, inr, relDue, toNum } from "./format";
import type { Debt, Invoice, JsrItem, Obligation } from "./types";

export type AttentionAction =
  | { type: "record_loan_payment"; id: string; amount: number }
  | { type: "record_card_payment"; id: string; amount: number }
  | { type: "record_debt_payment"; id: string; amount: number; direction: "i_owe" | "owed_to_me" }
  | { type: "record_receipt"; id: string; amount: number }
  | { type: "mark_invoice_sent"; id: string }
  | { type: "mark_sent"; id: string }
  | { type: "follow_up"; entity: "jsr_item" | "debt"; id: string }
  | { type: "create_invoice"; jsrItemId: string; clientId: string; projectId: string | null }
  | { type: "open"; href: string };

export type AttentionItem = {
  key: string;
  group: "overdue" | "today" | "week";
  date: string;
  area: "pay" | "receive" | "work";
  title: string;
  reason: string;
  amount?: number;
  href: string;
  action: AttentionAction;
  actionLabel: string;
};

function groupFor(date: string, today: string): AttentionItem["group"] {
  if (date < today) return "overdue";
  if (date === today) return "today";
  return "week";
}

export function buildAttention(input: {
  today: string;
  obligations: Obligation[];
  jsr: JsrItem[];
  debts: Debt[];
  invoices: Invoice[];
  clientWaitDays: number;
  /** debt ids that have installments — their parent ids appear on obligations */
}): AttentionItem[] {
  const { today } = input;
  const horizon = addDays(today, 7);
  const out: AttentionItem[] = [];
  const debtDir = new Map(input.debts.map((d) => [d.id, d.direction] as const));

  for (const o of input.obligations) {
    if (toNum(o.amount_remaining) <= 0 || !o.due_date || o.due_date > horizon) continue;
    out.push(obligationItem(o, today, debtDir));
  }

  for (const d of input.debts) {
    if (!d.follow_up_date || d.follow_up_date > horizon || d.is_settled || d.closed) continue;
    out.push({
      key: `debt-fu:${d.id}`, group: groupFor(d.follow_up_date, today), date: d.follow_up_date, area: d.direction === "i_owe" ? "pay" : "receive",
      title: `Follow up with ${d.counterparty}`,
      reason: `${inr(d.amount_remaining)} ${d.direction === "i_owe" ? "you owe" : "owed to you"} · follow-up ${relDue(d.follow_up_date, today).replace("due ", "")}`,
      href: `/finance/debts/${d.id}`, action: { type: "follow_up", entity: "debt", id: d.id }, actionLabel: "Follow up",
    });
  }

  for (const j of input.jsr) {
    if (!j.is_active) continue;
    const who = j.next_owner === "me" ? "Your move" : j.next_owner === "team" ? "Team's move" : "Client's move";
    if (j.action_due && j.action_due <= horizon && j.next_owner !== "client") {
      const toSend = j.status === "to_send";
      out.push({
        key: `jsr-due:${j.id}`, group: groupFor(j.action_due, today), date: j.action_due, area: "work",
        title: `${j.client_name}: ${j.title}`,
        reason: `${who} · ${j.next_action || "next action"} · ${relDue(j.action_due, today)}`,
        href: `/work/items/${j.id}`,
        action: toSend ? { type: "mark_sent", id: j.id } : { type: "open", href: `/work/items/${j.id}` },
        actionLabel: toSend ? "Mark sent" : "Update",
      });
    }
    const waitingLong = j.waiting_days !== null && j.waiting_days >= input.clientWaitDays;
    if ((j.follow_up_date && j.follow_up_date <= horizon) || (waitingLong && !j.follow_up_date)) {
      const date = j.follow_up_date ?? today;
      out.push({
        key: `jsr-fu:${j.id}`, group: groupFor(date, today), date, area: "work",
        title: `Follow up: ${j.client_name} — ${j.title}`,
        reason: [
          j.waiting_days !== null ? `waiting on client ${j.waiting_days} day${j.waiting_days === 1 ? "" : "s"}` : null,
          j.follow_up_date ? `follow-up ${relDue(j.follow_up_date, today).replace("due ", "")}` : "no follow-up date set",
        ].filter(Boolean).join(" · "),
        href: `/work/items/${j.id}`, action: { type: "follow_up", entity: "jsr_item", id: j.id }, actionLabel: "Follow up",
      });
    }
    if (j.billing === "to_invoice") {
      out.push({
        key: `jsr-bill:${j.id}`, group: "today", date: today, area: "work",
        title: `Invoice to send: ${j.client_name} — ${j.title}`,
        reason: `${j.status === "delivered" ? "Delivered" : "Approved"} but not invoiced yet`,
        href: `/work/items/${j.id}`, action: { type: "create_invoice", jsrItemId: j.id, clientId: j.client_id, projectId: j.project_id },
        actionLabel: "Create invoice",
      });
    }
  }

  for (const inv of input.invoices) {
    if (inv.status !== "ready") continue;
    out.push({
      key: `inv-ready:${inv.id}`, group: "today", date: today, area: "work",
      title: `Send invoice ${inv.invoice_number} — ${inv.client_name}`,
      reason: `${inr(inv.total)} ready to send`,
      href: `/work/invoices/${inv.id}`, action: { type: "mark_invoice_sent", id: inv.id }, actionLabel: "Mark sent",
    });
  }

  const order = { overdue: 0, today: 1, week: 2 } as const;
  return out.sort((a, b) => order[a.group] - order[b.group] || a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export function daysWaiting(since: string | null, today: string) {
  return since ? diffDays(today, since) : null;
}

/** Turn one money obligation into a row with its reason and direct action. */
export function obligationItem(o: Obligation, today: string, debtDir: Map<string, "i_owe" | "owed_to_me"> = new Map()): AttentionItem {
  const rem = toNum(o.amount_remaining);
  const paid = toNum(o.amount_paid);
  let reason = `${inr(rem)} ${o.direction === "out" ? "to pay" : "expected"} · ${relDue(o.due_date, today)}`;
  if (paid > 0) reason += ` · ${inr(paid)} of ${inr(o.amount_total)} already ${o.direction === "out" ? "paid" : "received"}`;
  if (o.source_type === "card_statement" && rem > 0) reason += o.minimum_covered ? " · minimum covered" : ` · minimum ${inr(o.minimum_due)} not covered`;
  if (rem <= 0) reason = `Settled · ${inr(o.amount_total)}`;
  let action: AttentionAction;
  let label: string;
  switch (o.source_type) {
    case "loan_installment":
      action = { type: "record_loan_payment", id: o.parent_id, amount: rem }; label = "Record payment"; break;
    case "card_statement":
      action = { type: "record_card_payment", id: o.source_id, amount: rem }; label = "Record payment"; break;
    case "invoice":
      action = { type: "record_receipt", id: o.source_id, amount: rem }; label = "Record receipt"; break;
    default: {
      const dir = debtDir.get(o.parent_id) ?? (o.direction === "out" ? "i_owe" : "owed_to_me");
      action = { type: "record_debt_payment", id: o.parent_id, amount: rem, direction: dir };
      label = o.direction === "out" ? "Record payment" : "Record receipt";
    }
  }
  if (rem <= 0) { action = { type: "open", href: o.href }; label = "View"; }
  const date = o.due_date ?? today;
  return {
    key: `${o.source_type}:${o.source_id}`, group: groupFor(date, today), date,
    area: o.direction === "out" ? "pay" : "receive",
    title: `${o.title} — ${o.counterparty}`, reason, amount: rem, href: o.href, action, actionLabel: label,
  };
}
