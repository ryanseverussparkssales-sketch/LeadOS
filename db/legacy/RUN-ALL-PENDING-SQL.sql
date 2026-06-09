-- ============================================================
-- LeadOS — All Pending Migrations
-- Run after: supabase-campaign-cadence.sql
-- Last updated: 2026-05-31
-- ============================================================


-- ── 1. UTM METADATA ──────────────────────────────────────────

-- UTM parameters + metadata passthrough for contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS utm_content TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS utm_term TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_metadata JSONB DEFAULT '{}';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_source_id UUID REFERENCES lead_sources(id) ON DELETE SET NULL;

-- Index for source attribution queries
CREATE INDEX IF NOT EXISTS idx_contacts_lead_source_id ON contacts(lead_source_id);
CREATE INDEX IF NOT EXISTS idx_contacts_utm_source ON contacts(utm_source) WHERE utm_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_utm_campaign ON contacts(utm_campaign) WHERE utm_campaign IS NOT NULL;

-- Add edit/delete support to lead_sources (fields were missing)
ALTER TABLE lead_sources ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE lead_sources ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE lead_sources ADD COLUMN IF NOT EXISTS metadata_schema JSONB DEFAULT '[]';
-- metadata_schema: [{key: 'ad_set_id', label: 'Ad Set ID', type: 'string'}]
-- defines what extra fields this source captures

-- Track daily/weekly lead counts per source
ALTER TABLE lead_sources ADD COLUMN IF NOT EXISTS leads_today INTEGER DEFAULT 0;
ALTER TABLE lead_sources ADD COLUMN IF NOT EXISTS leads_this_week INTEGER DEFAULT 0;
ALTER TABLE lead_sources ADD COLUMN IF NOT EXISTS last_lead_at TIMESTAMPTZ;


-- ── 2. WIN CONDITIONS ────────────────────────────────────────

-- Multiple win conditions per campaign (replaces single win_outcome)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS win_conditions JSONB DEFAULT '[]';
-- win_conditions format: [{ outcome: 'appointment_set', label: 'Appointment Set', weight: 1 }, ...]
-- weight: how many "wins" this outcome counts as (e.g. signed_up = 2 wins)

-- Win dedup: track which contacts have already generated a win for a campaign
CREATE TABLE IF NOT EXISTS campaign_wins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    outcome TEXT NOT NULL,
    weight INTEGER NOT NULL DEFAULT 1,
    call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(campaign_id, contact_id, outcome)  -- one win per outcome per contact per campaign
);

