"use client";
import { useState } from "react";
import { ActionForm, DateInput, Field, More, MoneyInput, TextInput } from "./forms";
import { createExpense, updateExpense } from "@/app/actions/finance";
import { PAYMENT_MODES, SPEND_CATEGORIES, type Expense } from "@/lib/types";
import { cx } from "./ui";

const chip = (on: boolean) => cx(
  "cursor-pointer rounded-full border px-3 py-1.5 text-sm select-none",
  on ? "border-accent bg-accent text-accent-text" : "border-line bg-surface",
);

/** Add (or edit) a spend. Date is filled in with today (India time); change it if needed. */
export function SpendForm({ today, extraCategories = [], expense }: { today: string; extraCategories?: string[]; expense?: Expense }) {
  const cats = [...SPEND_CATEGORIES.filter((c) => c !== "Other"), ...extraCategories, "Other"];
  const initialCat = expense ? (cats.includes(expense.category) ? expense.category : expense.category) : "Grocery";
  const [cat, setCat] = useState<string>(initialCat);
  const [mode, setMode] = useState(expense?.payment_mode ?? "upi");
  const allCats = cats.includes(initialCat) ? cats : [initialCat, ...cats];
  return (
    <ActionForm action={expense ? updateExpense : createExpense} submitLabel={expense ? "Save" : "Add spend"}>
      {expense ? <input type="hidden" name="id" value={expense.id} /> : null}
      <Field label="Amount">
        <MoneyInput name="amount" required autoFocus defaultValue={expense ? String(Number(expense.amount)) : undefined} className="text-lg" />
      </Field>

      <fieldset>
        <legend className="mb-1 text-sm font-medium">Category</legend>
        <div className="flex flex-wrap gap-1.5">
          {allCats.map((c) => (
            <label key={c} className={chip(cat === c)}>
              <input type="radio" name="category" value={c} checked={cat === c} onChange={() => setCat(c)} className="sr-only" />{c}
            </label>
          ))}
          <label className={chip(cat === "__new")}>
            <input type="radio" name="category" value="__new" checked={cat === "__new"} onChange={() => setCat("__new")} className="sr-only" />+ New
          </label>
        </div>
        {cat === "__new" ? <div className="mt-2"><TextInput name="new_category" placeholder="e.g. Pet care" maxLength={40} required aria-label="New category name" /></div> : null}
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm font-medium">Paid by</legend>
        <div className="flex flex-wrap gap-1.5">
          {PAYMENT_MODES.map((m) => (
            <label key={m.value} className={chip(mode === m.value)}>
              <input type="radio" name="payment_mode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} className="sr-only" />{m.label}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Date" hint="Filled in with today's date. Change it for an older spend.">
        <DateInput name="spent_on" defaultValue={expense?.spent_on ?? today} max={today} required />
      </Field>
      <More label="Add a note">
        <Field label="Note"><TextInput name="note" defaultValue={expense?.note ?? ""} placeholder="e.g. Big Bazaar, weekly stock-up" /></Field>
      </More>
    </ActionForm>
  );
}
