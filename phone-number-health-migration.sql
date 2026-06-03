-- Phone number health tracking migration
-- Run in Supabase SQL Editor
ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS calls_today  INT NOT NULL DEFAULT 0;
ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS daily_limit  INT NOT NULL DEFAULT 200;
