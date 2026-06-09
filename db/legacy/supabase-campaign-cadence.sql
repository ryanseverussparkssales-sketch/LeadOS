-- Add cadence window to campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS cadence_days INTEGER DEFAULT 14;
-- e.g. "3 attempts over 14 days" = calls_per_lead=3, cadence_days=14
