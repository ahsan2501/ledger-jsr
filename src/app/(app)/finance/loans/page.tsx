import Link from "next/link";
import { LoanForm, LoanPaymentForm } from "@/components/entry-forms";
import { SheetButton } from "@/components/forms";
import { Badge, Card, Empty, PageHeader, btn } from "@/components/ui";
import { fmtDate, inr, relDue, toNum, todayIST } from "@/lib/format";
import type { Loan } from "@/lib/types";
import { requireUser } from "@/lib/supabase/server";
import { FinanceTabs } from "../_tabs";

export const metadata = { title: "Loans" };

export default async function LoansPage() {
  const { supabase } = await requireUser();
  const today = todayIST();
  const { data } = await supabase.from("v_loans").select("*").order("status").order("next_due_date", { nullsFirst: false });
  const loans = (data ?? []) as Loan[];
  const active = loans.filter((l) => l.status === "active");
  return (
    <div>
      <PageHeader title="Loans" sub={`${active.length} active · ${inr(active.reduce((s, l) => s + toNum(l.outstanding), 0))} outstanding`}
        action={<SheetButton className={btn.primary} label="Add loan" title="Add loan"><LoanForm today={today} /></SheetButton>} />
      <FinanceTabs active="/finance/loans" />
      {loans.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {loans.map((l) => (
            <Card key={l.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/finance/loans/${l.id}`} className="min-w-0">
                  <p className="truncate font-semibold hover:underline">{l.name}</p>
                  <p className="text-xs text-muted">{l.lender}{l.interest_rate ? ` · ${toNum(l.interest_rate)}% p.a.` : ""}</p>
                </Link>
                {l.status === "closed" ? <Badge>Closed</Badge> : toNum(l.overdue_amount) > 0 ? <Badge tone="danger">{inr(l.overdue_amount)} overdue</Badge> : null}
              </div>
              <div className="tabular mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted">Outstanding</p><p className="font-semibold">{inr(l.outstanding)}</p>
                  <p className="text-[11px] text-muted">{l.balance_source === "lender" ? "lender-reported" : "estimate"} {fmtDate(l.balance_baseline_on, today)}</p></div>
                <div><p className="text-xs text-muted">Next EMI</p><p className="font-semibold">{l.next_due_date ? inr(l.next_amount_remaining) : "—"}</p>
                  <p className="text-[11px] text-muted">{l.next_due_date ? `${fmtDate(l.next_due_date, today)} · ${relDue(l.next_due_date, today)}` : "No schedule"}</p></div>
              </div>
              {l.status === "active" ? (
                <div className="mt-3 flex gap-2">
                  <SheetButton label="Record payment" title={`Pay ${l.name}`}>
                    <LoanPaymentForm loanId={l.id} amount={toNum(l.next_amount_remaining) || toNum(l.emi_amount) || undefined} today={today} />
                  </SheetButton>
                  <Link href={`/finance/loans/${l.id}`} className={btn.small}>Details</Link>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      ) : <Card><Empty title="No loans yet">Add a loan with its EMI and next due date to get reminders 5 days before each EMI.</Empty></Card>}
    </div>
  );
}
