import Link from "next/link";
import { CardBillForm, CardForm, CardPaymentForm } from "@/components/entry-forms";
import { SheetButton } from "@/components/forms";
import { Card, Empty, PageHeader, btn } from "@/components/ui";
import { StatementBadge } from "@/components/statement-badge";
import { getLookups } from "@/lib/data";
import { fmtDate, inr, relDue, toNum, todayIST } from "@/lib/format";
import type { CardStatement } from "@/lib/types";
import { requireUser } from "@/lib/supabase/server";
import { FinanceTabs } from "../_tabs";

export const metadata = { title: "Credit cards" };

export default async function CardsPage() {
  const { supabase } = await requireUser();
  const today = todayIST();
  const [{ data: cards }, { data: stmts }, lookups] = await Promise.all([
    supabase.from("credit_cards").select("*").order("active", { ascending: false }).order("nickname"),
    supabase.from("v_card_statements").select("*").order("due_date", { ascending: false }),
    getLookups(supabase),
  ]);
  const statements = (stmts ?? []) as CardStatement[];
  return (
    <div>
      <PageHeader title="Credit cards" sub="Each monthly statement is tracked separately"
        action={<div className="flex gap-2">
          <SheetButton className={btn.secondary} label="Add card" title="Add card"><CardForm /></SheetButton>
          <SheetButton className={btn.primary} label="Add bill" title="Add card bill"><CardBillForm lookups={lookups} /></SheetButton>
        </div>} />
      <FinanceTabs active="/finance/cards" />
      {(cards ?? []).length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {(cards ?? []).map((c) => {
            const mine = statements.filter((s) => s.card_id === c.id);
            const current = mine.find((s) => !s.is_paid) ?? mine[0];
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/finance/cards/${c.id}`} className="min-w-0">
                    <p className="truncate font-semibold hover:underline">{c.nickname}{c.last4 ? <span className="font-normal text-muted"> ·· {c.last4}</span> : null}</p>
                    <p className="text-xs text-muted">{c.issuer}{c.credit_limit ? ` · limit ${inr(c.credit_limit)}` : ""}{!c.active ? " · inactive" : ""}</p>
                  </Link>
                  {current ? <StatementBadge s={current} today={today} /> : null}
                </div>
                {current ? (
                  <>
                    <div className="tabular mt-3 grid grid-cols-3 gap-2 text-sm">
                      <div><p className="text-xs text-muted">Statement</p><p className="font-semibold">{inr(current.total_due)}</p></div>
                      <div><p className="text-xs text-muted">Minimum</p><p className="font-semibold">{inr(current.minimum_due)}</p></div>
                      <div><p className="text-xs text-muted">Remaining</p><p className="font-semibold">{inr(current.amount_remaining)}</p></div>
                    </div>
                    <p className="mt-1 text-xs text-muted">Due {fmtDate(current.due_date, today)} · {current.is_paid ? "settled" : relDue(current.due_date, today)}</p>
                    <div className="mt-3 flex gap-2">
                      {!current.is_paid ? (
                        <SheetButton label="Record payment" title={`Pay ${c.nickname}`}>
                          <CardPaymentForm statementId={current.id} amount={toNum(current.amount_remaining)} minimum={current.minimum_covered ? undefined : toNum(current.minimum_due) - toNum(current.amount_paid)} today={today} />
                        </SheetButton>
                      ) : null}
                      <SheetButton label="New statement" title={`New ${c.nickname} statement`}><CardBillForm lookups={lookups} cardId={c.id} /></SheetButton>
                    </div>
                  </>
                ) : (
                  <div className="mt-3"><SheetButton label="Add first statement" title={`${c.nickname} statement`}><CardBillForm lookups={lookups} cardId={c.id} /></SheetButton></div>
                )}
              </Card>
            );
          })}
        </div>
      ) : <Card><Empty title="No cards yet">Add a card bill — you&apos;ll get a reminder 5 days before it&apos;s due. Only store a nickname and (optionally) the last four digits.</Empty></Card>}
    </div>
  );
}
