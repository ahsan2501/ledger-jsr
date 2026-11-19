"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateJsrField, markApproved } from "@/app/actions/work";
import { jsrEmail, jsrWhatsApp } from "@/lib/messages";
import { JSR_STATUSES, OWNERS, PRIORITIES, statusLabel, type JsrItem } from "@/lib/types";
import { fmtDate, relDue } from "@/lib/format";
import { FollowUpForm, MarkSentForm, SetFollowUpForm } from "./entry-forms";
import { CopyButton, InlineAction, SheetButton } from "./forms";
import { Badge, btn, cx } from "./ui";

const cell = "rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-line focus:border-accent focus:bg-surface outline-none";

function useField(id: string) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const save = (field: string, value: string | null) =>
    start(async () => {
      const res = await updateJsrField(id, field, value);
      if (res && !res.ok) setError(res.error ?? "Could not save"); else { setError(null); router.refresh(); }
    });
  return { save, pending, error };
}

export function StatusBadge({ s }: { s: string }) {
  const tone = s === "waiting_for_client" || s === "sent_to_client" ? "info" : s === "revisions_needed" ? "danger"
    : s === "approved" || s === "delivered" ? "ok" : s === "closed" ? "neutral" : s === "to_send" ? "warn" : "accent";
  return <Badge tone={tone}>{statusLabel(s)}</Badge>;
}

export function WaitFlag({ j, waitDays }: { j: JsrItem; waitDays: number }) {
  if (j.waiting_days === null || j.waiting_days < waitDays) return null;
  return <Badge tone="danger">Waiting {j.waiting_days}d</Badge>;
}

export function QuickActions({ j, today, waitDays, compact }: { j: JsrItem; today: string; waitDays: number; compact?: boolean }) {
  return (
    <div className={cx("flex flex-wrap gap-1.5", compact && "justify-end")}>
      {["to_send", "in_progress", "internal_review", "revisions_needed"].includes(j.status) ? (
        <SheetButton label="Mark sent" title={`Mark sent: ${j.title}`}><MarkSentForm id={j.id} today={today} waitDays={waitDays} /></SheetButton>
      ) : null}
      <SheetButton label="Log follow-up" title={`Follow-up: ${j.title}`}><FollowUpForm entity="jsr_item" id={j.id} today={today} /></SheetButton>
      <SheetButton label="Next follow-up" title="Set next follow-up"><SetFollowUpForm entity="jsr_item" id={j.id} current={j.follow_up_date} today={today} /></SheetButton>
      {!["approved", "delivered", "closed"].includes(j.status) ? (
        <InlineAction action={markApproved} fields={{ id: j.id }} label="Mark approved" />
      ) : null}
      <CopyButton text={jsrWhatsApp(j, today)} label="WhatsApp" />
      <CopyButton text={jsrEmail(j, today)} label="Email" />
    </div>
  );
}

