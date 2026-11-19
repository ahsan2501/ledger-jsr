-- OPTIONAL: run the reminder scheduler every 15 minutes from Supabase itself
-- (works on the free plan; use this instead of / as well as the Vercel cron).
-- 1. Database → Extensions: enable pg_cron and pg_net.
-- 2. Replace the URL and secret below, then run this in the SQL editor.
--    The secret must equal CRON_SECRET in your Vercel env.
select cron.schedule(
  'ledger-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://YOUR-APP.vercel.app/api/cron/reminders',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')
  );
  $$
);
-- To remove: select cron.unschedule('ledger-reminders');
