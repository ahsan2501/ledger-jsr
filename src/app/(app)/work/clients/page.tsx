import Link from "next/link";
import { ClientForm, ProjectForm } from "@/components/entry-forms";
import { SheetButton } from "@/components/forms";
import { Card, Empty, PageHeader, btn } from "@/components/ui";
import { getLookups } from "@/lib/data";
import { inr, toNum } from "@/lib/format";
import { PROJECT_KINDS } from "@/lib/types";
import { requireUser } from "@/lib/supabase/server";
import { WorkTabs } from "../_tabs";

export const metadata = { title: "Clients" };

export default async function Clients() {
  const { supabase } = await requireUser();
  const [{ data: clients }, { data: projects }, { data: items }, { data: invs }, lookups] = await Promise.all([
    supabase.from("clients").select("*").order("archived").order("name"),
    supabase.from("projects").select("*").order("name"),
    supabase.from("v_jsr_items").select("client_id, is_active"),
    supabase.from("v_invoices").select("client_id, net_expected, status"),
    getLookups(supabase),
  ]);
  return (
    <div>
      <PageHeader title="Clients & projects" action={<div className="flex gap-2">
        <SheetButton className={btn.secondary} label="Add project" title="Add project / retainer"><ProjectForm lookups={lookups} /></SheetButton>
        <SheetButton className={btn.primary} label="Add client" title="Add client"><ClientForm /></SheetButton>
      </div>} />
      <WorkTabs active="/work/clients" />
      {(clients ?? []).length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {(clients ?? []).map((c) => {
            const ps = (projects ?? []).filter((p) => p.client_id === c.id);
            const active = (items ?? []).filter((j) => j.client_id === c.id && j.is_active).length;
            const due = (invs ?? []).filter((i) => i.client_id === c.id && ["sent", "part_paid", "overdue"].includes(i.status)).reduce((s, i) => s + toNum(i.net_expected), 0);
            return (
              <Card key={c.id} className="p-4">
                <Link href={`/work/clients/${c.id}`} className="font-semibold hover:underline">{c.name}</Link>
                <p className="text-xs text-muted">{[c.contact_name, c.phone, c.archived ? "archived" : null].filter(Boolean).join(" · ") || "No contact saved"}</p>
                <p className="mt-2 text-sm">{active} active item{active === 1 ? "" : "s"} · {inr(due)} receivable</p>
                {ps.length ? (
                  <ul className="mt-2 space-y-0.5 text-xs text-muted">
                    {ps.map((p) => <li key={p.id}>• {p.name} <span className="opacity-70">({PROJECT_KINDS.find((k) => k.value === p.kind)?.label}{p.status !== "active" ? `, ${p.status.replace("_", " ")}` : ""})</span></li>)}
                  </ul>
                ) : null}
              </Card>
            );
          })}
        </div>
      ) : <Card><Empty title="No clients yet">Add a client, then projects or retainers under it.</Empty></Card>}
    </div>
  );
}
