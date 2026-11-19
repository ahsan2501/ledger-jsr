import "server-only";
import { revalidatePath } from "next/cache";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { requireUser } from "@/lib/supabase/server";
import { parseAmount } from "@/lib/format";
import type { ActionResult } from "@/components/forms";

export async function act(fn: (sb: SupabaseClient, user: User) => Promise<string | void>): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const message = await fn(supabase, user);
    revalidatePath("/", "layout");
    return { ok: true, message: message || undefined };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

function friendly(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (/duplicate key.*invoice_number/i.test(msg)) return "That invoice number already exists.";
  if (/duplicate key.*card_statements/i.test(msg)) return "A statement with that date already exists for this card.";
  if (/check constraint.*minimum_due/i.test(msg) || /card_statements_check/.test(msg)) return "Minimum due can't be more than the total, and the due date must be after the statement date.";
  if (/loan_payments_check/.test(msg)) return "Principal + interest + fees can't be more than the payment amount.";
  if (/last4/.test(msg)) return "Last four digits must be exactly 4 numbers.";
  return msg.replace(/^.*?ERROR:\s*/, "");
}

/** Throw on Supabase errors; return data. */
export function must<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<T>;
}

export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
export const req = (fd: FormData, k: string, label: string) => {
  const v = str(fd, k);
  if (!v) throw new Error(`${label} is required`);
  return v;
};
export const date = (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`Invalid date: ${v}`);
  return v;
};
export const amt = (fd: FormData, k: string) => parseAmount(fd.get(k));
export const reqAmt = (fd: FormData, k: string, label: string) => {
  const v = amt(fd, k);
  if (v === null || v <= 0) throw new Error(`${label} must be more than zero`);
  return v;
};
export const int = (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (v === null) return null;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) throw new Error(`Invalid number: ${v}`);
  return n;
};
export const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
