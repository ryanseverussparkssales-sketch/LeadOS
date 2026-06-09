-- =============================================================================
-- LeadOS — Test Data Setup
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- =============================================================================
-- BEFORE RUNNING:
--  1. Find your owner user ID:
--     Supabase Dashboard → Authentication → Users → copy YOUR UUID
--  2. Create two test auth users in Supabase Auth:
--     a) test-rep@lead-os-demo.com   (password: TestRep2025!)
--     b) test-client@lead-os-demo.com (password: TestClient2025!)
--     Copy both UUIDs into the variables below.
--  3. Replace the three placeholder UUIDs at the top of the DO block.
-- =============================================================================

-- ── Schema additions (idempotent) ─────────────────────────────────────────────
ALTER TABLE clients   ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE contacts  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

-- ── Test data ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  -- ╔══════════════════════════════════════════╗
  -- ║  REPLACE THESE THREE VALUES              ║
  -- ╚══════════════════════════════════════════╝
  owner_id          UUID := '1f3c20ff-f471-4f2e-95e4-91835773bbcc';       -- your UUID from Supabase Auth
  test_sdr_uid      UUID := 'a3e78ba5-3636-4817-bc89-9c815461cdb5';    -- test-rep@ user UUID
  test_client_uid   UUID := '7fa3b67b-41ae-4dc7-87a5-f965bbe50a43'; -- test-client@ user UUID

  -- Internal IDs (auto-generated, don't touch)
  test_client_id    UUID := '00000000-0000-0000-0001-000000000001';
  test_project_id   UUID := '00000000-0000-0000-0001-000000000002';
  test_campaign_id  UUID := '00000000-0000-0000-0001-000000000003';
  test_list_id      UUID := '00000000-0000-0000-0001-000000000004';
  test_sdr_member   UUID := '00000000-0000-0000-0001-000000000005';
  test_cli_member   UUID := '00000000-0000-0000-0001-000000000006';

  cids UUID[];
  c    UUID;
  i    INT := 0;
BEGIN

-- ── Clean up any prior test run ───────────────────────────────────────────────
DELETE FROM campaign_sdrs    WHERE campaign_id = test_campaign_id;
DELETE FROM campaign_contacts WHERE campaign_id = test_campaign_id;
DELETE FROM call_list_contacts WHERE call_list_id = test_list_id;
DELETE FROM calls            WHERE campaign_id = test_campaign_id;
DELETE FROM call_lists       WHERE id = test_list_id;
DELETE FROM campaigns        WHERE id = test_campaign_id;
DELETE FROM projects         WHERE id = test_project_id;
DELETE FROM team_members     WHERE id IN (test_sdr_member, test_cli_member);
DELETE FROM contacts         WHERE user_id = owner_id AND is_test = true;
DELETE FROM clients          WHERE id = test_client_id;

-- ── Test client ───────────────────────────────────────────────────────────────
INSERT INTO clients (
  id, user_id, name, industry, description,
  is_test, contract_status, contract_value,
  primary_contact_name, primary_contact_email, primary_contact_phone
) VALUES (
  test_client_id, owner_id,
  'Acme Windows (Demo)', 'Home Improvement',
  'DEMO ACCOUNT — test data only, not a real client.',
  true, 'active', 3500,
  'Jane Demo', 'jane@acme-demo.example', '(512) 555-0100'
);

-- ── Test project ──────────────────────────────────────────────────────────────
INSERT INTO projects (id, client_id, name)
VALUES (test_project_id, test_client_id, 'Q3 Demo Outreach');

-- ── Test campaign ─────────────────────────────────────────────────────────────
INSERT INTO campaigns (
  id, project_id, name, status, campaign_type,
  is_test, win_outcome, win_label, target_wins, daily_call_goal
) VALUES (
  test_campaign_id, test_project_id,
  'Window Replacement Campaign (Demo)', 'active', 'outbound',
  true, 'appointment_set', 'Appointment Set', 10, 30
);

-- ── Test call list ────────────────────────────────────────────────────────────
INSERT INTO call_lists (id, campaign_id, project_id, name, status)
VALUES (test_list_id, test_campaign_id, test_project_id, 'Demo Leads', 'active');

-- ── 20 test contacts ──────────────────────────────────────────────────────────
WITH inserted AS (
  INSERT INTO contacts (
    user_id, name, phone, phone_normalized, company, title, status, is_test, notes
  ) VALUES
    (owner_id, 'Alice Thornton',    '(512) 555-0111', '5125550111', 'Thornton Realty',    'Owner',           'active', true, 'Demo contact'),
    (owner_id, 'Bob Nguyen',        '(737) 555-0112', '7375550112', 'Nguyen Home Svcs',   'Manager',         'active', true, 'Demo contact'),
    (owner_id, 'Carol Perez',       '(214) 555-0113', '2145550113', 'Perez Properties',   'Director',        'active', true, 'Demo contact'),
    (owner_id, 'David Kim',         '(972) 555-0114', '9725550114', 'Kim Construction',   'President',       'active', true, 'Demo contact'),
    (owner_id, 'Elena Vasquez',     '(469) 555-0115', '4695550115', 'Vasquez Homes',      'Owner',           'active', true, 'Demo contact'),
    (owner_id, 'Frank Okafor',      '(281) 555-0116', '2815550116', 'Okafor Real Estate', 'Broker',          'active', true, 'Demo contact'),
    (owner_id, 'Grace Liu',         '(832) 555-0117', '8325550117', 'Liu Developments',   'VP Operations',   'active', true, 'Demo contact'),
    (owner_id, 'Henry Patel',       '(713) 555-0118', '7135550118', 'Patel Holdings',     'CEO',             'active', true, 'Demo contact'),
    (owner_id, 'Isla Fernandez',    '(361) 555-0119', '3615550119', 'Fernandez Builders', 'Founder',         'active', true, 'Demo contact'),
    (owner_id, 'James Obi',         '(956) 555-0120', '9565550120', 'Obi Renovation',     'Owner',           'active', true, 'Demo contact'),
    (owner_id, 'Karen Walsh',       '(512) 555-0121', '5125550121', 'Walsh Property Mgmt','Director',        'active', true, 'Demo contact'),
    (owner_id, 'Leo Nakamura',      '(737) 555-0122', '7375550122', 'Nakamura Group',     'President',       'active', true, 'Demo contact'),
    (owner_id, 'Maria Dubois',      '(214) 555-0123', '2145550123', 'Dubois Estates',     'Owner',           'active', true, 'Demo contact'),
    (owner_id, 'Nathan Brooks',     '(972) 555-0124', '9725550124', 'Brooks Contracting', 'GM',              'active', true, 'Demo contact'),
    (owner_id, 'Olivia Stone',      '(469) 555-0125', '4695550125', 'Stone Remodeling',   'COO',             'active', true, 'Demo contact'),
    (owner_id, 'Paul Mensah',       '(281) 555-0126', '2815550126', 'Mensah Builds',      'Founder',         'active', true, 'Demo contact'),
    (owner_id, 'Quinn Torres',      '(832) 555-0127', '8325550127', 'Torres Properties',  'Owner',           'active', true, 'Demo contact'),
    (owner_id, 'Rachel Johansson',  '(713) 555-0128', '7135550128', 'Johansson Homes',    'VP Sales',        'active', true, 'Demo contact'),
    (owner_id, 'Sam Adeyemi',       '(361) 555-0129', '3615550129', 'Adeyemi Realty',     'Director',        'active', true, 'Demo contact'),
    (owner_id, 'Tina Ramirez',      '(956) 555-0130', '9565550130', 'Ramirez Dev',        'Owner',           'active', true, 'Demo contact')
  RETURNING id
)
SELECT array_agg(id) INTO cids FROM inserted;

-- ── Add all contacts to call list ─────────────────────────────────────────────
FOR i IN 1..array_length(cids, 1) LOOP
  c := cids[i];
  INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position)
  VALUES (test_list_id, c, 'pending', i);
  INSERT INTO campaign_contacts (campaign_id, contact_id)
  VALUES (test_campaign_id, c)
  ON CONFLICT DO NOTHING;
