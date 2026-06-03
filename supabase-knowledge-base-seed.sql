-- ============================================================
-- LeadOS Knowledge Base Seed
-- Sparks Curiosity Studio + Welfel Ventures + Portfolio
--
-- HOW TO USE:
-- 1. Run this in Supabase SQL Editor
-- 2. Replace YOUR_USER_ID with your actual user ID from auth.users
-- 3. Replace CLIENT_ID_WELFEL and CLIENT_ID_SPARKS with the actual
--    client UUIDs from your clients table:
--    SELECT id, name FROM clients;
-- ============================================================

-- Step 1: Find your IDs first (run this separately)
-- SELECT id FROM auth.users LIMIT 1;
-- SELECT id, name FROM clients ORDER BY name;

-- ============================================================
-- SPARKS CURIOSITY STUDIO — Knowledge Base
-- ============================================================

DO $$
DECLARE
  v_user_id UUID := (SELECT id FROM auth.users LIMIT 1);
  v_sparks_id UUID := (SELECT id FROM clients WHERE name ILIKE '%sparks%' LIMIT 1);
  v_welfel_id UUID := (SELECT id FROM clients WHERE name ILIKE '%welfel%' LIMIT 1);
BEGIN

-- ── SPARKS CURIOSITY STUDIO ─────────────────────────────────

IF v_sparks_id IS NOT NULL THEN

  INSERT INTO client_knowledge (user_id, client_id, title, content, knowledge_type, sort_order) VALUES

  (v_user_id, v_sparks_id, 'Agency Overview',
  'Sparks Curiosity Studio is a boutique sales agency founded and operated by Ryan Sparks. The agency specializes in outbound sales, cold calling, lead generation, and appointment setting for direct-to-consumer and B2B brands.

Key capabilities:
- Cold calling and outbound prospecting
- Lead generation and database building
- Resurrect and re-engage dead/cold databases
- Appointment setting and pipeline building
- Sales-focused voice work and script development
- CRM management and contact organization

Track record: 10+ years of sales experience. Over $2M in pipeline built through cold calling. Proven results across multiple industries including DTC consumer brands, technology, and service businesses.',
  'general', 1),

  (v_user_id, v_sparks_id, 'Core Services & Pricing Approach',
  'Services offered by Sparks Curiosity Studio:

1. OUTBOUND CALLING CAMPAIGNS
   - Cold calling for lead generation
   - Warm follow-up sequences
   - Re-engagement of lapsed leads/customers
   - Appointment setting for client sales teams

2. LEAD GENERATION
   - Contact list building and enrichment
   - Prospect research and qualification
   - Database cleanup and normalization

3. CRM MANAGEMENT
   - Contact organization and tagging
   - Pipeline tracking and reporting
   - Activity logging and follow-up scheduling

4. SCRIPT DEVELOPMENT
   - Cold call scripts
   - Objection handling playbooks
   - Email follow-up templates

Pricing model: Project-based or monthly retainer. Custom proposals based on volume, industry, and campaign complexity.',
  'product', 2),

  (v_user_id, v_sparks_id, 'Ideal Client Profile',
  'Best-fit clients for Sparks Curiosity Studio:

WHO WE SERVE BEST:
- DTC brands looking to add outbound sales to complement paid acquisition
- Companies with a proven product but no dedicated SDR/BDR team
- Businesses with a cold database that needs to be reactivated
- Startups that need to build pipeline quickly without hiring full-time sales
- Agencies and service firms looking to grow through outbound

INDUSTRIES WITH PROVEN SUCCESS:
- Direct-to-consumer (subscription boxes, consumer goods)
- SaaS and technology platforms
- E-commerce brands
- Professional services

COMPANY SIZE SWEET SPOT:
- 10-200 employees
- $1M-$50M annual revenue
- Companies where the founder is still involved in sales decisions',
  'general', 3),

  (v_user_id, v_sparks_id, 'Talking Points & Value Proposition',
  'KEY TALKING POINTS when prospecting for Sparks Curiosity Studio:

OPENING:
"We build outbound sales engines for DTC brands. Most of our clients have great products and strong digital marketing, but no structured outbound program. We change that."

VALUE PROPS:
- "You get 10+ years of cold calling experience without the cost and risk of hiring a full-time SDR."
- "We''ve built over $2M in pipeline through outbound alone — not ads, not inbound — just targeted outreach."
- "Most agencies focus on marketing. We focus on sales conversations that actually close."

DIFFERENTIATION:
- Boutique, hands-on — Ryan personally leads all campaigns
- Deep understanding of DTC brand dynamics (subscription, LTV, churn)
- Uses LeadOS CRM for real-time campaign tracking and reporting
- Results-focused: appointments set and pipeline created, not just dials made

PROOF POINTS:
- 10+ years outbound sales experience
- $2M+ in pipeline attributed to cold calling campaigns
- Experience with subscription brands (direct alignment with Welfel portfolio)',
  'talking_points', 4),

  (v_user_id, v_sparks_id, 'Common Objections & Responses',
  'OBJECTION HANDLING for Sparks Curiosity Studio pitches:

"We already have a marketing team."
→ "Great — we complement marketing, not compete with it. Marketing brings inbound leads. We create outbound pipeline your marketing can''t reach — people who match your profile but haven''t found you yet."

"We tried cold calling before and it didn''t work."
→ "Most cold calling fails because of bad lists, weak scripts, or no follow-through. We fix all three. Can I show you what our typical campaign setup looks like?"

"We don''t have budget for this."
→ "Understood. Let me ask — if we set 10 qualified appointments in the next 30 days, what would one closed deal be worth to you? Most clients find the ROI is immediate."

"We prefer to keep sales in-house."
→ "We work alongside internal teams all the time. We can act as a prospecting engine that feeds your team, so they focus on closing, not dialing."

"How do we know it''ll work for our industry?"
→ "We work in DTC and subscription businesses specifically — that''s your world. The Welfel portfolio is a great example. Happy to share what''s worked there."',
  'objections', 5);

