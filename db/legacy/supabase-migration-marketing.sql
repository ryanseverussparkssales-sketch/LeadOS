-- ============================================================
-- LeadOS — Marketing Management Migration
-- Assets, Social Platforms, Posts, Ad Campaigns
-- ============================================================

-- Marketing assets (images, banners, copy, etc.)
CREATE TABLE IF NOT EXISTS marketing_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  asset_type TEXT DEFAULT 'image',       -- image | video | copy | banner | logo | ad_creative | other
  source TEXT DEFAULT 'upload',          -- upload | canva | bannerbear | ai_generated | url
  file_url TEXT,
  thumbnail_url TEXT,
  canva_design_id TEXT,
  canva_edit_url TEXT,
  prompt TEXT,                           -- AI generation prompt
  width INTEGER,
  height INTEGER,
  format TEXT,                           -- square | landscape | portrait | story | banner
  platform TEXT,                         -- instagram | facebook | linkedin | twitter | tiktok | google | general
  status TEXT DEFAULT 'draft',           -- draft | approved | published | archived
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Social media platform accounts (per business or per client)
CREATE TABLE IF NOT EXISTS social_platform_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,  -- NULL = own business account
  platform TEXT NOT NULL,                -- instagram | facebook | linkedin | twitter | tiktok | youtube | pinterest | google_business
  account_name TEXT,
  account_handle TEXT,
  account_url TEXT,
  followers INTEGER DEFAULT 0,
  following INTEGER DEFAULT 0,
  access_token_vault_id UUID REFERENCES api_key_vault(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'connected',       -- connected | disconnected | error | pending
  last_synced_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, client_id, platform)
);

-- Scheduled / published social posts
CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  platform_account_id UUID REFERENCES social_platform_accounts(id) ON DELETE SET NULL,
  asset_id UUID REFERENCES marketing_assets(id) ON DELETE SET NULL,
  caption TEXT,
  hashtags TEXT,
  platforms TEXT[] DEFAULT '{}',         -- can target multiple platforms
  status TEXT DEFAULT 'draft',           -- draft | scheduled | published | failed
  scheduled_at TIMESTAMP,
  published_at TIMESTAMP,
  post_url TEXT,
  external_post_id TEXT,
  engagement_likes INTEGER DEFAULT 0,
  engagement_comments INTEGER DEFAULT 0,
  engagement_shares INTEGER DEFAULT 0,
  engagement_reach INTEGER DEFAULT 0,
  notes TEXT,
  ai_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Advertising campaigns (Meta, Google, LinkedIn, TikTok, etc.)
CREATE TABLE IF NOT EXISTS ad_campaigns_ext (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  lead_campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,  -- link to call campaign
  name TEXT NOT NULL,
  platform TEXT NOT NULL,                -- meta | google | linkedin | tiktok | twitter | snapchat | other
  campaign_type TEXT DEFAULT 'awareness', -- awareness | traffic | leads | conversion | retargeting | brand
  status TEXT DEFAULT 'active',          -- active | paused | ended | draft | under_review
  budget DECIMAL(10,2),
  budget_period TEXT DEFAULT 'monthly',  -- daily | monthly | lifetime
  spent DECIMAL(10,2) DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  leads INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  ctr DECIMAL(6,4),                      -- click-through rate (auto-calc)
  cpc DECIMAL(10,4),                     -- cost per click
  cpl DECIMAL(10,2),                     -- cost per lead
  roas DECIMAL(10,2),                    -- return on ad spend
  start_date DATE,
  end_date DATE,
  ad_account_id TEXT,
  external_campaign_id TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_marketing_assets_user ON marketing_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_marketing_assets_client ON marketing_assets(client_id);
CREATE INDEX IF NOT EXISTS idx_marketing_assets_platform ON marketing_assets(platform);
CREATE INDEX IF NOT EXISTS idx_social_platform_accounts_user ON social_platform_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_social_platform_accounts_client ON social_platform_accounts(client_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_user ON social_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(status);
CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled ON social_posts(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_ext_user ON ad_campaigns_ext(user_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_ext_client ON ad_campaigns_ext(client_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_ext_platform ON ad_campaigns_ext(platform);

-- RLS
ALTER TABLE marketing_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_platform_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_campaigns_ext ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketing_assets_all" ON marketing_assets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "social_accounts_all" ON social_platform_accounts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "social_posts_all" ON social_posts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "ad_campaigns_ext_all" ON ad_campaigns_ext FOR ALL USING (auth.uid() = user_id);
