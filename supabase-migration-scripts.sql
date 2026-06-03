-- ============================================================
-- LeadOS — Scripts, Goals & Knowledge Base Migration
-- ============================================================

-- Call scripts
CREATE TABLE IF NOT EXISTS scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID REFERENCES clients(id),     -- NULL = global (any client)
  campaign_id UUID REFERENCES campaigns(id), -- NULL = any campaign
  title TEXT NOT NULL,
  opener TEXT,           -- first words on the call
  elevator_pitch TEXT,   -- company/product pitch
  discovery TEXT,        -- discovery questions
  closing TEXT,          -- how to close/next steps
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Objection handlers per script
CREATE TABLE IF NOT EXISTS script_objections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  objection TEXT NOT NULL,        -- e.g. "We already have a solution"
  response TEXT NOT NULL,         -- what to say
  follow_up TEXT,                 -- what to pivot to next
  sort_order INTEGER DEFAULT 0
);

-- Campaign goals
CREATE TABLE IF NOT EXISTS campaign_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  goal_type TEXT NOT NULL,  -- calls_per_day | callback_rate | answer_rate | talk_time_minutes
  target_value DECIMAL(10,2) NOT NULL,
  period TEXT DEFAULT 'daily',  -- daily | weekly | monthly
  UNIQUE(campaign_id, goal_type, period)
);

-- Client knowledge base
CREATE TABLE IF NOT EXISTS client_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  knowledge_type TEXT DEFAULT 'general',  -- general | talking_points | objections | product | pricing | custom
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Team members (Owner + Team model)
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id),
  member_email TEXT NOT NULL,
  member_user_id UUID REFERENCES auth.users(id),  -- set when they accept
  role TEXT DEFAULT 'agent',  -- agent | manager
  status TEXT DEFAULT 'pending',  -- pending | active | revoked
  invited_at TIMESTAMP DEFAULT NOW(),
  accepted_at TIMESTAMP,
  UNIQUE(owner_user_id, member_email)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scripts_user ON scripts(user_id);
CREATE INDEX IF NOT EXISTS idx_scripts_client ON scripts(client_id);
CREATE INDEX IF NOT EXISTS idx_script_objections_script ON script_objections(script_id);
CREATE INDEX IF NOT EXISTS idx_campaign_goals_campaign ON campaign_goals(campaign_id);
CREATE INDEX IF NOT EXISTS idx_client_knowledge_client ON client_knowledge(client_id);
CREATE INDEX IF NOT EXISTS idx_team_members_owner ON team_members(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_member ON team_members(member_user_id);

-- RLS
ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_objections ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scripts_all" ON scripts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "objections_all" ON script_objections FOR ALL USING (
  EXISTS (SELECT 1 FROM scripts WHERE scripts.id = script_objections.script_id AND scripts.user_id = auth.uid())
);
CREATE POLICY "goals_all" ON campaign_goals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "knowledge_all" ON client_knowledge FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "team_owner" ON team_members FOR ALL USING (auth.uid() = owner_user_id);
CREATE POLICY "team_member_read" ON team_members FOR SELECT USING (auth.uid() = member_user_id);
