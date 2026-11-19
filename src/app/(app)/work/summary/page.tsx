import { CopyButton } from "@/components/forms";
import { Card, PageHeader, btn } from "@/components/ui";
import { getInvoices, getJsr } from "@/lib/data";
import { todayIST } from "@/lib/format";
import { weeklySummary } from "@/lib/summary";
import { requireUser } from "@/lib/supabase/server";
import { WorkTabs } from "../_tabs";

export const metadata = { title: "Weekly JSR summary" };

export default async function Summary() {
  const { supabase } = await requireUser();
  const [jsr, invoices] = await Promise.all([getJsr(supabase), getInvoices(supabase)]);
  const text = weeklySummary(jsr, invoices, todayIST());
  return (
    <div>
      <PageHeader title="Weekly summary" sub="Plain text — paste into WhatsApp, email or Slack" action={<CopyButton text={text} label="Copy summary" className={btn.primary} />} />
      <WorkTabs active="/work/summary" />
      <Card className="p-4"><pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{text}</pre></Card>
    </div>
  );
}
