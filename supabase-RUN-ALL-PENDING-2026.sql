-- ============================================================
-- LeadOS — ALL PENDING MIGRATIONS (Run this entire file)
-- Run in Supabase SQL Editor — all statements use IF NOT EXISTS
-- Split into blocks and run EACH BLOCK SEPARATELY to avoid
-- transaction rollbacks affecting other blocks.
-- ============================================================

-- ┌─────────────────────────────────────────────────────────┐
-- │  BLOCK 1: Soft Delete columns                           │
-- │  Run this block alone first, then run Block 2, etc.    │
-- └─────────────────────────────────────────────────────────┘
ALTER TABLE contacts    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE clients     ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE campaigns   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE projects    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE deals       ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE call_lists  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;


-- ┌─────────────────────────────────────────────────────────┐
-- │  BLOCK 2: Soft Delete indexes                           │
-- └─────────────────────────────────────────────────────────┘
CREATE INDEX IF NOT EXISTS idx_contacts_deleted_at   ON contacts(user_id, deleted_at)  WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_deleted_at    ON clients(user_id, deleted_at)   WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_deleted_at      ON deals(user_id, deleted_at)     WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_deleted_at  ON campaigns(deleted_at)           WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_deleted_at   ON projects(deleted_at)            WHERE deleted_at IS NOT NULL;


-- ┌─────────────────────────────────────────────────────────┐
-- │  BLOCK 3: Spotify + Widget settings + Time entries      │
-- └─────────────────────────────────────────────────────────┘
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS spotify_tokens JSONB;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS widget_settings JSONB;

