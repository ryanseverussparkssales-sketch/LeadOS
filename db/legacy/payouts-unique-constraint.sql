-- Payout double-pay guard.
--
-- The payouts approval route reserves a row per (call_id, team_member_id) BEFORE
-- moving money and relies on this unique index as the concurrency gate: a racing
-- duplicate insert fails with 23505 instead of triggering a second Stripe transfer.
-- (Postgres also previously rejected the route's ON CONFLICT upsert outright because
-- no matching constraint existed — so payout rows were never written after a transfer.)
--
-- Note: in Postgres, NULLs are distinct in a unique index, so payouts whose call was
-- deleted (call_id set NULL) never collide — exactly what we want.
--
-- If duplicate (call_id, team_member_id) rows already exist, this index creation will
-- fail; de-duplicate first (keep the most recent paid/pending row per pair) then re-run.

CREATE UNIQUE INDEX IF NOT EXISTS payouts_call_member_uniq
  ON payouts (call_id, team_member_id)
  WHERE call_id IS NOT NULL;
