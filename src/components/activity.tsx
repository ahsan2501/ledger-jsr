import { fmtDateTime } from "@/lib/format";
import type { Activity as A } from "@/lib/types";
import { Empty } from "./ui";

const LABEL: Record<string, string> = {
  created: "Created", status: "Status", sent: "Sent", approved: "Approved", follow_up: "Follow-up", next_follow_up: "Follow-up set",
  payment: "Payment", receipt: "Receipt", note: "Note", owner: "Next move", balance: "Balance",
};

export function Activity({ items }: { items: A[] }) {
  if (!items.length) return <Empty title="No activity yet" />;
  return (
    <ol className="space-y-0 px-4 pb-3">
      {items.map((a) => (
        <li key={a.id} className="relative border-l border-line py-2 pl-4">
          <span className="absolute -left-[5px] top-3 h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent" />
          <p className="text-sm"><span className="font-medium">{LABEL[a.kind] ?? a.kind}</span>{a.note ? ` — ${a.note}` : ""}</p>
          <p className="text-xs text-muted">{fmtDateTime(a.occurred_at)}</p>
        </li>
      ))}
    </ol>
  );
}