END LOOP;

-- ── Fake call records (mix of outcomes) ───────────────────────────────────────
-- Calls are attributed to the owner since test SDR may not exist yet
INSERT INTO calls (
  user_id, contact_id, campaign_id, call_list_id,
  outcome, call_duration_seconds, summary, created_at
)
SELECT
  owner_id,
  cids[n],
  test_campaign_id,
  test_list_id,
  outcome,
  duration,
  summary,
  NOW() - (n || ' hours')::INTERVAL
FROM (VALUES
  (1,  'appointment_set',  347, 'Demo: Homeowner interested, scheduled for Thursday'),
  (2,  'voicemail',         0,  'Demo: Left voicemail, call back requested'),
  (3,  'no_answer',         0,  'Demo: No answer'),
  (4,  'not_interested',   42,  'Demo: Homeowner said not interested at this time'),
  (5,  'appointment_set',  281, 'Demo: Confirmed appointment for next Tuesday 2pm'),
  (6,  'callback',         95,  'Demo: Requested callback tomorrow morning'),
  (7,  'no_answer',         0,  'Demo: No answer'),
  (8,  'voicemail',         0,  'Demo: Left message with callback number'),
  (9,  'not_interested',   28,  'Demo: Recently replaced windows'),
  (10, 'appointment_set',  412, 'Demo: Very interested, booked for Friday 10am'),
  (11, 'no_answer',         0,  'Demo: No answer, try again'),
  (12, 'callback',        118,  'Demo: Needs to check schedule, calling back Thursday'),
  (13, 'voicemail',         0,  'Demo: Voicemail full'),
  (14, 'appointment_set',  266, 'Demo: Set appointment, homeowner very motivated'),
  (15, 'not_interested',   61,  'Demo: Renting, not a homeowner')
) AS t(n, outcome, duration, summary);

