import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import { todayIST } from "@/lib/format";

const c = (spec: string) => spec.split(",").map((s) => { const [key, label] = s.split(":"); return { key, label: label ?? key }; });

const EXPORTS: Record<string, { view: string; cols: ReturnType<typeof c>; order: string }> = {
  obligations: { view: "v_obligations", order: "due_date", cols: c("direction:Direction,category:Category,title:Item,counterparty:Counterparty,due_date:Due date,amount_total:Total (INR),amount_paid:Paid (INR),amount_remaining:Remaining (INR),is_paid:Paid in full") },
  loans: { view: "v_loans", order: "name", cols: c("lender:Lender,name:Loan,original_principal:Original principal,outstanding:Outstanding,balance_source:Balance source,balance_baseline_on:Balance as of,interest_rate:Rate %,emi_amount:EMI,next_due_date:Next due,tenure_months:Tenure (months),status:Status,notes:Notes") },
  cards: { view: "v_card_statements", order: "due_date", cols: c("nickname:Card,issuer:Issuer,last4:Last 4,statement_date:Statement date,due_date:Due date,total_due:Total due,minimum_due:Minimum due,amount_paid:Paid,amount_remaining:Remaining,minimum_covered:Minimum covered,payment_status:Status") },
  debts: { view: "v_debts", order: "created_at", cols: c("direction:Direction,counterparty:Person / company,reason:Reason,original_amount:Original,amount_paid:Paid,amount_remaining:Remaining,due_date:Agreed due,next_due_date:Next due,follow_up_date:Follow-up,closed:Closed,notes:Notes") },
  jsr: { view: "v_jsr_items", order: "client_name", cols: c("client_name:Client,project_name:Project,title:Deliverable,status:Status,next_action:Next action,next_owner:Next move,action_due:Action due,follow_up_date:Follow-up,priority:Priority,last_contact_on:Last contact,waiting_days:Waiting days,billing:Billing,links:Links,notes:Notes") },
  expenses: { view: "expenses", order: "spent_on", cols: c("spent_on:Date,category:Category,amount:Amount (INR),payment_mode:Paid by,note:Note") },
  invoices: { view: "v_invoices", order: "invoice_date", cols: c("invoice_number:Invoice no,client_name:Client,project_name:Project,invoice_date:Invoice date,due_date:Due date,amount:Taxable amount,gst_amount:GST,total:Total,tds_amount:TDS expected,received_bank:Received (bank),tds_confirmed:TDS confirmed,net_expected:Net still expected,status:Status,sent_on:Sent on,notes:Notes") },
};

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") ?? "";
  const ex = EXPORTS[type];
  if (!ex) return NextResponse.json({ error: "Unknown export" }, { status: 400 });
  const sb = await createClient();
  const { data, error } = await sb.from(ex.view).select("*").order(ex.order);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return new NextResponse(toCsv(data ?? [], ex.cols), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${type}-${todayIST()}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
