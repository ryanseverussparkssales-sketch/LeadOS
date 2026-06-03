-- Client portal: allow clients to have scoped access
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS portal_access BOOLEAN DEFAULT false;

-- Index for fast client portal lookups
CREATE INDEX IF NOT EXISTS idx_team_members_client ON team_members(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_team_members_portal ON team_members(member_email) WHERE portal_access = true;

-- Update allowed roles to include 'client'
-- (no schema constraint needed — role is TEXT)
COMMENT ON COLUMN team_members.client_id IS 'When set, this member is a client user who can only see data for this client';
COMMENT ON COLUMN team_members.portal_access IS 'true = this member has client portal access (limited, read-only view)';
