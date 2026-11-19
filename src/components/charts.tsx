"use client";
import { useState } from "react";
import type { CashDay } from "@/lib/cashflow";
import { fmtDate, fmtMonth, inr, inrCompact, toNum } from "@/lib/format";

// ---------------------------------------------------------------------------
// Cash flow: inflows above the zero line, outflows below.
// Past days = actual payments (solid). Today onward = scheduled / expected
// (lighter fill + outline). Project billing not yet invoiced = hatched violet.
// ---------------------------------------------------------------------------
export function CashFlowChart({ days, today }: { days: CashDay[]; today: string }) {
  const [sel, setSel] = useState<number | null>(null);
  const W = 740, H = 230, padL = 46, padR = 8, padT = 12, padB = 26;
  const inOf = (d: CashDay) => (d.past ? d.actualIn : d.expectedInvoices + d.expectedPersonal + d.pipeline);
  const outOf = (d: CashDay) => (d.past ? d.actualOut : d.scheduledOut);
  const maxIn = Math.max(1, ...days.map(inOf));
  const maxOut = Math.max(1, ...days.map(outOf));
  const plotH = H - padT - padB;
  const total = maxIn + maxOut;
  const zeroY = padT + (maxIn / total) * plotH;
  const scale = plotH / total;
  const step = (W - padL - padR) / days.length;
  const bw = Math.max(3, step - 2); // 2px gap between bars
  const todayIdx = days.findIndex((d) => d.date === today);
  const empty = days.every((d) => inOf(d) === 0 && outOf(d) === 0);
  const tick = (v: number) => inrCompact(v);

  const r = 2;
  // rounded only at the data end (away from the baseline)
  const barUp = (x: number, y0: number, h: number) =>
    h <= 0 ? "" : `M${x},${y0} v${-(h - r)} q0,${-r} ${r},${-r} h${bw - 2 * r} q${r},0 ${r},${r} v${h - r} z`;
  const barDown = (x: number, y0: number, h: number) =>
    h <= 0 ? "" : `M${x},${y0} v${h - r} q0,${r} ${r},${r} h${bw - 2 * r} q${r},0 ${r},${-r} v${-(h - r)} z`;
  const rect = (x: number, y: number, h: number) => (h <= 0 ? "" : `M${x},${y} h${bw} v${h} h${-bw} z`);

  const d = sel !== null ? days[sel] : null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] text-muted">
        <Legend color="var(--c-in)" label="Invoices sent" />
        <Legend color="var(--c-in-2)" label="Personal owed to me" />
        <Legend color="var(--c-pipe)" label="Project billing (not invoiced)" hatched />
        <Legend color="var(--c-out)" label="Payments out" />
        <span>Solid = actual · light = scheduled / expected</span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-manipulation" role="img"
          aria-label="Cash flow for the last 7 days (actual) and next 30 days (scheduled and expected)">
          <defs>
            <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="5" stroke="var(--c-pipe)" strokeWidth="2" />
            </pattern>
          </defs>
          {/* grid */}
          {[maxIn, maxIn / 2].map((v) => (
            <g key={`gi${v}`}>
              <line x1={padL} x2={W - padR} y1={zeroY - v * scale} y2={zeroY - v * scale} stroke="var(--c-grid)" />
              <text x={padL - 6} y={zeroY - v * scale + 3} textAnchor="end" fontSize="10" fill="var(--muted)">{tick(v)}</text>
            </g>
          ))}
          {(maxOut * scale < 40 ? [maxOut] : [maxOut / 2, maxOut]).map((v) => (
            <g key={`go${v}`}>
              <line x1={padL} x2={W - padR} y1={zeroY + v * scale} y2={zeroY + v * scale} stroke="var(--c-grid)" />
              <text x={padL - 6} y={zeroY + v * scale + 3} textAnchor="end" fontSize="10" fill="var(--muted)">−{tick(v)}</text>
            </g>
          ))}
          {/* today divider */}
          {todayIdx >= 0 ? (
            <g>
              <rect x={padL} y={padT} width={todayIdx * step} height={plotH} fill="var(--surface-2)" opacity="0.6" />
              <text x={padL + 4} y={padT + 10} fontSize="10" fill="var(--muted)">Actual</text>
              <line x1={padL + todayIdx * step} x2={padL + todayIdx * step} y1={padT} y2={H - padB} stroke="var(--muted)" strokeDasharray="3 3" />
              <text x={padL + todayIdx * step + 4} y={padT + 10} fontSize="10" fill="var(--muted)">Today → scheduled / expected</text>
            </g>
          ) : null}
          {days.map((day, i) => {
            const x = padL + i * step + 1;
            const future = !day.past;
            const op = future ? 0.55 : 1;
            let y = zeroY;
            const parts: React.ReactNode[] = [];
            const segs = day.past
              ? [{ v: day.actualIn, c: "var(--c-in)" }]
              : [{ v: day.expectedInvoices, c: "var(--c-in)" }, { v: day.expectedPersonal, c: "var(--c-in-2)" }];
            const upTotal = inOf(day);
            segs.forEach((s, k) => {
              if (s.v <= 0) return;
              const h = s.v * scale;
              const isTop = !day.pipeline && segs.slice(k + 1).every((q) => q.v <= 0);
              parts.push(<path key={`u${k}`} d={isTop ? barUp(x, y, h) : rect(x, y - h, h)} fill={s.c} opacity={op} stroke={future ? s.c : "none"} />);
              y -= h + (upTotal > s.v ? 0 : 0);
            });
            if (day.pipeline > 0) {
              const h = day.pipeline * scale;
              parts.push(<path key="p" d={barUp(x, y, h)} fill="url(#hatch)" stroke="var(--c-pipe)" strokeWidth="1" />);
            }
            const out = outOf(day);
            if (out > 0) parts.push(<path key="o" d={barDown(x, zeroY + 1, out * scale)} fill="var(--c-out)" opacity={op} stroke={future ? "var(--c-out)" : "none"} />);
            return (
              <g key={day.date}>
                {sel === i ? <rect x={padL + i * step} y={padT} width={step} height={plotH} fill="var(--accent-soft)" /> : null}
                {parts}
                {/* generous hit target */}
                <rect x={padL + i * step} y={padT} width={step} height={plotH} fill="transparent"
                  onMouseEnter={() => setSel(i)} onClick={() => setSel(i)} />
                {(i - Math.max(todayIdx, 0)) % 7 === 0 ? (
                  <text x={x + bw / 2} y={H - 8} fontSize="10" textAnchor="middle" fill="var(--muted)">{fmtDate(day.date, today).replace(/^\w+, /, "")}</text>
                ) : null}
              </g>
            );
          })}
          <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} stroke="var(--muted)" strokeWidth="1" />
        </svg>
        {empty ? <p className="absolute inset-0 flex items-center justify-center text-sm text-muted">Nothing scheduled in this window yet.</p> : null}
      </div>
      <div className="mt-2 min-h-[64px] rounded-xl bg-surface-2 px-3 py-2 text-xs" aria-live="polite">
        {d ? (
          <>
            <p className="font-medium">
              {fmtDate(d.date, today)} · {d.past ? "actual" : d.isToday ? "today (incl. overdue)" : "scheduled / expected"}
            </p>
            {d.items.length ? (
              <ul className="mt-1 space-y-0.5">
                {d.items.map((it, k) => (
                  <li key={k} className="flex justify-between gap-3">
                    <span className="truncate text-muted">{it.label} <span className="opacity-70">({it.kind})</span></span>
                    <span className="tabular shrink-0">{inr(it.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-1 text-muted">Nothing on this day.</p>}
          </>
        ) : <p className="text-muted">Tap or hover a day to see what&apos;s in it.</p>}
      </div>
    </div>
  );
}

function Legend({ color, label, hatched }: { color: string; label: string; hatched?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={hatched
        ? { border: `1px solid ${color}`, background: `repeating-linear-gradient(45deg, ${color} 0 2px, transparent 2px 4px)` }
        : { background: color }} />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Debt trend from month-end snapshots (single series: total debt).
// ---------------------------------------------------------------------------
export type Snapshot = { snapshot_on: string; loans_total: unknown; cards_total: unknown; owe_total: unknown; source: string };

export function DebtTrendChart({ snapshots }: { snapshots: Snapshot[] }) {
  const pts = [...snapshots].sort((a, b) => a.snapshot_on.localeCompare(b.snapshot_on)).slice(-12)
    .map((s) => ({ ...s, total: toNum(s.loans_total) + toNum(s.cards_total) + toNum(s.owe_total) }));
  const [sel, setSel] = useState<number | null>(pts.length ? pts.length - 1 : null);
  if (pts.length < 2) {
    return (
      <div className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm">
        <p className="font-medium">Not enough history yet</p>
        <p className="mt-1 text-muted">
          The trend appears once there are two month-end balances. A snapshot is saved automatically on the last day of each month,
          or add past month-ends in Settings → Debt history.
        </p>
      </div>
    );
  }
  const W = 740, H = 180, padL = 52, padR = 16, padT = 14, padB = 24;
  const max = Math.max(...pts.map((p) => p.total)) * 1.05;
  const min = Math.min(...pts.map((p) => p.total)) * 0.95;
  const x = (i: number) => padL + (i * (W - padL - padR)) / (pts.length - 1);
  const y = (v: number) => padT + (1 - (v - min) / (max - min || 1)) * (H - padT - padB);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.total)}`).join(" ");
  const first = pts[0].total, last = pts[pts.length - 1].total;
  const change = last - first;
  const s = sel !== null ? pts[sel] : null;
  return (
    <div>
      <p className="mb-1 text-xs text-muted">
        Total debt (loans + card bills + money I owe) at month-end ·{" "}
        <span className={change <= 0 ? "text-ok" : "text-danger"}>{change <= 0 ? "down" : "up"} {inr(Math.abs(change))}</span> since {fmtMonth(pts[0].snapshot_on)}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Debt trend by month-end">
        {[min, (min + max) / 2, max].map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--c-grid)" />
            <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--muted)">{inrCompact(v)}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--c-in)" strokeWidth="2" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={p.snapshot_on}>
            {sel === i ? <line x1={x(i)} x2={x(i)} y1={padT} y2={H - padB} stroke="var(--muted)" strokeDasharray="2 3" /> : null}
            <circle cx={x(i)} cy={y(p.total)} r={sel === i ? 5 : 4} fill="var(--c-in)" stroke="var(--surface)" strokeWidth="2" />
            <text x={x(i)} y={H - 6} fontSize="10" textAnchor="middle" fill="var(--muted)">{fmtMonth(p.snapshot_on)}</text>
            <rect x={x(i) - 20} y={padT} width={40} height={H - padT - padB} fill="transparent" onMouseEnter={() => setSel(i)} onClick={() => setSel(i)} />
          </g>
        ))}
      </svg>
      {s ? (
        <p className="tabular mt-1 rounded-xl bg-surface-2 px-3 py-2 text-xs">
          <span className="font-medium">{fmtMonth(s.snapshot_on)}: {inr(s.total)}</span>
          <span className="text-muted"> · loans {inr(s.loans_total)} · cards {inr(s.cards_total)} · I owe {inr(s.owe_total)}{s.source === "manual" ? " · entered manually" : ""}</span>
        </p>
      ) : null}
    </div>
  );
}
