"use server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult } from "@/components/forms";
import { addDays, todayIST } from "@/lib/format";
import { act, amt, date, must, req, reqAmt, str } from "./_util";

type R = Promise<ActionResult>;

async function ensureClient(sb: SupabaseClient, fd: FormData): Promise<string> {
  const id = str(fd, "client_id");
  if (id && id !== "__new") return id;
  const c = must(await sb.from("clients").insert({ name: req(fd, "new_client_name", "Client name") }).select("id").single());
  return c.id;
}

// ---------------- Clients & projects ----------------
export async function createClientRecord(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    must(await sb.from("clients").insert({
      name: req(fd, "name", "Client name"), contact_name: str(fd, "contact_name"),
      phone: str(fd, "phone"), email: str(fd, "email"), notes: str(fd, "notes"),
    }));
  });
}
export async function updateClientRecord(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    must(await sb.from("clients").update({
      name: req(fd, "name", "Client name"), contact_name: str(fd, "contact_name"),
      phone: str(fd, "phone"), email: str(fd, "email"), notes: str(fd, "notes"), archived: fd.get("archived") === "on",
    }).eq("id", req(fd, "id", "Client")));
  });
}
export async function createProject(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    must(await sb.from("projects").insert({
      client_id: await ensureClient(sb, fd), name: req(fd, "name", "Project name"), kind: str(fd, "kind") ?? "campaign",
      expected_invoice_amount: amt(fd, "expected_invoice_amount"), expected_invoice_date: date(fd, "expected_invoice_date"),
      notes: str(fd, "notes"),
    }));
  });
}
export async function updateProject(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    must(await sb.from("projects").update({
      name: req(fd, "name", "Project name"), kind: str(fd, "kind") ?? "campaign", status: str(fd, "status") ?? "active",
      expected_invoice_amount: amt(fd, "expected_invoice_amount"), expected_invoice_date: date(fd, "expected_invoice_date"),
      notes: str(fd, "notes"),
    }).eq("id", req(fd, "id", "Project")));
  });
}

// ---------------- JSR items ----------------
export async function createJsrItem(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    const clientId = await ensureClient(sb, fd);
    const projectId = str(fd, "project_id");
    must(await sb.from("jsr_items").insert({
      client_id: clientId,
      project_id: projectId && projectId !== "__none" ? projectId : null,
      title: req(fd, "title", "Deliverable"),
      status: str(fd, "status") ?? "to_send",
      next_action: str(fd, "next_action"),
      next_owner: str(fd, "next_owner") ?? "me",
      action_due: date(fd, "action_due"),
      follow_up_date: date(fd, "follow_up_date"),
      priority: str(fd, "priority") ?? "medium",
      billing: str(fd, "billing") ?? "pending",
      links: str(fd, "links"),
      notes: str(fd, "notes"),
    }));
    return "Added to JSR";
  });
}

export async function updateJsrItem(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    const projectId = str(fd, "project_id");
    must(await sb.from("jsr_items").update({
      title: req(fd, "title", "Deliverable"),
      project_id: projectId && projectId !== "__none" ? projectId : null,
      status: req(fd, "status", "Status"),
      next_action: str(fd, "next_action"),
      next_owner: req(fd, "next_owner", "Next move"),
      action_due: date(fd, "action_due"),
      follow_up_date: date(fd, "follow_up_date"),
      priority: req(fd, "priority", "Priority"),
      last_contact_on: date(fd, "last_contact_on"),
      billing: req(fd, "billing", "Billing"),
      links: str(fd, "links"),
      notes: str(fd, "notes"),
    }).eq("id", req(fd, "id", "Item")));
  });
}

const INLINE_FIELDS = new Set(["status", "next_action", "next_owner", "action_due", "follow_up_date", "priority", "billing", "title"]);
/** Inline edit from the JSR table. */
export async function updateJsrField(id: string, field: string, value: string | null): R {
  return act(async (sb) => {
    if (!INLINE_FIELDS.has(field)) throw new Error("Field not editable");
    const v = value === "" ? null : value;
    if ((field === "title" || field === "status" || field === "next_owner" || field === "priority" || field === "billing") && !v) throw new Error("Required");
    must(await sb.from("jsr_items").update({ [field]: v }).eq("id", id));
  });
}

