"use server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult } from "@/components/forms";
import { addDays, todayIST } from "@/lib/format";
import { act, amt, bool, date, int, must, req, reqAmt, str } from "./_util";

type R = Promise<ActionResult>;

// ---------------- Loans ----------------
export async function createLoan(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    const outstanding = amt(fd, "outstanding") ?? amt(fd, "original_principal") ?? 0;
    must(await sb.from("loans").insert({
      lender: req(fd, "lender", "Lender"),
      name: req(fd, "name", "Loan name"),
      emi_amount: amt(fd, "emi_amount"),
      first_due_date: date(fd, "next_due_date"),
      balance_baseline: outstanding,
      balance_baseline_on: date(fd, "outstanding_on") ?? todayIST(),
      balance_source: str(fd, "balance_source") === "lender" ? "lender" : "opening",
      original_principal: amt(fd, "original_principal"),
      interest_rate: amt(fd, "interest_rate"),
      tenure_months: int(fd, "tenure_months"),
      emis_remaining: int(fd, "emis_remaining"),
      notes: str(fd, "notes"),
    }));
    return "Loan added";
  });
}

export async function updateLoan(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    const id = req(fd, "id", "Loan");
    must(await sb.from("loans").update({
      lender: req(fd, "lender", "Lender"),
      name: req(fd, "name", "Loan name"),
      emi_amount: amt(fd, "emi_amount"),
      original_principal: amt(fd, "original_principal"),
      interest_rate: amt(fd, "interest_rate"),
      tenure_months: int(fd, "tenure_months"),
      emis_remaining: int(fd, "emis_remaining"),
      notes: str(fd, "notes"),
      status: str(fd, "status") === "closed" ? "closed" : "active",
    }).eq("id", id));
    const next = date(fd, "next_due_date");
    if (next && next !== str(fd, "prev_next_due_date")) {
      must(await sb.rpc("loan_reschedule_next", { p_loan: id, p_date: next }));
    }
  });
}

export async function updateLenderBalance(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    const bal = amt(fd, "balance");
    if (bal === null || bal < 0) throw new Error("Enter the balance the lender reports");
    must(await sb.rpc("update_lender_balance", {
      p_loan: req(fd, "loan_id", "Loan"), p_balance: bal, p_as_of: date(fd, "as_of"), p_notes: str(fd, "notes"),
    }));
  });
}

export async function recordLoanPayment(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    must(await sb.rpc("record_loan_payment", {
      p_loan: req(fd, "loan_id", "Loan"),
      p_amount: reqAmt(fd, "amount", "Amount"),
      p_paid_on: date(fd, "paid_on"),
      p_kind: str(fd, "kind") ?? "emi",
      p_installment: str(fd, "installment_id"),
      p_principal: amt(fd, "principal_part"),
      p_interest: amt(fd, "interest_part"),
      p_fees: amt(fd, "fees_part"),
      p_notes: str(fd, "notes"),
    }));
    return "Payment recorded";
  });
}

// ---------------- Cards ----------------
async function ensureCard(sb: SupabaseClient, fd: FormData): Promise<string> {
  const id = str(fd, "card_id");
  if (id && id !== "__new") return id;
  const card = must(await sb.from("credit_cards").insert({
    nickname: req(fd, "new_card_nickname", "Card nickname"),
    issuer: str(fd, "new_card_issuer") ?? "",
    last4: str(fd, "new_card_last4"),
  }).select("id").single());
  return card.id;
}

export async function createCard(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    must(await sb.from("credit_cards").insert({
      nickname: req(fd, "nickname", "Nickname"),
      issuer: str(fd, "issuer") ?? "",
      last4: str(fd, "last4"),
      credit_limit: amt(fd, "credit_limit"),
      statement_day: int(fd, "statement_day"),
      due_day: int(fd, "due_day"),
      notes: str(fd, "notes"),
    }));
  });
}

export async function updateCard(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    must(await sb.from("credit_cards").update({
      nickname: req(fd, "nickname", "Nickname"),
      issuer: str(fd, "issuer") ?? "",
      last4: str(fd, "last4"),
      credit_limit: amt(fd, "credit_limit"),
      statement_day: int(fd, "statement_day"),
      due_day: int(fd, "due_day"),
      active: !bool(fd, "inactive"),
      notes: str(fd, "notes"),
    }).eq("id", req(fd, "id", "Card")));
  });
}

export async function createStatement(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    const cardId = await ensureCard(sb, fd);
    const due = req(fd, "due_date", "Due date");
    must(await sb.from("card_statements").insert({
      card_id: cardId,
      statement_date: date(fd, "statement_date") ?? (due < todayIST() ? addDays(due, -20) : todayIST()),
      due_date: due,
      total_due: reqAmt(fd, "total_due", "Statement total"),
      minimum_due: amt(fd, "minimum_due") ?? 0,
      notes: str(fd, "notes"),
    }));
    return "Bill added";
  });
}

