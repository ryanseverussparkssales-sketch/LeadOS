-- ============================================================
-- LeadOS — Financials Migration
-- Balance Tracker, Tech Stack Spend, Budget, Invoice Updates
-- ============================================================

-- Weekly manual income/expense log
CREATE TABLE IF NOT EXISTS balance_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  entry_date DATE NOT NULL,
  income DECIMAL(12,2) DEFAULT 0,
  expenses DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, entry_date)
);

-- SaaS/tool/subscription tracker
CREATE TABLE IF NOT EXISTS tech_stack_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  category TEXT DEFAULT 'other',        -- calling | ai | hosting | crm | marketing | productivity | other
  monthly_cost DECIMAL(10,2) DEFAULT 0,
  billing_cycle TEXT DEFAULT 'monthly', -- monthly | annual | one_time
  url TEXT,
  notes TEXT,
  project_ids UUID[] DEFAULT '{}',
  campaign_ids UUID[] DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Personal/business budget line items
CREATE TABLE IF NOT EXISTS budget_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  entry_type TEXT NOT NULL,         -- income | expense
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  frequency TEXT DEFAULT 'monthly', -- one_time | weekly | monthly | annual
  entry_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_balance_entries_user ON balance_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_balance_entries_date ON balance_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_tech_stack_user ON tech_stack_items(user_id);
CREATE INDEX IF NOT EXISTS idx_tech_stack_active ON tech_stack_items(user_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_budget_entries_user ON budget_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_entries_type ON budget_entries(entry_type);

-- RLS
ALTER TABLE balance_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_stack_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "balance_entries_all" ON balance_entries FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "tech_stack_all" ON tech_stack_items FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "budget_entries_all" ON budget_entries FOR ALL USING (auth.uid() = user_id);

-- Invoice payment tracking fields
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_method TEXT; -- ach | check | cash | stripe | other
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_notes TEXT;
