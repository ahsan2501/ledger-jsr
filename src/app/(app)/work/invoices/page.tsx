import Link from "next/link";
import { InvoiceForm, ReceiptForm } from "@/components/entry-forms";
import { InlineAction, SheetButton } from "@/components/forms";
import { InvoiceBadge } from "@/components/invoice-badge";
import { Card, Empty, PageHeader, Stat, btn, cx } from "@/components/ui";
import { markInvoiceSent } from "@/app/actions/work";
import { getInvoices, getLookups } from "@/lib/data";
import { fmtDate, inr, relDue, toNum, todayIST } from "@/lib/format";
import { INVOICE_STATUS_LABEL } from "@/lib/types";
import { requireUser } from "@/lib/supabase/server";
import { WorkTabs } from "../_tabs";

export const metadata = { title: "Invoices" };
const FILTERS = ["open", "draft", "ready", "sent", "part_paid", "overdue", "paid", "all"] as const;

export default async function Invoices({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const sp = await searchParams;
  const s = (FILTERS as readonly string[]).includes(sp.s ?? "") ? sp.s! : "open";
  const { supabase } = await requireUser();
  const today = todayIST();
  const [all, lookups] = await Promise.all([getInvoices(supabase), getLookups(supabase)]);
  const list = all.filter((i) => s === "all" ? true : s === "open" ? !["paid", "cancelled"].includes(i.status) : i.status === s);
  const expected = all.filter((i) => ["sent", "part_paid", "overdue"].includes(i.status)).reduce((t, i) => t + toNum(i.net_expected), 0);
  const overdue = all.filter((i) => i.status === "overdue").reduce((t, i) => t + toNum(i.net_expected), 0);
  const toSend = all.filter((i) => i.status === "draft" || i.status === "ready");
  const tdsPending = all.filter((i) => !i.cancelled).reduce((t, i) => t + toNum(i.tds_pending), 0);
  return (
    <div>
      <PageHeader title="Invoices" sub="Agency receivables — kept separate from personal money" action={
        <div className="flex gap-2">
          <a href="/api/export/csv?type=invoices" className={btn.secondary}>CSV</a>
          <SheetButton className={btn.primary} label="New invoice" title="New invoice"><InvoiceForm lookups={lookups} /></SheetButton>
        </div>} />
      <WorkTabs active="/work/invoices" />
      <Card className="mb-3 grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <Stat label="Net cash still expected" value={inr(expected)} sub="Sent invoices, after receipts & TDS" />
        <Stat label="Overdue" value={inr(overdue)} tone={overdue ? "danger" : undefined} />
        <Stat label="To send" value={String(toSend.length)} sub={inr(toSend.reduce((t, i) => t + toNum(i.total), 0))} />
        <Stat label="TDS awaiting confirmation" value={inr(tdsPending)} />
      </Card>
      <div className="-mx-4 mb-3 overflow-x-auto px-4"><div className="flex w-max gap-1.5">
        {FILTERS.map((f) => (
          <Link key={f} href={`/work/invoices?s=${f}`} className={cx("rounded-full border px-3 py-1.5 text-sm", s === f ? "border-accent bg-accent text-accent-text" : "border-line bg-surface")}>
            {f === "open" ? "Open" : f === "all" ? "All" : INVOICE_STATUS_LABEL[f]}
          </Link>
        ))}
      </div></div>
      <Card>
        {list.length ? (
          <ul className="divide-y divide-line">
            {list.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><Link href={`/work/invoices/${i.id}`} className="font-medium hover:underline">{i.invoice_number}</Link><InvoiceBadge s={i.status} /></div>
                  <p className="truncate text-xs text-muted">{i.client_name}{i.project_name ? ` · ${i.project_name}` : ""} · {fmtDate(i.invoice_date, today)}{i.due_date ? ` · ${relDue(i.due_date, today)}` : ""}</p>
                </div>
                <div className="tabular text-right">
                  <p className="text-sm font-semibold">{inr(i.total)}</p>
                  {["sent", "part_paid", "overdue"].includes(i.status) ? <p className="text-xs text-muted">{inr(i.net_expected)} expected</p> : null}
                </div>
                <div className="flex gap-1.5">
                  {i.status === "draft" || i.status === "ready" ? <InlineAction action={markInvoiceSent} fields={{ id: i.id }} label="Mark sent" /> : null}
                  {["sent", "part_paid", "overdue"].includes(i.status) ? (
                    <SheetButton label="Record receipt" title={`Receipt for ${i.invoice_number}`}><ReceiptForm invoiceId={i.id} amount={toNum(i.net_expected)} tdsPending={toNum(i.tds_pending)} today={today} /></SheetButton>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : <Empty title="No invoices here" />}
      </Card>
    </div>
  );
}
