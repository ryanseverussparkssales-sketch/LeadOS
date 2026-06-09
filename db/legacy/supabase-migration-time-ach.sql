-- ============================================================
-- LeadOS — Time Entries + Invoice ACH Migration
-- ============================================================

-- Manual time entries
CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID REFERENCES clients(id),
  project_id UUID REFERENCES projects(id),
  campaign_id UUID REFERENCES campaigns(id),
  description TEXT,
  duration_minutes INTEGER NOT NULL,
  billable BOOLEAN DEFAULT true,
  hourly_rate DECIMAL(10,2),
  entry_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ACH fields on invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS routing_number TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'checking';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_memo TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_project ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(entry_date);

-- RLS
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "time_entries_all" ON time_entries FOR ALL USING (auth.uid() = user_id);
