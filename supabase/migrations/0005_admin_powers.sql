-- 0005_admin_powers.sql — back the expanded super-admin panel.
--   * admin_audit_log : immutable trail of every admin write-action.
--   * account_overrides : per-tenant suspend / AI-access / trial / flags / limits.
-- Both are service-role-only (RLS on, no policy) — never exposed to tenants.
-- Idempotent. Run in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id  UUID NOT NULL,         -- the REAL admin (never the impersonated id)
    admin_email    TEXT,
    action         TEXT NOT NULL,         -- tier_change | suspend | reactivate | reset_password | force_logout | impersonate | override_update | offboard | create_account
    target_user_id UUID,                  -- account acted upon
    target_email   TEXT,
    detail         JSONB DEFAULT '{}'::jsonb,  -- before/after, reason, etc.
    created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit_log(target_user_id);
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;  -- service role only (no policy)

CREATE TABLE IF NOT EXISTS account_overrides (
    user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    suspended            BOOLEAN DEFAULT false,
    suspended_reason     TEXT,
    suspended_at         TIMESTAMPTZ,
    ai_access            TEXT,            -- NULL = default (by tier); 'on' = force-enable; 'off' = force-disable
    trial_ends_at        TIMESTAMPTZ,
    rate_limit_multiplier NUMERIC DEFAULT 1,
    feature_flags        JSONB DEFAULT '{}'::jsonb,
    notes                TEXT,
    updated_at           TIMESTAMPTZ DEFAULT now(),
    updated_by           UUID
);
CREATE INDEX IF NOT EXISTS idx_account_overrides_suspended ON account_overrides(user_id) WHERE suspended = true;
ALTER TABLE account_overrides ENABLE ROW LEVEL SECURITY;  -- service role only (no policy)

NOTIFY pgrst, 'reload schema';