CREATE INDEX IF NOT EXISTS idx_campaign_wins_campaign ON campaign_wins(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_wins_contact ON campaign_wins(contact_id);
CREATE INDEX IF NOT EXISTS idx_campaign_wins_user ON campaign_wins(user_id);

-- RLS
ALTER TABLE campaign_wins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own campaign wins" ON campaign_wins
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Migrate existing win_outcome to win_conditions
UPDATE campaigns
SET win_conditions = jsonb_build_array(
    jsonb_build_object(
        'outcome', win_outcome,
        'label', COALESCE(win_label, win_outcome),
        'weight', 1
    )
)
WHERE win_outcome IS NOT NULL
  AND (win_conditions IS NULL OR win_conditions = '[]'::jsonb);


-- ── 3. CRON SUPPORT ──────────────────────────────────────────

-- Cron job run log
CREATE TABLE IF NOT EXISTS cron_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name TEXT NOT NULL UNIQUE,
    last_run TIMESTAMPTZ,
    last_result TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add current_value + last_reset to campaign_goals for daily tracking
ALTER TABLE campaign_goals ADD COLUMN IF NOT EXISTS current_value DECIMAL(10,2) DEFAULT 0;
ALTER TABLE campaign_goals ADD COLUMN IF NOT EXISTS last_reset DATE;

-- Add last_reset_date to campaigns if not already there
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS last_reset_date DATE;


-- ── 4. CADENCE ENGINE ────────────────────────────────────────

-- =============================================================
-- CADENCE ENGINE MIGRATION
-- Run this in Supabase SQL editor
-- =============================================================

-- 1. Cadence tracking columns on call_list_contacts
ALTER TABLE call_list_contacts ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 0;
ALTER TABLE call_list_contacts ADD COLUMN IF NOT EXISTS last_called_at TIMESTAMPTZ;
ALTER TABLE call_list_contacts ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ;
ALTER TABLE call_list_contacts ADD COLUMN IF NOT EXISTS cadence_complete BOOLEAN DEFAULT FALSE;
-- cadence_complete = TRUE when attempt_count >= campaign.calls_per_lead
-- OR contact outcome was do_not_call / not_interested / disconnected / signed_up

-- Index for the follow-up queue (tasks page, dialer prioritization)
CREATE INDEX IF NOT EXISTS idx_clc_next_follow_up ON call_list_contacts(next_follow_up_at)
    WHERE next_follow_up_at IS NOT NULL AND cadence_complete = FALSE;

-- 2. source / source_id on tasks (track what triggered each task)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source TEXT;     -- 'cadence' | 'ai' | 'manual'
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_id UUID;  -- FK to triggering call id (soft ref)

-- Index for looking up tasks spawned by a specific call
CREATE INDEX IF NOT EXISTS idx_tasks_source_id ON tasks(source_id) WHERE source_id IS NOT NULL;


-- ── 5. ROUTING RULES ─────────────────────────────────────────

-- Lead routing rules per lead source
CREATE TABLE IF NOT EXISTS lead_routing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lead_source_id UUID REFERENCES lead_sources(id) ON DELETE CASCADE,
    -- NULL lead_source_id = applies to ALL sources for this user

    rule_order INTEGER NOT NULL DEFAULT 0,
    name TEXT, -- human label e.g. "Route LLCs to enterprise"

    -- Condition
    condition_field TEXT NOT NULL,
    -- 'company', 'email', 'phone', 'lead_source', 'utm_source',
    -- 'utm_medium', 'utm_campaign', 'contact_type', 'any_field'

    condition_operator TEXT NOT NULL DEFAULT 'contains',
    -- 'contains', 'equals', 'starts_with', 'ends_with', 'not_contains', 'is_empty', 'not_empty', 'matches_regex'

    condition_value TEXT, -- the value to test against (null for is_empty/not_empty)

    -- Action
    action_type TEXT NOT NULL,
    -- 'assign_campaign', 'assign_call_list', 'add_tag', 'set_contact_type',
    -- 'set_status', 'skip' (discard lead), 'notify'

    action_value TEXT, -- campaign_id, call_list_id, tag name, type value, etc.

    stop_on_match BOOLEAN DEFAULT FALSE, -- if true, don't run further rules after this one matches
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routing_rules_source ON lead_routing_rules(lead_source_id, rule_order);
CREATE INDEX IF NOT EXISTS idx_routing_rules_user ON lead_routing_rules(user_id, rule_order);

ALTER TABLE lead_routing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own routing rules" ON lead_routing_rules
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- ── 6. REPLY ROUTING ─────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- Reply-To Campaign Tagging — schema additions
-- Run once against your Supabase project.
-- ─────────────────────────────────────────────────────────────────────────────

-- Add campaign/project/client routing columns to email_logs
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS project_id  UUID REFERENCES projects(id)  ON DELETE SET NULL;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS client_id   UUID REFERENCES clients(id)   ON DELETE SET NULL;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS reply_tag   TEXT;
-- reply_tag: the full +subaddress extracted from the To header (for debugging / re-parsing)

-- Index: fast campaign-scoped email queries (e.g. "show all emails for campaign X")
CREATE INDEX IF NOT EXISTS idx_email_logs_campaign
    ON email_logs(campaign_id, created_at DESC)
    WHERE campaign_id IS NOT NULL;

-- Add direction column before any index that references it
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'outbound';

-- Index: fast client-scoped directional queries (e.g. "all inbound for client X")
CREATE INDEX IF NOT EXISTS idx_email_logs_client
    ON email_logs(client_id, direction, created_at DESC)
    WHERE client_id IS NOT NULL;

-- Add inbound_address to email_accounts so we know which Resend inbound domain
-- this account receives on (e.g. "reply@mail.sparks.agency")
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS inbound_address TEXT;


-- ── 7. GMAIL OAUTH ───────────────────────────────────────────

-- Gmail OAuth fields for email_accounts table
-- Run this in Supabase SQL Editor

-- Provider type: 'smtp' | 'gmail' | 'outlook'
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'smtp';

-- OAuth tokens (stored encrypted via vault pattern)
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS oauth_access_token TEXT;
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS oauth_refresh_token TEXT;
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS oauth_token_expires_at TIMESTAMPTZ;
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS oauth_scopes TEXT[];

-- Gmail incremental sync — avoids re-fetching all mail on every poll
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS gmail_history_id TEXT;

-- Sync state
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS sync_enabled BOOLEAN DEFAULT TRUE;

-- Prevent duplicate connections to the same Google account
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS google_account_id TEXT;

-- Add 'email' column as alias for email_address so OAuth upsert can use a consistent key
-- (email_accounts originally used email_address; OAuth flow uses 'email' for brevity)
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS email TEXT
    GENERATED ALWAYS AS (email_address) STORED;

-- Make smtp_password_encrypted nullable so OAuth accounts don't need it
ALTER TABLE email_accounts ALTER COLUMN smtp_password_encrypted DROP NOT NULL;
ALTER TABLE email_accounts ALTER COLUMN smtp_host DROP NOT NULL;
ALTER TABLE email_accounts ALTER COLUMN smtp_port DROP NOT NULL;
ALTER TABLE email_accounts ALTER COLUMN smtp_user DROP NOT NULL;

-- Unique constraint to allow upsert on (user_id, email_address) for OAuth accounts
ALTER TABLE email_accounts DROP CONSTRAINT IF EXISTS email_accounts_user_email_unique;
ALTER TABLE email_accounts ADD CONSTRAINT email_accounts_user_email_unique
    UNIQUE (user_id, email_address);

-- Index for sync job — quickly find all gmail accounts that need polling
CREATE INDEX IF NOT EXISTS idx_email_accounts_provider ON email_accounts(user_id, provider)
    WHERE provider != 'smtp';

CREATE INDEX IF NOT EXISTS idx_email_accounts_sync ON email_accounts(provider, sync_enabled, last_synced_at)
    WHERE provider = 'gmail' AND sync_enabled = TRUE;


-- ── 8. SMS INBOX ─────────────────────────────────────────────

-- ── SMS Inbox Infrastructure ──────────────────────────────────

-- Add missing columns to sms_logs
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
-- NULL = unread (for inbound messages), NOT NULL = read

ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS intent_label TEXT;
-- AI classification: 'interested' | 'objection' | 'opt_out' | 'question' | 'callback_request' | 'referral' | 'neutral' | 'positive_reply'

ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS intent_score DECIMAL(3,2);
-- 0.0 to 1.0 confidence

ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS thread_id UUID;
-- Groups messages into a conversation thread per contact per phone_number

ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS is_opted_out BOOLEAN DEFAULT FALSE;
-- TRUE when STOP keyword detected

-- Fix: phone_number_id was never written on inbound — add it now
-- (already exists as column, just not populated)

-- Create thread index for fast conversation loading
CREATE INDEX IF NOT EXISTS idx_sms_logs_thread ON sms_logs(thread_id, sent_at DESC)
    WHERE thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_logs_contact_direction ON sms_logs(contact_id, direction, sent_at DESC)
    WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_logs_unread ON sms_logs(user_id, read_at)
    WHERE direction = 'inbound' AND read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sms_logs_from_number ON sms_logs(from_number, sent_at DESC);

-- Conversation threads table — one row per contact per phone number
CREATE TABLE IF NOT EXISTS sms_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    phone_number_id UUID REFERENCES phone_numbers(id) ON DELETE SET NULL,
    -- The "other party" number (contact or unknown)
    remote_number TEXT NOT NULL,
    -- Our number
    local_number TEXT NOT NULL,
    last_message_at TIMESTAMPTZ,
    last_message_body TEXT,
    last_message_direction TEXT, -- 'inbound' | 'outbound'
    unread_count INTEGER DEFAULT 0,
    is_opted_out BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, remote_number, local_number)
);

