-- ============================================================
-- LeadOS — Lead Sources, Tasks & Email Logs Migration
-- ============================================================

-- Lead source webhooks (one per integration)
CREATE TABLE IF NOT EXISTS lead_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,              -- "Zapier", "Facebook Ads", "Website Form"
  source_type TEXT DEFAULT 'webhook', -- webhook | zapier | facebook | google | manual
  client_id UUID REFERENCES clients(id),
  project_id UUID REFERENCES projects(id),
  campaign_id UUID REFERENCES campaigns(id),
  auto_call_list_id UUID REFERENCES call_lists(id), -- auto-add to this list
  webhook_token TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::TEXT,
  default_contact_type TEXT DEFAULT 'lead',
  lead_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tasks / Follow-ups
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  contact_id UUID REFERENCES contacts(id),
  call_id UUID REFERENCES calls(id),
  campaign_id UUID REFERENCES campaigns(id),
  assigned_to UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT DEFAULT 'follow_up', -- follow_up | email | call | meeting | other
  priority TEXT DEFAULT 'medium',     -- low | medium | high | urgent
  status TEXT DEFAULT 'pending',      -- pending | in_progress | completed | cancelled
  due_date TIMESTAMP,
  completed_at TIMESTAMP,
  ai_suggested BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Email logs
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  contact_id UUID REFERENCES contacts(id),
  call_id UUID REFERENCES calls(id),
  task_id UUID REFERENCES tasks(id),
  subject TEXT,
  body TEXT NOT NULL,
  email_type TEXT DEFAULT 'follow_up', -- follow_up | thank_you | proposal | intro | custom
  status TEXT DEFAULT 'draft',         -- draft | sent | logged
  generated_by TEXT DEFAULT 'manual',  -- ai | manual
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lead_sources_user ON lead_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_sources_token ON lead_sources(webhook_token);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_contact ON tasks(contact_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_email_logs_user ON email_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_contact ON email_logs(contact_id);

-- RLS
ALTER TABLE lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_sources_all" ON lead_sources FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "tasks_all" ON tasks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "email_logs_all" ON email_logs FOR ALL USING (auth.uid() = user_id);
