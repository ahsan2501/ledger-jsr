import Link from "next/link";
import { SheetButton } from "@/components/forms";
import { DeleteButton } from "@/components/row-actions";
import { SpendBars } from "@/components/spend-bars";
import { SpendForm } from "@/components/spend-form";
import { Card, CardHeader, Empty, PageHeader, btn, cx } from "@/components/ui";
import { getLookups } from "@/lib/data";
import { fmtDate, fmtMonth, inr, todayIST } from "@/lib/format";
import { monthRange, shiftMonth, summariseSpending } from "@/lib/spending";
import { modeLabel, type Expense } from "@/lib/types";
import { requireUser } from "@/lib/supabase/server";
import { FinanceTabs } from "../_tabs";

export const metadata = { title: "Spending" };

export default async function SpendingPage({ searchParams }: { searchParams: Promise<{ m?: string; cat?: string; mode?: string }> }) {
  const sp = await searchParams;
  const today = todayIST();
  const thisMonth = today.slice(0, 7);
  const m = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : thisMonth;
  const { start, end } = monthRange(m);
  const { supabase } = await requireUser();
  const [{ data }, lookups] = await Promise.all([
    supabase.from("expenses").select("*").gte("spent_on", start).lte("spent_on", end)
      .order("spent_on", { ascending: false }).order("created_at", { ascending: false }),
    getLookups(supabase),
  ]);
  const all = (data ?? []) as Expense[];
  const list = all.filter((e) => (!sp.cat || e.category === sp.cat) && (!sp.mode || e.payment_mode === sp.mode));
  const s = summariseSpending(all, today);
  const shown = summariseSpending(list, today);
  const q = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const v = { m, cat: sp.cat, mode: sp.mode, ...o };
    for (const [k, x] of Object.entries(v)) if (x && !(k === "m" && x === thisMonth)) p.set(k, x);
    const qs = p.toString();
    return `/finance/spending${qs ? `?${qs}` : ""}`;
  };
  // group list by date
  const days = new Map<string, Expense[]>();
  for (const e of list) days.set(e.spent_on, [...(days.get(e.spent_on) ?? []), e]);

  return (
    <div>
      <PageHeader title="Spending" sub="Day-to-day spends by category and payment mode" action={
        <SheetButton className={btn.primary} label="₹ Add spend" title="Add spend"><SpendForm today={today} extraCategories={lookups.spendCategories} /></SheetButton>} />
      <FinanceTabs active="/finance/spending" />

      <div className="mb-3 flex items-center gap-2">
        <Link className={btn.small} href={q({ m: shiftMonth(m, -1) })} aria-label="Previous month">←</Link>
        <span className="min-w-24 text-center text-sm font-semibold">{fmtMonth(start)}</span>
        {m < thisMonth ? <Link className={btn.small} href={q({ m: shiftMonth(m, 1) })} aria-label="Next month">→</Link> : <span className={cx(btn.small, "opacity-40")}>→</span>}
        <a className="ml-auto text-sm text-accent" href="/api/export/csv?type=expenses">Export CSV</a>
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title={`${fmtMonth(start)} total: ${inr(s.total)}`} sub={`${s.count} spend${s.count === 1 ? "" : "s"}${m === thisMonth ? ` · today ${inr(s.today)} · last 7 days ${inr(s.last7)}` : ""}`} />
          <div className="px-4 pb-4">{s.count ? <SpendBars groups={s.byCategory} /> : <p className="text-sm text-muted">Nothing logged this month.</p>}</div>
        </Card>
        <Card>
          <CardHeader title="By payment mode" sub="Credit-card spends also show up later in that card's bill" />
          <div className="px-4 pb-4">{s.count ? <SpendBars groups={s.byMode} label={modeLabel} /> : <p className="text-sm text-muted">—</p>}</div>
        </Card>
      </div>

      {s.count ? (
        <div className="-mx-4 mb-3 overflow-x-auto px-4"><div className="flex w-max gap-1.5">
          <Link href={q({ cat: undefined, mode: undefined })} className={cx("rounded-full border px-3 py-1.5 text-sm", !sp.cat && !sp.mode ? "border-accent bg-accent text-accent-text" : "border-line bg-surface")}>All</Link>
          {s.byCategory.map((g) => (
            <Link key={g.key} href={q({ cat: g.key, mode: undefined })} className={cx("whitespace-nowrap rounded-full border px-3 py-1.5 text-sm", sp.cat === g.key ? "border-accent bg-accent text-accent-text" : "border-line bg-surface")}>{g.key}</Link>
          ))}
        </div></div>
      ) : null}

      <Card>
        <CardHeader title={sp.cat || sp.mode ? `${sp.cat ?? ""}${sp.mode ? ` · ${modeLabel(sp.mode)}` : ""}: ${inr(shown.total)}` : "All spends"} />
        {list.length ? (
          <div>
            {[...days.entries()].map(([day, xs]) => (
              <div key={day}>
                <p className="tabular flex justify-between bg-surface-2/60 px-4 py-1.5 text-xs font-medium text-muted">
                  <span>{fmtDate(day, today)}</span><span>{inr(xs.reduce((t, e) => t + Number(e.amount), 0))}</span>
                </p>
                <ul className="divide-y divide-line">
                  {xs.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{e.category}{e.is_demo ? <span className="text-xs text-muted"> · DEMO</span> : null}</p>
                        <p className="truncate text-xs text-muted">{modeLabel(e.payment_mode)}{e.note ? ` · ${e.note}` : ""}</p>
                      </div>
                      <span className="tabular text-sm font-semibold">{inr(e.amount)}</span>
                      <SheetButton label="Edit" title="Edit spend"><SpendForm today={today} extraCategories={lookups.spendCategories} expense={e} /></SheetButton>
                      <DeleteButton table="expenses" id={e.id} label="×" what="this spend" />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : <Empty title="No spends here">Use ₹ Add spend on Home, here, or in Quick add (+).</Empty>}
      </Card>
    </div>
  );
}
