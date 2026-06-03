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
