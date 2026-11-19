import Link from "next/link";
import type { ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-2xl border border-line bg-surface", className)}>{children}</section>;
}

export function CardHeader({ title, action, sub }: { title: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {sub ? <p className="mt-0.5 text-xs text-muted">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {sub ? <p className="mt-1 text-sm text-muted">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

type Tone = "neutral" | "danger" | "warn" | "ok" | "info" | "accent";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  danger: "bg-danger-soft text-danger",
  warn: "bg-warn-soft text-warn",
  ok: "bg-ok-soft text-ok",
  info: "bg-info-soft text-info",
  accent: "bg-accent-soft text-accent",
};
export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}

export const btn = {
  primary: "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-accent px-3.5 py-2 text-sm font-medium text-accent-text active:opacity-80 disabled:opacity-50",
  secondary: "inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium active:bg-surface-2 disabled:opacity-50",
  ghost: "inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft disabled:opacity-50",
  danger: "inline-flex items-center justify-center gap-1.5 rounded-xl border border-danger/40 px-3 py-2 text-sm font-medium text-danger disabled:opacity-50",
  small: "inline-flex items-center justify-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium active:bg-surface-2 disabled:opacity-50",
};

export function Tabs({ items, active }: { items: { href: string; label: string; count?: number }[]; active: string }) {
  return (
    <nav className="-mx-4 mb-4 overflow-x-auto px-4">
      <div className="flex w-max gap-1.5">
        {items.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={cx(
              "whitespace-nowrap rounded-full border px-3 py-1.5 text-sm",
              active === t.href ? "border-accent bg-accent text-accent-text" : "border-line bg-surface text-ink",
            )}
          >
            {t.label}
            {t.count !== undefined ? <span className="ml-1 opacity-70">{t.count}</span> : null}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children ? <div className="mt-1 text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={cx("tabular mt-0.5 text-lg font-semibold", tone === "danger" && "text-danger", tone === "ok" && "text-ok")}>{value}</p>
      {sub ? <p className="text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

export function DemoBanner() {
  return (
    <div className="mb-3 rounded-xl border border-warn/40 bg-warn-soft px-3 py-2 text-xs text-warn">
      <strong>Demo mode:</strong> sample records (marked DEMO) are loaded. Remove them in Settings before entering real data — your own records are never touched.
    </div>
  );
}
