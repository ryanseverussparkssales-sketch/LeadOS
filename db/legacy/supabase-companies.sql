-- Companies entity (separate from contacts)
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    phone_normalized TEXT,
    email TEXT,
    website TEXT,
    industry TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    description TEXT,
    company_type TEXT DEFAULT 'prospect',
    -- 'prospect' | 'customer' | 'partner' | 'investor' | 'vendor'
    size TEXT,
    -- '1-10' | '11-50' | '51-200' | '200+'
    linkedin_url TEXT,
    notes TEXT,
    tags TEXT[],
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "companies_owner" ON companies
        FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Link contacts to companies
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_companies_user ON companies(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(user_id, name);
CREATE INDEX IF NOT EXISTS idx_companies_client ON companies(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_deleted ON companies(user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id) WHERE company_id IS NOT NULL;
