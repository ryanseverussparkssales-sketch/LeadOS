-- Contact activity log — manual entries like notes, meetings, emails, demos
CREATE TABLE IF NOT EXISTS contact_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL DEFAULT 'note',
    -- Types: note | call | email | meeting | demo | linkedin | text | follow_up | voicemail | other
    title TEXT,
    description TEXT,
    outcome TEXT,
    -- e.g. 'interested', 'not_interested', 'callback', 'no_answer', 'scheduled_demo'
    scheduled_at TIMESTAMPTZ, -- when did/will this happen (defaults to created_at)
    duration_minutes INTEGER,  -- for calls/meetings
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE contact_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activities_owner" ON contact_activities
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_contact_activities_contact ON contact_activities(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_activities_user ON contact_activities(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_activities_type ON contact_activities(user_id, activity_type);
