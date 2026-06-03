-- Widget settings and Spotify token storage
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS spotify_tokens JSONB;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS widget_settings JSONB;

-- Project time tracking
CREATE TABLE IF NOT EXISTS time_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    description TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_entries_owner" ON time_entries
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_time_entries_user_project ON time_entries(user_id, project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_date ON time_entries(user_id, started_at DESC);
