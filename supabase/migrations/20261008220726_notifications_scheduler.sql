-- Notification data remains in server-only portal_state and uses portal_commit revisions.
-- Enable the project-local scheduler and HTTP transport. No new public tables or grants.
create extension if not exists pg_cron;
create extension if not exists pg_net;
revoke usage on schema cron, net from public, anon, authenticated;

-- Store the dispatch bearer in Vault as team_sweden_notifications_cron before enabling
-- this job. The deployed app must have the same CRON_SECRET. No secret in cron.job.
select cron.schedule(
  'team-sweden-notifications',
  '* * * * *',
  $job$
    select net.http_get(
      url := 'https://prospect-portal-one.vercel.app/api/notifications/dispatch',
      headers := jsonb_build_object('Authorization', 'Bearer ' ||
        (select decrypted_secret from vault.decrypted_secrets where name = 'team_sweden_notifications_cron')),
      timeout_milliseconds := 55000
    );
  $job$
);
