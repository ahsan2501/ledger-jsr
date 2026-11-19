"use server";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/forms";
import { createClient } from "@/lib/supabase/server";
import { act, int, must, req } from "./_util";

type R = Promise<ActionResult>;

export async function updateProfile(_: ActionResult, fd: FormData): R {
  return act(async (sb, user) => {
    const t = req(fd, "reminder_time", "Reminder time");
    must(await sb.from("profiles").update({
      reminder_time: t,
      advance_days: int(fd, "advance_days") ?? 5,
      alert_on_due: fd.get("alert_on_due") === "on",
      alert_overdue: fd.get("alert_overdue") === "on",
      remind_receipts: fd.get("remind_receipts") === "on",
      remind_work: fd.get("remind_work") === "on",
      discreet_push: fd.get("discreet_push") === "on",
      client_wait_days: int(fd, "client_wait_days") ?? 3,
    }).eq("owner_id", user.id));
    return "Settings saved";
  });
}

export async function loadDemo(_: ActionResult): R {
  return act(async (sb) => { must(await sb.rpc("load_demo_data")); return "Demo data loaded"; });
}
export async function clearDemo(_: ActionResult): R {
  return act(async (sb) => { must(await sb.rpc("clear_demo_data")); return "Demo data removed"; });
}

export async function restoreBackup(_: ActionResult, fd: FormData): R {
  return act(async (sb) => {
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a backup file");
    if (fd.get("confirm") !== "REPLACE") throw new Error('Type REPLACE to confirm');
    let json: unknown;
    try { json = JSON.parse(await file.text()); } catch { throw new Error("That file is not valid JSON"); }
    must(await sb.rpc("restore_backup", { p_backup: json }));
    return "Backup restored";
  });
}

export async function reminderAction(_: ActionResult, fd: FormData): R {
  return act(async (sb, user) => {
    const op = req(fd, "op", "Action");
    const id = fd.get("id")?.toString();
    if (op === "read" && id) must(await sb.from("reminders").update({ read_at: new Date().toISOString() }).eq("id", id));
    else if (op === "dismiss" && id) must(await sb.from("reminders").update({ status: "dismissed", read_at: new Date().toISOString() }).eq("id", id));
    else if (op === "read_all") must(await sb.from("reminders").update({ read_at: new Date().toISOString() }).eq("owner_id", user.id).is("read_at", null).eq("status", "active"));
    else throw new Error("Unknown action");
  });
}

export async function signOut() {
  const sb = await createClient();
  await sb.auth.signOut();
  redirect("/login");
}
