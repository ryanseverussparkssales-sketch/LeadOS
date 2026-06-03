-- Multiple win conditions per campaign (replaces single win_outcome)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS win_conditions JSONB DEFAULT '[]';
-- win_conditions format: [{ outcome: 'appointment_set', label: 'Appointment Set', weight: 1 }, ...]
-- weight: how many "wins" this outcome counts as (e.g. signed_up = 2 wins)

-- Win dedup: track which contacts have already generated a win for a campaign
CREATE TABLE IF NOT EXISTS campaign_wins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    outcome TEXT NOT NULL,
    weight INTEGER NOT NULL DEFAULT 1,
    call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(campaign_id, contact_id, outcome)  -- one win per outcome per contact per campaign
);

CREATE INDEX IF NOT EXISTS idx_campaign_wins_campaign ON campaign_wins(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_wins_contact ON campaign_wins(contact_id);
CREATE INDEX IF NOT EXISTS idx_campaign_wins_user ON campaign_wins(user_id);

-- RLS
ALTER TABLE campaign_wins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own campaign wins" ON campaign_wins
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Migrate existing win_outcome to win_conditions
UPDATE campaigns
SET win_conditions = jsonb_build_array(
    jsonb_build_object(
        'outcome', win_outcome,
        'label', COALESCE(win_label, win_outcome),
        'weight', 1
    )
)
WHERE win_outcome IS NOT NULL
  AND (win_conditions IS NULL OR win_conditions = '[]'::jsonb);