CREATE TABLE IF NOT EXISTS time_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    description TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "time_entries_owner" ON time_entries
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_project ON time_entries(user_id, project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_date ON time_entries(user_id, started_at DESC);


-- ┌─────────────────────────────────────────────────────────┐
-- │  BLOCK 4: Contact Activities                            │
-- └─────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS contact_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL DEFAULT 'note',
    title TEXT,
    description TEXT,
    outcome TEXT,
    scheduled_at TIMESTAMPTZ,
    duration_minutes INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE contact_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "activities_owner" ON contact_activities
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_contact_activities_contact ON contact_activities(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_activities_user ON contact_activities(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_activities_type ON contact_activities(user_id, activity_type);


-- ┌─────────────────────────────────────────────────────────┐
-- │  BLOCK 5: Client Portal (team_members upgrades)         │
-- └─────────────────────────────────────────────────────────┘
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS portal_access BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_team_members_client ON team_members(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_team_members_portal ON team_members(member_email) WHERE portal_access = true;


-- ┌─────────────────────────────────────────────────────────┐
-- │  BLOCK 6: Scraper upgrades                              │
-- └─────────────────────────────────────────────────────────┘
ALTER TABLE scraped_contacts ADD COLUMN IF NOT EXISTS source_query TEXT;
ALTER TABLE scraped_contacts ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE scraped_contacts ADD COLUMN IF NOT EXISTS call_list_id UUID REFERENCES call_lists(id) ON DELETE SET NULL;
ALTER TABLE scraped_contacts ADD COLUMN IF NOT EXISTS notes TEXT;


-- ┌─────────────────────────────────────────────────────────┐
-- │  BLOCK 7: Documents upgrades                            │
-- └─────────────────────────────────────────────────────────┘
ALTER TABLE contact_documents ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE contact_documents ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE contact_documents ADD COLUMN IF NOT EXISTS tags TEXT[];
CREATE INDEX IF NOT EXISTS idx_docs_client ON contact_documents(client_id);
CREATE INDEX IF NOT EXISTS idx_docs_project ON contact_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_docs_user_cat ON contact_documents(user_id, document_category);


-- ┌─────────────────────────────────────────────────────────┐
-- │  BLOCK 8: Invoice enhancements                          │
-- └─────────────────────────────────────────────────────────┘
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS contract_type TEXT DEFAULT 'invoice';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS contract_start DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS contract_end DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS scope_of_work TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS expected_hours_weekly DECIMAL(6,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS expected_hours_monthly DECIMAL(6,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS project_ids UUID[];
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id) WHERE client_id IS NOT NULL;


-- ┌─────────────────────────────────────────────────────────┐
-- │  BLOCK 9: Phone number features                         │
-- └─────────────────────────────────────────────────────────┘
ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS forwarding_number TEXT;
ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS forwarding_enabled BOOLEAN DEFAULT false;
ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN DEFAULT true;
ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS voicemail_enabled BOOLEAN DEFAULT true;
ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS voicemail_transcribe BOOLEAN DEFAULT true;
ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS ring_timeout_seconds INTEGER DEFAULT 20;


-- ┌─────────────────────────────────────────────────────────┐
-- │  BLOCK 10: Email accounts                               │
-- └─────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS email_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    email_address TEXT NOT NULL,
    smtp_host TEXT NOT NULL DEFAULT 'smtp.gmail.com',
    smtp_port INTEGER NOT NULL DEFAULT 587,
    smtp_user TEXT NOT NULL,
    smtp_password_encrypted TEXT NOT NULL,
    is_default BOOLEAN DEFAULT false,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "email_accounts_owner" ON email_accounts
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_user ON email_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_client ON email_accounts(client_id) WHERE client_id IS NOT NULL;


-- ┌─────────────────────────────────────────────────────────┐
-- │  BLOCK 11: Knowledge base seed (Sparks + Welfel)        │
-- │  Only runs if those clients exist in your DB            │
-- └─────────────────────────────────────────────────────────┘
DO $$
DECLARE
  v_user_id UUID := (SELECT id FROM auth.users LIMIT 1);
  v_sparks_id UUID := (SELECT id FROM clients WHERE name ILIKE '%sparks%' LIMIT 1);
  v_welfel_id UUID := (SELECT id FROM clients WHERE name ILIKE '%welfel%' LIMIT 1);
BEGIN
  IF v_sparks_id IS NOT NULL THEN
    INSERT INTO client_knowledge (user_id, client_id, title, content, knowledge_type, sort_order)
    VALUES
    (v_user_id, v_sparks_id, 'Agency Overview',
     'Sparks Curiosity Studio is a boutique sales agency founded by Ryan Sparks. Specializes in outbound sales, cold calling, lead generation, and appointment setting for DTC brands. Track record: 10+ years of sales experience, $2M+ in pipeline built through cold calling.',
     'general', 1),
    (v_user_id, v_sparks_id, 'Core Services',
     'Outbound Calling Campaigns, Lead Generation, CRM Management, Script Development. Pricing: Sprint $1,500 flat, Retainer $2,000/mo, CRM Cleanup $500-800, AI Integration $1,000-2,500.',
     'product', 2),
    (v_user_id, v_sparks_id, 'Talking Points',
     'You get 10+ years of cold calling experience without the cost of a full-time SDR. We''ve built over $2M in pipeline through outbound alone — not ads, not inbound. Results-focused: appointments set and pipeline created. Uses LeadOS CRM for real-time tracking.',
     'talking_points', 3)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_welfel_id IS NOT NULL THEN
    INSERT INTO client_knowledge (user_id, client_id, title, content, knowledge_type, sort_order)
    VALUES
    (v_user_id, v_welfel_id, 'Company Overview',
     'Welfel Ventures is a DTC brand portfolio company founded 2017 by Bryan and Peter Welfel. Tagline: "Process is our craft." Portfolio: The Beard Club (Chairman/CEO Bryan Welfel, $22.4M raised, 29 employees), iotty Smart Home (design-forward WiFi smart switches, $10M+ projected 2026), Huntt.gg (gaming rewards platform, launched 2024, iOS + Android).',
     'general', 1),
    (v_user_id, v_welfel_id, 'Key Contacts',
     'Bryan Welfel — Co-Founder, CEO The Beard Club. Twitter: @bwelfel. Location: New York, NY. Background: Founded JSwipe (sold 2015), DTC/tech strategist. Peter Welfel — Co-Founder. Background: 10+ years pharma, operations expert.',
     'general', 2),
    (v_user_id, v_welfel_id, 'Outreach Strategy',
     'The Beard Club: Target men''s lifestyle media, subscription box retailers, corporate gifting. iotty: Target residential electricians (B2B high LTV), home builders, interior designers. Huntt.gg: Target gaming streamers, esports teams, Gen Z brands. Current Ryan role: CS for iotty + streamer outreach for Huntt.',
     'talking_points', 3)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;


-- ┌─────────────────────────────────────────────────────────┐
-- │  BLOCK 12: Wrench Node project + Huntt streamers        │
-- │  Only runs if Wrench Node client exists                  │
-- └─────────────────────────────────────────────────────────┘
DO $$
DECLARE
  v_user_id UUID := (SELECT id FROM auth.users LIMIT 1);
  v_welfel_id UUID := (SELECT id FROM clients WHERE name ILIKE '%welfel%' LIMIT 1);
  v_wrench_id UUID := (SELECT id FROM clients WHERE name ILIKE '%wrench%' LIMIT 1);
  v_huntt_proj_id UUID;
  v_wrench_proj_id UUID;
  v_streamer_camp_id UUID;
  v_mechanics_camp_id UUID;
  v_streamer_list_id UUID;
  v_mechanics_list_id UUID;
BEGIN

  -- Wrench Node project
  IF v_wrench_id IS NOT NULL THEN
    INSERT INTO projects (client_id, name)
    VALUES (v_wrench_id, 'Tampa Bay Mechanics Outreach')
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_wrench_proj_id;

    IF v_wrench_proj_id IS NOT NULL THEN
      INSERT INTO campaigns (project_id, name, status, user_id)
      VALUES (v_wrench_proj_id, 'Tampa Bay Mechanics - Cold Call', 'active', v_user_id)
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_mechanics_camp_id;

      IF v_mechanics_camp_id IS NOT NULL THEN
        INSERT INTO call_lists (campaign_id, name, status)
        VALUES (v_mechanics_camp_id, 'Tampa Mechanics CSV (70 contacts)', 'active')
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_mechanics_list_id;
      END IF;

      INSERT INTO client_knowledge (user_id, client_id, title, content, knowledge_type)
      VALUES (v_user_id, v_wrench_id, 'Project Details',
        'Tampa Bay mechanics CSV — 70 contacts (verified). $175 of $350 paid, $175 outstanding. 6hrs calling remaining. Currently at $25/hr — UNDERCHARGING, reprice to $50-75/hr. Deliverable: booked appointments or qualified leads from mechanic shops. Last touchpoint: May 2026.',
        'general')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- Huntt.gg Streamer Outreach project
  IF v_welfel_id IS NOT NULL THEN
    INSERT INTO projects (client_id, name)
    VALUES (v_welfel_id, 'Huntt.gg Streamer Outreach')
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_huntt_proj_id;

    IF v_huntt_proj_id IS NOT NULL THEN
      INSERT INTO campaigns (project_id, name, status, user_id)
      VALUES (v_huntt_proj_id, 'Streamer Partnership 2026', 'active', v_user_id)
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_streamer_camp_id;

      IF v_streamer_camp_id IS NOT NULL THEN
        INSERT INTO call_lists (campaign_id, name, status)
        VALUES (v_streamer_camp_id, 'Streamers - Tier A + B (50 loaded)', 'active')
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_streamer_list_id;
      END IF;
    END IF;
  END IF;

END $$;


-- ┌─────────────────────────────────────────────────────────┐
-- │  BLOCK 13: Notion tasks import                          │
-- └─────────────────────────────────────────────────────────┘
DO $$
DECLARE
  v_user_id UUID := (SELECT id FROM auth.users LIMIT 1);
BEGIN
  INSERT INTO tasks (user_id, title, status, priority, task_type, description)
  VALUES
    (v_user_id, 'Upwork profile overhaul', 'pending', 'urgent', 'follow_up', 'Full rewrite. Senior sales ops without FT hire. $2M pipeline. AI-native. 4 packages listed.'),
    (v_user_id, 'Wrench Node power calling session', 'pending', 'urgent', 'follow_up', 'Afternoon block. 6 hrs left. $175 still outstanding. Score leads first.'),
    (v_user_id, 'Havens power calling session', 'pending', 'urgent', 'follow_up', '8-11am. Dumb dialer rule: open and dial first. $100/meeting set.'),
    (v_user_id, 'Build service packages', 'pending', 'high', 'follow_up', 'Sprint $1,500 flat. Retainer $2,000/mo. CRM Cleanup $500-800. AI Integration $1,000-2,500.'),
    (v_user_id, 'Email forwarding setup', 'pending', 'high', 'task', 'Forward all Gmails + Outlook to one main Gmail. Iotty inbox stays separate on tablet.'),
    (v_user_id, 'Bill Welfel the $44 tool cost', 'pending', 'high', 'follow_up', 'Their tool expense not yours. Add to next Bryan invoice.'),
    (v_user_id, 'Refine Streamer Outreach Proof', 'pending', 'high', 'follow_up', 'Refine the Huntt.gg streamer outreach proposal and approach.'),
    (v_user_id, 'Insurance coverage verification', 'pending', 'medium', 'task', 'Insurance being difficult. Re-verify coverage before appointment.'),
    (v_user_id, 'Inbox nuclear option', 'pending', 'medium', 'task', 'Gmail: search older_than:6m -> select all -> archive. Do all 3 Gmails.'),
    (v_user_id, 'Pass tool costs to clients', 'pending', 'medium', 'task', 'Adobe $38 + Canva $14 + JustCall portion = ~$74/mo billable back to clients.'),
    (v_user_id, 'Find ghost subscriptions', 'pending', 'medium', 'task', 'Open bank app, filter recurring charges. Kill anything not on approved list. Target: $100 random savings.'),
    (v_user_id, 'Sparks Curiosity LLC formation', 'pending', 'medium', 'task', 'Critical for mortgage qualification. Lenders want clean business entity + documented income.'),
    (v_user_id, 'Open business bank account', 'pending', 'medium', 'task', 'Need separate business account once LLC is formed.'),
    (v_user_id, 'Register LLC in Minnesota', 'pending', 'medium', 'task', 'File with MN Secretary of State.'),
    (v_user_id, 'Build Sparks Command Center - Phase 1', 'pending', 'medium', 'task', 'Clients/projects hierarchy and full LeadOS setup.'),
    (v_user_id, 'Kill CC debt $1,200', 'pending', 'high', 'task', 'Use Welfel payment + roommate. Dead by May 15.'),
    (v_user_id, 'NAS setup', 'pending', 'low', 'task', '2-bay starter NAS + drives $400-600. Centralizes media, client files, backups.'),
    (v_user_id, 'Steam Deck setup', 'pending', 'low', 'task', '9pm-12am gaming block. Protect the decompression time.'),
    (v_user_id, 'Home automation + mini PC', 'pending', 'low', 'task', 'Always-on mini PC for NAS management + home automation.'),
    (v_user_id, 'Desk rework + cable management', 'pending', 'low', 'task', '90in IKEA top. Monitor + KB arms incoming. 5-screen layout.')
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================
-- DONE — All 13 blocks complete
-- ============================================================
