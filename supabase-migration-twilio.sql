-- ============================================================
-- LeadOS — Twilio Migration
-- Run in Supabase SQL Editor after the initial schema
-- ============================================================

-- Add twilio_call_sid to calls table
ALTER TABLE calls ADD COLUMN IF NOT EXISTS twilio_call_sid TEXT;
CREATE INDEX IF NOT EXISTS idx_calls_twilio_sid ON calls(twilio_call_sid);
