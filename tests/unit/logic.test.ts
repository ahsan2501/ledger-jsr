import { describe, expect, it } from "vitest";
import { addDays, diffDays, fmtDate, inr, inrCompact, parseAmount, relDue, todayIST } from "@/lib/format";
import { buildCashFlow, projectPipeline, summariseCashFlow } from "@/lib/cashflow";
import { buildAttention } from "@/lib/attention";
import { invoiceWhatsApp, jsrEmail, jsrWhatsApp } from "@/lib/messages";
import { weeklySummary } from "@/lib/summary";
import { toCsv } from "@/lib/csv";
import { nextNumber } from "@/lib/numbering";
import type { Invoice, JsrItem, Obligation } from "@/lib/types";

const T = "2026-11-20";

describe("INR formatting", () => {
  it("uses Indian digit grouping", () => {
    expect(inr(125000)).toBe("₹1,25,000");
    expect(inr(12500000)).toBe("₹1,25,00,000");
    expect(inr("42300.5")).toBe("₹42,300.50");
    expect(inr(0)).toBe("₹0");
  });
  it("compacts to lakh / crore", () => {
    expect(inrCompact(150000)).toBe("₹1.5L");
    expect(inrCompact(34000000)).toBe("₹3.4Cr");
    expect(inrCompact(45000)).toBe("₹45K");
  });
  it("parses typed amounts", () => {
    expect(parseAmount("₹1,25,000.50")).toBe(125000.5);
    expect(parseAmount("")).toBeNull();
    expect(() => parseAmount("abc")).toThrow();
  });
});

describe("IST dates", () => {
  it("today is computed in Asia/Kolkata", () => {
    // 19 Nov 2026 20:00 UTC = 20 Nov 01:30 IST
    expect(todayIST(new Date("2026-11-19T20:00:00Z"))).toBe("2026-11-20");
    expect(todayIST(new Date("2026-11-19T18:00:00Z"))).toBe("2026-11-19");
  });
  it("date helpers", () => {
    expect(addDays("2026-12-30", 5)).toBe("2027-01-04");
    expect(diffDays("2026-11-25", T)).toBe(5);
    expect(relDue("2026-11-25", T)).toBe("due in 5 days");
    expect(relDue("2026-11-18", T)).toBe("2 days overdue");
    expect(fmtDate("2026-11-25", T)).toBe("Wed, 25 Nov");
  });
});

const ob = (o: Partial<Obligation>): Obligation => ({
  owner_id: "u", source_type: "card_statement", source_id: "s1", parent_id: "c1", direction: "out", category: "card",
  title: "Card bill", counterparty: "Bank", due_date: "2026-11-25", amount_total: 1000, amount_paid: 0, amount_remaining: 1000,
  minimum_due: 100, minimum_covered: false, is_paid: false, href: "/x", is_demo: false, ...o,
});

describe("cash flow", () => {
  const inv = ob({ source_type: "invoice", source_id: "inv1", direction: "in", category: "agency_receivable", title: "Invoice INV-1", amount_total: 116000, amount_remaining: 66000, due_date: "2026-12-05" });
  it("counts each invoice exactly once, using the remaining net amount", () => {
    const days = buildCashFlow({ today: T, obligations: [inv, inv], actuals: [], pipeline: [] });
    const s = summariseCashFlow(days);
    expect(s.inInvoices).toBe(66000);
    expect(days.filter((d) => d.expectedInvoices > 0)).toHaveLength(1);
  });
  it("keeps agency and personal receivables separate", () => {
    const personal = ob({ source_type: "debt", source_id: "d1", direction: "in", category: "personal_receivable", amount_remaining: 5000, due_date: "2026-11-22" });
    const s = summariseCashFlow(buildCashFlow({ today: T, obligations: [inv, personal], actuals: [], pipeline: [] }));
    expect(s.inPersonal).toBe(5000);
    expect(s.inInvoices).toBe(66000);
  });
  it("places overdue items on today and actuals in the past", () => {
    const days = buildCashFlow({ today: T, obligations: [ob({ due_date: "2026-11-10" })], actuals: [{ date: "2026-11-18", direction: "out", amount: 500, label: "EMI" }], pipeline: [] });
    expect(days.find((d) => d.isToday)!.overdueOut).toBe(1000);
    expect(days.find((d) => d.date === "2026-11-18")!.actualOut).toBe(500);
    expect(days).toHaveLength(38);
  });
  it("project pipeline excludes amounts already invoiced; drafts are pipeline, not expected cash", () => {
    const pipe = projectPipeline(
      [{ id: "p1", name: "Retainer", client_name: "A", status: "active", expected_invoice_amount: 150000, expected_invoice_date: "2026-11-30" }],
      [{ id: "i1", project_id: "p1", total: 100000, tds_amount: 2000, cancelled: false, stage: "ready", invoice_number: "INV-9", client_name: "A", due_date: "2026-12-10", invoice_date: T }],
    );
    expect(pipe.find((p) => p.kind === "project")!.amount).toBe(50000);
    expect(pipe.find((p) => p.kind === "invoice_draft")!.amount).toBe(98000);
  });
});

