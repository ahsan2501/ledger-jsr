import Link from "next/link";
import { Card, Empty, PageHeader } from "@/components/ui";
import { inr } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Search" };

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 80);
  const { supabase } = await requireUser();
  type Hit = { href: string; title: string; sub: string; kind: string };
  const hits: Hit[] = [];
  if (q.length >= 1) {
    const like = `%${q.replace(/[%_,()]/g, " ")}%`;
    const [cl, pr, jsr, inv, loans, cards, debts] = await Promise.all([
      supabase.from("clients").select("id, name, contact_name").or(`name.ilike.${like},contact_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`).limit(10),
      supabase.from("projects").select("id, name, client_id, clients(name)").ilike("name", like).limit(10),
      supabase.from("v_jsr_items").select("id, title, client_name, next_action").or(`title.ilike.${like},next_action.ilike.${like},client_name.ilike.${like}`).limit(15),
      supabase.from("v_invoices").select("id, invoice_number, client_name, total, status").or(`invoice_number.ilike.${like},client_name.ilike.${like}`).limit(15),
      supabase.from("loans").select("id, name, lender").or(`name.ilike.${like},lender.ilike.${like}`).limit(10),
      supabase.from("credit_cards").select("id, nickname, issuer").or(`nickname.ilike.${like},issuer.ilike.${like}`).limit(10),
      supabase.from("v_debts").select("id, counterparty, reason, direction, amount_remaining").or(`counterparty.ilike.${like},reason.ilike.${like}`).limit(10),
    ]);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    for (const r of cl.data ?? []) hits.push({ href: `/work/clients/${r.id}`, title: r.name, sub: r.contact_name ?? "", kind: "Client" });
    for (const r of (pr.data ?? []) as any[]) hits.push({ href: `/work/clients/${r.client_id}`, title: r.name, sub: r.clients?.name ?? "", kind: "Project" });
    for (const r of jsr.data ?? []) hits.push({ href: `/work/items/${r.id}`, title: r.title, sub: `${r.client_name}${r.next_action ? ` · ${r.next_action}` : ""}`, kind: "JSR" });
    for (const r of inv.data ?? []) hits.push({ href: `/work/invoices/${r.id}`, title: r.invoice_number, sub: `${r.client_name} · ${inr(r.total)} · ${r.status.replace("_", "-")}`, kind: "Invoice" });
    for (const r of loans.data ?? []) hits.push({ href: `/finance/loans/${r.id}`, title: r.name, sub: r.lender, kind: "Lender / loan" });
    for (const r of cards.data ?? []) hits.push({ href: `/finance/cards/${r.id}`, title: r.nickname, sub: r.issuer, kind: "Card" });
    for (const r of debts.data ?? []) hits.push({ href: `/finance/debts/${r.id}`, title: r.counterparty, sub: `${r.direction === "i_owe" ? "I owe" : "Owes me"} ${inr(r.amount_remaining)}${r.reason ? ` · ${r.reason}` : ""}`, kind: "Person" });
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }
  return (
    <div>
      <PageHeader title="Search" sub={q ? `Results for “${q}”` : "People, lenders, clients, projects and invoices"} />
      <Card>
        {hits.length ? (
          <ul className="divide-y divide-line">
            {hits.map((h) => (
              <li key={h.kind + h.href + h.title}><Link href={h.href} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{h.title}</p><p className="truncate text-xs text-muted">{h.sub}</p></div>
                <span className="shrink-0 text-xs text-muted">{h.kind}</span>
              </Link></li>
            ))}
          </ul>
        ) : <Empty title={q ? "No matches" : "Type in the search box above"} />}
      </Card>
    </div>
  );
}
