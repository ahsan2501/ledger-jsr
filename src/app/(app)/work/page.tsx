import Link from "next/link";
import { JsrItemForm } from "@/components/entry-forms";
import { SheetButton } from "@/components/forms";
import { JsrTable } from "@/components/jsr-table";
import { Card, Empty, PageHeader, btn, cx } from "@/components/ui";
import { getInvoices, getJsr, getLookups, getProfile } from "@/lib/data";
import { inr, todayIST } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import { FILTERS, WorkTabs } from "./_tabs";
import { filterJsr } from "./_filter";

export const metadata = { title: "Work" };

export default async function WorkPage({ searchParams }: { searchParams: Promise<{ f?: string; client?: string }> }) {
  const sp = await searchParams;
  const f = FILTERS.some((x) => x.key === sp.f) ? sp.f! : "all";
  const { supabase } = await requireUser();
  const today = todayIST();
  const [items, profile, lookups, invoices] = await Promise.all([getJsr(supabase), getProfile(supabase), getLookups(supabase), getInvoices(supabase)]);
  const list = filterJsr(items, f, today, sp.client);
  const prioRank = { high: 0, medium: 1, low: 2 } as const;
  list.sort((a, b) => (a.action_due ?? a.follow_up_date ?? "9999").localeCompare(b.action_due ?? b.follow_up_date ?? "9999") || prioRank[a.priority] - prioRank[b.priority]);
  const readyInvoices = invoices.filter((i) => i.status === "ready" || i.status === "draft");
  const q = (k: string) => `/work?f=${k}${sp.client ? `&client=${sp.client}` : ""}`;
  return (
    <div>
      <PageHeader title="Work" sub="Job Status Report" action={
        <SheetButton className={btn.primary} label="Add item" title="Add JSR item"><JsrItemForm lookups={lookups} /></SheetButton>} />
      <WorkTabs active="/work" />
      <div className="-mx-4 mb-3 overflow-x-auto px-4">
        <div className="flex w-max gap-1.5">
          {FILTERS.map((x) => (
            <Link key={x.key} href={q(x.key)} className={cx("whitespace-nowrap rounded-full border px-3 py-1.5 text-sm",
              f === x.key ? "border-accent bg-accent text-accent-text" : "border-line bg-surface")}>
              {x.label} <span className="opacity-70">{filterJsr(items, x.key, today, sp.client).length}</span>
            </Link>
          ))}
        </div>
      </div>
      {lookups.clients.length > 1 ? (
        <form className="mb-3 flex items-center gap-2 text-sm">
          <input type="hidden" name="f" value={f} />
          <label className="text-muted" htmlFor="client">Client</label>
          <select id="client" name="client" defaultValue={sp.client ?? ""} className="rounded-lg border border-line bg-surface px-2 py-1">
            <option value="">All clients</option>
            {lookups.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className={btn.small}>Apply</button>
        </form>
      ) : null}
      {f === "invoice" && readyInvoices.length ? (
        <Card className="mb-3 p-3 text-sm">
          <p className="mb-1 font-medium">Draft / ready invoices</p>
          <ul className="space-y-1">
            {readyInvoices.map((i) => <li key={i.id}><Link className="text-accent" href={`/work/invoices/${i.id}`}>{i.invoice_number}</Link> · {i.client_name} · {inr(i.total)} · {i.status === "ready" ? "ready to send" : "draft"}</li>)}
          </ul>
        </Card>
      ) : null}
      {list.length ? <JsrTable items={list} today={today} waitDays={profile.client_wait_days} />
        : <Card><Empty title={items.length ? "Nothing matches this filter" : "Your JSR is empty"}>{items.length ? "Try another filter." : "Add clients and deliverables with the + button."}</Empty></Card>}
      <p className="mt-3 text-xs text-muted">Items waiting on a client for {profile.client_wait_days}+ days are flagged (change in Settings). Edits save as you go.</p>
    </div>
  );
}
