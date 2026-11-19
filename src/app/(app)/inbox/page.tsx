import Link from "next/link";
import { InlineAction } from "@/components/forms";
import { Badge, Card, CardHeader, Empty, PageHeader, btn, cx } from "@/components/ui";
import { reminderAction } from "@/app/actions/settings";
import { fmtDate, fmtDateTime, todayIST } from "@/lib/format";
import type { Reminder } from "@/lib/types";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Reminders" };
const STAGE: Record<string, { label: string; tone: "danger" | "warn" | "info" | "accent" | "neutral" }> = {
  overdue: { label: "Overdue", tone: "danger" }, due: { label: "Due today", tone: "warn" }, advance: { label: "Coming up", tone: "info" },
  expected: { label: "Expected", tone: "accent" }, follow_up: { label: "Follow-up", tone: "warn" }, action_due: { label: "Action due", tone: "warn" },
};

export default async function Inbox() {
  const { supabase } = await requireUser();
  const today = todayIST();
  const [{ data: now }, { data: later }] = await Promise.all([
    supabase.from("reminders").select("*").eq("status", "active").lte("remind_on", today).order("due_date"),
    supabase.from("reminders").select("*").eq("status", "active").gt("remind_on", today).order("remind_on").limit(30),
  ]);
  const due = (now ?? []) as Reminder[];
  const upcoming = (later ?? []) as Reminder[];
  return (
    <div className="space-y-4">
      <PageHeader title="Reminders" sub="Works with or without push notifications" action={
        due.some((r) => !r.read_at) ? <InlineAction action={reminderAction} fields={{ op: "read_all" }} label="Mark all read" className={btn.secondary} /> : null} />
      <Card>
        <CardHeader title="Now" sub="Reminders that have arrived. They clear automatically when paid or done." />
        {due.length ? (
          <ul className="divide-y divide-line">
            {due.map((r) => (
              <li key={r.id} className={cx("flex items-start gap-3 px-4 py-3", !r.read_at && "bg-accent-soft/40")}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={STAGE[r.stage]?.tone ?? "neutral"}>{STAGE[r.stage]?.label ?? r.stage}</Badge>
                    {r.is_demo ? <Badge>DEMO</Badge> : null}
                    {r.pushed_at ? <span className="text-[11px] text-muted">pushed {fmtDateTime(r.pushed_at)}</span> : null}
                  </div>
                  <Link href={r.href ?? "#"} className={cx("mt-1 block text-sm hover:underline", !r.read_at && "font-semibold")}>{r.title}</Link>
                  <p className="text-xs text-muted">{r.detail}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {!r.read_at ? <InlineAction action={reminderAction} fields={{ op: "read", id: r.id }} label="Read" /> : null}
                  <InlineAction action={reminderAction} fields={{ op: "dismiss", id: r.id }} label="Dismiss" className="text-xs text-muted hover:underline" />
                </div>
              </li>
            ))}
          </ul>
        ) : <Empty title="Inbox zero">Nothing needs a reminder today.</Empty>}
      </Card>
      <Card>
        <CardHeader title="Scheduled" sub="Recalculated automatically when due dates or payments change" />
        {upcoming.length ? (
          <ul className="divide-y divide-line">
            {upcoming.map((r) => (
              <li key={r.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 truncate">{r.title}</span>
                <span className="shrink-0 text-xs text-muted">{fmtDate(r.remind_on, today)}</span>
              </li>
            ))}
          </ul>
        ) : <Empty title="Nothing scheduled" />}
      </Card>
    </div>
  );
}