CREATE INDEX IF NOT EXISTS idx_sms_threads_user ON sms_threads(user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_threads_contact ON sms_threads(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_threads_unread ON sms_threads(user_id, unread_count) WHERE unread_count > 0;

ALTER TABLE sms_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own SMS threads" ON sms_threads
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Update sms_logs to reference thread
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS sms_thread_id UUID REFERENCES sms_threads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sms_logs_thread_id ON sms_logs(sms_thread_id, sent_at ASC);


-- ── 9. EMAIL INBOX ───────────────────────────────────────────

-- ── Email Inbox Infrastructure ────────────────────────────────

-- Add direction support to email_logs (currently outbound-only)
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'outbound';
-- 'inbound' | 'outbound'

ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
-- NULL = unread for inbound

ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS from_address TEXT;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS to_address TEXT;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS reply_to TEXT;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS in_reply_to TEXT; -- Message-ID header for threading
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS message_id TEXT UNIQUE; -- Email Message-ID header
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS thread_id TEXT; -- Groups email chains (same subject stripped of Re:/Fwd:)
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS html_body TEXT; -- Original HTML (body column = plain text)
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
-- [{filename, content_type, size, storage_path}]

ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS intent_label TEXT;
-- Same as SMS: interested | objection | opt_out | question | callback_request | referral | positive_reply | neutral

ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS intent_score DECIMAL(3,2);
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS spam_score DECIMAL(4,2);
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS resend_email_id TEXT; -- Resend's email ID

-- Indexes for inbox queries
CREATE INDEX IF NOT EXISTS idx_email_logs_direction ON email_logs(user_id, direction, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_unread ON email_logs(user_id, read_at)
    WHERE direction = 'inbound' AND read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_email_logs_thread ON email_logs(thread_id, created_at ASC)
    WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_logs_contact_inbound ON email_logs(contact_id, direction, created_at DESC)
    WHERE direction = 'inbound';
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_logs_message_id ON email_logs(message_id)
    WHERE message_id IS NOT NULL;

-- Email threads table
CREATE TABLE IF NOT EXISTS email_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    subject TEXT NOT NULL,
    thread_key TEXT NOT NULL, -- normalized subject (strips Re:/Fwd:)
    last_message_at TIMESTAMPTZ,
    last_message_body TEXT, -- snippet
    last_message_direction TEXT,
    unread_count INTEGER DEFAULT 0,
    message_count INTEGER DEFAULT 0,
    participants TEXT[], -- email addresses involved
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, thread_key, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_email_threads_user ON email_threads(user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_threads_unread ON email_threads(user_id, unread_count) WHERE unread_count > 0;

ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own email threads" ON email_threads
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Link email_logs to email_threads
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS email_thread_id UUID REFERENCES email_threads(id) ON DELETE SET NULL;


-- ── 10. STORAGE & ASSETS ─────────────────────────────────────

-- ============================================================
-- LeadOS Storage & Asset Management Migration
-- supabase-storage-assets.sql
-- Run in Supabase SQL editor
-- ============================================================
-- Depends on: supabase-COMPLETE-SCHEMA.sql, supabase-client-portal.sql
-- Tables touched: team_members, marketing_assets, contact_documents
-- Tables created: team_member_clients, asset_versions, asset_shares
-- Buckets created: assets, documents, recordings, avatars
-- Functions created: user_can_access_client_assets()
-- ============================================================


-- ── 1. TEAM MEMBER ROLES ─────────────────────────────────────
-- Add 'creator' as a supported role alongside 'agent'/'admin'/'client'
-- No schema change needed (role is free-text TEXT column)
-- Document supported values:
COMMENT ON COLUMN team_members.role IS
    'Supported roles: admin, agent, creator, client. '
    'admin=full access, agent=read+dial, creator=upload+manage assets, client=portal read-only';


-- ── 2. MULTI-CLIENT ACCESS (team_member_clients junction) ────
-- Replace the single client_id FK on team_members with a proper many-to-many.
-- The original client_id column is kept for backward compatibility with portal users.
-- New multi-client assignments go through this junction table.

CREATE TABLE IF NOT EXISTS team_member_clients (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    team_member_id  UUID        NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
    client_id       UUID        NOT NULL REFERENCES clients(id)      ON DELETE CASCADE,
    access_level    TEXT        NOT NULL DEFAULT 'read',
    -- 'read'   = view assets/contacts for this client
    -- 'write'  = upload/edit assets for this client
    -- 'manage' = full client management (add contacts, edit settings)
    granted_by      UUID        REFERENCES auth.users(id),
    granted_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_member_id, client_id)
);

-- Migrate existing single client_id assignments to the junction table.
-- Only migrates rows where the member has a scoped client_id and portal_access.
INSERT INTO team_member_clients (team_member_id, client_id, access_level, granted_by)
SELECT
    id              AS team_member_id,
    client_id,
    CASE WHEN role = 'admin' THEN 'manage' ELSE 'read' END AS access_level,
    owner_user_id   AS granted_by
FROM team_members
WHERE client_id    IS NOT NULL
  AND portal_access = TRUE
ON CONFLICT (team_member_id, client_id) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tmc_team_member ON team_member_clients(team_member_id);
CREATE INDEX IF NOT EXISTS idx_tmc_client      ON team_member_clients(client_id);

-- RLS
ALTER TABLE team_member_clients ENABLE ROW LEVEL SECURITY;

-- Workspace owners can fully manage access grants for their team members
CREATE POLICY "tmc_owner_all" ON team_member_clients
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.id = team_member_clients.team_member_id
              AND tm.owner_user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.id = team_member_clients.team_member_id
              AND tm.owner_user_id = auth.uid()
        )
    );

-- Team members can read their own client assignments (so the UI can scope their view)
CREATE POLICY "tmc_member_read_own" ON team_member_clients
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.id = team_member_clients.team_member_id
              AND tm.member_user_id = auth.uid()
        )
    );


