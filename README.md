# Ledger + JSR

A private, single-user PWA that combines personal finances (loans, credit cards, money owed) with an agency **Job Status Report** (clients → projects/retainers → deliverables, invoices). Open it in the morning and see what to pay, who to chase and what you owe a client today.

- INR with Indian grouping (₹1,25,000). All dates and reminders run on **Asia/Kolkata**.
- Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Auth + Postgres with owner-only row-level security).
- Mobile-first; installable on iPhone and desktop. Web Push is optional, and the in-app reminder inbox always works.

## What's where

| Area | Path |
|---|---|
| Home: three tiles, Needs attention, 30-day cash flow, debt trend, quick add, search | `src/app/(app)/page.tsx` |
| Finance: due/overdue filters, loans, cards, money owed, spending | `src/app/(app)/finance/**` |
| Work: JSR table + board, invoices, clients, weekly summary | `src/app/(app)/work/**` |
| Reminders inbox, settings, backup/restore | `src/app/(app)/inbox`, `src/app/(app)/settings` |
| Database schema, views, payment logic, reminders, demo mode | `supabase/migrations/*.sql` |
| Scheduler (server-side) | `src/app/api/cron/reminders/route.ts` → `src/lib/scheduler.ts` |
| Service worker / manifest | `public/sw.js`, `src/app/manifest.ts` |

**Design rules enforced in the database:** balances and statuses are always derived from payments (views `v_loans`, `v_card_statements`, `v_debts`, `v_invoices`, `v_obligations`). Recording a payment is a single transaction, so the payment, the balance and the reminder state change together. Each sent invoice appears once in `v_obligations`, and that view is the only source the dashboard cash flow reads. Agency receivables (`agency_receivable`) are kept separate from personal money owed to you (`personal_receivable`).

## Local setup

Requires Node 20+ and Docker (for the local Supabase stack).

```bash
npm install
```
```bash
npx supabase start          # local Postgres + Auth; applies supabase/migrations
```
```bash
cp .env.example .env.local  # then fill in the values printed by `supabase start` (API URL, anon key, service_role key)
```
```bash
npx web-push generate-vapid-keys   # paste into NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
```
```bash
npm run dev                 # http://localhost:3000
```

The first time, set `ALLOW_SIGNUP=true` to create your owner account on the sign-in page, then set it back to `false`. Use **Settings → Demo mode** to explore with sample data. Demo records are flagged `DEMO`, and one tap removes them without touching your real records.

### Checks

```bash
npm run typecheck && npm run lint && npm test   # unit tests (formatting, cash flow, attention list, messages, CSV)
```
```bash
npm run test:db      # pgTAP: payments, reminders, JSR automation, invoices, backup/restore, RLS (needs supabase start)
```
```bash
npm run build && npm run test:e2e   # browser end-to-end of the core flows (needs supabase start + Playwright Chromium)
```

## Deploy (Supabase + Vercel)

1. Create a Supabase project. Push the schema:
   ```bash
   npx supabase link --project-ref YOUR_REF
   ```
   ```bash
   npx supabase db push
   ```
2. Create your login in Supabase → Authentication → Users → **Add user → Create new user** (tick **Auto Confirm User**). Then in Authentication → Sign In / Providers, **turn off "Allow new users to sign up"**. Keep `ALLOW_SIGNUP=false` in the app.
3. Import the repo into Vercel and set every variable from `.env.example` (Production). `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY` and `CRON_SECRET` are server-only; never prefix them with `NEXT_PUBLIC_`. Set `ALLOWED_EMAILS` to your email.
4. Scheduler: `vercel.json` calls `/api/cron/reminders` daily at 03:30 UTC (= 9:00 IST); Vercel sends `Authorization: Bearer $CRON_SECRET` automatically. If you change the reminder time, or want retries during the day, also run `supabase/scheduler.sql` (pg_cron every 15 minutes). Running the scheduler more often never duplicates notifications.

## Install on iPhone

1. Open the site in **Safari** (iOS 16.4+), tap **Share → Add to Home Screen**.
2. Open **Ledger** from the Home Screen and sign in. The installed app keeps its own session, which is why sign-in uses a password rather than an email link.
3. **Settings → Push notifications → Enable notifications → Allow**, then **Send test notification**.
4. If nothing arrives, check iOS Settings → Notifications → Ledger and any Focus mode.

## Spending

Tap **₹ Add spend** on Home (or **+ → Spending**). Enter the amount, tap a category (Grocery, Vegetables & fruits, Meat & fish, Dairy, Fuel, …, or **+ New** for your own) and how you paid (UPI, Cash, Debit/Credit card, Net banking, Wallet). The date is filled in with today's date (India time); change it for an older spend. Home shows today / last 7 days / this month with the top categories. **Finance → Spending** has month-by-month totals by category and payment mode, filters, edit/delete and CSV export.

Spends are tracked separately from the cash-flow chart, so a credit-card spend isn't counted twice (once when you buy, again when the card bill is paid).

## Reminders

- **Outgoing payments** (loan EMIs, card bills, money you owe with a due date or instalments): a reminder **5 calendar days before** (configurable). Optionally a second alert on the due date and one once overdue (Settings). Each item has one current reminder, so the inbox never lists the same bill twice.
- **Expected receipts** (sent invoices, money owed to you), **JSR action dates** and **follow-up dates** (JSR and personal) also create reminders.
- Default time **09:00 IST**. Lock-screen text is **discreet by default** ("Reminder: you have something due"); turn that off in Settings to show names and amounts.
- Reminders are reconciled from your data on every change and every scheduler run. A changed due date moves the reminder. A partial payment keeps it, with the new remaining amount. Full payment resolves it.
- **No duplicates:** each reminder has a unique key, and each (reminder, device) push is claimed in `push_deliveries` before sending. Scheduler retries and overlapping runs can't send twice. Failed pushes retry up to 3 times. Expired devices are removed.

## Backup & restore

- **Settings → Download full backup** saves a JSON file of all your records.
- **Restore** replaces all your records with a backup in one transaction (all or nothing). You type `REPLACE` to confirm.
- CSV exports cover dues, loans, card statements, money owed, JSR and invoices. Cells are protected against spreadsheet formula injection.

## Privacy & security

- Every table has `owner_id` and an owner-only RLS policy. Child rows use composite foreign keys, so a row can't be attached to someone else's record. Views run as the caller (`security_invoker`).
- Server-only secrets stay on the server. The browser only gets the anon key, which can't read anything without your session.
- Sign-in can be restricted to `ALLOWED_EMAILS` (checked server-side in middleware).
- The app stores no bank logins, no full card numbers and no CVVs (only optional last-4 digits, validated as 4 digits).
- The service worker caches only the offline page, icons and hashed static bundles. Pages, data and API responses are never cached. Signed-in pages are sent with `Cache-Control: private, no-store`.
