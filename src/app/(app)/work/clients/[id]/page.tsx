import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceForm, JsrItemForm, ProjectForm } from "@/components/entry-forms";
import { ActionForm, Check, DateInput, Field, MoneyInput, More, Row, Select, SheetButton, TextArea, TextInput } from "@/components/forms";
import { InvoiceBadge } from "@/components/invoice-badge";
import { StatusBadge } from "@/components/jsr-table";
import { DeleteButton } from "@/components/row-actions";
import { Card, CardHeader, Empty, PageHeader, btn } from "@/components/ui";
import { updateClientRecord, updateProject } from "@/app/actions/work";
import { getLookups } from "@/lib/data";
import { fmtDate, inr, toNum, todayIST } from "@/lib/format";
import { PROJECT_KINDS, type Invoice, type JsrItem } from "@/lib/types";
import { requireUser } from "@/lib/supabase/server";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const today = todayIST();
  const [{ data: c }, { data: projects }, { data: items }, { data: invs }, lookups] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).maybeSingle(),
    supabase.from("projects").select("*").eq("client_id", id).order("status").order("name"),
    supabase.from("v_jsr_items").select("*").eq("client_id", id).order("is_active", { ascending: false }),
    supabase.from("v_invoices").select("*").eq("client_id", id).order("invoice_date", { ascending: false }),
    getLookups(supabase),
  ]);
  if (!c) notFound();
  const jsr = (items ?? []) as JsrItem[];
  const invoices = (invs ?? []) as Invoice[];
  return (
    <div className="space-y-4">
      <PageHeader title={c.name} sub={[c.contact_name, c.phone, c.email].filter(Boolean).join(" · ")} action={
        <div className="flex gap-2">
          <SheetButton className={btn.secondary} label="Edit" title="Edit client">
            <ActionForm action={updateClientRecord}>
              <input type="hidden" name="id" value={c.id} />
              <Field label="Client name"><TextInput name="name" defaultValue={c.name} required /></Field>
              <Row>
                <Field label="Contact person"><TextInput name="contact_name" defaultValue={c.contact_name ?? ""} /></Field>
                <Field label="Phone"><TextInput name="phone" defaultValue={c.phone ?? ""} /></Field>
              </Row>
              <Field label="Email"><TextInput name="email" type="email" defaultValue={c.email ?? ""} /></Field>
              <Field label="Notes"><TextArea name="notes" defaultValue={c.notes ?? ""} /></Field>
              <Check name="archived" label="Archived" defaultChecked={c.archived} />
            </ActionForm>
          </SheetButton>
          <SheetButton className={btn.primary} label="Add item" title="Add JSR item"><JsrItemForm lookups={lookups} clientId={c.id} /></SheetButton>
        </div>} />
      <Card>
        <CardHeader title="Projects & retainers" action={<SheetButton label="Add" title="Add project"><ProjectForm lookups={lookups} clientId={c.id} /></SheetButton>} />
        {(projects ?? []).length ? (
          <ul className="divide-y divide-line">
            {(projects ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <div>
                  <p className="font-medium">{p.name} <span className="font-normal text-muted">· {PROJECT_KINDS.find((k) => k.value === p.kind)?.label} · {p.status.replace("_", " ")}</span></p>
                  {p.expected_invoice_amount ? <p className="text-xs text-muted">Expected billing {inr(p.expected_invoice_amount)}{p.expected_invoice_date ? ` around ${fmtDate(p.expected_invoice_date, today)}` : ""}</p> : null}
                </div>
                <div className="flex gap-2">
                  <SheetButton label="Edit" title="Edit project">
                    <ActionForm action={updateProject}>
                      <input type="hidden" name="id" value={p.id} />
                      <Row>
                        <Field label="Name"><TextInput name="name" defaultValue={p.name} required /></Field>
                        <Field label="Type"><Select name="kind" defaultValue={p.kind} options={PROJECT_KINDS} /></Field>
                      </Row>
                      <Field label="Status"><Select name="status" defaultValue={p.status} options={[{ value: "active", label: "Active" }, { value: "on_hold", label: "On hold" }, { value: "closed", label: "Closed" }]} /></Field>
                      <More label="Expected billing">
                        <Row>
                          <Field label="Expected invoice"><MoneyInput name="expected_invoice_amount" defaultValue={p.expected_invoice_amount ? String(toNum(p.expected_invoice_amount)) : ""} /></Field>
                          <Field label="Expected on"><DateInput name="expected_invoice_date" defaultValue={p.expected_invoice_date ?? ""} /></Field>
                        </Row>
                        <Field label="Notes"><TextArea name="notes" defaultValue={p.notes ?? ""} /></Field>
                      </More>
                    </ActionForm>
                  </SheetButton>
                  <SheetButton label="Invoice" title="New invoice"><InvoiceForm lookups={lookups} clientId={c.id} projectId={p.id} /></SheetButton>
                  <DeleteButton table="projects" id={p.id} label="×" what="this project" />
                </div>
              </li>
            ))}
          </ul>
        ) : <Empty title="No projects yet" />}
      </Card>
      <Card>
        <CardHeader title="JSR items" />
        {jsr.length ? (
          <ul className="divide-y divide-line">
            {jsr.map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <Link href={`/work/items/${j.id}`} className="min-w-0 truncate hover:underline">{j.title}{j.project_name ? <span className="text-muted"> · {j.project_name}</span> : null}</Link>
                <StatusBadge s={j.status} />
              </li>
            ))}
          </ul>
        ) : <Empty title="No items" />}
      </Card>
      <Card>
        <CardHeader title="Invoices" />
        {invoices.length ? (
          <ul className="divide-y divide-line">
            {invoices.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <Link href={`/work/invoices/${i.id}`} className="text-accent">{i.invoice_number}</Link>
                <span className="tabular">{inr(i.total)}</span><InvoiceBadge s={i.status} />
              </li>
            ))}
          </ul>
        ) : <Empty title="No invoices" />}
      </Card>
      <div className="text-right"><DeleteButton table="clients" id={c.id} label="Delete client" what="this client with all projects, JSR items and invoices" /></div>
    </div>
  );
}
