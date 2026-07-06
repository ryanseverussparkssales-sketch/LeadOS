-- 0007_client_digest.sql
-- Workstream 1B: Weekly client digest email.
-- Adds opt-in flag + override recipient to clients. The Monday cron
-- (/api/cron/client-digest) sends a last-7-days stats email to every client
-- with digest_enabled = true. Recipient resolution: digest_email first,
-- falling back to primary_contact_email.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS digest_enabled boolean DEFAULT false;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS digest_email text;

COMMENT ON COLUMN public.clients.digest_enabled IS
  'When true, the weekly client digest cron (/api/cron/client-digest, Mondays 13:00 UTC) emails this client a last-7-days outreach summary.';

COMMENT ON COLUMN public.clients.digest_email IS
  'Override recipient for the weekly digest. Falls back to primary_contact_email when null.';
