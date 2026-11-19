import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity as ActivityList } from "@/components/activity";
import { InvoiceForm } from "@/components/entry-forms";
import { ActionForm, DateInput, Field, More, Row, Select, SheetButton, TextArea, TextInput } from "@/components/forms";
import { QuickActions, StatusBadge, WaitFlag } from "@/components/jsr-table";
import { DeleteButton } from "@/components/row-actions";
import { Badge, Card, CardHeader, PageHeader, btn } from "@/components/ui";
import { addNote, updateJsrItem } from "@/app/actions/work";
import { getLookups, getProfile } from "@/lib/data";
import { fmtDate, inr, relDue, todayIST } from "@/lib/format";
import { BILLING, INVOICE_STATUS_LABEL, JSR_STATUSES, OWNERS, PRIORITIES, type Activity, type JsrItem } from "@/lib/types";
import { requireUser } from "@/lib/supabase/server";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const today = todayIST();
  const [{ data }, acts, invs, profile, lookups] = await Promise.all([
    supabase.from("v_jsr_items").select("*").eq("id", id).maybeSingle(),
    supabase.from("activities").select("*").eq("entity_type", "jsr_item").eq("entity_id", id).order("occurred_at", { ascending: false }),
    supabase.from("v_invoices").select("id, invoice_number, total, status").eq("jsr_item_id", id),
    getProfile(supabase), getLookups(supabase),
  ]);
  if (!data) notFound();
  const j = data as JsrItem;
  const projects = lookups.projects.filter((p) => p.client_id === j.client_id);
  const links = (j.links ?? "").split(/\s+/).filter((s) => /^https?:\/\//.test(s));
  return (
    <div className="space-y-4">
      <PageHeader title={j.title} sub={<><Link className="hover:underline" href={`/work/clients/${j.client_id}`}>{j.client_name}</Link>{j.project_name ? ` · ${j.project_name}` : ""}</>} action={
        <SheetButton className={btn.secondary} label="Edit" title="Edit JSR item">
          <ActionForm action={updateJsrItem}>
            <input type="hidden" name="id" value={j.id} />
            <Field label="Deliverable"><TextInput name="title" defaultValue={j.title} required /></Field>
            <Field label="What happens next"><TextInput name="next_action" defaultValue={j.next_action ?? ""} /></Field>
            <Row>
              <Field label="Status"><Select name="status" defaultValue={j.status} options={JSR_STATUSES} /></Field>
              <Field label="Next move"><Select name="next_owner" defaultValue={j.next_owner} options={OWNERS} /></Field>
            </Row>
            <Row>
              <Field label="Action due"><DateInput name="action_due" defaultValue={j.action_due ?? ""} /></Field>
              <Field label="Follow-up"><DateInput name="follow_up_date" defaultValue={j.follow_up_date ?? ""} /></Field>
            </Row>
            <Row>
              <Field label="Priority"><Select name="priority" defaultValue={j.priority} options={PRIORITIES} /></Field>
              <Field label="Billing"><Select name="billing" defaultValue={j.billing} options={BILLING} /></Field>
            </Row>
            <More>
              {projects.length ? <Field label="Project"><Select name="project_id" defaultValue={j.project_id ?? "__none"} options={[{ value: "__none", label: "— None —" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} /></Field> : <input type="hidden" name="project_id" value={j.project_id ?? "__none"} />}
              <Field label="Last contact"><DateInput name="last_contact_on" defaultValue={j.last_contact_on ?? ""} /></Field>
              <Field label="Links"><TextArea name="links" rows={2} defaultValue={j.links ?? ""} /></Field>
              <Field label="Notes"><TextArea name="notes" rows={3} defaultValue={j.notes ?? ""} /></Field>
            </More>
          </ActionForm>
        </SheetButton>} />

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge s={j.status} />
          <Badge tone={j.next_owner === "client" ? "info" : "accent"}>Next move: {j.next_owner === "me" ? "me" : j.next_owner === "team" ? "my team" : "client"}</Badge>
          <Badge tone={j.priority === "high" ? "danger" : "neutral"}>{j.priority} priority</Badge>
          <Badge tone={j.billing === "to_invoice" ? "warn" : "neutral"}>{BILLING.find((b) => b.value === j.billing)?.label}</Badge>
          <WaitFlag j={j} waitDays={profile.client_wait_days} />
        </div>
        <p className="mt-3 text-base">{j.next_action || <span className="text-muted">No next action set.</span>}</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-muted">Action due</dt><dd>{j.action_due ? `${fmtDate(j.action_due, today)} · ${relDue(j.action_due, today)}` : "—"}</dd></div>
          <div><dt className="text-xs text-muted">Follow-up</dt><dd>{j.follow_up_date ? fmtDate(j.follow_up_date, today) : "—"}</dd></div>
          <div><dt className="text-xs text-muted">Last contact</dt><dd>{j.last_contact_on ? fmtDate(j.last_contact_on, today) : "—"}</dd></div>
          <div><dt className="text-xs text-muted">Waiting since</dt><dd>{j.waiting_since ? `${fmtDate(j.waiting_since, today)} (${j.waiting_days}d)` : "—"}</dd></div>
        </dl>
        <div className="mt-4"><QuickActions j={j} today={today} waitDays={profile.client_wait_days} /></div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Activity history" sub="What was sent and when" action={
            <SheetButton label="Add note" title="Add note">
              <ActionForm action={addNote}><input type="hidden" name="entity" value="jsr_item" /><input type="hidden" name="id" value={j.id} />
                <Field label="Note"><TextArea name="note" required /></Field></ActionForm>
            </SheetButton>} />
          <ActivityList items={(acts.data ?? []) as Activity[]} />
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Billing" action={
              <SheetButton label="Create invoice" title="New invoice"><InvoiceForm lookups={lookups} clientId={j.client_id} projectId={j.project_id} jsrItemId={j.id} /></SheetButton>} />
            <ul className="px-4 pb-3 text-sm">
              {(invs.data ?? []).length ? (invs.data ?? []).map((i) => (
                <li key={i.id} className="flex justify-between py-1"><Link className="text-accent" href={`/work/invoices/${i.id}`}>{i.invoice_number}</Link><span>{inr(i.total)} · {INVOICE_STATUS_LABEL[i.status]}</span></li>
              )) : <li className="text-muted">No invoice linked.</li>}
            </ul>
          </Card>
          {links.length || j.notes ? (
            <Card className="p-4 text-sm">
              {links.length ? <><p className="text-xs text-muted">Links</p><ul className="mb-2">{links.map((l) => <li key={l}><a href={l} target="_blank" rel="noreferrer" className="break-all text-accent">{l}</a></li>)}</ul></> : null}
              {j.notes ? <><p className="text-xs text-muted">Notes</p><p className="whitespace-pre-wrap">{j.notes}</p></> : null}
            </Card>
          ) : null}
        </div>
      </div>
      <div className="text-right"><DeleteButton table="jsr_items" id={j.id} label="Delete item" what="this JSR item" /></div>
    </div>
  );
}
