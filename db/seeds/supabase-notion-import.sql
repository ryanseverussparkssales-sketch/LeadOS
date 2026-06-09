-- ============================================================
-- LeadOS — Notion Import
-- Tasks, Wrench Node project, Huntt.gg Streamer Outreach
-- Run in Supabase SQL Editor
-- Generated: 2026-05-30
-- ============================================================

DO $$
DECLARE
  v_user_id        UUID;
  v_welfel_id      UUID;
  v_wrench_id      UUID;
  v_huntt_proj_id  UUID;
  v_wrench_proj_id UUID;
  v_streamer_camp_id   UUID;
  v_mechanics_camp_id  UUID;
  v_streamer_list_id   UUID;
  v_mechanics_list_id  UUID;
  v_contact_id         UUID;

BEGIN

  -- ── Auto-detect user and client IDs ───────────────────────────────────────
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;
  SELECT id INTO v_welfel_id FROM clients WHERE name ILIKE '%welfel%' LIMIT 1;
  SELECT id INTO v_wrench_id FROM clients WHERE name ILIKE '%wrench%' LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found in auth.users — make sure you are logged in.';
  END IF;

  RAISE NOTICE 'user_id    = %', v_user_id;
  RAISE NOTICE 'welfel_id  = %', v_welfel_id;
  RAISE NOTICE 'wrench_id  = %', v_wrench_id;


  -- ============================================================
  -- SECTION 1: TASKS FROM NOTION (26 active tasks)
  -- Notion "Track" → priority:
  --   Today       → urgent
  --   Tomorrow    → high
  --   This Week   → medium
  --   This Month / Parked → low
  -- Notion "Category" → task_type:
  --   New Revenue, Welfel Ventures → follow_up
  --   Admin Setup, Budget Tools, Home Workspace,
  --   Email Comms, Health → task
  -- ============================================================

  INSERT INTO tasks (user_id, title, status, priority, task_type, due_date, description)
  VALUES

    -- 1. Find ghost subscriptions — This Week / Admin Setup
    (v_user_id,
     'Find ghost subscriptions',
     'pending', 'medium', 'task', NULL,
     'Open bank app, filter recurring charges. Kill anything not on approved list. Target: $100 random.'),

    -- 2. Doctor appointment 5/19 — This Month / Health
    (v_user_id,
     'Doctor appointment 5/19',
     'pending', 'low', 'task', '2026-05-19 00:00:00',
     'Weight loss appointment rescheduled to 5/19. Insurance didn''t cooperate — verify coverage again before the 19th.'),

    -- 3. Desk rework + cable management — This Month / Home Workspace
    (v_user_id,
     'Desk rework + cable management',
     'pending', 'low', 'task', NULL,
     '90in IKEA top. Monitor + KB arms incoming. 5-screen layout: Lowes/Welfel/Main/Dialer/Tablet.'),

    -- 4. Home automation + mini PC — This Month / Home Workspace
    (v_user_id,
     'Home automation + mini PC',
     'pending', 'low', 'task', NULL,
     'Always-on mini PC for NAS management + home automation.'),

    -- 5. Steam Deck setup — This Month / Home Workspace
    (v_user_id,
     'Steam Deck setup',
     'pending', 'low', 'task', NULL,
     '9pm-12am gaming block. Protect the decompression time.'),

    -- 6. Build service packages — Tomorrow / New Revenue
    (v_user_id,
     'Build service packages',
     'pending', 'high', 'follow_up', NULL,
     'Sprint $1,500 flat. Retainer $2,000/mo. CRM Cleanup $500-800. AI Integration $1,000-2,500.'),

    -- 7. Time tracking setup (Toggl) — This Month / Admin Setup
    (v_user_id,
     'Time tracking setup (Toggl)',
     'pending', 'low', 'task', NULL,
     'Toggl free + Notion = $0. Know your hours = know your real rate. Currently undercharging.'),

    -- 8. Upwork profile overhaul — Today / New Revenue
    (v_user_id,
     'Upwork profile overhaul',
     'pending', 'urgent', 'follow_up', NULL,
     'Full rewrite. Senior sales ops without the FT hire. $2M pipeline. AI-native. 4 packages listed.'),

    -- 9. Inbox nuclear option — This Week / Email Comms
    (v_user_id,
     'Inbox nuclear option',
     'pending', 'medium', 'task', NULL,
     'Gmail: search older_than:6m -> select all -> archive. Do all 3 Gmails. 30 sec each.'),

    -- 10. Pass tool costs to clients — This Week / Admin Setup
    (v_user_id,
     'Pass tool costs to clients',
     'pending', 'medium', 'task', NULL,
     'Adobe $38 + Canva $14 + JustCall portion = ~$74/mo billable back to clients.'),

    -- 11. Wrench Node power calling session — Today / New Revenue
    (v_user_id,
     'Wrench Node power calling session',
     'pending', 'urgent', 'follow_up', NULL,
     'Afternoon block. 6 hrs left. $175 still outstanding. Score leads first.'),

    -- 12. Havens power calling session — Today / New Revenue
    (v_user_id,
     'Havens power calling session',
     'pending', 'urgent', 'follow_up', NULL,
     '8-11am. Dumb dialer rule: open and dial first. 6 hrs left on list. $100/meeting set.'),

    -- 13. Email forwarding setup — Tomorrow / Email Comms
    (v_user_id,
     'Email forwarding setup',
     'pending', 'high', 'task', NULL,
     'Forward all Gmails + Outlook to one main Gmail. Iotty inbox stays separate on tablet.'),

    -- 14. Bill Welfel the $44 tool cost — Tomorrow / Welfel Ventures
    (v_user_id,
     'Bill Welfel the $44 tool cost',
     'pending', 'high', 'follow_up', NULL,
     'Their tool expense not yours. Add to next Bryan invoice.'),

    -- 15. Insurance coverage verification — This Week / Health
    (v_user_id,
     'Insurance coverage verification',
     'pending', 'medium', 'task', '2026-05-19 00:00:00',
     'Insurance being difficult. Appt moved to 5/19 — re-verify coverage before then.'),

    -- 16. NAS setup — This Month / Home Workspace
    (v_user_id,
     'NAS setup',
     'pending', 'low', 'task', NULL,
     '2-bay starter NAS + drives $400-600. Centralizes media, client files, backups.'),

    -- 17. Website rebuild — Parked / New Revenue
    (v_user_id,
     'Website rebuild',
     'pending', 'low', 'task', NULL,
     'Upwork IS your website for 60 days. Revisit with 3+ case studies. Site copy is already solid.'),

    -- 18. Kill CC debt $1,200 — Tomorrow / Budget Tools
    (v_user_id,
     'Kill CC debt $1,200',
     'pending', 'high', 'task', NULL,
     'Use Welfel $700 + roommate $1,500 next week. Dead by May 15.'),

    -- 19. Sparks Curiosity LLC formation — This Week / Admin Setup
    (v_user_id,
     'Sparks Curiosity LLC formation',
     'pending', 'medium', 'task', NULL,
     'Critical for mortgage qualification. Lenders want clean business entity + documented income.'),

    -- 20. Dumpster rental + garage cleanout — This Month / Home Workspace
    (v_user_id,
     'Dumpster rental + garage cleanout',
     'pending', 'low', 'task', NULL,
     'Order dumpster this week. Clean garage week of May 12. Done before June 15.'),

    -- 21. Office shelving installation — This Month / Home Workspace
    (v_user_id,
     'Office shelving installation',
     'pending', 'low', 'task', NULL,
     'Budget $200-400. Do after garage clear. Wall of bookshelves expansion.'),

    -- 22. Open business bank account — This Week / Admin Setup
    (v_user_id,
     'Open business bank account',
     'pending', 'medium', 'task', NULL,
     NULL),

    -- 23. Register LLC in Minnesota — This Week / Admin Setup
    (v_user_id,
     'Register LLC in Minnesota',
     'pending', 'medium', 'task', NULL,
     NULL),

    -- 24. Build Sparks Command Center - Phase 1 — This Week / Admin Setup
    (v_user_id,
     'Build Sparks Command Center - Phase 1',
     'pending', 'medium', 'task', NULL,
     'Clients/projects hierarchy setup in LeadOS'),

    -- 25. Refine Streamer Outreach Proof — Tomorrow / Welfel Ventures
    (v_user_id,
     'Refine Streamer Outreach Proof',
     'pending', 'high', 'follow_up', NULL,
     'Refine the Huntt.gg streamer outreach proposal'),

    -- 26. Notion workspace setup — Today / Admin Setup
    (v_user_id,
     'Notion workspace setup',
     'pending', 'urgent', 'task', NULL,
     'Replacing HubSpot. Client vaults, tasks, time tracking. Free tier.');

  RAISE NOTICE 'Section 1 complete — 26 tasks inserted.';


  -- ============================================================
  -- SECTION 2: WRENCH NODE PROJECT
  -- ============================================================

  -- Guard: need a Wrench Node client to proceed
  IF v_wrench_id IS NULL THEN
    RAISE WARNING 'Wrench Node client not found — skipping Section 2. Create a client named "Wrench Node" first.';
  ELSE

    -- Create project
    INSERT INTO projects (client_id, name, status)
    VALUES (v_wrench_id, 'Tampa Bay Mechanics Outreach', 'active')
    RETURNING id INTO v_wrench_proj_id;

    RAISE NOTICE 'Wrench project id = %', v_wrench_proj_id;

    -- Create campaign
    INSERT INTO campaigns (project_id, user_id, name, description, status)
    VALUES (
      v_wrench_proj_id,
      v_user_id,
      'Tampa Bay Mechanics - Cold Call',
      'Cold calling campaign targeting independent mechanic shops in the Tampa Bay area.',
      'active'
    )
    RETURNING id INTO v_mechanics_camp_id;

    RAISE NOTICE 'Wrench campaign id = %', v_mechanics_camp_id;

    -- Create call list linked to both project and campaign
    INSERT INTO call_lists (project_id, campaign_id, name, status)
    VALUES (v_wrench_proj_id, v_mechanics_camp_id, 'Tampa Mechanics CSV (300 contacts)', 'active')
    RETURNING id INTO v_mechanics_list_id;

    RAISE NOTICE 'Wrench call list id = %', v_mechanics_list_id;

    -- Knowledge base entry: Project Details
    INSERT INTO client_knowledge (user_id, client_id, title, content, knowledge_type, sort_order)
    VALUES (
      v_user_id,
      v_wrench_id,
      'Project Details',
      'Tampa Bay mechanics CSV — 300 contacts. $175 of $350 paid, $175 outstanding. 6hrs calling remaining. Power session PM. Currently charging $25/hr — UNDERCHARGING, reprice next project to $50-75/hr. Deliverable: booked appointments or qualified leads from mechanic shops. Services: Cold Calling + Lead Gen. Last touchpoint: 2026-05-12.',
      'general',
      1
    );

    -- Knowledge base entry: Calling Strategy (talking points)
    INSERT INTO client_knowledge (user_id, client_id, title, content, knowledge_type, sort_order)
    VALUES (
      v_user_id,
      v_wrench_id,
      'Wrench Node Calling Strategy',
      'Score warm leads first — anyone who showed interest previously, call those first. Goal: booked appointments. Rate: $100/meeting set. 300 contacts total in Tampa Bay area. Focus on independent shops and small chains. Ask for the owner or service manager. Key offer: mobile mechanic software / tools / services that save them time and money.',
      'talking_points',
      2
    );

    RAISE NOTICE 'Section 2 complete — Wrench Node project, campaign, call list, and 2 knowledge entries inserted.';

  END IF;


  -- ============================================================
  -- SECTION 3: HUNTT.GG STREAMER OUTREACH PROJECT
  -- ============================================================

  -- Guard: need a Welfel Ventures client to proceed
  IF v_welfel_id IS NULL THEN
    RAISE WARNING 'Welfel Ventures client not found — skipping Section 3. Create a client named "Welfel Ventures" first.';
  ELSE

    -- Create project under Welfel Ventures
    INSERT INTO projects (client_id, name, status)
    VALUES (v_welfel_id, 'Huntt.gg Streamer Outreach', 'active')
    RETURNING id INTO v_huntt_proj_id;

    RAISE NOTICE 'Huntt project id = %', v_huntt_proj_id;

    -- Create campaign
    INSERT INTO campaigns (project_id, user_id, name, description, status)
    VALUES (
      v_huntt_proj_id,
      v_user_id,
      'Streamer Partnership 2026',
      'Outreach campaign to gaming streamers and content creators for Huntt.gg partnership deals.',
      'active'
    )
    RETURNING id INTO v_streamer_camp_id;

    RAISE NOTICE 'Huntt campaign id = %', v_streamer_camp_id;

    -- Create call list
    INSERT INTO call_lists (project_id, campaign_id, name, status)
    VALUES (v_huntt_proj_id, v_streamer_camp_id, 'Streamer Tier A + B', 'active')
    RETURNING id INTO v_streamer_list_id;

    RAISE NOTICE 'Huntt call list id = %', v_streamer_list_id;

    -- ── Insert 26 streamer contacts and link to call list ──────────────────

    -- 1. OhnePixel
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'OhnePixel', 'Streamer / Content Creator', 'prospect',
      'CS2/gaming streamer. Streamer Awards 2025 nominee. Audience spends money on in-game items — ideal gaming marketplace fit.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 1);

    -- 2. Adapt
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'Adapt', 'Streamer / Content Creator', 'prospect',
      'Won Best Breakout Streamer at 2025 Streamer Awards. Rapidly rising. Get in early before rates increase.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 2);

    -- 3. DDG
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'DDG', 'Streamer / Content Creator', 'prospect',
      'Music artist turned streamer. Nominated 2025 Streamer Awards. Broad young audience across music and gaming.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 3);

    -- 4. Disguised Toast
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'Disguised Toast', 'Streamer / Content Creator', 'prospect',
      'Card game/variety streamer. Large engaged audience. Known for creative gaming content.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 4);

    -- 5. Sodapoppin
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'Sodapoppin', 'Streamer / Content Creator', 'prospect',
      'OTK affiliate. Veteran variety streamer. Audience loves gaming deals, competitions, reward-based content.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 5);

    -- 6. Michael Reeves
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'Michael Reeves', 'Streamer / Content Creator', 'prospect',
      'Tech/comedy creator. Huge YouTube + Twitch audience. Known for viral engineering projects.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 6);

    -- 7. MoistCr1TiKaL
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'MoistCr1TiKaL', 'Streamer / Content Creator', 'prospect',
      'Massive multi-platform creator. Beloved by Gen Z. High trust = high conversion for partnerships.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 7);

    -- 8. Vinesauce
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'Vinesauce', 'Streamer / Content Creator', 'prospect',
      'Gaming channel with cult loyal fanbase. Nominated Streamer Awards 2025. Niche but deeply engaged audience.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 8);

    -- 9. William Osman
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'William Osman', 'Streamer / Content Creator', 'prospect',
      'Tech/comedy YouTube creator. Overlaps with Michael Reeves crowd. Engaged niche audience.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 9);

    -- 10. Clavicular
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'Clavicular', 'Streamer / Content Creator', 'prospect',
      'Rising gaming content creator. Emerging audience in competitive gaming space.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 10);

    -- 11. Kkatamina
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'Kkatamina', 'Streamer / Content Creator', 'prospect',
      'Holds records for most-subscribed female streamer ever. Huge Gen Z gaming audience. Gaming rewards/discounts are a natural fit.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 11);

    -- 12. ExtraEmily
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'ExtraEmily', 'Streamer / Content Creator', 'prospect',
      'OTK orbit. Won Best Stream Duo with Agent00 at Streamer Awards 2025. Fast-rising, high brand conversion.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 12);

    -- 13. Typical Gamer
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'Typical Gamer', 'Streamer / Content Creator', 'prospect',
      'Fortnite-focused YouTuber/streamer. 15.9M+ subscribers. Loyal Fortnite audience = perfect Huntt fit.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 13);

    -- 14. Esfand
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'Esfand', 'Streamer / Content Creator', 'prospect',
      'OTK co-founder. WoW and variety streamer. Audience spends on in-game rewards.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 14);

    -- 15. Asmongold
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'Asmongold', 'Streamer / Content Creator', 'prospect',
      'One of biggest gaming streamers. WoW + variety. Massive loyal audience. OTK co-founder.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 15);

    -- 16. Vanillamace
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'Vanillamace', 'Streamer / Content Creator', 'prospect',
      'Fastest growing female creator in 2025. Nominated Streamer Awards 2025. High momentum — get in now.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 16);

    -- 17. Marlon
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'Marlon', 'Streamer / Content Creator', 'prospect',
      'Won Best Rising Streamer at 2025 Streamer Awards. One of most discussed new names in streaming. Get in early.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 17);

    -- 18. Summit1g
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'Summit1g', 'Streamer / Content Creator', 'prospect',
      'Veteran Twitch streamer. CS and variety. Large dedicated fanbase with high spending power.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 18);

    -- 19. iitztimmy
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'iitztimmy', 'Streamer / Content Creator', 'prospect',
      'Top Apex streamer, ex-pro. Competitive gaming audience that engages with gaming gear and game deals.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 19);

    -- 20. HasanAbi
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'HasanAbi', 'Streamer / Content Creator', 'prospect',
      'Political/variety streamer. Massive Twitch audience. Broad reach across Gen Z.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 20);

    -- 21. Caedrel
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'Caedrel', 'Streamer / Content Creator', 'prospect',
      'League of Legends esports commentator + streamer. Deeply engaged LoL audience.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 21);

    -- 22. Ludwig Ahgren
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'Ludwig Ahgren', 'Streamer / Content Creator', 'prospect',
      'One of the biggest YouTube gaming creators. Host of Mogul Money, chess streamers. Mainstream gaming audience.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 22);

    -- 23. Ironmouse
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'Ironmouse', 'Streamer / Content Creator', 'prospect',
      'VTuber with massive community. Won VTuber of the Year. Loyal, highly engaged fanbase.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 23);

    -- 24. Jynxzi
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'Jynxzi', 'Streamer / Content Creator', 'prospect',
      'Won Best FPS & Gamer of Year 2024 Streamer Awards. Ubisoft made in-game cosmetics for him. Gen Z hardcore FPS player base.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 24);

    -- 25. Valkyrae
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'Valkyrae', 'Streamer / Content Creator', 'prospect',
      '100 Thieves co-owner with CouRageJD. One of biggest female gaming creators. Reach via 100T brand partnerships.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 25);

    -- 26. Joe Bartolozzi
    INSERT INTO contacts (user_id, name, company, status, notes)
    VALUES (v_user_id, 'Joe Bartolozzi', 'Streamer / Content Creator', 'prospect',
      'TikTok creator turned Twitch streamer. Nominated 2025 Streamer Awards. Younger demographic, high social reach.')
    RETURNING id INTO v_contact_id;
    INSERT INTO call_list_contacts (call_list_id, contact_id, status, queue_position) VALUES (v_streamer_list_id, v_contact_id, 'pending', 26);

    RAISE NOTICE 'Section 3 complete — Huntt.gg project, campaign, call list, and 26 streamer contacts inserted.';

  END IF;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Import complete. Summary:';
  RAISE NOTICE '  Section 1: 26 tasks from Notion';
  RAISE NOTICE '  Section 2: Wrench Node — Tampa Bay Mechanics Outreach project + campaign + call list + 2 KB entries';
  RAISE NOTICE '  Section 3: Huntt.gg — Streamer Outreach project + campaign + Tier A+B call list + 26 contacts';
  RAISE NOTICE '============================================================';

END $$;
