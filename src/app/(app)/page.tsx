import Link from "next/link";
import { AttentionList } from "@/components/attention";
import { CashFlowChart, DebtTrendChart, type Snapshot } from "@/components/charts";
import { Card, CardHeader, btn, cx } from "@/components/ui";
import { SheetButton } from "@/components/forms";
import { SpendForm } from "@/components/spend-form";
import { SpendBars } from "@/components/spend-bars";
import { summariseSpending } from "@/lib/spending";
import { modeLabel, type Expense } from "@/lib/types";
import { buildAttention } from "@/lib/attention";
import { buildCashFlow, projectPipeline, summariseCashFlow } from "@/lib/cashflow";
import { getActuals, getDebts, getDueReminders, getInvoices, getJsr, getLookups, getObligations, getProfile } from "@/lib/data";
import { addDays, fmtDate, inr, monthBounds, toNum, todayIST } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Home" };

export default async function Home() {
  const { supabase } = await requireUser();
  const today = todayIST();
  const { start: monthStart } = monthBounds(today);
  const [profile, obligations, jsr, debts, invoices, actuals, reminders, lookups, projectsRes, snapsRes, spendRes] = await Promise.all([
    getProfile(supabase), getObligations(supabase), getJsr(supabase), getDebts(supabase), getInvoices(supabase),
    getActuals(supabase, today), getDueReminders(supabase, today), getLookups(supabase),
    supabase.from("projects").select("id, name, status, expected_invoice_amount, expected_invoice_date, clients(name)"),
    supabase.from("balance_snapshots").select("snapshot_on, loans_total, cards_total, owe_total, source").order("snapshot_on"),
    supabase.from("expenses").select("*").gte("spent_on", addDays(today, -6) < monthStart ? addDays(today, -6) : monthStart)
      .order("spent_on", { ascending: false }).order("created_at", { ascending: false }),
  ]);
  const spends = (spendRes.data ?? []) as Expense[];
  const month = summariseSpending(spends.filter((e) => e.spent_on >= monthStart), today);
  const last7 = summariseSpending(spends, today).last7;

  const week = addDays(today, 7);
  const open = obligations.filter((o) => toNum(o.amount_remaining) > 0);
  const dueOut = open.filter((o) => o.direction === "out" && o.due_date && o.due_date >= today && o.due_date <= week);
  const overdueOut = open.filter((o) => o.direction === "out" && o.due_date && o.due_date < today);
  const overdueIn = open.filter((o) => o.direction === "in" && o.due_date && o.due_date < today);
  const sum = (xs: typeof open) => xs.reduce((s, o) => s + toNum(o.amount_remaining), 0);
  const overdueAgency = sum(overdueIn.filter((o) => o.category === "agency_receivable"));
  const overduePersonal = sum(overdueIn.filter((o) => o.category !== "agency_receivable"));
  const workToday = jsr.filter((j) => j.is_active && (
    (j.action_due && j.action_due <= today && j.next_owner !== "client") || (j.follow_up_date && j.follow_up_date <= today)));
  const invoicesReady = invoices.filter((i) => i.status === "ready").length;

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const projects = ((projectsRes.data ?? []) as any[]).map((p) => ({ ...p, client_name: p.clients?.name ?? "" }));
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const days = buildCashFlow({ today, obligations, actuals, pipeline: projectPipeline(projects, invoices) });
  const cf = summariseCashFlow(days);
  const attention = buildAttention({ today, obligations, jsr, debts, invoices, clientWaitDays: profile.client_wait_days });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{fmtDate(today, today)} · India time</p>
        <SheetButton className={btn.primary} label="₹ Add spend" title="Add spend">
          <SpendForm today={today} extraCategories={lookups.spendCategories} />
        </SheetButton>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile href="/finance?view=week&dir=out" label="To pay · next 7 days" value={inr(sum(dueOut))}
          sub={`${dueOut.length} payment${dueOut.length === 1 ? "" : "s"}${overdueOut.length ? ` · +${inr(sum(overdueOut))} overdue` : ""}`}
          tone={overdueOut.length ? "danger" : undefined} />
        <Tile href="/finance?view=overdue&dir=in" label="Overdue to me" value={inr(overdueAgency + overduePersonal)}
          sub={`Agency ${inr(overdueAgency)} · Personal ${inr(overduePersonal)}`} tone={overdueIn.length ? "danger" : undefined} />
        <Tile href="/work?f=today" label="Work actions due today" value={String(workToday.length + invoicesReady)}
          sub={`${plural(workToday.filter((j) => j.follow_up_date && j.follow_up_date <= today).length, "follow-up")} · ${plural(invoicesReady, "invoice")} ready`} />
      </div>

      {reminders.length ? (
        <Card>
          <CardHeader title="Reminders" sub="Also in your inbox" action={<Link href="/inbox" className="text-sm text-accent">Inbox →</Link>} />
          <ul className="px-4 pb-3">
            {reminders.slice(0, 4).map((r) => (
              <li key={r.id} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                <Link href={r.href ?? "/inbox"} className={cx("min-w-0 truncate", !r.read_at && "font-medium")}>{r.title}</Link>
                <span className="shrink-0 text-xs text-muted">{r.stage.replace("_", " ")}</span>
              </li>
            ))}
            {reminders.length > 4 ? <li className="text-xs text-muted">+ {reminders.length - 4} more</li> : null}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Needs attention" sub="Overdue, today and the next 7 days" />
        <AttentionList items={attention} lookups={lookups} waitDays={profile.client_wait_days} limit={8} />
      </Card>

      <Card>
        <CardHeader title="Spending" sub="This month, by category" action={<Link href="/finance/spending" className="text-sm text-accent">All spending →</Link>} />
        <div className="grid gap-4 px-4 pb-4 md:grid-cols-2">
          <div>
            <div className="tabular mb-3 grid grid-cols-3 gap-2 text-xs">
              <Mini label="Today" value={inr(month.today)} />
              <Mini label="Last 7 days" value={inr(last7)} />
              <Mini label="This month" value={inr(month.total)} />
            </div>
            {month.count ? <SpendBars groups={month.byCategory} limit={5} /> : <p className="text-sm text-muted">No spending logged this month. Tap <strong>₹ Add spend</strong> after you pay for something.</p>}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted">Recent</p>
            <ul className="divide-y divide-line">
              {spends.slice(0, 6).map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{e.category}<span className="text-xs text-muted"> · {modeLabel(e.payment_mode)} · {fmtDate(e.spent_on, today)}{e.note ? ` · ${e.note}` : ""}</span></span>
                  <span className="tabular shrink-0 font-medium">{inr(e.amount)}</span>
                </li>
              ))}
              {!spends.length ? <li className="py-2 text-sm text-muted">Nothing yet.</li> : null}
            </ul>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Cash flow" sub="Last 7 days actual · next 30 days scheduled out vs expected in" />
          <div className="px-3 pb-3">
            <div className="tabular mb-3 grid grid-cols-2 gap-2 px-1 text-xs sm:grid-cols-4">
              <Mini label="Scheduled out" value={inr(cf.out)} />
              <Mini label="Invoices expected" value={inr(cf.inInvoices)} />
              <Mini label="Personal expected" value={inr(cf.inPersonal)} />
              <Mini label="Not yet invoiced" value={inr(cf.pipeline)} />
            </div>
            <CashFlowChart days={days} today={today} />
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Debt trend" sub="Recorded month-end balances" />
          <div className="px-3 pb-3"><DebtTrendChart snapshots={(snapsRes.data ?? []) as Snapshot[]} /></div>
        </Card>
      </div>
    </div>
  );
}

function Tile({ href, label, value, sub, tone }: { href: string; label: string; value: string; sub: string; tone?: "danger" }) {
  return (
    <Link href={href} className="rounded-2xl border border-line bg-surface p-4 transition active:scale-[0.99] hover:border-accent">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={cx("tabular mt-1 text-2xl font-semibold tracking-tight", tone === "danger" && "text-danger")}>{value}</p>
      <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>
    </Link>
  );
}
function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2.5 py-1.5">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
