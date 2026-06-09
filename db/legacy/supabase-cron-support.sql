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