function Row({ j, today, waitDays }: { j: JsrItem; today: string; waitDays: number }) {
  const { save, pending, error } = useField(j.id);
  const [open, setOpen] = useState(false);
  const overdue = j.action_due && j.action_due < today && j.next_owner !== "client";
  return (
    <>
      <tr className={cx("border-t border-line align-top", pending && "opacity-60")}>
        <td className="py-2 pl-3 pr-2">
          <p className="text-xs text-muted">{j.client_name}{j.project_name ? ` · ${j.project_name}` : ""}</p>
          <Link href={`/work/items/${j.id}`} className="text-sm font-medium hover:underline">{j.title}</Link>
          <div className="mt-0.5 flex gap-1"><WaitFlag j={j} waitDays={waitDays} />{j.billing === "to_invoice" ? <Badge tone="warn">Invoice to send</Badge> : null}</div>
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </td>
        <td className="py-2 pr-2">
          <select aria-label="Status" className={cx(cell, "w-40")} defaultValue={j.status} onChange={(e) => save("status", e.target.value)}>
            {JSR_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </td>
        <td className="py-2 pr-2">
          <input aria-label="Next action" className={cx(cell, "w-56")} defaultValue={j.next_action ?? ""} placeholder="What happens next"
            onBlur={(e) => e.target.value !== (j.next_action ?? "") && save("next_action", e.target.value)} />
        </td>
        <td className="py-2 pr-2">
          <select aria-label="Next move" className={cx(cell, "w-24")} defaultValue={j.next_owner} onChange={(e) => save("next_owner", e.target.value)}>
            {OWNERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </td>
        <td className="py-2 pr-2">
          <input type="date" aria-label="Action due" className={cx(cell, "w-36", overdue && "text-danger")} defaultValue={j.action_due ?? ""}
            onChange={(e) => save("action_due", e.target.value)} />
        </td>
        <td className="py-2 pr-2">
          <input type="date" aria-label="Follow-up date" className={cx(cell, "w-36", j.follow_up_date && j.follow_up_date <= today && "text-danger")} defaultValue={j.follow_up_date ?? ""}
            onChange={(e) => save("follow_up_date", e.target.value)} />
        </td>
        <td className="py-2 pr-2">
          <select aria-label="Priority" className={cx(cell, "w-24")} defaultValue={j.priority} onChange={(e) => save("priority", e.target.value)}>
            {PRIORITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </td>
        <td className="py-2 pr-2 text-xs text-muted whitespace-nowrap">{j.last_contact_on ? fmtDate(j.last_contact_on, today) : "—"}</td>
        <td className="py-2 pr-3 text-right">
          <button className={btn.small} onClick={() => setOpen((o) => !o)} aria-expanded={open}>Actions</button>
        </td>
      </tr>
      {open ? (
        <tr><td colSpan={9} className="bg-surface-2/50 px-3 pb-3 pt-1"><QuickActions j={j} today={today} waitDays={waitDays} /></td></tr>
      ) : null}
    </>
  );
}

function MobileCard({ j, today, waitDays }: { j: JsrItem; today: string; waitDays: number }) {
  const { save, pending, error } = useField(j.id);
  const [open, setOpen] = useState(false);
  return (
    <li className={cx("rounded-2xl border border-line bg-surface p-3", pending && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted">{j.client_name}{j.project_name ? ` · ${j.project_name}` : ""}</p>
          <Link href={`/work/items/${j.id}`} className="block text-sm font-semibold">{j.title}</Link>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {j.priority === "high" ? <Badge tone="danger">High</Badge> : null}
          <WaitFlag j={j} waitDays={waitDays} />
        </div>
      </div>
      <p className="mt-1 text-sm">{j.next_action || <span className="text-muted">No next action set</span>}</p>
      <p className="mt-1 text-xs text-muted">
        {j.next_owner === "me" ? "Your move" : j.next_owner === "team" ? "Team's move" : "Client's move"}
        {j.action_due ? ` · ${relDue(j.action_due, today)}` : ""}
        {j.follow_up_date ? ` · follow up ${fmtDate(j.follow_up_date, today)}` : ""}
        {j.last_contact_on ? ` · last contact ${fmtDate(j.last_contact_on, today)}` : ""}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <select aria-label="Status" className="flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm" defaultValue={j.status} onChange={(e) => save("status", e.target.value)}>
          {JSR_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button className={btn.small} onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? "Hide" : "Actions"}</button>
      </div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      {open ? <div className="mt-2"><QuickActions j={j} today={today} waitDays={waitDays} /></div> : null}
    </li>
  );
}

export function JsrTable({ items, today, waitDays }: { items: JsrItem[]; today: string; waitDays: number }) {
  return (
    <>
      <ul className="space-y-2 md:hidden">
        {items.map((j) => <MobileCard key={j.id + j.updated_at} j={j} today={today} waitDays={waitDays} />)}
      </ul>
      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface md:block">
        <table className="w-full min-w-[1100px] text-left">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-2 pl-3 font-medium">Client · deliverable</th><th className="font-medium">Status</th><th className="font-medium">Next action</th>
              <th className="font-medium">Next move</th><th className="font-medium">Action due</th><th className="font-medium">Follow-up</th>
              <th className="font-medium">Priority</th><th className="font-medium">Last contact</th><th />
            </tr>
          </thead>
          <tbody>{items.map((j) => <Row key={j.id + j.updated_at} j={j} today={today} waitDays={waitDays} />)}</tbody>
        </table>
      </div>
    </>
  );
}