END IF;

-- ── WELFEL VENTURES ─────────────────────────────────────────

IF v_welfel_id IS NOT NULL THEN

  INSERT INTO client_knowledge (user_id, client_id, title, content, knowledge_type, sort_order) VALUES

  (v_user_id, v_welfel_id, 'Company Overview',
  'Welfel Ventures is a direct-to-consumer brand portfolio company founded in 2017 by brothers Bryan and Peter Welfel, headquartered in New York, NY.

FOUNDERS:
- Bryan Welfel (CEO/Managing Partner): Business and technology strategist. Previously co-founded JSwipe (Jewish dating app), sold to Spark Networks in 2015. Now Chairman & CEO of The Beard Club. Expert in DTC growth, subscription economics, and digital marketing.
- Peter Welfel (Partner): 10+ years experience in computer system validation in the pharmaceutical industry. Brings operational rigor and process discipline from a highly regulated environment.

PHILOSOPHY:
"Process is our craft." — Welfel Ventures builds and scales DTC brands through disciplined operational process, data-driven marketing, and strategic portfolio management.

PORTFOLIO:
1. The Beard Club — men''s subscription grooming brand (Bryan is Chairman/CEO)
2. iotty Smart Home — design-forward WiFi smart switches and home automation
3. Huntt.gg — gaming rewards platform (earn coins playing games, redeem for prizes)

WHAT RYAN IS DOING FOR WELFEL:
Outbound sales campaigns, lead generation, contact prospecting, and appointment setting across the portfolio companies.',
  'general', 1),

  (v_user_id, v_welfel_id, 'Key Contacts',
  'PRIMARY CONTACTS at Welfel Ventures:

BRYAN WELFEL
- Title: Co-Founder, Managing Partner / Chairman & CEO (The Beard Club)
- Location: New York, NY
- Background: Serial entrepreneur, DTC expert, digital marketing strategist
- Twitter/X: @bwelfel
- Focus areas: Growth strategy, marketing, product direction across portfolio
- Decision-making role: Primary decision maker for all major initiatives

PETER WELFEL
- Title: Co-Founder, Partner
- Background: Pharmaceutical industry, computer system validation, operations
- Focus areas: Operations, process optimization, compliance, systems
- Role: Operational backbone of the portfolio

COMMUNICATION STYLE:
- Bryan: Strategic, big-picture thinker. Responds well to data and ROI framing.
- Peter: Detail-oriented, process-focused. Appreciates thoroughness and documentation.',
  'general', 2),

  (v_user_id, v_welfel_id, 'Portfolio Company Details',
  'WELFEL VENTURES PORTFOLIO — Detailed Overview:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE BEARD CLUB (thebeardclub.com)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Founded: 2015 | HQ: Westwood, NJ
- Bryan Welfel: Chairman & CEO
- Employees: 29 | Funding: $22.4M raised
- Model: Monthly subscription grooming boxes
- Products: Beard oils, creams, pomades, shampoos, growth supplements, accessories, swag
- All-natural formulations
- Subscription flexibility: monthly, every 2 months, every 3 months
- Strong customer satisfaction and repeat purchase rates

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IOTTY SMART HOME (iottysmarthome.com)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Founded: 2017 | HQ: Westwood, NJ
- Product: Design-forward Wi-Fi smart switches (Italian tempered glass aesthetic)
- Current products: 1, 2, 3, and 4-switch controllers with dimming
- Coming: Smart outlets, occupancy sensors (commercial)
- Integrations: Amazon Alexa, Google Assistant, iotty mobile app
- 2026 projections: $10M+ revenue (vs. $2.7M avg since 2019)
- Distribution expansion: Electricians, builders, Amazon marketplace
- Market: $27B US switch-and-outlet market

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HUNTT.GG (huntt.gg)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Founded: 2024 | Platform: Mobile app (iOS + Android)
- Tagline: "Your gaming success, rewarded with real-world prizes"
- How it works: Play games → earn Huntt Coins → redeem for exclusive prizes
- Supported games: Fortnite, Brawl Stars, Call of Duty, Candy Crush, Apex, CS2, Dota 2, Valorant, COD Warzone
- Features: Lucky Drops (mystery boxes), Hot Items, Raffles
- Social: @hunttapp on Instagram/X, Discord community
- Email: help@huntt.gg',
  'product', 3),

  (v_user_id, v_welfel_id, 'Talking Points for Welfel Projects',
  'TALKING POINTS when calling on behalf of Welfel Ventures brands:

FOR THE BEARD CLUB:
"The Beard Club has been in the men''s grooming subscription space since 2015 — one of the originals. With $22M raised and Bryan Welfel at the helm, they''re focused on profitable growth and expanding their retail presence. If your audience is men who take their grooming seriously, this partnership conversation is worth having."

FOR IOTTY SMART HOME:
"iotty is one of the most design-forward smart home brands I''ve come across — Italian tempered glass switches that look incredible and install in minutes. They''re on track for $10M in revenue in 2026 and expanding from direct-to-consumer into electricians, builders, and Amazon. If you work in real estate, home renovation, or smart home retail, this is a conversation worth having."

FOR HUNTT.GG:
"Huntt is where gaming meets real rewards. Players earn coins through their gaming performance — not gambling, not purchasing — and redeem them for exclusive drops and merchandise. If your audience is in gaming, esports, or Gen Z consumer products, Huntt is building something genuinely new in this space."

GENERAL WELFEL ANGLE:
"Welfel Ventures has a proven playbook for building DTC brands — they scaled JSwipe to acquisition, The Beard Club to $22M raised, and they''re now applying those learnings to smart home tech and gaming rewards."',
  'talking_points', 4),

  (v_user_id, v_welfel_id, 'Objections & Responses',
  'COMMON OBJECTIONS when working on Welfel portfolio campaigns:

"We already work with a grooming brand / smart home company."
→ "Understood — we''re not asking you to replace anything. We''re asking if there''s a conversation to be had about partnership, co-marketing, or distribution that adds value for both sides."

"We don''t do subscription boxes."
→ "The Beard Club''s subscription model is flexible — monthly, bi-monthly, quarterly. It''s designed to fit the customer''s lifestyle, not force a commitment."

"Smart home feels saturated."
→ "Most smart switches are ugly or complicated. iotty is the first one that''s genuinely beautiful — Italian tempered glass, installs like a normal switch. That''s the differentiation."

"Gaming rewards sounds like gambling."
→ "Huntt is fundamentally different — you earn coins based on your gaming skill and performance, not by spending money. It''s a skill-based rewards platform, not a gambling site."

"I''d need to know more before committing."
→ "Absolutely — that''s exactly why I''m calling. Bryan Welfel would love 20 minutes to walk you through the roadmap. Can we find time this week?"',
  'objections', 5),

  (v_user_id, v_welfel_id, 'Campaign Strategy Notes',
  'OUTBOUND STRATEGY for Welfel Ventures engagement:

TARGET SEGMENTS:

The Beard Club:
- Men''s lifestyle influencers and media buyers
- Subscription box retailers and curators
- Men''s health/wellness brands for co-marketing
- Gift market buyers (Father''s Day, Christmas, etc.)
- Corporate gifting companies

iotty Smart Home:
- Residential electricians (B2B — high LTV)
- Home builders and contractors (B2B)
- Interior designers and staging companies
- Smart home retail chains and distributors
- Real estate agents and property managers

Huntt.gg:
- Gaming content creators and streamers
- Esports team managers and agents
- Gaming merchandise brands for drop partnerships
- Mobile gaming publishers for integration
- Gen Z-focused brand marketers

CALL PRIORITY ORDER:
1. Warm referrals / existing connections Bryan/Peter have introduced
2. Industry contacts in each vertical above
3. Cold outreach using LeadOS call lists

TRACKING:
All calls logged in LeadOS under Welfel Ventures client. Outcomes tracked by portfolio company (use Tags: beard-club, iotty, huntt)',
  'custom', 6);

END IF;

END $$;