-- ── Test SDR team member ──────────────────────────────────────────────────────
INSERT INTO team_members (
  id, owner_user_id, member_user_id, member_email,
  role, portal_access, permissions
) VALUES (
  test_sdr_member,
  owner_id,
  test_sdr_uid,
  'test-rep@lead-os-demo.com',
  'sdr',
  false,
  '{"can_dial": true, "can_log_calls": true, "can_view_scripts": true}'::jsonb
)
ON CONFLICT (member_user_id, owner_user_id) DO UPDATE
  SET member_email = EXCLUDED.member_email,
      role = EXCLUDED.role;

-- Assign test SDR to test campaign
INSERT INTO campaign_sdrs (campaign_id, sdr_id)
VALUES (test_campaign_id, test_sdr_member)
ON CONFLICT DO NOTHING;

-- ── Test client portal user ───────────────────────────────────────────────────
INSERT INTO team_members (
  id, owner_user_id, member_user_id, member_email,
  role, portal_access, client_id, permissions
) VALUES (
  test_cli_member,
  owner_id,
  test_client_uid,
  'test-client@lead-os-demo.com',
  'viewer',
  true,
  test_client_id,
  '{}'::jsonb
)
ON CONFLICT (member_user_id, owner_user_id) DO UPDATE
  SET member_email = EXCLUDED.member_email,
      portal_access = true,
      client_id = EXCLUDED.client_id;

RAISE NOTICE 'Test data created successfully.';
RAISE NOTICE '  Client ID:   %', test_client_id;
RAISE NOTICE '  Campaign ID: %', test_campaign_id;
RAISE NOTICE '  Call List:   %', test_list_id;
RAISE NOTICE '  SDR member:  %', test_sdr_member;
RAISE NOTICE '  Client mbr:  %', test_cli_member;

END $$;
