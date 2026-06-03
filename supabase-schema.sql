-- ============================================================
-- LeadOS MVP — Full Supabase Schema
-- Run this entire script in Supabase SQL Editor
-- ============================================================

-- CONTACTS (master, deduplicated)
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  company TEXT,
  title TEXT,
  phone_normalized TEXT,
  email_normalized TEXT,
  status TEXT DEFAULT 'active',
  call_count INTEGER DEFAULT 0,
  last_called_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- CLIENTS
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- PROJECTS
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- CALL LISTS
CREATE TABLE IF NOT EXISTS call_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

-- CALL LIST CONTACTS (junction — a contact can be in many lists)
CREATE TABLE IF NOT EXISTS call_list_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_list_id UUID NOT NULL REFERENCES call_lists(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  skip_count INTEGER DEFAULT 0,
  skip_limit INTEGER DEFAULT 3,
  queue_position INTEGER,
  added_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(call_list_id, contact_id)
);

-- CALLS (core record — call_list_id is nullable for flexibility)
CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  contact_id UUID NOT NULL REFERENCES contacts(id),
  call_list_id UUID REFERENCES call_lists(id),  -- nullable
  phone_number TEXT,
  call_duration_seconds INTEGER,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  recording_url TEXT,
  raw_transcript TEXT,
  summary TEXT,
  outcome TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- TAGS
CREATE TABLE IF NOT EXISTS contact_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  color TEXT DEFAULT '#888888',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- TAG MAPPINGS
CREATE TABLE IF NOT EXISTS contact_tag_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES contact_tags(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(contact_id, tag_id)
);

-- FILTER PRESETS
CREATE TABLE IF NOT EXISTS contact_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  filter_config JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone_normalized ON contacts(phone_normalized);
CREATE INDEX IF NOT EXISTS idx_contacts_email_normalized ON contacts(email_normalized);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_call_lists_project ON call_lists(project_id);
CREATE INDEX IF NOT EXISTS idx_call_list_contacts_list ON call_list_contacts(call_list_id);
CREATE INDEX IF NOT EXISTS idx_call_list_contacts_contact ON call_list_contacts(contact_id);
CREATE INDEX IF NOT EXISTS idx_calls_user ON calls(user_id);
CREATE INDEX IF NOT EXISTS idx_calls_contact ON calls(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_tags_user ON contact_tags(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_tag_mappings_contact ON contact_tag_mappings(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_tag_mappings_tag ON contact_tag_mappings(tag_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_list_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_tag_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_filters ENABLE ROW LEVEL SECURITY;

-- Contacts
CREATE POLICY "contacts_select" ON contacts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "contacts_insert" ON contacts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "contacts_update" ON contacts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "contacts_delete" ON contacts FOR DELETE USING (auth.uid() = user_id);

-- Clients
CREATE POLICY "clients_select" ON clients FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "clients_insert" ON clients FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "clients_update" ON clients FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "clients_delete" ON clients FOR DELETE USING (auth.uid() = user_id);

-- Projects (via client ownership)
CREATE POLICY "projects_all" ON projects FOR ALL USING (
  EXISTS (SELECT 1 FROM clients WHERE clients.id = projects.client_id AND clients.user_id = auth.uid())
);

-- Call lists (via project → client ownership)
CREATE POLICY "call_lists_all" ON call_lists FOR ALL USING (
  EXISTS (
    SELECT 1 FROM projects
    JOIN clients ON clients.id = projects.client_id
    WHERE projects.id = call_lists.project_id AND clients.user_id = auth.uid()
  )
);

-- Call list contacts
CREATE POLICY "call_list_contacts_all" ON call_list_contacts FOR ALL USING (
  EXISTS (
    SELECT 1 FROM call_lists
    JOIN projects ON projects.id = call_lists.project_id
    JOIN clients ON clients.id = projects.client_id
    WHERE call_lists.id = call_list_contacts.call_list_id AND clients.user_id = auth.uid()
  )
);

-- Calls
CREATE POLICY "calls_select" ON calls FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "calls_insert" ON calls FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "calls_update" ON calls FOR UPDATE USING (auth.uid() = user_id);

-- Tags
CREATE POLICY "tags_all" ON contact_tags FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "tag_mappings_all" ON contact_tag_mappings FOR ALL USING (
  EXISTS (SELECT 1 FROM contacts WHERE contacts.id = contact_tag_mappings.contact_id AND contacts.user_id = auth.uid())
);

-- Filters
CREATE POLICY "filters_all" ON contact_filters FOR ALL USING (auth.uid() = user_id);
