"use client";
import { useState } from "react";
import { Sheet } from "./forms";
import { CardBillForm, DebtForm, InvoiceForm, JsrItemForm, LoanForm, QuickFollowUpForm } from "./entry-forms";
import { IconPlus } from "./icons";
import { SpendForm } from "./spend-form";
import type { Lookups } from "@/lib/data";

const TYPES = [
  { key: "spend", label: "Spending", sub: "Amount, category & payment mode" },
  { key: "card", label: "Credit card bill", sub: "Statement total, minimum & due date" },
  { key: "loan", label: "Loan", sub: "EMI, next due date & balance" },
  { key: "debt", label: "Money owed", sub: "I owe / owed to me" },
  { key: "jsr", label: "JSR item", sub: "Deliverable & next action" },
  { key: "invoice", label: "Invoice", sub: "Client invoice with GST / TDS" },
  { key: "follow", label: "Follow-up", sub: "Remind me to chase someone" },
] as const;
type Key = (typeof TYPES)[number]["key"];

export function QuickAdd({ lookups }: { lookups: Lookups }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<Key | null>(null);
  const close = () => { setOpen(false); setType(null); };
  const title = type ? `Add ${TYPES.find((t) => t.key === type)!.label.toLowerCase()}` : "Quick add";
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Quick add"
        className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-text shadow-lg active:scale-95 md:bottom-6 md:right-6"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 76px)" }}>
        <IconPlus width={26} height={26} />
      </button>
      <Sheet open={open} onClose={close} title={title}>
        {!type ? (
          <ul className="grid grid-cols-2 gap-2 pb-2">
            {TYPES.map((t) => (
              <li key={t.key}>
                <button onClick={() => setType(t.key)} className="h-full w-full rounded-2xl border border-line p-3 text-left active:bg-surface-2">
                  <span className="block text-sm font-medium">{t.label}</span>
                  <span className="mt-0.5 block text-xs text-muted">{t.sub}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="pb-2">
            <button className="mb-3 text-sm text-accent" onClick={() => setType(null)}>← All types</button>
            {type === "spend" && <SpendForm today={lookups.today} extraCategories={lookups.spendCategories} />}
            {type === "card" && <CardBillForm lookups={lookups} />}
            {type === "loan" && <LoanForm today={lookups.today} />}
            {type === "debt" && <DebtForm today={lookups.today} />}
            {type === "jsr" && <JsrItemForm lookups={lookups} />}
            {type === "invoice" && <InvoiceForm lookups={lookups} />}
            {type === "follow" && <QuickFollowUpForm lookups={lookups} />}
          </div>
        )}
      </Sheet>
    </>
  );
}
