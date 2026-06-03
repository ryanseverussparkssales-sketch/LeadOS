-- ============================================================
-- LeadOS — HR & Payroll Migration
-- Extended team member data, payroll entries, HR records
-- ============================================================

-- Extend team_members with HR fields
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS hire_date DATE;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS contract_type TEXT DEFAULT 'full_time';
  -- full_time | part_time | contractor | intern | 1099
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS pay_rate DECIMAL(10,2);
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS pay_type TEXT DEFAULT 'salary';
  -- salary | hourly | commission | draw_plus_commission | contractor
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS pay_frequency TEXT DEFAULT 'bi_weekly';
  -- weekly | bi_weekly | semi_monthly | monthly
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS quota_monthly DECIMAL(12,2);
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,2);  -- %
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Payroll entries (per team member per pay period)
CREATE TABLE IF NOT EXISTS payroll_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
  member_email TEXT,                   -- denormalized for display if member deleted
  pay_period_start DATE NOT NULL,
  pay_period_end DATE NOT NULL,
  base_pay DECIMAL(10,2) DEFAULT 0,
  commission DECIMAL(10,2) DEFAULT 0,
  bonuses DECIMAL(10,2) DEFAULT 0,
  deductions DECIMAL(10,2) DEFAULT 0,
  net_pay DECIMAL(10,2) GENERATED ALWAYS AS (base_pay + commission + bonuses - deductions) STORED,
  status TEXT DEFAULT 'pending',       -- pending | approved | paid
  paid_at TIMESTAMP,
  payment_method TEXT DEFAULT 'ach',   -- ach | check | cash | wire | paypal
  reference TEXT,                      -- check number or transfer ID
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Slack integration config
CREATE TABLE IF NOT EXISTS slack_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
  workspace_name TEXT,
  bot_token_vault_id UUID REFERENCES api_key_vault(id),
  default_channel TEXT DEFAULT '#general',
  notify_new_leads BOOLEAN DEFAULT true,
  notify_calls BOOLEAN DEFAULT false,
  notify_deals BOOLEAN DEFAULT false,
  notify_tasks BOOLEAN DEFAULT false,
  webhook_url TEXT,                    -- Incoming webhook URL (simpler, no OAuth)
  connected_at TIMESTAMP DEFAULT NOW()
);

-- Teams integration config
CREATE TABLE IF NOT EXISTS teams_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
  webhook_url TEXT NOT NULL,           -- Incoming webhook URL from Teams
  channel_name TEXT,
  notify_new_leads BOOLEAN DEFAULT true,
  notify_calls BOOLEAN DEFAULT false,
  notify_deals BOOLEAN DEFAULT false,
  connected_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payroll_entries_user ON payroll_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_member ON payroll_entries(team_member_id);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_period ON payroll_entries(pay_period_start, pay_period_end);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_status ON payroll_entries(status);

-- RLS
ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE slack_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_entries_all" ON payroll_entries FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "slack_integrations_all" ON slack_integrations FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "teams_integrations_all" ON teams_integrations FOR ALL USING (auth.uid() = user_id);