-- ── 3. MARKETING ASSETS — ADD STORAGE COLUMNS ────────────────
-- Extend existing marketing_assets table with real file storage support.
-- All new columns use ADD COLUMN IF NOT EXISTS so this is safe to re-run.

-- Core storage reference
ALTER TABLE marketing_assets ADD COLUMN IF NOT EXISTS storage_path      TEXT;
-- Path format: {owner_user_id}/clients/{client_id}/{category}/{filename}
COMMENT ON COLUMN marketing_assets.storage_path IS
    'Supabase Storage object path. Format: {owner_user_id}/clients/{client_id}/{category}/{filename}';

ALTER TABLE marketing_assets ADD COLUMN IF NOT EXISTS storage_bucket    TEXT        DEFAULT 'assets';
ALTER TABLE marketing_assets ADD COLUMN IF NOT EXISTS file_size         BIGINT;
-- file_size in bytes
ALTER TABLE marketing_assets ADD COLUMN IF NOT EXISTS mime_type         TEXT;
ALTER TABLE marketing_assets ADD COLUMN IF NOT EXISTS original_filename TEXT;
ALTER TABLE marketing_assets ADD COLUMN IF NOT EXISTS uploaded_by       UUID        REFERENCES auth.users(id);

-- Versioning support
ALTER TABLE marketing_assets ADD COLUMN IF NOT EXISTS version           INTEGER     DEFAULT 1;
ALTER TABLE marketing_assets ADD COLUMN IF NOT EXISTS parent_asset_id   UUID        REFERENCES marketing_assets(id) ON DELETE SET NULL;
-- parent_asset_id: for versioning — v2 points to v1 as parent

