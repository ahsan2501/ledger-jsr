import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, toNum, todayIST } from "./format";
import { nextNumber } from "./numbering";
import type { ActualPayment } from "./cashflow";
import type { Debt, Invoice, JsrItem, Obligation, Profile, Reminder } from "./types";
import { PAST_DAYS } from "./cashflow";

function rows<T>(res: { data: T[] | null; error: { message: string } | null }): T[] {
  if (res.error) throw new Error(res.error.message);
  return res.data ?? [];
}

export async function getProfile(sb: SupabaseClient): Promise<Profile> {
  const { data } = await sb.from("profiles").select("*").maybeSingle();
  return (data as Profile) ?? {
    owner_id: "", display_name: null, reminder_time: "09:00:00", advance_days: 5, alert_on_due: true, alert_overdue: true,
    remind_receipts: true, remind_work: true, discreet_push: true, client_wait_days: 3,
  };
}

export async function getObligations(sb: SupabaseClient) {
  return rows<Obligation>(await sb.from("v_obligations").select("*").order("due_date", { ascending: true, nullsFirst: false }));
}
export async function getJsr(sb: SupabaseClient) {
  return rows<JsrItem>(await sb.from("v_jsr_items").select("*").order("action_due", { ascending: true, nullsFirst: false }));
}
export async function getInvoices(sb: SupabaseClient) {
  return rows<Invoice>(await sb.from("v_invoices").select("*").order("invoice_date", { ascending: false }));
}
export async function getDebts(sb: SupabaseClient) {
  return rows<Debt>(await sb.from("v_debts").select("*").order("created_at", { ascending: false }));
}

export async function getActuals(sb: SupabaseClient, today = todayIST()): Promise<ActualPayment[]> {
  const from = addDays(today, -PAST_DAYS);
  const [lp, cp, dp, ir] = await Promise.all([
    sb.from("loan_payments").select("paid_on, amount, loans(name)").gte("paid_on", from),
    sb.from("card_payments").select("paid_on, amount, card_statements(credit_cards(nickname))").gte("paid_on", from),
    sb.from("debt_payments").select("paid_on, amount, debts(direction, counterparty)").gte("paid_on", from),
    sb.from("invoice_receipts").select("received_on, bank_amount, invoices(invoice_number)").gte("received_on", from),
  ]);
  const out: ActualPayment[] = [];
  /* eslint-disable @typescript-eslint/no-explicit-any */
  for (const r of (lp.data ?? []) as any[]) out.push({ date: r.paid_on, direction: "out", amount: toNum(r.amount), label: `${r.loans?.name ?? "Loan"} payment` });
  for (const r of (cp.data ?? []) as any[]) out.push({ date: r.paid_on, direction: "out", amount: toNum(r.amount), label: `${r.card_statements?.credit_cards?.nickname ?? "Card"} payment` });
  for (const r of (dp.data ?? []) as any[]) out.push({ date: r.paid_on, direction: r.debts?.direction === "i_owe" ? "out" : "in", amount: toNum(r.amount), label: r.debts?.counterparty ?? "Personal" });
  for (const r of (ir.data ?? []) as any[]) if (toNum(r.bank_amount) > 0) out.push({ date: r.received_on, direction: "in", amount: toNum(r.bank_amount), label: `Invoice ${r.invoices?.invoice_number ?? ""}` });
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return out;
}

export async function getInboxCount(sb: SupabaseClient, today = todayIST()) {
  const { count } = await sb.from("reminders").select("id", { count: "exact", head: true })
    .eq("status", "active").lte("remind_on", today).is("read_at", null);
  return count ?? 0;
}

export async function getDueReminders(sb: SupabaseClient, today = todayIST()) {
  return rows<Reminder>(await sb.from("reminders").select("*").eq("status", "active").lte("remind_on", today).order("due_date"));
}

export async function hasDemo(sb: SupabaseClient) {
  const { data } = await sb.rpc("has_demo_data");
  return Boolean(data);
}

export type Lookups = {
  clients: { id: string; name: string }[];
  projects: { id: string; name: string; client_id: string }[];
  cards: { id: string; nickname: string; statement_day: number | null; due_day: number | null }[];
  jsr: { id: string; title: string; client_name: string }[];
  debts: { id: string; counterparty: string; direction: string }[];
  nextInvoiceNumber: string;
  today: string;
};

export async function getLookups(sb: SupabaseClient): Promise<Lookups> {
  const [c, p, cards, j, d, inv] = await Promise.all([
    sb.from("clients").select("id, name").eq("archived", false).order("name"),
    sb.from("projects").select("id, name, client_id").neq("status", "closed").order("name"),
    sb.from("credit_cards").select("id, nickname, statement_day, due_day").eq("active", true).order("nickname"),
    sb.from("v_jsr_items").select("id, title, client_name").eq("is_active", true).order("client_name"),
    sb.from("v_debts").select("id, counterparty, direction").eq("is_settled", false).eq("closed", false),
    sb.from("invoices").select("invoice_number").order("created_at", { ascending: false }).limit(1),
  ]);
  return {
    clients: c.data ?? [], projects: p.data ?? [], cards: cards.data ?? [], jsr: j.data ?? [], debts: d.data ?? [],
    nextInvoiceNumber: nextNumber(inv.data?.[0]?.invoice_number), today: todayIST(),
  };
}

export { nextNumber } from "./numbering";
