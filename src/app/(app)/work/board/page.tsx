import Link from "next/link";
import { QuickActions, WaitFlag } from "@/components/jsr-table";
import { InlineAction } from "@/components/forms";
import { Badge, PageHeader } from "@/components/ui";
import { setJsrStatus } from "@/app/actions/work";
import { getJsr, getProfile } from "@/lib/data";
import { relDue, todayIST } from "@/lib/format";
import { JSR_STATUSES } from "@/lib/types";
import { requireUser } from "@/lib/supabase/server";
import { WorkTabs } from "../_tabs";

export const metadata = { title: "JSR board" };

export default async function Board({ searchParams }: { searchParams: Promise<{ closed?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const today = todayIST();
  const [items, profile] = await Promise.all([getJsr(supabase), getProfile(supabase)]);
  const cols = JSR_STATUSES.filter((s) => sp.closed || s.value !== "closed");
  return (
    <div>
      <PageHeader title="Board" sub="Grouped by status" action={<Link className="text-sm text-accent" href={sp.closed ? "/work/board" : "/work/board?closed=1"}>{sp.closed ? "Hide closed" : "Show closed"}</Link>} />
      <WorkTabs active="/work/board" />
      <div className="-mx-4 overflow-x-auto px-4 pb-4">
        <div className="flex w-max gap-3">
          {cols.map((c, ci) => {
            const list = items.filter((j) => j.status === c.value);
            const next = JSR_STATUSES[ci + 1];
            return (
              <section key={c.value} className="w-72 shrink-0 rounded-2xl bg-surface-2 p-2">
                <h2 className="flex items-center justify-between px-1 pb-2 text-sm font-semibold">{c.label}<span className="text-xs font-normal text-muted">{list.length}</span></h2>
                <ul className="space-y-2">
                  {list.map((j) => (
                    <li key={j.id} className="rounded-xl border border-line bg-surface p-3">
                      <p className="text-xs text-muted">{j.client_name}</p>
                      <Link href={`/work/items/${j.id}`} className="text-sm font-medium hover:underline">{j.title}</Link>
                      <p className="mt-1 text-xs">{j.next_action}</p>
                      <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                        <Badge tone={j.next_owner === "client" ? "info" : "accent"}>{j.next_owner === "me" ? "Me" : j.next_owner === "team" ? "Team" : "Client"}</Badge>
                        {j.action_due ? <Badge tone={j.action_due < today ? "danger" : "neutral"}>{relDue(j.action_due, today)}</Badge> : null}
                        <WaitFlag j={j} waitDays={profile.client_wait_days} />
                      </div>
                      <details className="mt-2">
                        <summary className="text-xs text-accent">Actions</summary>
                        <div className="mt-2 space-y-2">
                          <QuickActions j={j} today={today} waitDays={profile.client_wait_days} />
                          {next ? <InlineAction action={setJsrStatus} fields={{ id: j.id, status: next.value }} label={`Move to ${next.label} →`} /> : null}
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
