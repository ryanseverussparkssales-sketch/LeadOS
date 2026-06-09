-- Campaign call goals and cadence tracking
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS daily_call_goal INTEGER;
-- Target calls per day for this campaign
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS calls_per_lead INTEGER DEFAULT 1;
-- How many call attempts per contact (cadence depth)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS calls_today INTEGER DEFAULT 0;
-- Running daily call count (reset each day)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS total_calls INTEGER DEFAULT 0;
-- All-time call count for this campaign
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS last_reset_date DATE;
-- Date calls_today was last reset
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS followup_count INTEGER DEFAULT 0;
-- Number of open follow-up tasks for this campaign
