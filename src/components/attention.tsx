import Link from "next/link";
import type { AttentionItem } from "@/lib/attention";
import type { Lookups } from "@/lib/data";
import { inr } from "@/lib/format";
import { InlineAction, SheetButton } from "./forms";
import {
  CardPaymentForm, DebtPaymentForm, FollowUpForm, InvoiceForm, LoanPaymentForm, MarkSentForm, ReceiptForm,
} from "./entry-forms";
import { markInvoiceSent } from "@/app/actions/work";
import { Badge, btn, Empty } from "./ui";

const GROUPS = [
  { key: "overdue", label: "Overdue", tone: "danger" as const },
  { key: "today", label: "Today", tone: "warn" as const },
  { key: "week", label: "Next 7 days", tone: "info" as const },
];
const AREA = { pay: "Pay", receive: "Receive", work: "Work" } as const;

export function AttentionAction({ item, lookups, waitDays }: { item: AttentionItem; lookups: Lookups; waitDays: number }) {
  const a = item.action;
  const today = lookups.today;
  const cls = btn.small;
  switch (a.type) {
    case "record_loan_payment":
      return <SheetButton className={cls} label={item.actionLabel} title="Record loan payment"><LoanPaymentForm loanId={a.id} amount={a.amount} today={today} /></SheetButton>;
    case "record_card_payment":
      return <SheetButton className={cls} label={item.actionLabel} title="Record card payment"><CardPaymentForm statementId={a.id} amount={a.amount} today={today} /></SheetButton>;
    case "record_debt_payment":
      return <SheetButton className={cls} label={item.actionLabel} title={item.actionLabel}><DebtPaymentForm debtId={a.id} direction={a.direction} amount={a.amount} today={today} /></SheetButton>;
    case "record_receipt":
      return <SheetButton className={cls} label={item.actionLabel} title="Record receipt"><ReceiptForm invoiceId={a.id} amount={a.amount} today={today} /></SheetButton>;
    case "mark_invoice_sent":
      return <InlineAction action={markInvoiceSent} fields={{ id: a.id }} label="Mark sent" className={cls} />;
    case "mark_sent":
      return <SheetButton className={cls} label="Mark sent" title="Mark sent to client"><MarkSentForm id={a.id} today={today} waitDays={waitDays} /></SheetButton>;
    case "follow_up":
      return <SheetButton className={cls} label="Follow up" title="Log follow-up"><FollowUpForm entity={a.entity} id={a.id} today={today} /></SheetButton>;
    case "create_invoice":
      return <SheetButton className={cls} label="Create invoice" title="New invoice"><InvoiceForm lookups={lookups} clientId={a.clientId} projectId={a.projectId} jsrItemId={a.jsrItemId} /></SheetButton>;
    default:
      return <Link className={cls} href={a.href}>{item.actionLabel}</Link>;
  }
}

export function AttentionList({ items, lookups, waitDays, limit }: { items: AttentionItem[]; lookups: Lookups; waitDays: number; limit?: number }) {
  if (!items.length) return <Empty title="All clear">Nothing overdue, due today or in the next 7 days.</Empty>;
  return (
    <div className="divide-y divide-line">
      {GROUPS.map((g) => {
        const list = items.filter((i) => i.group === g.key);
        if (!list.length) return null;
        const shown = limit ? list.slice(0, limit) : list;
        return (
          <div key={g.key} className="py-1">
            <div className="flex items-center gap-2 px-4 pt-2 pb-1">
              <Badge tone={g.tone}>{g.label}</Badge>
              <span className="text-xs text-muted">{list.length}</span>
            </div>
            <ul>
              {shown.map((it) => (
                <li key={it.key} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link href={it.href} className="block truncate text-sm font-medium hover:underline">{it.title}</Link>
                    <p className="truncate text-xs text-muted"><span className="font-medium">{AREA[it.area]}</span> · {it.reason}</p>
                  </div>
                  {it.amount !== undefined ? <span className="tabular hidden text-sm font-medium sm:inline">{inr(it.amount)}</span> : null}
                  <div className="shrink-0"><AttentionAction item={it} lookups={lookups} waitDays={waitDays} /></div>
                </li>
              ))}
              {limit && list.length > limit ? (
                <li className="px-4 pb-2 text-xs text-muted">+ {list.length - limit} more</li>
              ) : null}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
