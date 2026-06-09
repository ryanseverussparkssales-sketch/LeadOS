-- Enhanced client profile fields
ALTER TABLE clients ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS primary_contact_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS primary_contact_email TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS primary_contact_phone TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contract_value DECIMAL(10,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contract_status TEXT DEFAULT 'active';
-- contract_status: 'prospect' | 'active' | 'paused' | 'ended'
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE clients ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes TEXT;
