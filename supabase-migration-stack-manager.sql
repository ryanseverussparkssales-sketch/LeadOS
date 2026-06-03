-- ============================================================
-- LeadOS — Stack Manager Migration
-- Service accounts, credentials linking, payment/trial tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS stack_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),

  -- Service identity
  service_name TEXT NOT NULL,
  service_category TEXT DEFAULT 'other',
    -- calling | ai | hosting | crm | banking | payments | legal | storage | analytics | productivity | other
  service_url TEXT,
  service_icon TEXT,  -- emoji or image URL

  -- Login credentials
  login_email TEXT,
  login_username TEXT,
  password_vault_id UUID REFERENCES password_vault(id) ON DELETE SET NULL,
  api_key_vault_id UUID REFERENCES api_key_vault(id) ON DELETE SET NULL,

  -- Status & trial
  status TEXT DEFAULT 'active',  -- active | trial | paused | cancelled
  trial_start DATE,
  trial_end DATE,
  auto_renew BOOLEAN DEFAULT true,

  -- Cost & billing
  cost DECIMAL(10,2) DEFAULT 0,
  billing_cycle TEXT DEFAULT 'monthly',  -- monthly | annual | one_time | usage_based | free
  next_billing_date DATE,
  payment_method_label TEXT,   -- e.g. "Visa •••• 4242"
  annual_cost DECIMAL(10,2),   -- override for annual plans stored annually

  -- Notes
  notes TEXT,
  tags TEXT[] DEFAULT '{}',

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_stack_accounts_user ON stack_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_stack_accounts_status ON stack_accounts(status);
CREATE INDEX IF NOT EXISTS idx_stack_accounts_trial_end ON stack_accounts(trial_end) WHERE trial_end IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stack_accounts_billing ON stack_accounts(next_billing_date) WHERE next_billing_date IS NOT NULL;

-- RLS
ALTER TABLE stack_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stack_accounts_all" ON stack_accounts FOR ALL USING (auth.uid() = user_id);
