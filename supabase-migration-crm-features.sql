-- ============================================================
-- LeadOS — CRM Features Migration
-- Win/Loss, Quotas, Snippets, Documents, Outbound Webhooks
-- ============================================================

-- Quotas (revenue or calls target per user per period)
CREATE TABLE IF NOT EXISTS quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  quota_type TEXT NOT NULL DEFAULT 'calls', -- calls | revenue
  target_value DECIMAL(12,2) NOT NULL,
  period TEXT NOT NULL DEFAULT 'monthly',   -- daily | weekly | monthly | quarterly
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, quota_type, period_start)
);

-- Snippets / text shortcuts
CREATE TABLE IF NOT EXISTS snippets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  trigger TEXT NOT NULL,    -- e.g. "/intro"
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, trigger)
);

-- Contact/deal documents
CREATE TABLE IF NOT EXISTS contact_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Outbound webhooks
CREATE TABLE IF NOT EXISTS outbound_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT[] DEFAULT ARRAY['lead_arrived'],
  secret TEXT,
  enabled BOOLEAN DEFAULT true,
  delivery_count INTEGER DEFAULT 0,
  last_delivered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_quotas_user ON quotas(user_id);
CREATE INDEX IF NOT EXISTS idx_snippets_user ON snippets(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_docs_contact ON contact_documents(contact_id);
CREATE INDEX IF NOT EXISTS idx_outbound_webhooks_user ON outbound_webhooks(user_id);

-- RLS
ALTER TABLE quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE snippets ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotas_all" ON quotas FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "snippets_all" ON snippets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "docs_all" ON contact_documents FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "webhooks_all" ON outbound_webhooks FOR ALL USING (auth.uid() = user_id);
