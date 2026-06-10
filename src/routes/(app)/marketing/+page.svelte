<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { apiFetch } from '$lib/api';
	import { toastSuccess, toastError } from '$lib/stores/toast';
	import DatePicker from '$lib/components/DatePicker.svelte';
	// ── Tabs ──────────────────────────────────────────────────
	type Tab = 'dashboard' | 'content' | 'social' | 'ads' | 'copy' | 'integrations';
	let activeTab = $state<Tab>('dashboard');

	// ── Filters ───────────────────────────────────────────────
	let clients = $state<any[]>([]);
	let selectedClientId = $state<string>('');

	// ── Data ──────────────────────────────────────────────────
	let assets = $state<any[]>([]);
	let socialAccounts = $state<any[]>([]);
	let socialPosts = $state<any[]>([]);
	let adCampaigns = $state<any[]>([]);
	let loading = $state(true);

	// ── Asset form ────────────────────────────────────────────
	let showAssetForm = $state(false);
	let assetForm = $state({ name: '', clientId: '', campaignId: '', assetType: 'image', source: 'upload', fileUrl: '', platform: 'general', status: 'draft', notes: '' });
	let assetSaving = $state(false);

	// ── Social account form ───────────────────────────────────
	let showSocialForm = $state(false);
	let socialForm = $state({ clientId: '', platform: 'instagram', accountName: '', accountHandle: '', accountUrl: '', followers: '', status: 'connected' });
	let socialSaving = $state(false);

	// ── Post composer ─────────────────────────────────────────
	let showPostComposer = $state(false);
	let postForm = $state({ clientId: '', caption: '', hashtags: '', platforms: [] as string[], scheduledAt: '', assetId: '', status: 'draft' });
	let postSaving = $state(false);

	// ── Ad campaign form ──────────────────────────────────────
	let showAdForm = $state(false);
	let adForm = $state({ name: '', clientId: '', platform: 'meta', campaignType: 'awareness', status: 'active', budget: '', budgetPeriod: 'monthly', spent: '', impressions: '', clicks: '', leads: '', startDate: '', endDate: '', notes: '' });
	let adSaving = $state(false);
	let editingAdId = $state<string | null>(null);

	// ── AI copy generator ─────────────────────────────────────
	let copyType = $state<'post' | 'ad_headline' | 'ad_description' | 'email_subject'>('post');
	let copyPlatform = $state('instagram');
	let copyClientId = $state('');
	let copyProduct = $state('');
	let copyTone = $state('professional');
	let copyAudience = $state('');
	let copyContext = $state('');
	let copyResult = $state<any>(null);
	let copyGenerating = $state(false);

	// ── Integrations config ───────────────────────────────────
	let slackConfig = $state({ webhookUrl: '', defaultChannel: '#general', workspaceName: '', notifyNewLeads: true, notifyCalls: false, notifyDeals: false });
	let teamsConfig = $state({ webhookUrl: '', channelName: '', notifyNewLeads: true, notifyCalls: false });
	let slackSaving = $state(false);
	let teamsSaving = $state(false);
	let slackMsg = $state('');
	let slackTestMsg = $state('');
	let slackTesting = $state(false);

	// ── Platforms ─────────────────────────────────────────────
	const SOCIAL_PLATFORMS = [
		{ id: 'instagram', label: 'Instagram', icon: '📸', color: 'from-[var(--accent)] to-pink-500' },
		{ id: 'facebook', label: 'Facebook', icon: '👥', color: 'from-blue-600 to-blue-500' },
		{ id: 'linkedin', label: 'LinkedIn', icon: '💼', color: 'from-blue-700 to-blue-600' },
		{ id: 'twitter', label: 'X / Twitter', icon: '🐦', color: 'from-gray-800 to-gray-700' },
		{ id: 'tiktok', label: 'TikTok', icon: '🎵', color: 'from-gray-900 to-gray-800' },
		{ id: 'youtube', label: 'YouTube', icon: '▶️', color: 'from-red-600 to-red-500' },
		{ id: 'pinterest', label: 'Pinterest', icon: '📌', color: 'from-red-500 to-red-400' },
		{ id: 'google_business', label: 'Google', icon: '🔍', color: 'from-blue-500 to-[var(--accent)]' },
	];

	const AD_PLATFORMS = [
		{ id: 'meta', label: 'Meta Ads', icon: '🎯', sub: 'Facebook + Instagram' },
		{ id: 'google', label: 'Google Ads', icon: '🔍', sub: 'Search + Display + YouTube' },
		{ id: 'linkedin', label: 'LinkedIn Ads', icon: '💼', sub: 'B2B targeting' },
		{ id: 'tiktok', label: 'TikTok Ads', icon: '🎵', sub: 'Short-form video' },
		{ id: 'twitter', label: 'X Ads', icon: '🐦', sub: 'Promoted posts' },
		{ id: 'snapchat', label: 'Snapchat', icon: '👻', sub: 'Stories + AR' },
	];

	const CANVA_FORMATS = [
		{ label: 'Instagram Post', size: '1080×1080', url: 'https://www.canva.com/create/instagram-posts/' },
		{ label: 'Instagram Story', size: '1080×1920', url: 'https://www.canva.com/create/instagram-stories/' },
		{ label: 'Facebook Post', size: '1200×630', url: 'https://www.canva.com/create/facebook-posts/' },
		{ label: 'LinkedIn Post', size: '1200×628', url: 'https://www.canva.com/create/linkedin-banners/' },
		{ label: 'Twitter Header', size: '1500×500', url: 'https://www.canva.com/create/twitter-headers/' },
		{ label: 'YouTube Thumbnail', size: '1280×720', url: 'https://www.canva.com/create/youtube-thumbnails/' },
		{ label: 'Ad Banner 728×90', size: '728×90', url: 'https://www.canva.com/create/banner/' },
		{ label: 'Business Card', size: '3.5×2in', url: 'https://www.canva.com/create/business-cards/' },
		{ label: 'Flyer', size: '8.5×11in', url: 'https://www.canva.com/create/flyers/' },
		{ label: 'Presentation', size: '16:9', url: 'https://www.canva.com/create/presentations/' },
	];

	// ── Helpers ───────────────────────────────────────────────
	function fmtDate(d: string) { return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'; }
	function fmt(n: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n); }
	function fmtNum(n: number) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }
	const statusDot = (s: string) => s === 'active' || s === 'published' || s === 'connected' ? 'bg-[var(--accent)]' : s === 'paused' || s === 'scheduled' ? 'bg-yellow-400' : s === 'ended' || s === 'failed' || s === 'disconnected' ? 'bg-red-400' : 'bg-[#555]';

	const clientName = (id: string) => clients.find(c => c.id === id)?.name ?? 'Own Business';

	// ── Derived ───────────────────────────────────────────────
	const filteredAssets = $derived((() => {
		if (selectedClientId === 'own') return assets.filter(a => a.client_id === null || a.client_id === undefined);
		if (selectedClientId) return assets.filter(a => a.client_id === selectedClientId);
		return assets;
	})());
	const filteredPosts = $derived(selectedClientId ? socialPosts.filter(p => p.client_id === selectedClientId) : socialPosts);
	const filteredAds = $derived(selectedClientId ? adCampaigns.filter(a => a.client_id === selectedClientId) : adCampaigns);
	const totalAdSpend = $derived(filteredAds.reduce((s, a) => s + parseFloat(a.spent ?? 0), 0));
	const totalAdBudget = $derived(filteredAds.reduce((s, a) => s + parseFloat(a.budget ?? 0), 0));
	const totalLeads = $derived(filteredAds.reduce((s, a) => s + (a.leads ?? 0), 0));
	const totalImpressions = $derived(filteredAds.reduce((s, a) => s + (a.impressions ?? 0), 0));
	const scheduledPosts = $derived(socialPosts.filter(p => p.status === 'scheduled'));

	// ── Load ──────────────────────────────────────────────────
	async function loadAll() {
		loading = true;
		const clientQ = selectedClientId ? `?clientId=${selectedClientId}` : '';
		const [cRes, aRes, saRes, spRes, adRes, slRes, tmRes] = await Promise.all([
			apiFetch('/api/clients'),
			apiFetch(`/api/marketing/assets${clientQ}`),
			apiFetch(`/api/marketing/social-accounts${clientQ}`),
			apiFetch(`/api/marketing/social-posts${clientQ}`),
			apiFetch(`/api/marketing/ad-campaigns${clientQ}`),
			apiFetch('/api/slack'),
			apiFetch('/api/teams-webhook'),
		]);
		clients = cRes.ok ? await cRes.json() : [];
		assets = aRes.ok ? await aRes.json() : [];
		socialAccounts = saRes.ok ? await saRes.json() : [];
		socialPosts = spRes.ok ? await spRes.json() : [];
		adCampaigns = adRes.ok ? await adRes.json() : [];
		if (slRes.ok) { const d = await slRes.json(); if (d.webhook_url || d.webhookUrl) slackConfig = { ...slackConfig, ...d }; }
		if (tmRes.ok) { const d = await tmRes.json(); if (d.webhook_url || d.webhookUrl) teamsConfig = { ...teamsConfig, ...d }; }
		loading = false;
	}

	onMount(loadAll);

	// ── Asset actions ─────────────────────────────────────────
	async function saveAsset() {
		assetSaving = true;
		const res = await apiFetch('/api/marketing/assets', { method: 'POST', body: JSON.stringify({ ...assetForm, clientId: assetForm.clientId || null }) });
		if (res.ok) { await loadAll(); assetForm = { name: '', clientId: '', campaignId: '', assetType: 'image', source: 'upload', fileUrl: '', platform: 'general', status: 'draft', notes: '' }; showAssetForm = false; toastSuccess('Asset saved'); }
		else { toastError('Failed to save asset'); }
		assetSaving = false;
	}

	async function deleteAsset(id: string) {
		if (!confirm('Delete asset?')) return;
		const res = await apiFetch(`/api/marketing/assets/${id}`, { method: 'DELETE' });
		if (res.ok) { await loadAll(); toastSuccess('Asset deleted'); }
		else { toastError('Failed to delete asset'); }
	}

	// ── Social actions ────────────────────────────────────────
	async function saveSocial() {
		socialSaving = true;
		const res = await apiFetch('/api/marketing/social-accounts', { method: 'POST', body: JSON.stringify({ ...socialForm, clientId: socialForm.clientId || null, followers: parseInt(socialForm.followers) || 0 }) });
		if (res.ok) { await loadAll(); socialForm = { clientId: '', platform: 'instagram', accountName: '', accountHandle: '', accountUrl: '', followers: '', status: 'connected' }; showSocialForm = false; toastSuccess('Account added'); }
		else { toastError('Failed to add account'); }
		socialSaving = false;
	}

	async function deleteSocial(id: string) {
		if (!confirm('Disconnect this social account?')) return;
		const res = await apiFetch(`/api/marketing/social-accounts/${id}`, { method: 'DELETE' });
		if (res.ok) { await loadAll(); toastSuccess('Account removed'); }
		else { toastError('Failed to remove account'); }
	}

	// ── Post actions ──────────────────────────────────────────
	async function savePost() {
		postSaving = true;
		const res = await apiFetch('/api/marketing/social-posts', { method: 'POST', body: JSON.stringify({ ...postForm, clientId: postForm.clientId || null, scheduledAt: postForm.scheduledAt || null, assetId: postForm.assetId || null }) });
		if (res.ok) { await loadAll(); postForm = { clientId: '', caption: '', hashtags: '', platforms: [], scheduledAt: '', assetId: '', status: 'draft' }; showPostComposer = false; toastSuccess('Post saved'); }
		else { toastError('Failed to save post'); }
		postSaving = false;
	}

	async function deletePost(id: string) {
		if (!confirm('Delete this post?')) return;
		const res = await apiFetch(`/api/marketing/social-posts/${id}`, { method: 'DELETE' });
		if (res.ok) { await loadAll(); toastSuccess('Post deleted'); }
		else { toastError('Failed to delete post'); }
	}

	// ── Ad actions ────────────────────────────────────────────
	async function saveAd() {
		adSaving = true;
		const method = editingAdId ? 'PATCH' : 'POST';
		const url = editingAdId ? `/api/marketing/ad-campaigns/${editingAdId}` : '/api/marketing/ad-campaigns';
		const res = await apiFetch(url, { method, body: JSON.stringify({ ...adForm, clientId: adForm.clientId || null, budget: parseFloat(adForm.budget) || null, spent: parseFloat(adForm.spent) || 0, impressions: parseInt(adForm.impressions) || 0, clicks: parseInt(adForm.clicks) || 0, leads: parseInt(adForm.leads) || 0, startDate: adForm.startDate || null, endDate: adForm.endDate || null }) });
		if (res.ok) { await loadAll(); adForm = { name: '', clientId: '', platform: 'meta', campaignType: 'awareness', status: 'active', budget: '', budgetPeriod: 'monthly', spent: '', impressions: '', clicks: '', leads: '', startDate: '', endDate: '', notes: '' }; showAdForm = false; toastSuccess(editingAdId ? 'Campaign updated' : 'Campaign created'); editingAdId = null; }
		else { toastError('Failed to save campaign'); }
		adSaving = false;
	}

	function editAd(ad: any) {
		editingAdId = ad.id;
		adForm = { name: ad.name, clientId: ad.client_id ?? '', platform: ad.platform, campaignType: ad.campaign_type, status: ad.status, budget: String(ad.budget ?? ''), budgetPeriod: ad.budget_period, spent: String(ad.spent ?? ''), impressions: String(ad.impressions ?? ''), clicks: String(ad.clicks ?? ''), leads: String(ad.leads ?? ''), startDate: ad.start_date ?? '', endDate: ad.end_date ?? '', notes: ad.notes ?? '' };
		showAdForm = true;
	}

	// ── AI copy ───────────────────────────────────────────────
	async function generateCopy() {
		copyGenerating = true; copyResult = null;
		const res = await apiFetch('/api/marketing/generate-copy', { method: 'POST', body: JSON.stringify({ type: copyType, platform: copyPlatform, clientName: copyClientId ? clientName(copyClientId) : '', product: copyProduct, tone: copyTone, audience: copyAudience, extraContext: copyContext }) });
		if (res.ok) { copyResult = (await res.json()).result; }
		else { copyResult = null; toastError('Failed to generate copy'); }
		copyGenerating = false;
	}

	// ── Integrations ──────────────────────────────────────────
	async function saveSlack() {
		slackSaving = true; slackMsg = '';
		const res = await apiFetch('/api/slack', { method: 'PUT', body: JSON.stringify({ webhookUrl: slackConfig.webhookUrl, workspaceName: slackConfig.workspaceName, defaultChannel: slackConfig.defaultChannel, notifyNewLeads: slackConfig.notifyNewLeads, notifyCalls: slackConfig.notifyCalls, notifyDeals: slackConfig.notifyDeals }) });
		slackMsg = res.ok ? '✓ Slack configured' : '✗ Error saving';
		slackSaving = false;
	}

	async function testSlack() {
		slackTesting = true;
		const res = await apiFetch('/api/slack', { method: 'POST', body: JSON.stringify({ text: `🧪 Edelhaus test message from ${slackConfig.workspaceName || 'Edelhaus'}`, channel: slackConfig.defaultChannel }) });
		slackTestMsg = res.ok ? '✓ Message sent' : '✗ Failed — check webhook URL';
		slackTesting = false;
		setTimeout(() => slackTestMsg = '', 4000);
	}

	async function saveTeams() {
		teamsSaving = true;
		const res = await apiFetch('/api/teams-webhook', { method: 'PUT', body: JSON.stringify({ webhookUrl: teamsConfig.webhookUrl, channelName: teamsConfig.channelName, notifyNewLeads: teamsConfig.notifyNewLeads, notifyCalls: teamsConfig.notifyCalls }) });
		if (res.ok) { toastSuccess('Teams settings saved'); }
		else { toastError('Failed to save Teams settings'); }
		teamsSaving = false;
	}

	function togglePostPlatform(p: string) {
		postForm.platforms = postForm.platforms.includes(p) ? postForm.platforms.filter(x => x !== p) : [...postForm.platforms, p];
	}