export async function updateStatement(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    must(await sb.from("card_statements").update({
      statement_date: req(fd, "statement_date", "Statement date"),
      due_date: req(fd, "due_date", "Due date"),
      total_due: reqAmt(fd, "total_due", "Statement total"),
      minimum_due: amt(fd, "minimum_due") ?? 0,
      notes: str(fd, "notes"),
    }).eq("id", req(fd, "id", "Statement")));
  });
}

export async function recordCardPayment(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    must(await sb.rpc("record_card_payment", {
      p_statement: req(fd, "statement_id", "Statement"),
      p_amount: reqAmt(fd, "amount", "Amount"),
      p_paid_on: date(fd, "paid_on"),
      p_notes: str(fd, "notes"),
    }));
    return "Payment recorded";
  });
}

// ---------------- Personal money ----------------
export async function createDebt(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    const total = reqAmt(fd, "original_amount", "Amount");
    const d = must(await sb.from("debts").insert({
      direction: str(fd, "direction") === "i_owe" ? "i_owe" : "owed_to_me",
      counterparty: req(fd, "counterparty", "Person or company"),
      reason: str(fd, "reason"),
      original_amount: total,
      due_date: date(fd, "due_date"),
      follow_up_date: date(fd, "follow_up_date"),
      started_on: date(fd, "started_on") ?? todayIST(),
      notes: str(fd, "notes"),
    }).select("id").single());
    const n = int(fd, "installments");
    const first = date(fd, "first_installment");
    if (n && n > 1) {
      if (!first) throw new Error("Pick the first instalment date");
      const each = Math.floor((total / n) * 100) / 100;
      const rows = Array.from({ length: n }, (_, i) => {
        const dt = new Date(first + "T00:00:00Z");
        dt.setUTCMonth(dt.getUTCMonth() + i);
        return { debt_id: d.id, due_date: dt.toISOString().slice(0, 10), amount: i === n - 1 ? Math.round((total - each * (n - 1)) * 100) / 100 : each };
      });
      must(await sb.from("debt_installments").insert(rows));
    }
    return "Saved";
  });
}

export async function updateDebt(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    must(await sb.from("debts").update({
      counterparty: req(fd, "counterparty", "Person or company"),
      reason: str(fd, "reason"),
      original_amount: reqAmt(fd, "original_amount", "Amount"),
      due_date: date(fd, "due_date"),
      follow_up_date: date(fd, "follow_up_date"),
      notes: str(fd, "notes"),
      closed: bool(fd, "closed"),
    }).eq("id", req(fd, "id", "Record")));
  });
}

export async function addDebtInstallment(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    must(await sb.from("debt_installments").insert({
      debt_id: req(fd, "debt_id", "Record"), due_date: req(fd, "due_date", "Due date"), amount: reqAmt(fd, "amount", "Amount"),
    }));
  });
}

export async function recordDebtPayment(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    must(await sb.rpc("record_debt_payment", {
      p_debt: req(fd, "debt_id", "Record"),
      p_amount: reqAmt(fd, "amount", "Amount"),
      p_paid_on: date(fd, "paid_on"),
      p_reference: str(fd, "reference"),
      p_notes: str(fd, "notes"),
    }));
    return "Recorded";
  });
}

export async function setFollowUpDate(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    const entity = req(fd, "entity", "Entity");
    const table = entity === "debt" ? "debts" : entity === "jsr_item" ? "jsr_items" : null;
    if (!table) throw new Error("Unsupported");
    must(await sb.from(table).update({ follow_up_date: date(fd, "follow_up_date") }).eq("id", req(fd, "id", "Record")));
  });
}

export async function logFollowUp(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    must(await sb.rpc("log_follow_up", {
      p_entity_type: req(fd, "entity", "Entity"),
      p_entity_id: req(fd, "id", "Record"),
      p_note: str(fd, "note"),
      p_next: date(fd, "next_follow_up"),
      p_channel: str(fd, "channel"),
    }));
    return "Follow-up logged";
  });
}

// ---------------- generic deletes ----------------
const DELETABLE = new Set([
  "loans", "loan_payments", "credit_cards", "card_statements", "card_payments", "debts", "debt_payments", "debt_installments",
  "clients", "projects", "jsr_items", "invoices", "invoice_receipts", "balance_snapshots",
]);
export async function deleteRow(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    const table = req(fd, "table", "Table");
    if (!DELETABLE.has(table)) throw new Error("Not allowed");
    must(await sb.from(table).delete().eq("id", req(fd, "id", "Record")));
    return "Deleted";
  });
}

export async function addSnapshot(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    must(await sb.from("balance_snapshots").upsert({
      snapshot_on: req(fd, "snapshot_on", "Month-end date"),
      loans_total: amt(fd, "loans_total") ?? 0,
      cards_total: amt(fd, "cards_total") ?? 0,
      owe_total: amt(fd, "owe_total") ?? 0,
      source: "manual",
    }, { onConflict: "owner_id,snapshot_on" }));
  });
}

export async function snapshotNow(_: ActionResult): R {
  return act(async (sb, user) => {
    must(await sb.rpc("take_balance_snapshot", { p_owner: user.id, p_on: todayIST(), p_source: "manual" }));
    return "Snapshot saved";
  });
}
