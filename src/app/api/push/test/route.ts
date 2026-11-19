import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushConfigured, webPushSender, type PushSub } from "@/lib/push";

export const runtime = "nodejs";

export async function POST() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: "Push is not configured on the server (VAPID keys missing)." }, { status: 503 });
  const { data: subs } = await sb.from("push_subscriptions").select("id, owner_id, endpoint, p256dh, auth");
  if (!subs?.length) return NextResponse.json({ error: "No device is subscribed yet. Tap “Enable notifications” first." }, { status: 400 });
  const { data: profile } = await sb.from("profiles").select("discreet_push").maybeSingle();
  let sent = 0, failed = 0;
  for (const s of subs as PushSub[]) {
    const res = await webPushSender(s, {
      title: profile?.discreet_push === false ? "Ledger + JSR test" : "Reminder",
      body: "Test notification — reminders will look like this.", url: "/inbox", tag: `test-${Date.now()}`,
    });
    if (res.ok) sent++;
    else { failed++; if (res.gone) await sb.from("push_subscriptions").delete().eq("id", s.id); }
  }
  return NextResponse.json({ ok: true, sent, failed });
}