ALTER TABLE marketing_assets ADD COLUMN IF NOT EXISTS is_latest_version BOOLEAN     DEFAULT TRUE;

-- Approval workflow
ALTER TABLE marketing_assets ADD COLUMN IF NOT EXISTS approved_by       UUID        REFERENCES auth.users(id);
ALTER TABLE marketing_assets ADD COLUMN IF NOT EXISTS approved_at       TIMESTAMPTZ;

-- Time-limited campaign assets
ALTER TABLE marketing_assets ADD COLUMN IF NOT EXISTS expires_at        TIMESTAMPTZ;
COMMENT ON COLUMN marketing_assets.expires_at IS
    'Optional expiry for time-limited campaign assets. NULL = never expires.';

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_marketing_assets_client_latest
    ON marketing_assets(client_id, is_latest_version)
    WHERE is_latest_version = TRUE;

CREATE INDEX IF NOT EXISTS idx_marketing_assets_parent
    ON marketing_assets(parent_asset_id)
    WHERE parent_asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_assets_uploaded_by
    ON marketing_assets(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_marketing_assets_expires
    ON marketing_assets(expires_at)
    WHERE expires_at IS NOT NULL;


-- ── 4. ASSET VERSIONS TABLE ──────────────────────────────────
-- Lightweight version log, separate from the assets table.
-- Every upload that replaces an existing asset writes a row here.

CREATE TABLE IF NOT EXISTS asset_versions (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id       UUID        NOT NULL REFERENCES marketing_assets(id) ON DELETE CASCADE,
    version        INTEGER     NOT NULL,
    storage_path   TEXT        NOT NULL,
    storage_bucket TEXT        NOT NULL DEFAULT 'assets',
    file_size      BIGINT,
    mime_type      TEXT,
    uploaded_by    UUID        REFERENCES auth.users(id),
    upload_note    TEXT,       -- e.g. "Updated logo colors for Q3"
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(asset_id, version)
);

CREATE INDEX IF NOT EXISTS idx_asset_versions_asset
    ON asset_versions(asset_id, version DESC);

ALTER TABLE asset_versions ENABLE ROW LEVEL SECURITY;

-- Asset version access follows the parent marketing_assets row's owner check.
-- Owners of the workspace can read/write all versions they own.
CREATE POLICY "asset_versions_owner_all" ON asset_versions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM marketing_assets ma
            WHERE ma.id = asset_versions.asset_id
              AND ma.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM marketing_assets ma
            WHERE ma.id = asset_versions.asset_id
              AND ma.user_id = auth.uid()
        )
    );

