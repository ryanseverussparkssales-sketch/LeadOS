-- ============================================================
-- LeadOS — Reports & Invoices Migration
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS generated_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID REFERENCES clients(id),
  project_id UUID REFERENCES projects(id),
  campaign_id UUID REFERENCES campaigns(id),
  report_type TEXT NOT NULL, -- action_report | invoice | custom
  report_title TEXT NOT NULL,
  date_from DATE,
  date_to DATE,
  content TEXT,       -- markdown
  html_content TEXT,  -- rendered HTML
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID REFERENCES clients(id),
  report_id UUID REFERENCES generated_reports(id),
  invoice_number TEXT,
  invoice_date DATE,
  due_date DATE,
  hours_worked DECIMAL(10, 2),
  hourly_rate DECIMAL(10, 2),
  subtotal DECIMAL(12, 2),
  tax_percent DECIMAL(5, 2) DEFAULT 0,
  tax_amount DECIMAL(12, 2),
  total DECIMAL(12, 2),
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reports_user ON generated_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_client ON generated_reports(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);

-- RLS
ALTER TABLE generated_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reports_all" ON generated_reports FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "invoices_all" ON invoices FOR ALL USING (auth.uid() = user_id);
