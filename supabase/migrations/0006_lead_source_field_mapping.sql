-- Per-source webhook payload field mapping.
-- Maps arbitrary inbound payload shapes (Meta lead ads, web forms, Zapier, etc.)
-- to contact fields without code changes. Keys are contact fields; values are
-- dot-paths into the payload (array indices supported, e.g. "data.0.email").
--
--   { "name": "lead.full_name", "phone": "lead.phone", "email": "contact.emailAddress" }
--
-- NULL / {} ⇒ default heuristic extraction (name/full_name/first_name, etc.) applies.
ALTER TABLE public.lead_sources
  ADD COLUMN IF NOT EXISTS field_mapping jsonb;

COMMENT ON COLUMN public.lead_sources.field_mapping IS
  'Contact-field → payload dot-path mapping for the inbound webhook. Mapped values take precedence over heuristic extraction.';