export async function markSent(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    const id = req(fd, "id", "Item");
    must(await sb.from("jsr_items").update({
      status: "sent_to_client",
      follow_up_date: date(fd, "follow_up_date"),
      next_action: str(fd, "next_action") ?? undefined,
    }).eq("id", id));
    const note = str(fd, "note");
    if (note) must(await sb.from("activities").insert({ entity_type: "jsr_item", entity_id: id, kind: "note", note }));
    return "Marked sent";
  });
}

export async function markApproved(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    must(await sb.from("jsr_items").update({ status: "approved" }).eq("id", req(fd, "id", "Item")));
    return "Approved";
  });
}

export async function setJsrStatus(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    must(await sb.from("jsr_items").update({ status: req(fd, "status", "Status") }).eq("id", req(fd, "id", "Item")));
  });
}

export async function addNote(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    must(await sb.from("activities").insert({
      entity_type: req(fd, "entity", "Entity"), entity_id: req(fd, "id", "Record"), kind: "note", note: req(fd, "note", "Note"),
    }));
  });
}

// ---------------- Invoices ----------------
export async function createInvoice(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    const amount = reqAmt(fd, "amount", "Amount");
    const gstRate = amt(fd, "gst_rate");
    const tdsRate = amt(fd, "tds_rate");
    const gstAmount = amt(fd, "gst_amount") ?? (gstRate ? Math.round(amount * gstRate) / 100 : null);
    const tdsAmount = amt(fd, "tds_amount") ?? (tdsRate ? Math.round(amount * tdsRate) / 100 : null);
    const stage = str(fd, "stage") ?? "draft";
    const invoiceDate = date(fd, "invoice_date") ?? todayIST();
    const projectId = str(fd, "project_id");
    const inv = must(await sb.from("invoices").insert({
      client_id: await ensureClient(sb, fd),
      project_id: projectId && projectId !== "__none" ? projectId : null,
      jsr_item_id: str(fd, "jsr_item_id"),
      invoice_number: req(fd, "invoice_number", "Invoice number"),
      invoice_date: invoiceDate,
      due_date: date(fd, "due_date") ?? addDays(invoiceDate, 30),
      amount, gst_rate: gstRate, gst_amount: gstAmount, tds_rate: tdsRate, tds_amount: tdsAmount,
      stage: stage === "sent" ? "draft" : stage,
      notes: str(fd, "notes"),
    }).select("id").single());
    if (stage === "sent") must(await sb.rpc("mark_invoice_sent", { p_invoice: inv.id, p_sent_on: date(fd, "sent_on") }));
    return "Invoice saved";
  });
}

export async function updateInvoice(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    const amount = reqAmt(fd, "amount", "Amount");
    const gstRate = amt(fd, "gst_rate");
    const tdsRate = amt(fd, "tds_rate");
    must(await sb.from("invoices").update({
      invoice_number: req(fd, "invoice_number", "Invoice number"),
      invoice_date: req(fd, "invoice_date", "Invoice date"),
      due_date: date(fd, "due_date"),
      amount, gst_rate: gstRate, tds_rate: tdsRate,
      gst_amount: amt(fd, "gst_amount") ?? (gstRate ? Math.round(amount * gstRate) / 100 : null),
      tds_amount: amt(fd, "tds_amount") ?? (tdsRate ? Math.round(amount * tdsRate) / 100 : null),
      sent_on: date(fd, "sent_on"),
      notes: str(fd, "notes"),
      cancelled: fd.get("cancelled") === "on",
    }).eq("id", req(fd, "id", "Invoice")));
  });
}

export async function markInvoiceSent(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    must(await sb.rpc("mark_invoice_sent", { p_invoice: req(fd, "id", "Invoice"), p_sent_on: date(fd, "sent_on") }));
    return "Invoice marked sent";
  });
}

export async function markInvoiceReady(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    must(await sb.from("invoices").update({ stage: "ready" }).eq("id", req(fd, "id", "Invoice")).eq("stage", "draft"));
  });
}

export async function recordReceipt(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    must(await sb.rpc("record_invoice_receipt", {
      p_invoice: req(fd, "invoice_id", "Invoice"),
      p_bank: amt(fd, "bank_amount") ?? 0,
      p_tds: amt(fd, "tds_amount") ?? 0,
      p_received_on: date(fd, "received_on"),
      p_reference: str(fd, "reference"),
      p_notes: str(fd, "notes"),
    }));
    return "Receipt recorded";
  });
}