-- Active team members with at least read access to the client can read versions.
CREATE POLICY "asset_versions_team_read" ON asset_versions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM marketing_assets    ma
            JOIN team_members        tm  ON tm.owner_user_id  = ma.user_id
            JOIN team_member_clients tmc ON tmc.team_member_id = tm.id
            WHERE ma.id              = asset_versions.asset_id
              AND tmc.client_id      = ma.client_id
              AND tm.member_user_id  = auth.uid()
              AND tm.status          = 'active'
        )
    );


-- ── 5. ASSET SHARES TABLE ────────────────────────────────────
-- Tracks issued share tokens (signed-URL proxies) so they can be revoked.
-- The actual signed URL is generated server-side; only the token is stored here.

CREATE TABLE IF NOT EXISTS asset_shares (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id        UUID        NOT NULL REFERENCES marketing_assets(id) ON DELETE CASCADE,
    shared_by       UUID        NOT NULL REFERENCES auth.users(id),
    share_token     TEXT        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'base64url'),
    recipient_email TEXT,
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    accessed_at     TIMESTAMPTZ,        -- last access timestamp
    access_count    INTEGER     DEFAULT 0,
    is_revoked      BOOLEAN     DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Fast token lookup (only active tokens)
CREATE INDEX IF NOT EXISTS idx_asset_shares_token
    ON asset_shares(share_token)
    WHERE is_revoked = FALSE;

CREATE INDEX IF NOT EXISTS idx_asset_shares_asset
    ON asset_shares(asset_id);

CREATE INDEX IF NOT EXISTS idx_asset_shares_shared_by
    ON asset_shares(shared_by);

ALTER TABLE asset_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "asset_shares_owner_all" ON asset_shares
    FOR ALL
    USING    (shared_by = auth.uid())
    WITH CHECK (shared_by = auth.uid());


-- ── 6. UPDATE contact_documents STORAGE METADATA ─────────────
-- Add bucket_name column so documents can be migrated across buckets
-- without breaking existing storage_path values.
-- Existing rows default to 'documents'; new rows match whatever bucket
-- the upload went to.

ALTER TABLE contact_documents ADD COLUMN IF NOT EXISTS bucket_name TEXT DEFAULT 'documents';

COMMENT ON COLUMN contact_documents.bucket_name IS
    'Supabase Storage bucket for this document. Default: documents.';

COMMENT ON COLUMN contact_documents.storage_path IS
    'New convention: {owner_user_id}/clients/{client_id}/{category}/{filename}. '
    'Legacy (pre-storage-migration): {owner_user_id}/{timestamp}-{filename}';


-- ── 7. SUPABASE STORAGE — CREATE BUCKETS ─────────────────────
-- Requires the storage extension. If running on a fresh project,
-- storage.buckets is available immediately after enabling Storage
-- in the Supabase Dashboard.
--
-- File-size limits (bytes):
--   assets      = 50 MB  (creative files, decks, zips)
--   documents   = 25 MB  (contracts, PDFs, spreadsheets)
--   recordings  = 500 MB (long outbound call recordings)
--   avatars     = 5 MB   (logos, profile photos — public bucket)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'assets', 'assets', FALSE, 52428800,
    ARRAY[
        'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
        'video/mp4', 'video/webm', 'video/quicktime',
        'application/pdf',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/zip',
        'text/plain', 'text/csv'
    ]
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'documents', 'documents', FALSE, 26214400,
    ARRAY[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain', 'text/csv',
        'image/jpeg', 'image/png', 'application/zip'
    ]
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'recordings', 'recordings', FALSE, 524288000,
    ARRAY[
        'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg',
        'audio/mp4', 'audio/webm', 'audio/x-m4a'
    ]
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'avatars', 'avatars', TRUE, 5242880,
    ARRAY[
        'image/jpeg', 'image/png', 'image/webp', 'image/gif'
    ]
)
ON CONFLICT (id) DO NOTHING;


