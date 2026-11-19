import { Badge } from "./ui";
import { INVOICE_STATUS_LABEL, type Invoice } from "@/lib/types";

export function InvoiceBadge({ s }: { s: Invoice["status"] }) {
  const tone = s === "paid" ? "ok" : s === "overdue" ? "danger" : s === "part_paid" ? "warn" : s === "sent" ? "info" : s === "ready" ? "accent" : "neutral";
  return <Badge tone={tone}>{INVOICE_STATUS_LABEL[s]}</Badge>;
}

