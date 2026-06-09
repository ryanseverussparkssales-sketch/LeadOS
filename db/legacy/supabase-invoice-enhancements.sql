-- Enhance invoices table with client linking and contract fields
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS contract_type TEXT DEFAULT 'invoice';
-- contract_type: 'invoice' | 'retainer' | 'project' | 'hourly'
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS contract_start DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS contract_end DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS scope_of_work TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS expected_hours_weekly DECIMAL(6,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS expected_hours_monthly DECIMAL(6,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS project_ids UUID[];
-- Array of linked project IDs for time tracking association

CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id) WHERE client_id IS NOT NULL;
