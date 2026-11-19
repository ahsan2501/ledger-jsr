import Link from "next/link";
import { BottomNav, SideNav, TopBar } from "@/components/nav";
import { QuickAdd } from "@/components/quick-add";
import { DemoBanner } from "@/components/ui";
import { getInboxCount, getLookups, hasDemo } from "@/lib/data";
import { requireUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase } = await requireUser();
  const [lookups, inboxCount, demo] = await Promise.all([getLookups(supabase), getInboxCount(supabase), hasDemo(supabase)]);
  return (
    <div className="pt-safe mx-auto flex max-w-6xl gap-6 px-4 md:px-6">
      <aside className="sticky top-0 hidden h-dvh w-52 shrink-0 flex-col py-6 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-3 text-base font-semibold">
          <img src="/icons/icon-192.png" alt="" width={28} height={28} className="rounded-lg" /> Ledger + JSR
        </Link>
        <SideNav />
      </aside>
      <div className="min-w-0 flex-1 pb-28 md:pb-12">
        <div className="sticky top-0 z-20 -mx-4 bg-bg/95 px-4 pt-3 pb-3 backdrop-blur md:static md:mx-0 md:px-0 md:pt-6">
          <TopBar inboxCount={inboxCount} />
        </div>
        {demo ? <DemoBanner /> : null}
        <main>{children}</main>
      </div>
      <BottomNav />
      <QuickAdd lookups={lookups} />
    </div>
  );
}