const jsr = (j: Partial<JsrItem>): JsrItem => ({
  id: "j1", client_id: "c1", project_id: null, title: "KV options", status: "waiting_for_client", next_action: "Pick a route",
  next_owner: "client", action_due: null, follow_up_date: T, priority: "high", last_contact_on: "2026-11-14", waiting_since: "2026-11-14",
  billing: "pending", links: null, notes: null, is_demo: false, created_at: "", updated_at: "", client_name: "Acme", client_phone: null,
  client_email: null, client_contact: "Vikram Rao", project_name: "Winter", project_kind: "campaign", waiting_days: 6, is_active: true, ...j,
});

describe("needs attention", () => {
  it("groups by overdue / today / week with reasons and actions", () => {
    const items = buildAttention({
      today: T, clientWaitDays: 3, debts: [], invoices: [],
      obligations: [ob({ due_date: "2026-11-18", source_id: "a" }), ob({ due_date: "2026-11-25", source_id: "b", amount_paid: 400, amount_remaining: 600, minimum_covered: true })],
      jsr: [jsr({}), jsr({ id: "j2", status: "to_send", next_owner: "me", action_due: T, follow_up_date: null, waiting_days: null })],
    });
    expect(items.map((i) => i.group)).toEqual(["overdue", "today", "today", "week"]);
    const week = items.find((i) => i.group === "week")!;
    expect(week.reason).toContain("₹600 to pay");
    expect(week.reason).toContain("minimum covered");
    expect(week.action.type).toBe("record_card_payment");
    expect(items.find((i) => i.key === "jsr-due:j2")!.actionLabel).toBe("Mark sent");
    expect(items.find((i) => i.key === "jsr-fu:j1")!.reason).toContain("waiting on client 6 days");
  });
  it("ignores paid items and items beyond 7 days", () => {
    const items = buildAttention({ today: T, clientWaitDays: 3, debts: [], invoices: [], jsr: [],
      obligations: [ob({ amount_remaining: 0, is_paid: true }), ob({ source_id: "z", due_date: "2026-12-20" })] });
    expect(items).toHaveLength(0);
  });
});

describe("messages & summary", () => {
  it("builds WhatsApp and email follow-ups with client, item and date", () => {
    const j = jsr({ action_due: "2026-11-24" });
    expect(jsrWhatsApp(j, T)).toBe("Hi Vikram, just following up on KV options (Winter) we shared on Sat, 14 Nov — pick a route. Could we close this by Tue, 24 Nov? Thanks!");
    expect(jsrEmail(j, T)).toContain("Subject: Following up: KV options — Winter");
    const inv = { invoice_number: "INV-1", total: 118000, net_expected: 66000, received_bank: 50000, is_part_paid: true, due_date: "2026-11-15", invoice_date: "2026-10-16", project_name: null } as unknown as Invoice;
    expect(invoiceWhatsApp(inv, "Anjali", T)).toContain("₹66,000 is still pending");
  });
  it("weekly summary has the four sections", () => {
    const text = weeklySummary([jsr({}), jsr({ id: "x", status: "approved", next_owner: "me", billing: "to_invoice", waiting_days: null })], [], T);
    for (const h of ["PENDING DELIVERABLES", "WAITING ON CLIENT (1)", "INVOICES TO SEND (1)", "PAYMENTS TO CHASE (0)"]) expect(text).toContain(h);
  });
  it("CSV escapes and neutralises formulas", () => {
    const csv = toCsv([{ a: "=SUM(A1)", b: 'x,"y"', c: -5 }], [{ key: "a", label: "A" }, { key: "b", label: "B" }, { key: "c", label: "C" }]);
    expect(csv).toContain(`'=SUM(A1),"x,""y""",-5`);
  });
  it("suggests the next invoice number", () => {
    expect(nextNumber("INV-2026-041")).toBe("INV-2026-042");
    expect(nextNumber("A9")).toBe("A10");
  });
});

describe("month labels", () => {
  it("are unambiguous", async () => {
    const { fmtMonth } = await import("@/lib/format");
    expect(fmtMonth("2026-10-31")).toBe("Oct ’26");
  });
});
