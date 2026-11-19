import Link from "next/link";
import { DebtForm, DebtPaymentForm, FollowUpForm, SetFollowUpForm } from "@/components/entry-forms";
import { CopyButton, SheetButton } from "@/components/forms";
import { Badge, Card, Empty, PageHeader, Tabs, btn } from "@/components/ui";
import { getDebts } from "@/lib/data";
import { debtWhatsApp } from "@/lib/messages";
import { fmtDate, inr, relDue, toNum, todayIST } from "@/lib/format";
import type { Debt } from "@/lib/types";
import { requireUser } from "@/lib/supabase/server";
import { FinanceTabs } from "../_tabs";

export const metadata = { title: "Money owed" };

export default async function DebtsPage({ searchParams }: { searchParams: Promise<{ dir?: string; show?: string }> }) {
  const sp = await searchParams;
  const dir = sp.dir === "i_owe" ? "i_owe" : "owed_to_me";
  const showSettled = sp.show === "settled";
  const { supabase } = await requireUser();
  const today = todayIST();
  const all = await getDebts(supabase);
  const list = all.filter((d) => d.direction === dir && (showSettled ? d.is_settled || d.closed : !d.is_settled && !d.closed))
    .sort((a, b) => (a.next_due_date ?? "9999").localeCompare(b.next_due_date ?? "9999"));
  const total = all.filter((d) => d.direction === dir && !d.closed).reduce((s, d) => s + toNum(d.amount_remaining), 0);
  return (
    <div>
      <PageHeader title="Money owed" sub={`${dir === "i_owe" ? "I owe" : "Owed to me"}: ${inr(total)} outstanding`}
        action={<SheetButton className={btn.primary} label="Add" title="Add money owed"><DebtForm today={today} defaultDirection={dir} /></SheetButton>} />
      <FinanceTabs active="/finance/debts" />
      <Tabs active={`/finance/debts?dir=${dir}${showSettled ? "&show=settled" : ""}`} items={[
        { href: "/finance/debts?dir=owed_to_me", label: "Owed to me" },
        { href: "/finance/debts?dir=i_owe", label: "I owe" },
        { href: `/finance/debts?dir=${dir}&show=settled`, label: "Settled" },
      ]} />
      {list.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((d) => <DebtCard key={d.id} d={d} today={today} />)}
        </div>
      ) : <Card><Empty title={showSettled ? "Nothing settled yet" : "Nothing outstanding"}>Personal money only — agency invoices live under Work → Invoices.</Empty></Card>}
    </div>
  );
}

function DebtCard({ d, today }: { d: Debt; today: string }) {
  const overdue = d.next_due_date && d.next_due_date < today && !d.is_settled;
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/finance/debts/${d.id}`} className="min-w-0">
          <p className="truncate font-semibold hover:underline">{d.counterparty}</p>
          <p className="truncate text-xs text-muted">{d.reason || "—"}</p>
        </Link>
        {d.is_settled ? <Badge tone="ok">Settled</Badge> : d.closed ? <Badge>Closed</Badge> : overdue ? <Badge tone="danger">Overdue</Badge> : null}
      </div>
      <div className="tabular mt-3 grid grid-cols-2 gap-2 text-sm">
        <div><p className="text-xs text-muted">Remaining</p><p className="font-semibold">{inr(d.amount_remaining)}</p><p className="text-[11px] text-muted">of {inr(d.original_amount)}</p></div>
        <div>
          <p className="text-xs text-muted">{d.installment_count ? "Next instalment" : "Due"}</p>
          <p className="font-semibold">{d.next_due_date ? fmtDate(d.next_due_date, today) : "No due date"}</p>
          <p className="text-[11px] text-muted">{d.next_due_date ? relDue(d.next_due_date, today) : d.follow_up_date ? `Follow up ${fmtDate(d.follow_up_date, today)}` : "Set a follow-up date"}</p>
        </div>
      </div>
      {!d.is_settled && !d.closed ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <SheetButton label={d.direction === "i_owe" ? "Record payment" : "Record receipt"} title={d.counterparty}>
            <DebtPaymentForm debtId={d.id} direction={d.direction} amount={toNum(d.next_due_amount ?? d.amount_remaining)} today={today} />
          </SheetButton>
          <SheetButton label="Follow up" title={`Follow up with ${d.counterparty}`}><FollowUpForm entity="debt" id={d.id} today={today} /></SheetButton>
          <SheetButton label={d.follow_up_date ? `Follow-up ${fmtDate(d.follow_up_date, today)}` : "Set follow-up"} title="Follow-up date">
            <SetFollowUpForm entity="debt" id={d.id} current={d.follow_up_date} today={today} />
          </SheetButton>
          <CopyButton text={debtWhatsApp(d, today)} label="WhatsApp" />
        </div>
      ) : null}
    </Card>
  );
}
