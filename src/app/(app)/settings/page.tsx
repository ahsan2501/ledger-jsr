import { ActionForm, Check, DateInput, Field, InlineAction, MoneyInput, Row, SheetButton, TextInput } from "@/components/forms";
import { PushSettings } from "@/components/push-settings";
import { DeleteButton } from "@/components/row-actions";
import { Card, CardHeader, PageHeader, btn } from "@/components/ui";
import { addSnapshot, snapshotNow } from "@/app/actions/finance";
import { clearDemo, loadDemo, restoreBackup, signOut, updateProfile } from "@/app/actions/settings";
import { getProfile, hasDemo } from "@/lib/data";
import { fmtDate, inr, monthBounds, toNum, todayIST, addDays } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const { supabase, user } = await requireUser();
  const today = todayIST();
  const [p, demo, { count: devices }, { data: snaps }] = await Promise.all([
    getProfile(supabase), hasDemo(supabase),
    supabase.from("push_subscriptions").select("id", { count: "exact", head: true }),
    supabase.from("balance_snapshots").select("*").order("snapshot_on", { ascending: false }).limit(24),
  ]);
  const lastMonthEnd = addDays(monthBounds(today).start, -1);
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" sub={`Signed in as ${user.email}`} />

      <Card>
        <CardHeader title="Reminders" sub="All times are India time (Asia/Kolkata)" />
        <div className="px-4 pb-4">
          <ActionForm action={updateProfile} submitLabel="Save reminder settings">
            <Row>
              <Field label="Reminder time"><TextInput type="time" name="reminder_time" defaultValue={p.reminder_time.slice(0, 5)} required /></Field>
              <Field label="Days before payments" hint="Default 5 calendar days"><TextInput name="advance_days" inputMode="numeric" defaultValue={p.advance_days} /></Field>
            </Row>
            <Check name="alert_on_due" defaultChecked={p.alert_on_due} label="Also alert on the due date" />
            <Check name="alert_overdue" defaultChecked={p.alert_overdue} label="Alert once when overdue" />
            <Check name="remind_receipts" defaultChecked={p.remind_receipts} label="Remind me about expected receipts (invoices, money owed to me)" />
            <Check name="remind_work" defaultChecked={p.remind_work} label="Remind me about JSR actions and client follow-ups" />
            <Check name="discreet_push" defaultChecked={p.discreet_push} label="Discreet lock-screen text (no names or amounts)" />
            <Field label="Flag items waiting on a client after (days)"><TextInput name="client_wait_days" inputMode="numeric" defaultValue={p.client_wait_days} /></Field>
          </ActionForm>
        </div>
      </Card>

      <Card>
        <CardHeader title="Push notifications" sub="Optional. Reminders always appear in the in-app inbox." />
        <div className="space-y-4 px-4 pb-4">
          <PushSettings vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} deviceCount={devices ?? 0} />
          <details className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
            <summary className="font-medium">Install on iPhone & allow notifications</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
              <li>Open this site in <strong>Safari</strong> (iOS 16.4 or later).</li>
              <li>Tap the <strong>Share</strong> button → <strong>Add to Home Screen</strong> → Add.</li>
              <li>Open <strong>Ledger</strong> from the Home Screen icon and sign in again (the installed app keeps its own session).</li>
              <li>Come back here and tap <strong>Enable notifications</strong>, then <strong>Allow</strong>.</li>
              <li>Tap <strong>Send test notification</strong>. If nothing arrives, check iOS Settings → Notifications → Ledger, and that Focus mode isn&apos;t hiding it.</li>
            </ol>
            <p className="mt-2 text-muted">On Android/desktop Chrome or Edge, use the browser&apos;s Install button, then enable notifications here.</p>
          </details>
        </div>
      </Card>

      <Card>
        <CardHeader title="Backup & export" sub="Your data, in your hands" />
        <div className="space-y-3 px-4 pb-4 text-sm">
          <div className="flex flex-wrap gap-2">
            <a className={btn.primary} href="/api/export/backup">Download full backup (JSON)</a>
            <a className={btn.secondary} href="/api/export/csv?type=obligations">Dues CSV</a>
            <a className={btn.secondary} href="/api/export/csv?type=loans">Loans CSV</a>
            <a className={btn.secondary} href="/api/export/csv?type=cards">Card statements CSV</a>
            <a className={btn.secondary} href="/api/export/csv?type=debts">Money owed CSV</a>
            <a className={btn.secondary} href="/api/export/csv?type=expenses">Spending CSV</a>
            <a className={btn.secondary} href="/api/export/csv?type=jsr">JSR CSV</a>
            <a className={btn.secondary} href="/api/export/csv?type=invoices">Invoices CSV</a>
          </div>
          <SheetButton className={btn.danger} label="Restore from backup…" title="Restore backup">
            <ActionForm action={restoreBackup} submitLabel="Replace all my data" danger>
              <p className="text-sm">This <strong>replaces all of your records</strong> with the backup file, in one step (all or nothing). Download a fresh backup first if unsure.</p>
              <Field label="Backup file (.json)"><input type="file" name="file" accept="application/json,.json" required className="block w-full text-sm" /></Field>
              <Field label='Type "REPLACE" to confirm'><TextInput name="confirm" required autoComplete="off" /></Field>
            </ActionForm>
          </SheetButton>
        </div>
      </Card>

      <Card>
        <CardHeader title="Debt history" sub="Month-end balances for the debt trend chart. Saved automatically on the last day of each month." action={
          <div className="flex gap-2">
            <InlineAction action={snapshotNow} fields={{}} label="Snapshot now" />
            <SheetButton label="Add month-end" title="Add month-end balance">
              <ActionForm action={addSnapshot}>
                <Field label="Month-end date"><DateInput name="snapshot_on" defaultValue={lastMonthEnd} required /></Field>
                <Row>
                  <Field label="Loans outstanding"><MoneyInput name="loans_total" /></Field>
                  <Field label="Card balances"><MoneyInput name="cards_total" /></Field>
                </Row>
                <Field label="Personal money I owe"><MoneyInput name="owe_total" /></Field>
              </ActionForm>
            </SheetButton>
          </div>} />
        <ul className="divide-y divide-line px-4 pb-2 text-sm">
          {(snaps ?? []).map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 py-2">
              <span>{fmtDate(s.snapshot_on, today)} <span className="text-xs text-muted">{s.source}{s.is_demo ? " · DEMO" : ""}</span></span>
              <span className="tabular">{inr(toNum(s.loans_total) + toNum(s.cards_total) + toNum(s.owe_total))}</span>
              <DeleteButton table="balance_snapshots" id={s.id} label="×" what="this snapshot" />
            </li>
          ))}
          {!(snaps ?? []).length ? <li className="py-2 text-muted">No history yet.</li> : null}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Demo mode" sub="Sample data is flagged DEMO and never mixes with your own records" />
        <div className="px-4 pb-4">
          {demo ? <InlineAction action={clearDemo} fields={{}} label="Remove demo data" className={btn.danger} confirm="Remove all DEMO records? Your own records stay." />
            : <InlineAction action={loadDemo} fields={{}} label="Load demo data" className={btn.secondary} />}
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-2 text-sm text-muted">Privacy: data is protected by owner-only database rules. The app never asks for bank logins, full card numbers or CVVs, and nothing financial is cached on this device.</p>
        <form action={signOut}><button className={btn.secondary}>Sign out</button></form>
      </Card>
    </div>
  );
}
