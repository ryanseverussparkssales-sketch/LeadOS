-- ============================================================
-- LeadOS — Advanced Features Migration
-- Activity Timeline, Sequences, Scoring, Automation, Custom Fields
-- ============================================================

-- Contact scoring
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS contact_score INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS score_updated_at TIMESTAMP;

-- Email sequences (drip campaigns)
CREATE TABLE IF NOT EXISTS email_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT DEFAULT 'manual', -- manual | lead_arrived | call_completed | callback_outcome
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  delay_days INTEGER DEFAULT 0,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  email_type TEXT DEFAULT 'follow_up'
);

CREATE TABLE IF NOT EXISTS contact_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES email_sequences(id),
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',  -- active | paused | completed | cancelled
  started_at TIMESTAMP DEFAULT NOW(),
  next_step_at TIMESTAMP,
  UNIQUE(contact_id, sequence_id)
);

-- Workflow automation rules
CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,  -- lead_arrived | call_completed | contact_updated | task_overdue
  conditions JSONB DEFAULT '[]',
  actions JSONB DEFAULT '[]',
  enabled BOOLEAN DEFAULT true,
  run_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Custom contact field definitions
CREATE TABLE IF NOT EXISTS contact_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  field_key TEXT NOT NULL,
  field_type TEXT DEFAULT 'text',  -- text | number | date | select | boolean | url
  options JSONB,                    -- for select: ["Option A", "Option B"]
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, field_key)
);

-- Custom field values per contact
CREATE TABLE IF NOT EXISTS contact_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  field_definition_id UUID NOT NULL REFERENCES contact_field_definitions(id) ON DELETE CASCADE,
  value TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(contact_id, field_definition_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contacts_score ON contacts(contact_score);
CREATE INDEX IF NOT EXISTS idx_sequences_user ON email_sequences(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_sequences_contact ON contact_sequences(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_sequences_next ON contact_sequences(next_step_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_automation_rules_user ON automation_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_field_defs_user ON contact_field_definitions(user_id);
CREATE INDEX IF NOT EXISTS idx_field_values_contact ON contact_field_values(contact_id);

-- RLS
ALTER TABLE email_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sequences_all" ON email_sequences FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "seq_steps_all" ON sequence_steps FOR ALL USING (EXISTS (SELECT 1 FROM email_sequences WHERE id = sequence_steps.sequence_id AND user_id = auth.uid()));
CREATE POLICY "contact_seqs_all" ON contact_sequences FOR ALL USING (EXISTS (SELECT 1 FROM contacts WHERE id = contact_sequences.contact_id AND user_id = auth.uid()));
CREATE POLICY "automations_all" ON automation_rules FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "field_defs_all" ON contact_field_definitions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "field_values_all" ON contact_field_values FOR ALL USING (EXISTS (SELECT 1 FROM contacts WHERE id = contact_field_values.contact_id AND user_id = auth.uid()));

-- Client portal: shareable report tokens
ALTER TABLE generated_reports ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;
ALTER TABLE generated_reports ADD COLUMN IF NOT EXISTS share_expires_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_reports_share_token ON generated_reports(share_token);
