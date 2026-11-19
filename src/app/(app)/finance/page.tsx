import Link from "next/link";
import { AttentionAction } from "@/components/attention";
import { Badge, Card, CardHeader, Empty, PageHeader, Stat, cx } from "@/components/ui";
import { obligationItem } from "@/lib/attention";
import { getDebts, getLookups, getObligations, getProfile } from "@/lib/data";
import { addDays, fmtDate, inr, monthBounds, toNum, todayIST } from "@/lib/format";
import type { Obligation } from "@/lib/types";
import { requireUser } from "@/lib/supabase/server";
import { FinanceTabs } from "./_tabs";

export const metadata = { title: "Finance" };

const VIEWS = [
  { key: "open", label: "All open" },
  { key: "overdue", label: "Overdue" },
  { key: "week", label: "Due this week" },
  { key: "upcoming", label: "Upcoming" },
  { key: "nodate", label: "No due date" },
  { key: "paid", label: "Paid" },
] as const;
const DIRS = [
  { key: "all", label: "Both" },
  { key: "out", label: "I pay" },
  { key: "in", label: "I receive" },
] as const;

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ view?: string; dir?: string }> }) {
  const sp = await searchParams;
  const view = VIEWS.some((v) => v.key === sp.view) ? sp.view! : "open";
  const dir = DIRS.some((d) => d.key === sp.dir) ? sp.dir! : "all";
  const { supabase } = await requireUser();
  const today = todayIST();
  const [obligations, debts, lookups, profile, loansRes] = await Promise.all([
    getObligations(supabase), getDebts(supabase), getLookups(supabase), getProfile(supabase),
    supabase.from("v_loans").select("outstanding, status"),
  ]);
  const weekEnd = addDays(today, 6);
  const { end: monthEnd } = monthBounds(today);
  const rem = (o: Obligation) => toNum(o.amount_remaining);

  const match = (o: Obligation) => {
    if (dir !== "all" && o.direction !== dir) return false;
    const open = rem(o) > 0;
    switch (view) {
      case "overdue": return open && !!o.due_date && o.due_date < today;
      case "week": return open && !!o.due_date && o.due_date >= today && o.due_date <= weekEnd;
      case "upcoming": return open && !!o.due_date && o.due_date > weekEnd;
      case "nodate": return open && !o.due_date;
      case "paid": return !open;
      default: return open;
    }
  };
  const list = obligations.filter(match).sort((a, b) =>
    view === "paid" ? (b.due_date ?? "").localeCompare(a.due_date ?? "") : (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  const debtDir = new Map(debts.map((d) => [d.id, d.direction] as const));

  // Totals: outstanding (everything owed) vs due this month (incl. overdue)
  const open = obligations.filter((o) => rem(o) > 0);
  const loansOutstanding = ((loansRes.data ?? []) as { outstanding: unknown; status: string }[])
    .filter((l) => l.status === "active").reduce((s, l) => s + toNum(l.outstanding), 0);
  const cardsOutstanding = open.filter((o) => o.category === "card").reduce((s, o) => s + rem(o), 0);
  const oweOutstanding = debts.filter((d) => d.direction === "i_owe" && !d.closed).reduce((s, d) => s + toNum(d.amount_remaining), 0);
  const dueThisMonthOut = open.filter((o) => o.direction === "out" && o.due_date && o.due_date <= monthEnd).reduce((s, o) => s + rem(o), 0);
  const owedToMe = open.filter((o) => o.direction === "in").reduce((s, o) => s + rem(o), 0);
  const expectedThisMonth = open.filter((o) => o.direction === "in" && o.due_date && o.due_date <= monthEnd).reduce((s, o) => s + rem(o), 0);
  const count = (k: string) => obligations.filter((o) => (dir === "all" || o.direction === dir) && (() => {
    const open = rem(o) > 0;
    if (k === "overdue") return open && !!o.due_date && o.due_date < today;
    if (k === "week") return open && !!o.due_date && o.due_date >= today && o.due_date <= weekEnd;
    if (k === "upcoming") return open && !!o.due_date && o.due_date > weekEnd;
    if (k === "nodate") return open && !o.due_date;
    if (k === "paid") return !open;
    return open;
  })()).length;

  const href = (v: string, d: string) => `/finance?view=${v}&dir=${d}`;
  return (
    <div>
      <PageHeader title="Finance" sub="Loans, card bills and personal money" action={
        <a href="/api/export/csv?type=obligations" className="text-sm text-accent">Export CSV</a>} />
      <FinanceTabs active="/finance" />

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold">What I owe</p>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Total outstanding" value={inr(loansOutstanding + cardsOutstanding + oweOutstanding)}
              sub={`Loans ${inr(loansOutstanding)} · cards ${inr(cardsOutstanding)} · personal ${inr(oweOutstanding)}`} />
            <Stat label="Actually due this month" value={inr(dueThisMonthOut)} sub={`EMIs, bills & repayments by ${fmtDate(monthEnd, today)} incl. overdue`} tone={dueThisMonthOut ? "danger" : undefined} />
          </div>
        </Card>
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold">Owed to me</p>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Total outstanding" value={inr(owedToMe)} sub="Sent invoices (net of TDS) + personal" />
            <Stat label="Expected this month" value={inr(expectedThisMonth)} sub="Incl. overdue" tone={expectedThisMonth ? "ok" : undefined} />
          </div>
        </Card>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {VIEWS.map((v) => (
          <Link key={v.key} href={href(v.key, dir)} className={cx("rounded-full border px-3 py-1.5 text-sm",
            view === v.key ? "border-accent bg-accent text-accent-text" : "border-line bg-surface")}>
            {v.label} <span className="opacity-70">{count(v.key)}</span>
          </Link>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-line sm:inline-block" />
        <div className="flex gap-1 rounded-full bg-surface-2 p-1">
          {DIRS.map((d) => (
            <Link key={d.key} href={href(view, d.key)} className={cx("rounded-full px-3 py-1 text-sm", dir === d.key ? "bg-surface font-medium shadow-sm" : "text-muted")}>{d.label}</Link>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader title={`${VIEWS.find((v) => v.key === view)!.label}${dir === "out" ? " · I pay" : dir === "in" ? " · I receive" : ""}`}
          sub={`${list.length} item${list.length === 1 ? "" : "s"} · ${inr(list.reduce((s, o) => s + (view === "paid" ? toNum(o.amount_total) : rem(o)), 0))}`} />
        {list.length ? (
          <ul className="divide-y divide-line">
            {list.map((o) => {
              const it = obligationItem(o, today, debtDir);
              return (
                <li key={`${o.source_type}:${o.source_id}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link href={o.href} className="truncate text-sm font-medium hover:underline">{o.title}</Link>
                      <Badge tone={o.direction === "out" ? "warn" : "ok"}>{o.direction === "out" ? "Pay" : o.category === "agency_receivable" ? "Agency" : "Personal"}</Badge>
                    </div>
                    <p className="truncate text-xs text-muted">{o.counterparty} · {o.due_date ? fmtDate(o.due_date, today) : "No due date"} · {it.reason}</p>
                  </div>
                  <span className={cx("tabular text-sm font-semibold", o.due_date && o.due_date < today && rem(o) > 0 && "text-danger")}>{inr(view === "paid" ? o.amount_total : rem(o))}</span>
                  <AttentionAction item={it} lookups={lookups} waitDays={profile.client_wait_days} />
                </li>
              );
            })}
          </ul>
        ) : <Empty title="Nothing here">Try another filter, or add something with the + button.</Empty>}
      </Card>
    </div>
  );
}