-- ── 8. SUPABASE STORAGE — RLS POLICIES ───────────────────────
-- Storage path convention used throughout:
--   {owner_user_id}/clients/{client_id}/{category}/{filename}
--   index:  [1]              [2]         [3]         [4]
--
-- storage.foldername(name) returns the path segments as TEXT[].
-- Segment [1] = owner workspace user id
-- Segment [3] = client id  (when path follows convention above)
--
-- All CREATE POLICY statements are wrapped in anonymous DO blocks with
-- duplicate_object exception handling so this script is safe to re-run.

-- ── assets bucket ─────────────────────────────────────────────

-- Workspace owners have full control of their own folder tree.
DO $$ BEGIN
CREATE POLICY "asset_owner_all" ON storage.objects
    FOR ALL
    USING    (bucket_id = 'assets' AND (storage.foldername(name))[1] = auth.uid()::TEXT)
    WITH CHECK (bucket_id = 'assets' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Creators and admins with write/manage access to the client folder may upload.
DO $$ BEGIN
CREATE POLICY "asset_creator_write" ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'assets' AND
        EXISTS (
            SELECT 1
            FROM team_members        tm
            JOIN team_member_clients tmc ON tmc.team_member_id = tm.id
            WHERE tm.member_user_id   = auth.uid()
              AND tmc.client_id::TEXT = (storage.foldername(name))[3]
              AND tmc.access_level    IN ('write', 'manage')
              AND tm.status           = 'active'
        )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Any active team member assigned to the client may read assets.
DO $$ BEGIN
CREATE POLICY "asset_team_read" ON storage.objects
    FOR SELECT
    USING (
        bucket_id = 'assets' AND
        EXISTS (
            SELECT 1
            FROM team_members        tm
            JOIN team_member_clients tmc ON tmc.team_member_id = tm.id
            WHERE tm.member_user_id   = auth.uid()
              AND tmc.client_id::TEXT = (storage.foldername(name))[3]
              AND tm.status           = 'active'
        )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Team members with manage access may delete assets for their clients.
DO $$ BEGIN
CREATE POLICY "asset_team_delete" ON storage.objects
    FOR DELETE
    USING (
        bucket_id = 'assets' AND
        EXISTS (
            SELECT 1
            FROM team_members        tm
            JOIN team_member_clients tmc ON tmc.team_member_id = tm.id
            WHERE tm.member_user_id   = auth.uid()
              AND tmc.client_id::TEXT = (storage.foldername(name))[3]
              AND tmc.access_level    = 'manage'
              AND tm.status           = 'active'
        )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── documents bucket ──────────────────────────────────────────

DO $$ BEGIN
CREATE POLICY "doc_owner_all" ON storage.objects
    FOR ALL
    USING    (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::TEXT)
    WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Active team members assigned to a client may read documents in that client's folder.
DO $$ BEGIN
CREATE POLICY "doc_team_read" ON storage.objects
    FOR SELECT
    USING (
        bucket_id = 'documents' AND
        EXISTS (
            SELECT 1
            FROM team_members        tm
            JOIN team_member_clients tmc ON tmc.team_member_id = tm.id
            WHERE tm.member_user_id   = auth.uid()
              AND tmc.client_id::TEXT = (storage.foldername(name))[3]
              AND tm.status           = 'active'
        )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Team members with write+ access may upload documents.
DO $$ BEGIN
CREATE POLICY "doc_team_write" ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'documents' AND
        EXISTS (
            SELECT 1
            FROM team_members        tm
            JOIN team_member_clients tmc ON tmc.team_member_id = tm.id
            WHERE tm.member_user_id   = auth.uid()
              AND tmc.client_id::TEXT = (storage.foldername(name))[3]
              AND tmc.access_level    IN ('write', 'manage')
              AND tm.status           = 'active'
        )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── recordings bucket (owner-only, private) ───────────────────

DO $$ BEGIN
CREATE POLICY "recordings_owner_only" ON storage.objects
    FOR ALL
    USING    (bucket_id = 'recordings' AND (storage.foldername(name))[1] = auth.uid()::TEXT)
    WITH CHECK (bucket_id = 'recordings' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── avatars bucket (public reads, owner writes) ───────────────

DO $$ BEGIN
CREATE POLICY "avatars_public_read" ON storage.objects
    FOR SELECT
    USING (bucket_id = 'avatars');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE POLICY "avatars_owner_write" ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'avatars' AND
        (storage.foldername(name))[1] = auth.uid()::TEXT
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE POLICY "avatars_owner_update" ON storage.objects
    FOR UPDATE
    USING (
        bucket_id = 'avatars' AND
        (storage.foldername(name))[1] = auth.uid()::TEXT
    )
    WITH CHECK (
        bucket_id = 'avatars' AND
        (storage.foldername(name))[1] = auth.uid()::TEXT
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE POLICY "avatars_owner_delete" ON storage.objects
    FOR DELETE
    USING (
        bucket_id = 'avatars' AND
        (storage.foldername(name))[1] = auth.uid()::TEXT
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 9. HELPER FUNCTION: user_can_access_client_assets() ───────
-- Returns TRUE if the calling user has at least p_min_access level
-- ('read', 'write', or 'manage') for the given client_id.
-- Used in API route guards and can be called from RLS policies.
-- SECURITY DEFINER so the function can query team tables without
-- the caller needing direct SELECT grants on team_member_clients.

CREATE OR REPLACE FUNCTION user_can_access_client_assets(
    p_client_id  UUID,
    p_min_access TEXT DEFAULT 'read'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_access_levels TEXT[]  := ARRAY['read', 'write', 'manage'];
    v_min_idx       INTEGER;
    v_user_level    TEXT;
BEGIN
    -- Workspace owners always have full access to their own clients.
    IF EXISTS (
        SELECT 1 FROM clients
        WHERE id = p_client_id AND user_id = auth.uid()
    ) THEN
        RETURN TRUE;
    END IF;

    -- Look up the highest access level this user holds for the client
    -- via the team_member_clients junction table.
    SELECT tmc.access_level
    INTO   v_user_level
    FROM   team_members        tm
    JOIN   team_member_clients tmc ON tmc.team_member_id = tm.id
    WHERE  tm.member_user_id = auth.uid()
      AND  tmc.client_id     = p_client_id
      AND  tm.status         = 'active'
    ORDER BY array_position(v_access_levels, tmc.access_level) DESC
    LIMIT  1;

    -- No assignment found → deny
    IF v_user_level IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Validate p_min_access; treat unknown level as most restrictive
    v_min_idx := array_position(v_access_levels, p_min_access);
    IF v_min_idx IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN array_position(v_access_levels, v_user_level) >= v_min_idx;
END;
$$;

COMMENT ON FUNCTION user_can_access_client_assets(UUID, TEXT) IS
    'Returns TRUE if auth.uid() has at least p_min_access (read|write|manage) '
    'for the specified client, either as the workspace owner or via team_member_clients.';


-- ── 10. ADDITIONAL INDEXES FOR QUERY PATTERNS ─────────────────
-- Cover the most common queries from the marketing/assets API routes.

-- GET /api/marketing/assets?clientId=&status=
CREATE INDEX IF NOT EXISTS idx_marketing_assets_client_status
    ON marketing_assets(client_id, status);

-- GET /api/marketing/assets?campaignId=&platform=
CREATE INDEX IF NOT EXISTS idx_marketing_assets_campaign_platform
    ON marketing_assets(campaign_id, platform);

-- Asset share token expiry sweeps
CREATE INDEX IF NOT EXISTS idx_asset_shares_expiry
    ON asset_shares(expires_at)
    WHERE is_revoked = FALSE;

-- Version history lookups by uploader
CREATE INDEX IF NOT EXISTS idx_asset_versions_uploaded_by
    ON asset_versions(uploaded_by);

-- ── END OF STORAGE MIGRATION ──────────────────────────────────


-- ── 11. DASHBOARD LAYOUT ─────────────────────────────────────
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS dashboard_layout JSONB;
