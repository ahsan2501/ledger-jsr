import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayIST } from "@/lib/format";

export async function GET() {
  const sb = await createClient();
  const { data, error } = await sb.rpc("export_backup");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return new NextResponse(JSON.stringify(data, null, 1), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="ledger-jsr-backup-${todayIST()}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
