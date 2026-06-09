-- Lead routing rules per lead source
CREATE TABLE IF NOT EXISTS lead_routing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lead_source_id UUID REFERENCES lead_sources(id) ON DELETE CASCADE,
    -- NULL lead_source_id = applies to ALL sources for this user

    rule_order INTEGER NOT NULL DEFAULT 0,
    name TEXT, -- human label e.g. "Route LLCs to enterprise"

    -- Condition
    condition_field TEXT NOT NULL,
    -- 'company', 'email', 'phone', 'lead_source', 'utm_source',
    -- 'utm_medium', 'utm_campaign', 'contact_type', 'any_field'

    condition_operator TEXT NOT NULL DEFAULT 'contains',
    -- 'contains', 'equals', 'starts_with', 'ends_with', 'not_contains', 'is_empty', 'not_empty', 'matches_regex'

    condition_value TEXT, -- the value to test against (null for is_empty/not_empty)

    -- Action
    action_type TEXT NOT NULL,
    -- 'assign_campaign', 'assign_call_list', 'add_tag', 'set_contact_type',
    -- 'set_status', 'skip' (discard lead), 'notify'

    action_value TEXT, -- campaign_id, call_list_id, tag name, type value, etc.

    stop_on_match BOOLEAN DEFAULT FALSE, -- if true, don't run further rules after this one matches
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routing_rules_source ON lead_routing_rules(lead_source_id, rule_order);
CREATE INDEX IF NOT EXISTS idx_routing_rules_user ON lead_routing_rules(user_id, rule_order);

ALTER TABLE lead_routing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own routing rules" ON lead_routing_rules
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
