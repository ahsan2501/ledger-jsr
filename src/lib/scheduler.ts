import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayIST } from "./format";
import { payloadFor, type PushSender, type PushSub } from "./push";

/**
 * Server-side reminder job. Safe to run as often as you like and to retry:
 *  1. run_maintenance per owner: roll EMI schedules, reconcile reminders (unique per
 *     dedupe key), take month-end snapshots.
 *  2. push due reminders. Each (reminder, device) pair is claimed with a unique row
 *     in push_deliveries before sending, so retries and overlapping runs never send
 *     the same notification twice.
 */
export async function runScheduler(admin: SupabaseClient, sender: PushSender | null, now = new Date()) {
  const stats = { owners: 0, dueReminders: 0, sent: 0, skippedAlreadySent: 0, failed: 0, removedSubscriptions: 0 };
  const { data: profiles, error } = await admin.from("profiles").select("owner_id, discreet_push");
  if (error) throw error;
  for (const p of profiles ?? []) {
    const { error: e } = await admin.rpc("run_maintenance", { p_owner: p.owner_id });
    if (e) throw e;
    stats.owners++;
  }
  if (!sender) return stats;

  const today = todayIST(now);
  const { data: due, error: e2 } = await admin
    .from("reminders")
    .select("id, owner_id, title, detail, href")
    .eq("status", "active")
    .eq("is_demo", false)
    .lte("fire_at", now.toISOString())
    .gte("remind_on", addDays(today, -2)) // don't push stale backlog
    .order("fire_at");
  if (e2) throw e2;
  stats.dueReminders = due?.length ?? 0;
  if (!due?.length) return stats;

  const { data: subs } = await admin.from("push_subscriptions").select("id, owner_id, endpoint, p256dh, auth");
  const discreet = new Map((profiles ?? []).map((p) => [p.owner_id, p.discreet_push !== false]));
  const gone = new Set<string>();

  for (const r of due) {
    for (const sub of (subs ?? []) as PushSub[]) {
      if (sub.owner_id !== r.owner_id || gone.has(sub.id)) continue;
      // claim (idempotent)
      const { data: claimed } = await admin
        .from("push_deliveries")
        .upsert({ owner_id: r.owner_id, reminder_id: r.id, subscription_id: sub.id }, { onConflict: "reminder_id,subscription_id", ignoreDuplicates: true })
        .select("id, attempts");
      let deliveryId = claimed?.[0]?.id as string | undefined;
      if (!deliveryId) {
        // previously failed? retry up to 3 attempts
        const { data: retry } = await admin
          .from("push_deliveries")
          .select("id, attempts, status")
          .eq("reminder_id", r.id).eq("subscription_id", sub.id).single();
        if (retry && retry.status === "failed" && retry.attempts < 3) {
          const { data: re } = await admin.from("push_deliveries")
            .update({ status: "sending", attempts: retry.attempts + 1 })
            .eq("id", retry.id).eq("status", "failed").eq("attempts", retry.attempts).select("id");
          deliveryId = re?.[0]?.id;
        }
        if (!deliveryId) { stats.skippedAlreadySent++; continue; }
      }
      const res = await sender(sub, payloadFor(r, discreet.get(r.owner_id) ?? true));
      if (res.ok) {
        stats.sent++;
        await admin.from("push_deliveries").update({ status: "sent", error: null }).eq("id", deliveryId);
        await admin.from("reminders").update({ pushed_at: new Date().toISOString() }).eq("id", r.id).is("pushed_at", null);
        await admin.from("push_subscriptions").update({ last_success_at: new Date().toISOString() }).eq("id", sub.id);
      } else if (res.gone) {
        gone.add(sub.id);
        stats.removedSubscriptions++;
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        stats.failed++;
        await admin.from("push_deliveries").update({ status: "failed", error: res.error.slice(0, 500) }).eq("id", deliveryId);
      }
    }
  }
  return stats;
}
