import { inr } from "@/lib/format";
import type { SpendGroup } from "@/lib/spending";

/** Ranked horizontal bars: label + amount in text, bar length = share. */
export function SpendBars({ groups, label = (k: string) => k, limit }: { groups: SpendGroup[]; label?: (k: string) => string; limit?: number }) {
  const shown = limit ? groups.slice(0, limit) : groups;
  const max = Math.max(1, ...shown.map((g) => g.total));
  return (
    <ul className="space-y-2">
      {shown.map((g) => (
        <li key={g.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{label(g.key)} <span className="text-xs text-muted">· {g.count}</span></span>
            <span className="tabular shrink-0 font-medium">{inr(g.total)} <span className="text-xs font-normal text-muted">{Math.round(g.share * 100)}%</span></span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-surface-2">
            <div className="h-1.5 rounded-full" style={{ width: `${Math.max(2, (g.total / max) * 100)}%`, background: "var(--c-in)" }} />
          </div>
        </li>
      ))}
      {limit && groups.length > limit ? <li className="text-xs text-muted">+ {groups.length - limit} more categories</li> : null}
    </ul>
  );
}
