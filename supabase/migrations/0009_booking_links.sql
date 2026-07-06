-- 0009_booking_links.sql
-- Public booking links (Workstream 3I).
-- A booking_link belongs to one tenant (user_id) and exposes a public /book/{slug}
-- page. Slot computation + booking writes always derive the owner from this row,
-- never from client input.

CREATE TABLE IF NOT EXISTS public.booking_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  duration_minutes int NOT NULL DEFAULT 30,
  timezone text NOT NULL DEFAULT 'America/New_York',
  availability jsonb NOT NULL DEFAULT '{"mon":[["09:00","17:00"]],"tue":[["09:00","17:00"]],"wed":[["09:00","17:00"]],"thu":[["09:00","17:00"]],"fri":[["09:00","17:00"]]}',
  campaign_id uuid,
  client_id uuid,
  buffer_minutes int DEFAULT 15,
  max_days_ahead int DEFAULT 14,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Fast public lookup by slug (UNIQUE already indexes it, but keep an explicit
-- named index so it survives constraint refactors).
CREATE INDEX IF NOT EXISTS idx_booking_links_slug ON public.booking_links (slug);

-- Owner-scoped listing in the management UI.
CREATE INDEX IF NOT EXISTS idx_booking_links_user ON public.booking_links (user_id);

-- Slot computation queries appointments by owner + time window.
CREATE INDEX IF NOT EXISTS idx_appointments_owner_scheduled
  ON public.appointments (owner_user_id, scheduled_at);

NOTIFY pgrst, 'reload schema';
