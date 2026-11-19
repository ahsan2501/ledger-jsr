// Row shapes for the views/tables the UI reads. Numerics arrive as numbers or strings; use toNum().
type Num = number | string;

export type Obligation = {
  owner_id: string;
  source_type: "loan_installment" | "card_statement" | "debt" | "debt_installment" | "invoice";
  source_id: string;
  parent_id: string;
  direction: "out" | "in";
  category: "loan" | "card" | "personal_payable" | "personal_receivable" | "agency_receivable";
  title: string;
  counterparty: string;
  due_date: string | null;
  amount_total: Num;
  amount_paid: Num;
  amount_remaining: Num;
  minimum_due: Num | null;
  minimum_covered: boolean | null;
  is_paid: boolean;
  href: string;
  is_demo: boolean;
};

export type JsrStatus =
  | "to_send" | "in_progress" | "internal_review" | "sent_to_client" | "waiting_for_client"
  | "revisions_needed" | "approved" | "delivered" | "closed";

export const JSR_STATUSES: { value: JsrStatus; label: string }[] = [
  { value: "to_send", label: "To send" },
  { value: "in_progress", label: "In progress" },
  { value: "internal_review", label: "Internal review" },
  { value: "sent_to_client", label: "Sent to client" },
  { value: "waiting_for_client", label: "Waiting for client" },
  { value: "revisions_needed", label: "Revisions needed" },
  { value: "approved", label: "Approved" },
  { value: "delivered", label: "Delivered" },
  { value: "closed", label: "Closed" },
];
export const statusLabel = (s: string) => JSR_STATUSES.find((x) => x.value === s)?.label ?? s;

export const OWNERS = [
  { value: "me", label: "Me" },
  { value: "team", label: "My team" },
  { value: "client", label: "Client" },
] as const;
export const PRIORITIES = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;
export const BILLING = [
  { value: "pending", label: "Bill later" },
  { value: "to_invoice", label: "Invoice to send" },
  { value: "invoiced", label: "Invoiced" },
  { value: "na", label: "Not billable" },
] as const;
export const PROJECT_KINDS = [
  { value: "retainer", label: "Retainer" },
  { value: "campaign", label: "Campaign" },
  { value: "pitch", label: "Pitch" },
  { value: "production", label: "Creative production" },
  { value: "servicing", label: "Client servicing" },
  { value: "other", label: "Other" },
] as const;

export type JsrItem = {
  id: string;
  client_id: string;
  project_id: string | null;
  title: string;
  status: JsrStatus;
  next_action: string | null;
  next_owner: "me" | "team" | "client";
  action_due: string | null;
  follow_up_date: string | null;
  priority: "high" | "medium" | "low";
  last_contact_on: string | null;
  waiting_since: string | null;
  billing: "na" | "pending" | "to_invoice" | "invoiced";
  links: string | null;
  notes: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  client_contact: string | null;
  project_name: string | null;
  project_kind: string | null;
  waiting_days: number | null;
  is_active: boolean;
};

export type Invoice = {
  id: string;
  client_id: string;
  project_id: string | null;
  jsr_item_id: string | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  amount: Num;
  gst_rate: Num | null;
  gst_amount: Num | null;
  tds_rate: Num | null;
  tds_amount: Num | null;
  stage: "draft" | "ready" | "sent";
  sent_on: string | null;
  cancelled: boolean;
  notes: string | null;
  is_demo: boolean;
  client_name: string;
  project_name: string | null;
  total: Num;
  received_bank: Num;
  tds_confirmed: Num;
  last_received_on: string | null;
  outstanding_gross: Num;
  tds_pending: Num;
  net_expected: Num;
  net_total: Num;
  status: "draft" | "ready" | "sent" | "part_paid" | "paid" | "overdue" | "cancelled";
  is_part_paid: boolean;
};

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  ready: "Ready to send",
  sent: "Sent",
  part_paid: "Part-paid",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

export type Loan = {
  id: string;
  lender: string;
  name: string;
  original_principal: Num | null;
  interest_rate: Num | null;
  emi_amount: Num | null;
  first_due_date: string | null;
  tenure_months: number | null;
  emis_remaining: number | null;
  balance_baseline: Num;
  balance_baseline_on: string;
  balance_source: "opening" | "lender";
  status: "active" | "closed";
  notes: string | null;
  is_demo: boolean;
  outstanding: Num;
  principal_paid_since_baseline: Num;
  unknown_principal_payments: number;
  total_paid: Num;
  next_due_date: string | null;
  next_amount_remaining: Num | null;
  overdue_amount: Num;
};

export type CardStatement = {
  id: string;
  card_id: string;
  statement_date: string;
  due_date: string;
  total_due: Num;
  minimum_due: Num;
  notes: string | null;
  nickname: string;
  issuer: string;
  last4: string | null;
  amount_paid: Num;
  amount_remaining: Num;
  minimum_covered: boolean;
  is_paid: boolean;
  payment_status: "paid" | "minimum_paid" | "part_paid" | "unpaid";
  is_demo: boolean;
};

export type Debt = {
  id: string;
  direction: "i_owe" | "owed_to_me";
  counterparty: string;
  reason: string | null;
  original_amount: Num;
  started_on: string;
  due_date: string | null;
  follow_up_date: string | null;
  closed: boolean;
  notes: string | null;
  is_demo: boolean;
  amount_paid: Num;
  amount_remaining: Num;
  is_settled: boolean;
  installment_count: number;
  next_due_date: string | null;
  next_due_amount: Num | null;
  last_followup_at: string | null;
};

export type Reminder = {
  id: string;
  dedupe_key: string;
  source_type: string;
  source_id: string;
  stage: string;
  direction: string | null;
  due_date: string;
  remind_on: string;
  fire_at: string;
  title: string;
  detail: string;
  amount: Num | null;
  href: string | null;
  status: "active" | "resolved" | "dismissed";
  pushed_at: string | null;
  read_at: string | null;
  is_demo: boolean;
};

export type Activity = {
  id: string;
  entity_type: string;
  entity_id: string;
  kind: string;
  note: string | null;
  meta: Record<string, unknown>;
  occurred_at: string;
};

export type Profile = {
  owner_id: string;
  display_name: string | null;
  reminder_time: string;
  advance_days: number;
  alert_on_due: boolean;
  alert_overdue: boolean;
  remind_receipts: boolean;
  remind_work: boolean;
  discreet_push: boolean;
  client_wait_days: number;
};

// ---------------- Spending ----------------
export const SPEND_CATEGORIES = [
  "Grocery", "Vegetables & fruits", "Meat & fish", "Dairy", "Eating out", "Food delivery",
  "Fuel", "Transport", "Shopping", "Bills & utilities", "Rent", "Health & medicine",
  "Household", "Personal care", "Education", "Entertainment", "Travel", "Gifts", "Other",
] as const;

export const PAYMENT_MODES = [
  { value: "upi", label: "UPI" },
  { value: "cash", label: "Cash" },
  { value: "debit_card", label: "Debit card" },
  { value: "credit_card", label: "Credit card" },
  { value: "net_banking", label: "Net banking" },
  { value: "wallet", label: "Wallet" },
  { value: "other", label: "Other" },
] as const;
export const modeLabel = (m: string) => PAYMENT_MODES.find((x) => x.value === m)?.label ?? m;

export type Expense = {
  id: string;
  spent_on: string;
  amount: number | string;
  category: string;
  payment_mode: string;
  note: string | null;
  is_demo: boolean;
  created_at: string;
};
