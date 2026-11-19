import { Badge } from "./ui";
import { inr, toNum } from "@/lib/format";
import type { CardStatement } from "@/lib/types";

export function StatementBadge({ s, today }: { s: CardStatement; today: string }) {
  if (s.is_paid) return <Badge tone="ok">Paid in full</Badge>;
  if (s.due_date < today) return <Badge tone="danger">Overdue · {inr(s.amount_remaining)} left</Badge>;
  if (s.minimum_covered && toNum(s.amount_paid) > 0) return <Badge tone="warn">Minimum covered · {inr(s.amount_remaining)} left</Badge>;
  if (toNum(s.amount_paid) > 0) return <Badge tone="warn">Part-paid · minimum not covered</Badge>;
  return <Badge>Unpaid</Badge>;
}