</script>

<svelte:head><title>Marketing — Edelhaus</title></svelte:head>

<div class="flex flex-col h-full bg-[#0a0a0a] text-[#f5f5f5] overflow-auto">

	<!-- Header -->
	<div class="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a]">
		<div>
			<h1 class="text-xl font-semibold">Marketing</h1>
			<p class="text-[#8a8a8a] text-sm">Content, social media, advertising, and campaign management</p>
		</div>
		<!-- Context indicator + client filter -->
		<div class="flex items-center gap-2">
			<select bind:value={selectedClientId} onchange={loadAll} class="bg-[#111] border border-[#2a2a2a] rounded px-3 py-2 text-sm text-white">
				<option value="">All Clients + Own Business</option>
				<option value="own">Own Business Only</option>
				{#each clients as c}<option value={c.id}>{c.name}</option>{/each}
			</select>
		</div>
	</div>

	<!-- Tabs -->
	<div class="flex gap-1 px-6 pt-4 border-b border-[#2a2a2a]">
		{#each [['dashboard','Dashboard'],['content','Content Hub'],['social','Social Media'],['ads','Ad Campaigns'],['copy','AI Copy'],['integrations','Integrations']] as [id, label]}
			<button onclick={() => activeTab = id as Tab} class="px-4 py-2 text-sm border-b-2 transition-colors {activeTab === id ? 'border-white text-white' : 'border-transparent text-[#8a8a8a] hover:text-[#ccc]'}">{label}</button>
		{/each}
	</div>

	<div class="flex-1 overflow-auto p-6">
	{#if loading}
		<div class="flex items-center justify-center py-20"><div class="w-6 h-6 border-2 border-[#333] border-t-white rounded-full animate-spin"></div></div>

	<!-- ═══════════════ DASHBOARD ═══════════════ -->
	{:else if activeTab === 'dashboard'}
		<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
			<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
				<div class="text-[#8a8a8a] text-xs mb-1">Assets</div>
				<div class="text-2xl font-semibold">{assets.length}</div>
				<div class="text-xs text-[#7c7c7c] mt-1">{assets.filter(a => a.status === 'published').length} published</div>
			</div>
			<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
				<div class="text-[#8a8a8a] text-xs mb-1">Social Accounts</div>
				<div class="text-2xl font-semibold">{socialAccounts.filter(a => a.status === 'connected').length}</div>
				<div class="text-xs text-[#7c7c7c] mt-1">across {[...new Set(socialAccounts.map(a => a.platform))].length} platforms</div>
			</div>
			<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
				<div class="text-[#8a8a8a] text-xs mb-1">Ad Spend</div>
				<div class="text-2xl font-semibold text-yellow-400">{fmt(totalAdSpend)}</div>
				<div class="text-xs text-[#7c7c7c] mt-1">of {fmt(totalAdBudget)} budget</div>
			</div>
			<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
				<div class="text-[#8a8a8a] text-xs mb-1">Ad Leads</div>
				<div class="text-2xl font-semibold text-[var(--accent)]">{fmtNum(totalLeads)}</div>
				<div class="text-xs text-[#7c7c7c] mt-1">{fmtNum(totalImpressions)} impressions</div>
			</div>
		</div>

		<!-- Scheduled posts alert -->
		{#if scheduledPosts.length}
			<div class="mb-4 p-3 bg-blue-400/10 border border-blue-400/30 rounded text-sm text-blue-300">
				📅 {scheduledPosts.length} post{scheduledPosts.length > 1 ? 's' : ''} scheduled —
				<button onclick={() => activeTab = 'social'} class="underline">view schedule</button>
			</div>
		{/if}

		<!-- Per-client breakdown -->
		<div class="bg-[#111] border border-[#2a2a2a] rounded-lg overflow-hidden mb-4">
			<div class="px-4 py-3 border-b border-[#2a2a2a] text-sm font-medium">Client Marketing Summary</div>
			{#each [{id: null, name: 'Own Business'}, ...clients] as client}
				{@const clientAssets = assets.filter(a => a.client_id === (client.id ?? null))}
				{@const clientAds = adCampaigns.filter(a => a.client_id === (client.id ?? null))}
				{#if clientAssets.length || clientAds.length}
					<div class="flex items-center gap-4 px-8 py-4 border-b border-[#1a1a1a] hover:bg-[#161616]">
						<div class="flex-1 text-sm font-medium">{client.name}</div>
						<div class="text-xs text-[#8a8a8a]">{clientAssets.length} assets</div>
						<div class="text-xs text-[#8a8a8a]">{clientAds.length} ad campaigns</div>
						<div class="text-xs text-yellow-400">{fmt(clientAds.reduce((s, a) => s + parseFloat(a.spent ?? 0), 0))} spent</div>
					</div>
				{/if}
			{/each}
		</div>

	<!-- ═══════════════ CONTENT HUB ═══════════════ -->
	{:else if activeTab === 'content'}
		<!-- Design Tools bar -->
		<div class="mb-5">
			<div class="text-xs text-[#8a8a8a] uppercase tracking-wide mb-2">Design Tools</div>
			<div class="flex flex-wrap gap-2 mb-4">
				<!-- Canva quick-create buttons -->
				{#each CANVA_FORMATS as f}
					<a href={f.url} target="_blank" rel="noopener"
						class="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#111] border border-[#2a2a2a] rounded-full hover:border-[#7c3aed] hover:text-[var(--accent-hi)] text-[#999] transition-colors">
						<span class="w-4 h-4 bg-[var(--accent)] rounded-sm inline-flex items-center justify-center text-[var(--accent-ink)]" style="font-size:9px">C</span>
						{f.label}
					</a>
				{/each}
			</div>

			<!-- Bannerbear / other tools -->
			<div class="flex gap-2">
				<a href="https://bannerbear.com" target="_blank" rel="noopener" class="px-3 py-1.5 text-xs bg-[#111] border border-[#2a2a2a] rounded hover:border-yellow-400 hover:text-yellow-300 text-[#999] transition-colors">🐻 Bannerbear — Auto-generate images via API</a>
				<a href="https://www.adobe.com/express/" target="_blank" rel="noopener" class="px-3 py-1.5 text-xs bg-[#111] border border-[#2a2a2a] rounded hover:border-red-400 hover:text-red-300 text-[#999] transition-colors">🎨 Adobe Express</a>
				<a href="https://www.figma.com" target="_blank" rel="noopener" class="px-3 py-1.5 text-xs bg-[#111] border border-[#2a2a2a] rounded hover:border-orange-400 hover:text-orange-300 text-[#999] transition-colors">🖊 Figma</a>
			</div>
		</div>

		<div class="flex justify-between items-center mb-3">
			<div class="text-sm text-[#8a8a8a]">{filteredAssets.length} assets</div>
			<button onclick={() => showAssetForm = !showAssetForm} class="px-3 py-1 text-xs border border-[#333] rounded hover:border-white hover:text-white text-[#999] transition-colors">+ Add Asset</button>
		</div>

		{#if showAssetForm}
			<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4 mb-4">
				<div class="grid grid-cols-3 gap-3 mb-3">
					<div>
						<label class="block text-xs text-[#8a8a8a] mb-1">Name *</label>
						<input bind:value={assetForm.name} placeholder="Asset name" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
					</div>
					<div>
						<label class="block text-xs text-[#8a8a8a] mb-1">Client</label>
						<select bind:value={assetForm.clientId} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white">
							<option value="">Own Business</option>
							{#each clients as c}<option value={c.id}>{c.name}</option>{/each}
						</select>
					</div>
					<div>
						<label class="block text-xs text-[#8a8a8a] mb-1">Platform</label>
						<select bind:value={assetForm.platform} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white">
							<option value="general">General</option>
							{#each SOCIAL_PLATFORMS as p}<option value={p.id}>{p.label}</option>{/each}
							<option value="google">Google Ads</option>
							<option value="email">Email</option>
						</select>
					</div>
					<div>
						<label class="block text-xs text-[#8a8a8a] mb-1">Source</label>
						<select bind:value={assetForm.source} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white">
							<option value="upload">Upload</option>
							<option value="canva">Canva</option>
							<option value="bannerbear">Bannerbear</option>
							<option value="ai_generated">AI Generated</option>
							<option value="url">URL</option>
						</select>
					</div>
					<div>
						<label class="block text-xs text-[#8a8a8a] mb-1">URL / Link</label>
						<input bind:value={assetForm.fileUrl} placeholder="https://…" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
					</div>
					<div>
						<label class="block text-xs text-[#8a8a8a] mb-1">Status</label>
						<select bind:value={assetForm.status} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white">
							<option value="draft">Draft</option>
							<option value="approved">Approved</option>
							<option value="published">Published</option>
						</select>
					</div>
				</div>
				<div class="flex gap-2">
					<button onclick={saveAsset} disabled={assetSaving || !assetForm.name} class="px-4 py-2 bg-white text-black rounded text-sm font-medium disabled:opacity-50">
						{assetSaving ? 'Saving…' : 'Add Asset'}
					</button>
					<button onclick={() => showAssetForm = false} class="px-4 py-2 border border-[#333] rounded text-sm text-[#999] hover:text-white transition-colors">Cancel</button>
				</div>
			</div>
		{/if}

		<!-- Asset grid -->
		{#if filteredAssets.length}
			<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
				{#each filteredAssets as asset}
					<div class="bg-[#111] border border-[#2a2a2a] rounded-lg overflow-hidden group">
						<!-- Image/placeholder -->
						<div class="aspect-square bg-[#1a1a1a] flex items-center justify-center relative">
							{#if asset.file_url || asset.thumbnail_url}
								<img src={asset.thumbnail_url ?? asset.file_url} alt={asset.name} class="w-full h-full object-cover" />
							{:else}
								<div class="text-4xl opacity-30">🖼</div>
							{/if}
							<div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
								{#if asset.file_url}<a href={asset.file_url} target="_blank" rel="noopener" class="text-xs text-white border border-white/40 rounded px-2 py-1">View</a>{/if}
								{#if asset.canva_edit_url}<a href={asset.canva_edit_url} target="_blank" rel="noopener" class="text-xs text-[var(--accent)] border border-[var(--accent)]/40 rounded px-2 py-1">Edit in Canva</a>{/if}
								<button onclick={() => deleteAsset(asset.id)} class="text-xs text-red-400 border border-red-400/40 rounded px-2 py-1">Del</button>
							</div>
						</div>
						<div class="p-2">
							<div class="text-xs font-medium truncate">{asset.name}</div>
							<div class="flex items-center gap-1 mt-1">
								<span class="text-xs text-[#7c7c7c]">{asset.platform}</span>
								<span class="ml-auto text-xs {asset.status === 'published' ? 'text-[var(--accent)]' : asset.status === 'approved' ? 'text-blue-400' : 'text-[#7c7c7c]'}">{asset.status}</span>
							</div>
							{#if asset.client}<div class="text-xs text-[#6e6e6e] truncate">{asset.client.name}</div>{/if}
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="text-center py-12 text-[#7c7c7c] text-sm">No assets yet. Use the Canva buttons above to create your first design.</div>
		{/if}

	<!-- ═══════════════ SOCIAL MEDIA ═══════════════ -->
	{:else if activeTab === 'social'}
		<!-- Platform tiles -->
		<div class="grid grid-cols-4 gap-3 mb-6">
			{#each SOCIAL_PLATFORMS as platform}
				{@const accts = socialAccounts.filter(a => a.platform === platform.id)}
				<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-3 relative">
					<div class="flex items-center gap-2 mb-2">
						<span class="text-lg">{platform.icon}</span>
						<span class="text-sm font-medium">{platform.label}</span>
					</div>
					{#if accts.length}
						{#each accts as acct}
							<div class="text-xs text-[#999] flex items-center gap-1">
								<span class="w-1.5 h-1.5 rounded-full {statusDot(acct.status)}"></span>
								{acct.account_handle ? `@${acct.account_handle}` : acct.account_name ?? 'Connected'}
								{#if acct.followers}<span class="text-[#7c7c7c] ml-auto">{fmtNum(acct.followers)}</span>{/if}
							</div>
						{/each}
					{:else}
						<div class="text-xs text-[#7c7c7c]">Not connected</div>
					{/if}
					<button onclick={() => { socialForm.platform = platform.id; showSocialForm = true; }} class="mt-2 w-full text-xs text-[#8a8a8a] hover:text-white border border-[#222] hover:border-[#555] rounded py-0.5 transition-colors">+ Add Account</button>
				</div>
			{/each}
		</div>

		<!-- Add social account form -->
		{#if showSocialForm}
			<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4 mb-4">
				<div class="text-sm font-medium mb-3">Add Social Account</div>
				<div class="grid grid-cols-3 gap-3 mb-3">
					<div>
						<label class="block text-xs text-[#8a8a8a] mb-1">Platform</label>
						<select bind:value={socialForm.platform} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white">
							{#each SOCIAL_PLATFORMS as p}<option value={p.id}>{p.label}</option>{/each}
						</select>
					</div>
					<div>
						<label class="block text-xs text-[#8a8a8a] mb-1">Client (blank = own business)</label>
						<select bind:value={socialForm.clientId} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white">
							<option value="">Own Business</option>
							{#each clients as c}<option value={c.id}>{c.name}</option>{/each}
						</select>
					</div>
					<div>
						<label class="block text-xs text-[#8a8a8a] mb-1">Account Handle (@…)</label>
						<input bind:value={socialForm.accountHandle} placeholder="@handle" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
					</div>
					<div>
						<label class="block text-xs text-[#8a8a8a] mb-1">Account Name</label>
						<input bind:value={socialForm.accountName} placeholder="Display name" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
					</div>
					<div>
						<label class="block text-xs text-[#8a8a8a] mb-1">Profile URL</label>
						<input bind:value={socialForm.accountUrl} placeholder="https://…" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
					</div>
					<div>
						<label class="block text-xs text-[#8a8a8a] mb-1">Followers</label>
						<input type="number" bind:value={socialForm.followers} placeholder="0" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
					</div>
				</div>
				<div class="flex gap-2">
					<button onclick={saveSocial} disabled={socialSaving} class="px-4 py-2 bg-white text-black rounded text-sm font-medium disabled:opacity-50">{socialSaving ? 'Saving…' : 'Add'}</button>
					<button onclick={() => showSocialForm = false} class="px-4 py-2 border border-[#333] rounded text-sm text-[#999] hover:text-white transition-colors">Cancel</button>
				</div>
			</div>
		{/if}

		<!-- Post Composer -->
		<div class="flex justify-between items-center mb-3">
			<div class="text-sm font-medium">Posts</div>
			<button onclick={() => showPostComposer = !showPostComposer} class="px-3 py-1 text-xs border border-[#333] rounded hover:border-white hover:text-white text-[#999] transition-colors">✏️ Compose Post</button>
		</div>

		{#if showPostComposer}
			<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4 mb-4">
				<div class="grid grid-cols-2 gap-3 mb-3">
					<div>
						<label class="block text-xs text-[#8a8a8a] mb-1">Client</label>
						<select bind:value={postForm.clientId} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white">
							<option value="">Own Business</option>
							{#each clients as c}<option value={c.id}>{c.name}</option>{/each}
						</select>
					</div>
					<div>
						<label class="block text-xs text-[#8a8a8a] mb-1">Status</label>
						<select bind:value={postForm.status} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white">
							<option value="draft">Draft</option>
							<option value="scheduled">Scheduled</option>
						</select>
					</div>
					<div class="col-span-2">
						<label class="block text-xs text-[#8a8a8a] mb-1">Target Platforms</label>
						<div class="flex flex-wrap gap-2">
							{#each SOCIAL_PLATFORMS as p}
								<button onclick={() => togglePostPlatform(p.id)} class="px-2 py-1 text-xs rounded border transition-colors {postForm.platforms.includes(p.id) ? 'border-white text-white bg-white/10' : 'border-[#333] text-[#8a8a8a] hover:border-[#555]'}">{p.icon} {p.label}</button>
							{/each}
						</div>
					</div>
					<div class="col-span-2">
						<label class="block text-xs text-[#8a8a8a] mb-1">Caption</label>
						<textarea bind:value={postForm.caption} rows="3" placeholder="Write your post…" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555] resize-none"></textarea>
					</div>
					<div>
						<label class="block text-xs text-[#8a8a8a] mb-1">Hashtags</label>
						<input bind:value={postForm.hashtags} placeholder="#sales #leadgen" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
					</div>
					{#if postForm.status === 'scheduled'}
						<div>
							<label class="block text-xs text-[#8a8a8a] mb-1">Schedule Date/Time</label>
							<input type="datetime-local" bind:value={postForm.scheduledAt} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white" />
						</div>
					{/if}
				</div>
				<div class="flex gap-2">
					<button onclick={savePost} disabled={postSaving || !postForm.caption} class="px-4 py-2 bg-white text-black rounded text-sm font-medium disabled:opacity-50">{postSaving ? 'Saving…' : 'Save Post'}</button>
					<button onclick={() => showPostComposer = false} class="px-4 py-2 border border-[#333] rounded text-sm text-[#999] hover:text-white transition-colors">Cancel</button>
				</div>
			</div>
		{/if}

		<!-- Posts list -->
		<div class="bg-[#111] border border-[#2a2a2a] rounded-lg overflow-hidden">
			<table class="w-full text-sm">
				<thead><tr class="border-b border-[#2a2a2a]">
					<th class="text-left px-4 py-3 text-[#8a8a8a] font-normal">Caption</th>
					<th class="text-left px-4 py-3 text-[#8a8a8a] font-normal">Platforms</th>
					<th class="text-left px-4 py-3 text-[#8a8a8a] font-normal">Client</th>
					<th class="text-left px-4 py-3 text-[#8a8a8a] font-normal">Status</th>
					<th class="text-left px-4 py-3 text-[#8a8a8a] font-normal">Date</th>
					<th class="px-4 py-3"></th>
				</tr></thead>
				<tbody>
					{#each filteredPosts as post}
						<tr class="border-b border-[#1a1a1a] hover:bg-[#161616]">
							<td class="px-4 py-3 max-w-xs truncate">{post.caption ?? '—'}</td>
							<td class="px-4 py-3 text-xs text-[#8a8a8a]">{(post.platforms ?? []).join(', ') || '—'}</td>
							<td class="px-4 py-3 text-xs text-[#8a8a8a]">{post.client?.name ?? 'Own'}</td>
							<td class="px-4 py-3"><span class="flex items-center gap-1.5 text-xs"><span class="w-1.5 h-1.5 rounded-full {statusDot(post.status)}"></span>{post.status}</span></td>
							<td class="px-4 py-3 text-xs text-[#8a8a8a]">{post.scheduled_at ? fmtDate(post.scheduled_at) : fmtDate(post.created_at)}</td>
							<td class="px-4 py-3 text-right"><button onclick={() => deletePost(post.id)} class="text-xs text-[#7c7c7c] hover:text-red-400 transition-colors"><Icon name="x" size={14} /></button></td>
						</tr>
					{:else}
						<tr><td colspan="6" class="px-4 py-8 text-center text-[#7c7c7c]">No posts yet — compose your first post above.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>

	<!-- ═══════════════ AD CAMPAIGNS ═══════════════ -->
	{:else if activeTab === 'ads'}
		<!-- Platform tiles -->
		<div class="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
			{#each AD_PLATFORMS as plat}
				{@const campaigns = filteredAds.filter(a => a.platform === plat.id)}
				<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-3 text-center">
					<div class="text-2xl mb-1">{plat.icon}</div>
					<div class="text-xs font-medium">{plat.label}</div>
					<div class="text-xs text-[#7c7c7c] mt-0.5">{plat.sub}</div>
					{#if campaigns.length}
						<div class="mt-2 text-xs text-yellow-400">{fmt(campaigns.reduce((s, a) => s + parseFloat(a.spent ?? 0), 0))} spent</div>
					{:else}
						<div class="mt-2 text-xs text-[#6e6e6e]">No campaigns</div>
					{/if}
				</div>
			{/each}
		</div>

		<div class="flex justify-between items-center mb-3">
			<div class="text-sm text-[#8a8a8a]">{filteredAds.length} campaigns</div>
			<button onclick={() => { showAdForm = !showAdForm; editingAdId = null; adForm = { name: '', clientId: '', platform: 'meta', campaignType: 'awareness', status: 'active', budget: '', budgetPeriod: 'monthly', spent: '', impressions: '', clicks: '', leads: '', startDate: '', endDate: '', notes: '' }; }} class="px-3 py-1 text-xs border border-[#333] rounded hover:border-white hover:text-white text-[#999] transition-colors">+ New Campaign</button>
		</div>

		{#if showAdForm}
			<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4 mb-4">
				<div class="text-sm font-medium mb-3">{editingAdId ? 'Edit Campaign' : 'New Ad Campaign'}</div>
				<div class="grid grid-cols-3 gap-3 mb-3">
					<div><label class="block text-xs text-[#8a8a8a] mb-1">Name *</label><input bind:value={adForm.name} placeholder="Campaign name" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" /></div>
					<div><label class="block text-xs text-[#8a8a8a] mb-1">Client</label><select bind:value={adForm.clientId} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white"><option value="">Own Business</option>{#each clients as c}<option value={c.id}>{c.name}</option>{/each}</select></div>
					<div><label class="block text-xs text-[#8a8a8a] mb-1">Platform</label><select bind:value={adForm.platform} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white">{#each AD_PLATFORMS as p}<option value={p.id}>{p.label}</option>{/each}</select></div>
					<div><label class="block text-xs text-[#8a8a8a] mb-1">Type</label><select bind:value={adForm.campaignType} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white"><option value="awareness">Awareness</option><option value="traffic">Traffic</option><option value="leads">Lead Gen</option><option value="conversion">Conversion</option><option value="retargeting">Retargeting</option></select></div>
					<div><label class="block text-xs text-[#8a8a8a] mb-1">Status</label><select bind:value={adForm.status} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white"><option value="active">Active</option><option value="paused">Paused</option><option value="draft">Draft</option><option value="ended">Ended</option></select></div>
					<div><label class="block text-xs text-[#8a8a8a] mb-1">Budget ($)</label><input type="number" bind:value={adForm.budget} placeholder="0.00" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" /></div>
					<div><label class="block text-xs text-[#8a8a8a] mb-1">Spent ($)</label><input type="number" bind:value={adForm.spent} placeholder="0.00" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" /></div>
					<div><label class="block text-xs text-[#8a8a8a] mb-1">Impressions</label><input type="number" bind:value={adForm.impressions} placeholder="0" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" /></div>
					<div><label class="block text-xs text-[#8a8a8a] mb-1">Clicks</label><input type="number" bind:value={adForm.clicks} placeholder="0" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" /></div>
					<div><label class="block text-xs text-[#8a8a8a] mb-1">Leads</label><input type="number" bind:value={adForm.leads} placeholder="0" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" /></div>
					<div><label class="block text-xs text-[#8a8a8a] mb-1">Start Date</label><DatePicker bind:value={adForm.startDate} onchange={(v) => adForm.startDate = v} /></div>
					<div><label class="block text-xs text-[#8a8a8a] mb-1">End Date</label><DatePicker bind:value={adForm.endDate} onchange={(v) => adForm.endDate = v} /></div>
				</div>
				<div class="flex gap-2"><button onclick={saveAd} disabled={adSaving || !adForm.name} class="px-4 py-2 bg-white text-black rounded text-sm font-medium disabled:opacity-50">{adSaving ? 'Saving…' : editingAdId ? 'Update' : 'Create'}</button><button onclick={() => { showAdForm = false; editingAdId = null; }} class="px-4 py-2 border border-[#333] rounded text-sm text-[#999] hover:text-white transition-colors">Cancel</button></div>
			</div>
		{/if}

		<div class="space-y-2">
			{#each filteredAds as ad}
				{@const ctr = ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(2) : '—'}
				{@const cpl = ad.leads > 0 ? (ad.spent / ad.leads).toFixed(2) : '—'}
				{@const spendPct = ad.budget > 0 ? (ad.spent / ad.budget) * 100 : 0}
				<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
					<div class="flex items-start gap-4">
						<div class="flex-1">
							<div class="flex items-center gap-2 mb-1">
								<span class="font-medium text-sm">{ad.name}</span>
								<span class="text-xs px-2 py-0.5 rounded-full {ad.status === 'active' ? 'bg-[var(--accent)]/12 text-[var(--accent)]' : 'bg-[#222] text-[#8a8a8a]'}">{ad.status}</span>
								<span class="text-xs text-[#7c7c7c]">{ad.platform} · {ad.campaign_type}</span>
								{#if ad.client}<span class="text-xs text-blue-400">{ad.client.name}</span>{/if}
							</div>
							{#if ad.budget}
								<div class="w-full h-1.5 bg-[#222] rounded-full mb-2">
									<div class="h-full rounded-full {spendPct >= 90 ? 'bg-red-400' : spendPct >= 70 ? 'bg-yellow-400' : 'bg-blue-400'}" style="width:{Math.min(spendPct, 100)}%"></div>
								</div>
							{/if}
							<div class="flex gap-6 text-xs text-[#999]">
								{#if ad.budget}<span>Budget: <strong class="text-white">{fmt(ad.budget)}</strong></span>{/if}
								<span>Spent: <strong class="text-yellow-400">{fmt(ad.spent ?? 0)}</strong></span>
								<span>Impressions: <strong class="text-white">{fmtNum(ad.impressions ?? 0)}</strong></span>
								<span>Clicks: <strong class="text-white">{fmtNum(ad.clicks ?? 0)}</strong></span>
								<span>CTR: <strong class="text-white">{ctr}%</strong></span>
								<span>Leads: <strong class="text-[var(--accent)]">{ad.leads ?? 0}</strong></span>
								{#if cpl !== '—'}<span>CPL: <strong class="text-[var(--accent)]">${cpl}</strong></span>{/if}
							</div>
						</div>
						<div class="flex gap-2">
							<button onclick={() => editAd(ad)} class="text-xs text-[#8a8a8a] hover:text-white transition-colors">Edit</button>
							<button onclick={async () => { if(confirm('Delete?')) { const r = await apiFetch(`/api/marketing/ad-campaigns/${ad.id}`, {method:'DELETE'}); if (r.ok) { await loadAll(); toastSuccess('Campaign deleted'); } else { toastError('Failed to delete campaign'); } } }} class="text-xs text-[#8a8a8a] hover:text-red-400 transition-colors"><Icon name="x" size={14} /></button>
						</div>
					</div>
				</div>
			{:else}
				<div class="text-center py-12 text-[#7c7c7c] text-sm">No ad campaigns yet.</div>
			{/each}
		</div>

	<!-- ═══════════════ AI COPY ═══════════════ -->
	{:else if activeTab === 'copy'}
		<div class="max-w-2xl">
			<div class="text-sm text-[#8a8a8a] mb-4">Generate platform-optimized copy using Claude AI — captions, ad headlines, email subjects, and more.</div>

			<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-5 mb-4">
				<div class="grid grid-cols-2 gap-3 mb-3">
					<div>
						<label class="block text-xs text-[#8a8a8a] mb-1">Content Type</label>
						<select bind:value={copyType} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white">
							<option value="post">Social Media Post</option>
							<option value="ad_headline">Google Ad Headlines</option>
							<option value="ad_description">Google Ad Descriptions</option>
							<option value="email_subject">Email Subject Lines</option>
						</select>
					</div>
					{#if copyType === 'post'}
						<div>
							<label class="block text-xs text-[#8a8a8a] mb-1">Platform</label>
							<select bind:value={copyPlatform} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white">
								{#each SOCIAL_PLATFORMS as p}<option value={p.id}>{p.label}</option>{/each}
							</select>
						</div>
					{/if}
					<div>
						<label class="block text-xs text-[#8a8a8a] mb-1">Client / Brand</label>
						<select bind:value={copyClientId} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white">
							<option value="">My Business</option>
							{#each clients as c}<option value={c.id}>{c.name}</option>{/each}
						</select>
					</div>
					<div>
						<label class="block text-xs text-[#8a8a8a] mb-1">Tone</label>
						<select bind:value={copyTone} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white">
							<option value="professional">Professional</option>
							<option value="casual">Casual</option>
							<option value="urgent">Urgent</option>
							<option value="inspiring">Inspiring</option>
							<option value="humorous">Humorous</option>
							<option value="authoritative">Authoritative</option>
						</select>
					</div>
					<div class="col-span-2">
						<label class="block text-xs text-[#8a8a8a] mb-1">Product / Service *</label>
						<input bind:value={copyProduct} placeholder="What are you promoting?" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
					</div>
					<div>
						<label class="block text-xs text-[#8a8a8a] mb-1">Target Audience</label>
						<input bind:value={copyAudience} placeholder="e.g. small business owners" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
					</div>
					<div>
						<label class="block text-xs text-[#8a8a8a] mb-1">Key Angle / USP</label>
						<input bind:value={copyContext} placeholder="What makes this special?" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
					</div>
				</div>
				<button onclick={generateCopy} disabled={copyGenerating || !copyProduct} class="px-4 py-2 bg-white text-black rounded text-sm font-medium hover:bg-[#e5e5e5] disabled:opacity-50 transition-colors">
					{copyGenerating ? '✨ Generating…' : '✨ Generate Copy'}
				</button>
			</div>

			{#if copyResult}
				<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-5">
					<div class="text-sm font-medium mb-3">Generated Copy</div>
					{#if copyResult.caption}
						<div class="mb-4">
							<div class="text-xs text-[#8a8a8a] mb-1">Caption</div>
							<div class="bg-[#1a1a1a] rounded p-3 text-sm whitespace-pre-wrap">{copyResult.caption}</div>
							<button onclick={() => navigator.clipboard.writeText(copyResult.caption).then(() => toastSuccess('Copied')).catch(() => toastError('Failed to copy'))} class="mt-1 text-xs text-[#8a8a8a] hover:text-white transition-colors">Copy to clipboard</button>
						</div>
					{/if}
					{#if copyResult.hashtags}
						<div class="mb-4">
							<div class="text-xs text-[#8a8a8a] mb-1">Hashtags</div>
							<div class="bg-[#1a1a1a] rounded p-2 text-sm text-blue-400">{copyResult.hashtags}</div>
						</div>
					{/if}
					{#if copyResult.cta}
						<div class="mb-4">
							<div class="text-xs text-[#8a8a8a] mb-1">Call to Action</div>
							<div class="bg-[#1a1a1a] rounded p-2 text-sm font-medium">{copyResult.cta}</div>
						</div>
					{/if}
					{#if copyResult.headlines}
						<div class="mb-4">
							<div class="text-xs text-[#8a8a8a] mb-2">Headlines</div>
							{#each copyResult.headlines as h, i}
								<div class="flex items-center gap-2 mb-1">
									<span class="text-xs text-[#7c7c7c] w-4">{i+1}.</span>
									<div class="flex-1 bg-[#1a1a1a] rounded px-3 py-1.5 text-sm">{h}</div>
									<span class="text-xs {h.length > 30 ? 'text-red-400' : 'text-[#7c7c7c]'}">{h.length}/30</span>
								</div>
							{/each}
						</div>
					{/if}
					{#if copyResult.descriptions}
						<div class="mb-4">
							<div class="text-xs text-[#8a8a8a] mb-2">Descriptions</div>
							{#each copyResult.descriptions as d, i}
								<div class="flex items-center gap-2 mb-1">
									<span class="text-xs text-[#7c7c7c] w-4">{i+1}.</span>
									<div class="flex-1 bg-[#1a1a1a] rounded px-3 py-1.5 text-sm">{d}</div>
									<span class="text-xs {d.length > 90 ? 'text-red-400' : 'text-[#7c7c7c]'}">{d.length}/90</span>
								</div>
							{/each}
						</div>
					{/if}
					{#if copyResult.subjects}
						<div>
							<div class="text-xs text-[#8a8a8a] mb-2">Subject Lines</div>
							{#each copyResult.subjects as s, i}
								<div class="flex items-center gap-2 mb-1">
									<span class="text-xs text-[#7c7c7c] w-4">{i+1}.</span>
									<div class="flex-1 bg-[#1a1a1a] rounded px-3 py-1.5 text-sm">{s}</div>
									<button onclick={() => navigator.clipboard.writeText(s).then(() => toastSuccess('Copied')).catch(() => toastError('Failed to copy'))} class="text-xs text-[#7c7c7c] hover:text-white transition-colors">Copy</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div><!-- /max-w-2xl -->

	<!-- ═══════════════ INTEGRATIONS ═══════════════ -->
	{:else if activeTab === 'integrations'}
		<div class="grid grid-cols-2 gap-6">

			<!-- Slack -->
			<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-5">
				<div class="flex items-center gap-2 mb-4">
					<span class="text-xl">💬</span>
					<div>
						<div class="font-medium text-sm">Slack</div>
						<div class="text-xs text-[#8a8a8a]">Send notifications to your Slack workspace</div>
					</div>
					{#if slackConfig.webhookUrl}<span class="ml-auto text-xs text-[var(--accent)] bg-[var(--accent)]/12 px-2 py-0.5 rounded">Connected</span>{/if}
				</div>
				<div class="space-y-3 mb-4">
					<div>
						<label class="block text-xs text-[#8a8a8a] mb-1">Incoming Webhook URL</label>
						<input bind:value={slackConfig.webhookUrl} placeholder="https://hooks.slack.com/services/…" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
						<div class="text-xs text-[#7c7c7c] mt-1">Create at: Slack App → Incoming Webhooks</div>
					</div>
					<div>
						<label class="block text-xs text-[#8a8a8a] mb-1">Default Channel</label>
						<input bind:value={slackConfig.defaultChannel} placeholder="#general" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
					</div>
					<div>
						<label class="block text-xs text-[#8a8a8a] mb-1">Workspace Name (label)</label>
						<input bind:value={slackConfig.workspaceName} placeholder="My Team" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
					</div>
					<div class="space-y-1">
						<div class="text-xs text-[#8a8a8a] mb-1">Notify on:</div>
						{#each [['notifyNewLeads','New Leads'],['notifyCalls','Calls'],['notifyDeals','Deal changes']] as [key, label]}
							<label class="flex items-center gap-2 text-sm cursor-pointer">
								<input type="checkbox" bind:checked={(slackConfig as any)[key]} class="accent-white" />
								{label}
							</label>
						{/each}
					</div>
				</div>
				<div class="flex gap-2">
					<button onclick={saveSlack} disabled={slackSaving} class="px-3 py-1.5 bg-white text-black rounded text-xs font-medium disabled:opacity-50">{slackSaving ? 'Saving…' : 'Save'}</button>
					{#if slackConfig.webhookUrl}
						<button onclick={testSlack} disabled={slackTesting} class="px-3 py-1.5 border border-[#333] rounded text-xs text-[#999] hover:text-white transition-colors">{slackTesting ? 'Sending…' : 'Test'}</button>
					{/if}
					{#if slackMsg}<span class="text-xs text-[var(--accent)] self-center">{slackMsg}</span>{/if}
					{#if slackTestMsg}<span class="text-xs {slackTestMsg.startsWith('✓') ? 'text-[var(--accent)]' : 'text-red-400'} self-center">{slackTestMsg}</span>{/if}
				</div>
			</div>

			<!-- Teams -->
			<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-5">
				<div class="flex items-center gap-2 mb-4">
					<span class="text-xl">🟦</span>
					<div>
						<div class="font-medium text-sm">Microsoft Teams</div>
						<div class="text-xs text-[#8a8a8a]">Post notifications to a Teams channel</div>
					</div>
					{#if teamsConfig.webhookUrl}<span class="ml-auto text-xs text-[var(--accent)] bg-[var(--accent)]/12 px-2 py-0.5 rounded">Connected</span>{/if}
				</div>
				<div class="space-y-3 mb-4">
					<div>
						<label class="block text-xs text-[#8a8a8a] mb-1">Incoming Webhook URL</label>
						<input bind:value={teamsConfig.webhookUrl} placeholder="https://…webhook.office.com/webhookb2/…" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
						<div class="text-xs text-[#7c7c7c] mt-1">Create in Teams channel → Connectors → Incoming Webhook</div>
					</div>
					<div>
						<label class="block text-xs text-[#8a8a8a] mb-1">Channel Name (label)</label>
						<input bind:value={teamsConfig.channelName} placeholder="#sales-alerts" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
					</div>
					<div class="space-y-1">
						<div class="text-xs text-[#8a8a8a] mb-1">Notify on:</div>
						{#each [['notifyNewLeads','New Leads'],['notifyCalls','Calls']] as [key, label]}
							<label class="flex items-center gap-2 text-sm cursor-pointer">
								<input type="checkbox" bind:checked={(teamsConfig as any)[key]} class="accent-white" />
								{label}
							</label>
						{/each}
					</div>
				</div>
				<button onclick={saveTeams} disabled={teamsSaving} class="px-3 py-1.5 bg-white text-black rounded text-xs font-medium disabled:opacity-50">{teamsSaving ? 'Saving…' : 'Save'}</button>
			</div>

			<!-- Canva -->
			<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-5">
				<div class="flex items-center gap-2 mb-3">
					<div class="w-6 h-6 bg-[var(--accent)] rounded flex items-center justify-center text-[var(--accent-ink)] text-xs font-bold">C</div>
					<div><div class="font-medium text-sm">Canva</div><div class="text-xs text-[#8a8a8a]">Create designs — no API key required</div></div>
					<span class="ml-auto text-xs text-[var(--accent)] bg-[var(--accent)]/12 px-2 py-0.5 rounded">Ready</span>
				</div>
				<p class="text-xs text-[#8a8a8a] mb-3">Canva design buttons are available in the Content Hub tab. Click any format to open Canva directly. To use the Canva API for automated design generation, add your Canva API key in Settings → API Key Vault.</p>
				<a href="https://www.canva.com/create/" target="_blank" rel="noopener" class="inline-block px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hi)] text-[var(--accent-ink)] rounded text-xs transition-colors">Open Canva →</a>
			</div>

			<!-- Bannerbear -->
			<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-5">
				<div class="flex items-center gap-2 mb-3">
					<span class="text-xl">🐻</span>
					<div><div class="font-medium text-sm">Bannerbear</div><div class="text-xs text-[#8a8a8a]">Auto-generate images via API from templates</div></div>
				</div>
				<p class="text-xs text-[#8a8a8a] mb-3">Bannerbear lets you auto-generate social media images, ads, and thumbnails using pre-built templates. Perfect for scaling client content creation.</p>
				<div class="flex gap-2">
					<a href="https://bannerbear.com" target="_blank" rel="noopener" class="text-xs text-yellow-400 hover:underline">Sign up →</a>
					<span class="text-xs text-[#7c7c7c]">Then add the API key to Vercel env vars.</span>
				</div><!-- /flex gap-2 -->
			</div><!-- /bannerbear card -->

		</div><!-- /grid cols-2 -->
	{/if}<!-- /activeTab -->
	</div><!-- /flex-1 overflow-auto p-6 -->
</div><!-- /flex flex-col h-full -->