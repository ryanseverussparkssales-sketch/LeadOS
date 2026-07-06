<script lang="ts">
	import { onMount } from 'svelte';
	import { titleFor } from '$lib/brand';
	import Icon from '$lib/components/Icon.svelte';
	import { apiFetch } from '$lib/api';
	import { toastSuccess, toastError } from '$lib/stores/toast';

	interface LeadSource {
		id: string; name: string; status: string; source_type: string;
		webhook_token: string; lead_count: number; leads_today: number;
		leads_this_week: number; last_lead_at: string | null;
		campaign_id: string | null; client_id: string | null;
		auto_call_list_id: string | null; default_contact_type: string;
		description: string | null;
		client: { name: string } | null;
		campaign: { name: string } | null;
	}

	interface Lead {
		id: string; name: string; phone: string; email: string;
		company: string; title: string; lead_source: string;
		lead_source_id: string | null; contact_score: number | null;
		utm_source: string | null; utm_medium: string | null;
		utm_campaign: string | null; lead_metadata: Record<string, unknown> | null;
		contact_type: string; status: string; created_at: string;
	}

	// Sources
	let sources = $state<LeadSource[]>([]);
	let selectedSource = $state<LeadSource | null>(null);
	let loadingSources = $state(true);

	// Leads feed
	let leads = $state<Lead[]>([]);
	let leadsTotal = $state(0);
	let loadingLeads = $state(false);
	let leadsOffset = $state(0);
	const LEADS_PAGE = 30;

	// New source form
	let showNewSource = $state(false);
	let newName = $state('');
	let newPlatform = $state('zapier');
	let newContactType = $state('lead');
	let newCampaignId = $state('');
	let newClientId = $state('');
	let newCallListId = $state('');
	let creating = $state(false);

	// Edit source
	let editingSource = $state(false);
	let editMapping = $state('');
	let editData = $state<Partial<LeadSource>>({});

	// Campaigns / clients / call lists for pickers
	let campaigns = $state<{ id: string; name: string }[]>([]);
	let clients = $state<{ id: string; name: string }[]>([]);
	let callLists = $state<{ id: string; name: string }[]>([]);

	// Assign to campaign
	let assigningLeadId = $state<string | null>(null);
	let assignCampaignId = $state('');

	// Routing rules
	let showRules = $state(false);
	let rules = $state<any[]>([]);
	let loadingRules = $state(false);

	// New rule form
	let newRuleField = $state('company');
	let newRuleOp = $state('contains');
	let newRuleVal = $state('');
	let newRuleAction = $state('add_tag');
	let newRuleActionVal = $state('');
	let newRuleStopOnMatch = $state(false);
	let savingRule = $state(false);

	// Rule test / preview
	let showRuleTest = $state(false);
	let testContact = $state({ name: '', company: '', email: '', phone: '', lead_source: '', utm_source: '', utm_campaign: '' });
	let testResults = $state<{ruleId: string; matched: boolean; action: string}[]>([]);

	function runRuleTest() {
		testResults = rules.map(rule => {
			const field = rule.condition_field === 'any_field'
				? Object.values(testContact).join(' ').toLowerCase()
				: (testContact as any)[rule.condition_field]?.toLowerCase() ?? '';
			const val = (rule.condition_value ?? '').toLowerCase();

			let matched = false;
			switch (rule.condition_operator) {
				case 'contains':     matched = field.includes(val); break;
				case 'equals':       matched = field === val; break;
				case 'starts_with':  matched = field.startsWith(val); break;
				case 'ends_with':    matched = field.endsWith(val); break;
				case 'not_contains': matched = !field.includes(val); break;
				case 'is_empty':     matched = !field.trim(); break;
				case 'not_empty':    matched = !!field.trim(); break;
			}

			return { ruleId: rule.id, matched, action: `${rule.action_type}: ${rule.action_value ?? ''}` };
		});
	}

	async function moveRule(id: string, direction: 'up' | 'down') {
		const idx = rules.findIndex(r => r.id === id);
		if (idx === -1) return;
		const newRules = [...rules];
		const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
		if (swapIdx < 0 || swapIdx >= newRules.length) return;

		// Swap
		[newRules[idx], newRules[swapIdx]] = [newRules[swapIdx], newRules[idx]];

		// Update rule_order values
		await Promise.all([
			apiFetch(`/api/routing-rules/${newRules[idx].id}`, { method: 'PATCH', body: JSON.stringify({ rule_order: idx }) }),
			apiFetch(`/api/routing-rules/${newRules[swapIdx].id}`, { method: 'PATCH', body: JSON.stringify({ rule_order: swapIdx }) }),
		]);

		rules = newRules.map((r, i) => ({ ...r, rule_order: i }));
	}

	const CONDITION_FIELDS = [
		{ value: 'company',      label: 'Company' },
		{ value: 'email',        label: 'Email' },
		{ value: 'phone',        label: 'Phone' },
		{ value: 'lead_source',  label: 'Lead Source' },
		{ value: 'utm_source',   label: 'UTM Source' },
		{ value: 'utm_campaign', label: 'UTM Campaign' },
		{ value: 'any_field',    label: 'Any Field' },
	];
	const OPERATORS = [
		{ value: 'contains',     label: 'contains' },
		{ value: 'equals',       label: 'equals' },
		{ value: 'starts_with',  label: 'starts with' },
		{ value: 'not_contains', label: 'does not contain' },
		{ value: 'is_empty',     label: 'is empty' },
		{ value: 'not_empty',    label: 'is not empty' },
	];
	const ACTION_TYPES = [
		{ value: 'add_tag',          label: 'Add Tag' },
		{ value: 'assign_campaign',  label: 'Assign to Campaign' },
		{ value: 'set_contact_type', label: 'Set Contact Type' },
		{ value: 'skip',             label: 'Discard Lead' },
	];

	async function loadRules(sourceId: string) {
		loadingRules = true;
		const r = await apiFetch(`/api/routing-rules?source_id=${sourceId}`);
		if (r.ok) rules = await r.json();
		loadingRules = false;
	}

	async function saveRule() {
		if (!selectedSource || !newRuleField || !newRuleAction) return;
		savingRule = true;
		const res = await apiFetch('/api/routing-rules', {
			method: 'POST',
			body: JSON.stringify({
				lead_source_id: selectedSource.id,
				condition_field: newRuleField,
				condition_operator: newRuleOp,
				condition_value: newRuleVal || null,
				action_type: newRuleAction,
				action_value: newRuleActionVal || null,
				rule_order: rules.length,
				name: `${newRuleField} ${newRuleOp} "${newRuleVal}" → ${newRuleAction}`,
				stop_on_match: newRuleStopOnMatch,
			}),
		});
		if (res.ok) {
			const rule = await res.json();
			rules = [...rules, rule];
			newRuleVal = '';
			newRuleActionVal = '';
			newRuleStopOnMatch = false;
			toastSuccess('Rule added');
		}
		savingRule = false;
	}

	async function deleteRule(id: string) {
		const res = await apiFetch(`/api/routing-rules/${id}`, { method: 'DELETE' });
		if (res.ok) { rules = rules.filter(r => r.id !== id); toastSuccess('Rule deleted'); }
		else toastError('Could not delete rule');
	}

	function getActionDisplay(rule: any): string {
		if (rule.action_type === 'assign_campaign' && rule.action_value) {
			const campaign = campaigns.find(c => c.id === rule.action_value);
			return campaign ? `→ assign "${campaign.name}"` : `→ assign campaign`;
		}
		return `→ ${rule.action_type} "${rule.action_value ?? ''}"`;
	}

	const PLATFORMS = [
		{ value: 'zapier', label: 'Zapier' },
		{ value: 'facebook', label: 'Facebook Ads' },
		{ value: 'google', label: 'Google Ads' },
		{ value: 'linkedin', label: 'LinkedIn' },
		{ value: 'website', label: 'Website Form' },
		{ value: 'webhook', label: 'Custom Webhook' },
	];

	onMount(async () => {
		await Promise.all([loadSources(), loadMeta()]);
		await loadLeads();
	});

	async function loadSources() {
		loadingSources = true;
		try {
			const res = await apiFetch('/api/lead-sources');
			if (res.ok) sources = await res.json();
		} catch {}
		loadingSources = false;
	}

	async function loadMeta() {
		try {
			const [cr, camr, lr] = await Promise.all([
				apiFetch('/api/clients'),
				apiFetch('/api/campaigns'),
				apiFetch('/api/call-lists'),
			]);
			if (cr.ok) clients = await cr.json();
			if (camr.ok) { const d = await camr.json(); campaigns = d.map((c: any) => ({ id: c.id, name: c.name })); }
			if (lr.ok) callLists = await lr.json();
		} catch {}
	}

	async function selectSource(source: LeadSource) {
		selectedSource = source;
		editingSource = false;
		leadsOffset = 0;
		leads = [];
		showRules = false;
		rules = [];
		await Promise.all([loadLeads(source.id), loadRules(source.id)]);
	}

	async function showAllSources() {
		selectedSource = null;
		editingSource = false;
		leadsOffset = 0;
		leads = [];
		await loadLeads();
	}

	async function loadLeads(sourceId?: string, append = false) {
		loadingLeads = true;
		try {
			const params = new URLSearchParams({ limit: String(LEADS_PAGE), offset: String(leadsOffset) });
			if (sourceId) params.set('source_id', sourceId);
			const res = await apiFetch(`/api/leads-feed?${params}`);
			if (res.ok) {
				const d = await res.json();
				leads = append ? [...leads, ...d.data] : d.data;
				leadsTotal = d.count ?? 0;
			}
		} catch {}
		loadingLeads = false;
	}

	async function loadMore() {
		leadsOffset += LEADS_PAGE;
		await loadLeads(selectedSource?.id, true);
	}

	async function createSource() {
		if (!newName.trim()) return;
		creating = true;
		const res = await apiFetch('/api/lead-sources', {
			method: 'POST',
			body: JSON.stringify({
				name: newName,
				sourceType: newPlatform,
				defaultContactType: newContactType,
				campaignId: newCampaignId || null,
				clientId: newClientId || null,
				autoCallListId: newCallListId || null,
			}),
		});
		if (res.ok) {
			toastSuccess('Lead source created');
			showNewSource = false;
			newName = ''; newPlatform = 'zapier'; newContactType = 'lead';
			newCampaignId = ''; newClientId = ''; newCallListId = '';
			await loadSources();
		} else {
			toastError('Failed to create source');
		}
		creating = false;
	}

	async function toggleSourceStatus(source: LeadSource) {
		const newStatus = source.status === 'active' ? 'paused' : 'active';
		const res = await apiFetch(`/api/lead-sources/${source.id}`, {
			method: 'PATCH',
			body: JSON.stringify({ ...source, status: newStatus }),
		});
		if (res.ok) {
			sources = sources.map(s => s.id === source.id ? { ...s, status: newStatus } : s);
			if (selectedSource?.id === source.id) selectedSource = { ...selectedSource, status: newStatus };
			toastSuccess(newStatus === 'active' ? 'Source activated' : 'Source paused');
		}
	}

	async function saveSourceEdit() {
		if (!selectedSource) return;
		// Parse field mapping JSON (empty ⇒ clear mapping, use default extraction)
		let fieldMapping: Record<string, string> | null = null;
		if (editMapping.trim()) {
			try {
				const parsed = JSON.parse(editMapping);
				if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
				fieldMapping = parsed;
			} catch {
				toastError('Field mapping must be a JSON object like {"phone": "data.phone_number"}');
				return;
			}
		}
		const res = await apiFetch(`/api/lead-sources/${selectedSource.id}`, {
			method: 'PATCH',
			body: JSON.stringify({ ...editData, field_mapping: fieldMapping }),
		});
		if (res.ok) {
			const updated = await res.json();
			sources = sources.map(s => s.id === updated.id ? { ...s, ...updated } : s);
			selectedSource = { ...selectedSource, ...updated };
			editingSource = false;
			toastSuccess('Source updated');
		}
	}

	async function deleteSource(source: LeadSource) {
		if (!confirm(`Delete "${source.name}"? This cannot be undone.`)) return;
		const res = await apiFetch(`/api/lead-sources/${source.id}`, { method: 'DELETE' });
		if (res.ok) {
			sources = sources.filter(s => s.id !== source.id);
			if (selectedSource?.id === source.id) { selectedSource = null; leads = []; leadsTotal = 0; await loadLeads(); }
			toastSuccess('Source deleted');
		}
	}

	async function assignLeadToCampaign(leadId: string, campaignId: string) {
		if (!campaignId) return;
		const res = await apiFetch(`/api/contacts/${leadId}/assign-campaign`, {
			method: 'POST',
			body: JSON.stringify({ campaign_id: campaignId }),
		});
		if (res.ok) {
			toastSuccess('Lead assigned to campaign');
			assigningLeadId = null;
			assignCampaignId = '';
		} else {
			toastError('Failed to assign lead');
		}
	}

	let showEmbed = $state(false);

	function copyWebhookUrl(token: string) {
		const url = `${window.location.origin}/api/webhook/${token}`;
		navigator.clipboard.writeText(url);
		toastSuccess('Webhook URL copied');
	}

	function copyEmbedSnippet(token: string) {
		const snippet = `<iframe\n  src="${window.location.origin}/embed/form/${token}?theme=dark"\n  width="100%"\n  height="420"\n  frameborder="0"\n  style="border-radius: 12px; max-width: 480px;"\n></iframe>`;
		navigator.clipboard.writeText(snippet);
		toastSuccess('Embed code copied');
	}

	function timeAgo(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h ago`;
		return `${Math.floor(hrs / 24)}d ago`;
	}

	function scoreColor(score: number | null): string {
		if (!score) return 'text-[#6e6e6e]';
		if (score >= 70) return 'text-[var(--accent)]';
		if (score >= 40) return 'text-yellow-400';
		return 'text-red-400';
	}

	const allLeadsSelected = $derived(selectedSource === null);
</script>

<svelte:head><title>{titleFor('Lead Inbox')}</title></svelte:head>

<div class="flex flex-col flex-1 h-full overflow-hidden">
	<!-- Header -->
	<div class="border-b border-[#1e1e1e] px-6 py-4 flex items-center justify-between flex-shrink-0">
		<div>
			<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Lead Inbox</h2>
			<p class="text-[#7c7c7c] text-xs mt-0.5">
				{leadsTotal} leads{selectedSource ? ` from ${selectedSource.name}` : ' across all sources'}
			</p>
		</div>
		<button onclick={() => { showNewSource = true; }}
			class="rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors">
			+ New Source
		</button>
	</div>

	<div class="flex flex-1 overflow-hidden">
		<!-- Left: Source List -->
		<div class="w-64 shrink-0 border-r border-[#1e1e1e] flex flex-col overflow-hidden">
			<!-- All sources option -->
			<button onclick={showAllSources}
				class="flex items-center justify-between px-8 py-4 border-b border-[#1e1e1e] transition-colors text-left {allLeadsSelected ? 'bg-white/5' : 'hover:bg-white/5'}">
				<div>
					<p class="text-sm text-white font-medium">All Sources</p>
					<p class="text-xs text-[#7c7c7c]">All inbound leads</p>
				</div>
			</button>

			<div class="flex-1 overflow-y-auto">
				{#if loadingSources}
					{#each { length: 4 } as _}
						<div class="px-4 py-3 border-b border-[#1a1a1a]">
							<div class="h-3 w-28 bg-[#1a1a1a] rounded animate-pulse mb-1.5"></div>
							<div class="h-2.5 w-16 bg-[#1a1a1a] rounded animate-pulse"></div>
						</div>
					{/each}
				{:else if sources.length === 0}
					<div class="px-4 py-6 text-center">
						<p class="text-[#333] text-xs">No sources yet</p>
					</div>
				{:else}
					{#each sources as source}
						<button onclick={() => selectSource(source)}
							class="w-full text-left px-4 py-3 border-b border-[#1a1a1a] transition-colors {selectedSource?.id === source.id ? 'bg-white/10' : 'hover:bg-white/5'}">
							<div class="flex items-center justify-between mb-1">
								<p class="text-sm text-white font-medium truncate flex-1 mr-2">{source.name}</p>
								<span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 {source.status === 'active' ? 'bg-[var(--accent)]/12 text-[var(--accent)]' : 'bg-[#1a1a1a] text-[#7c7c7c]'}">
									{source.status === 'active' ? '● LIVE' : '⏸'}
								</span>
							</div>
							<div class="flex gap-3 text-[10px] text-[#7c7c7c]">
								<span>{source.leads_today ?? 0} today</span>
								<span>{source.lead_count ?? 0} total</span>
							</div>
							{#if source.last_lead_at}
								<p class="text-[10px] text-[#6e6e6e] mt-0.5">Last: {timeAgo(source.last_lead_at)}</p>
							{/if}
						</button>
					{/each}
				{/if}
			</div>

			<!-- New source form -->
			{#if showNewSource}
				<div class="border-t border-[#1e1e1e] p-4 space-y-3 bg-[#0a0a0a]">
					<p class="text-xs font-semibold text-white">New Source</p>
					<input bind:value={newName} placeholder="Source name"
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" />
					<select bind:value={newPlatform}
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white focus:outline-none">
						{#each PLATFORMS as p}<option value={p.value}>{p.label}</option>{/each}
					</select>
					<select bind:value={newCampaignId}
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white focus:outline-none">
						<option value="">No campaign</option>
						{#each campaigns as c}<option value={c.id}>{c.name}</option>{/each}
					</select>
					<select bind:value={newClientId}
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white focus:outline-none">
						<option value="">No client</option>
						{#each clients as c}<option value={c.id}>{c.name}</option>{/each}
					</select>
					<select bind:value={newCallListId}
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white focus:outline-none">
						<option value="">No call list</option>
						{#each callLists as l}<option value={l.id}>{l.name}</option>{/each}
					</select>
					<div class="flex gap-2">
						<button onclick={createSource} disabled={creating || !newName.trim()}
							class="flex-1 rounded-lg bg-white py-1.5 text-xs font-semibold text-black disabled:opacity-40">
							{creating ? 'Creating…' : 'Create'}
						</button>
						<button onclick={() => showNewSource = false}
							class="flex-1 rounded-lg border border-[#2a2a2a] py-1.5 text-xs text-[#8a8a8a]">
							Cancel
						</button>
					</div>
				</div>
			{/if}
		</div>

		<!-- Right: Leads Feed + Source Detail -->
		<div class="flex-1 flex flex-col overflow-hidden">
			{#if selectedSource}
				<!-- Source header with stats + edit -->
				<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center justify-between flex-shrink-0">
					{#if editingSource}
						<div class="flex flex-col gap-3 flex-1 mr-4">
							<div class="flex gap-3">
								<input bind:value={editData.name} placeholder="Source name"
									class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white focus:border-white focus:outline-none" />
								<select bind:value={editData.campaign_id}
									class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white focus:outline-none">
									<option value="">No campaign</option>
									{#each campaigns as c}<option value={c.id}>{c.name}</option>{/each}
								</select>
							</div>
							<div>
								<p class="text-[10px] text-[#6e6e6e] mb-1">Field mapping (optional) — contact field → payload path, e.g. {`{"phone": "data.phone_number", "email": "lead.email"}`}. Leave empty for auto-detection.</p>
								<textarea bind:value={editMapping} rows="3" placeholder={'{\n  "phone": "data.phone_number"\n}'}
									class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs font-mono text-white placeholder-[#444] focus:border-white focus:outline-none"></textarea>
							</div>
						</div>
						<div class="flex gap-2">
							<button onclick={saveSourceEdit}
								class="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-black">Save</button>
							<button onclick={() => editingSource = false}
								class="text-xs text-[#8a8a8a] hover:text-white px-2">Cancel</button>
						</div>
					{:else}
						<div class="flex items-center gap-4 min-w-0">
							<div class="min-w-0">
								<div class="flex items-center gap-2">
									<p class="text-white font-semibold text-sm">{selectedSource.name}</p>
									<span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 {selectedSource.status === 'active' ? 'bg-[var(--accent)]/12 text-[var(--accent)]' : 'bg-[#1a1a1a] text-[#7c7c7c]'}">
										{selectedSource.status === 'active' ? '● LIVE' : '⏸ PAUSED'}
									</span>
								</div>
								<p class="text-[#7c7c7c] text-xs font-mono mt-0.5 truncate max-w-xs">
									/api/webhook/{selectedSource.webhook_token}
								</p>
								<div class="mt-1.5">
									<button onclick={() => showEmbed = !showEmbed} class="text-xs text-[#6e6e6e] hover:text-white transition-colors">
										{showEmbed ? '▼' : '▶'} Embed Form
									</button>
									{#if showEmbed}
										<pre class="mt-1.5 rounded-lg bg-[#0a0a0a] border border-[#1a1a1a] p-3 text-[10px] text-[#8a8a8a] overflow-x-auto whitespace-pre-wrap">{`<iframe\n  src="${window.location.origin}/embed/form/${selectedSource.webhook_token}?theme=dark"\n  width="100%"\n  height="420"\n  frameborder="0"\n  style="border-radius: 12px; max-width: 480px;"\n></iframe>`}</pre>
										<button onclick={() => copyEmbedSnippet(selectedSource!.webhook_token)}
											class="mt-1 text-xs text-[#7c7c7c] hover:text-white transition-colors">⎘ Copy snippet</button>
									{/if}
								</div>
							</div>
							<div class="flex gap-4 text-center">
								<div>
									<p class="text-white font-mono text-lg font-bold">{selectedSource.leads_today ?? 0}</p>
									<p class="text-[#6e6e6e] text-[10px]">today</p>
								</div>
								<div>
									<p class="text-white font-mono text-lg font-bold">{selectedSource.leads_this_week ?? 0}</p>
									<p class="text-[#6e6e6e] text-[10px]">this week</p>
								</div>
								<div>
									<p class="text-white font-mono text-lg font-bold">{selectedSource.lead_count ?? 0}</p>
									<p class="text-[#6e6e6e] text-[10px]">total</p>
								</div>
							</div>
						</div>
						<div class="flex items-center gap-2 flex-shrink-0">
							<button onclick={() => copyWebhookUrl(selectedSource!.webhook_token)}
								class="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#8a8a8a] hover:border-white hover:text-white transition-colors">
								⎘ URL
							</button>
							<button onclick={() => toggleSourceStatus(selectedSource!)}
								class="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#8a8a8a] hover:border-white hover:text-white transition-colors">
								{selectedSource.status === 'active' ? '⏸ Pause' : '▶ Activate'}
							</button>
							<button onclick={() => { editingSource = true; editData = { ...selectedSource }; editMapping = (selectedSource as any).field_mapping ? JSON.stringify((selectedSource as any).field_mapping, null, 2) : ''; }}
								class="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#8a8a8a] hover:border-white hover:text-white transition-colors">
								Edit
							</button>
							<button onclick={() => deleteSource(selectedSource!)}
								class="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#8a8a8a] hover:border-red-900 hover:text-red-400 transition-colors">
								Delete
							</button>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Routing Rules collapsible (only when a source is selected) -->
			{#if selectedSource}
				<div class="border-b border-[#1e1e1e] px-8 py-4 flex-shrink-0">
					<div class="flex items-center justify-between">
						<button onclick={() => showRules = !showRules}
							class="flex items-center gap-2 text-xs text-[#7c7c7c] hover:text-white transition-colors text-left">
							<span class="text-[8px]">{showRules ? '▼' : '▶'}</span>
							<span>Routing Rules ({rules.length})</span>
							{#if loadingRules}<span class="text-[#6e6e6e] ml-1">…</span>{/if}
						</button>
						{#if showRules && rules.length > 0}
							<button onclick={() => { showRuleTest = !showRuleTest; testResults = []; }}
								class="text-[10px] border border-[#2a2a2a] text-[#7c7c7c] hover:border-white hover:text-white px-2 py-0.5 rounded transition-colors">
								{showRuleTest ? 'Close Test' : 'Test Rules'}
							</button>
						{/if}
					</div>

					{#if showRules}
						<div class="mt-3 space-y-2">
							{#if rules.length === 0}
								<p class="text-[10px] text-[#6e6e6e] pl-1">No rules yet — leads flow through unfiltered.</p>
							{:else}
								{#each rules as rule, index}
									<div class="flex items-center justify-between rounded-lg bg-[#111] border border-[#1a1a1a] px-3 py-2">
										<!-- Order controls -->
										<div class="flex items-center gap-1 mr-2 flex-shrink-0">
											<button onclick={() => moveRule(rule.id, 'up')} disabled={index === 0}
												class="text-[#333] hover:text-white disabled:opacity-20 text-xs px-1 transition-colors">↑</button>
											<button onclick={() => moveRule(rule.id, 'down')} disabled={index === rules.length - 1}
												class="text-[#333] hover:text-white disabled:opacity-20 text-xs px-1 transition-colors">↓</button>
										</div>
									<p class="text-xs text-[#888] leading-relaxed flex-1 truncate">
										<span class="text-white capitalize">{(rule.condition_field ?? '').replace(/_/g,' ')}</span>
										<span class="text-[#7c7c7c]">{OPERATORS.find(o => o.value === rule.condition_operator)?.label ?? rule.condition_operator}</span>
										{#if rule.condition_value}<span class="text-white">"{rule.condition_value}"</span>{/if}
										<span class="text-[#7c7c7c]">{getActionDisplay(rule)}</span>
										{#if rule.stop_on_match}<span class="text-[10px] text-yellow-500/70 ml-1">stop</span>{/if}
									</p>
									<button onclick={() => deleteRule(rule.id)} aria-label="Delete rule" class="text-[#6e6e6e] hover:text-red-400 text-xs ml-2 flex-shrink-0"><Icon name="x" size={14} /></button>
								</div>
							{/each}
						{/if}

						<!-- New rule form -->
						<div class="rounded-lg bg-[#0d0d0d] border border-[#1a1a1a] p-3 space-y-2 mt-2">
							<p class="text-[10px] text-[#7c7c7c] uppercase tracking-widest">Add rule</p>
							<div class="flex flex-wrap gap-2">
								<select bind:value={newRuleField} class="rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white">
									{#each CONDITION_FIELDS as f}<option value={f.value}>{f.label}</option>{/each}
								</select>
								<select bind:value={newRuleOp} class="rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white">
									{#each OPERATORS as o}<option value={o.value}>{o.label}</option>{/each}
								</select>
								{#if newRuleOp !== 'is_empty' && newRuleOp !== 'not_empty'}
									<input bind:value={newRuleVal} placeholder="value" class="rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white placeholder-[#444] flex-1 min-w-[100px]" />
								{/if}
							</div>
							<div class="flex flex-wrap gap-2 items-center">
								<select bind:value={newRuleAction} class="rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white">
									{#each ACTION_TYPES as a}<option value={a.value}>{a.label}</option>{/each}
								</select>
								{#if newRuleAction === 'assign_campaign'}
									<select bind:value={newRuleActionVal} class="rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white flex-1 min-w-[100px]">
										<option value="">Pick campaign…</option>
										{#each campaigns as c}<option value={c.id}>{c.name}</option>{/each}
									</select>
								{:else if newRuleAction !== 'skip'}
									<input bind:value={newRuleActionVal} placeholder="value" class="rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white placeholder-[#444] flex-1 min-w-[100px]" />
								{/if}
								<label class="flex items-center gap-1 text-[10px] text-[#8a8a8a]"><input type="checkbox" bind:checked={newRuleStopOnMatch} /> stop on match</label>
							</div>
							<button onclick={saveRule} disabled={savingRule} class="rounded bg-white px-3 py-1 text-xs font-semibold text-black hover:bg-white/90 disabled:opacity-40">
								{savingRule ? 'Adding…' : '+ Add rule'}
							</button>
						</div>

						{#if showRuleTest}
							<div class="rounded-lg bg-[#0d0d0d] border border-[#1a1a1a] p-3 space-y-2 mt-2">
								<p class="text-[10px] text-[#7c7c7c] uppercase tracking-widest">Test a sample lead</p>
								<div class="grid grid-cols-2 gap-2">
									<input bind:value={testContact.company} placeholder="Company" class="rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white placeholder-[#444]" />
									<input bind:value={testContact.email} placeholder="Email" class="rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white placeholder-[#444]" />
									<input bind:value={testContact.lead_source} placeholder="Lead source" class="rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white placeholder-[#444]" />
									<input bind:value={testContact.utm_source} placeholder="UTM source" class="rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white placeholder-[#444]" />
								</div>
								<button onclick={runRuleTest} class="rounded border border-[#2a2a2a] px-3 py-1 text-xs text-[#888] hover:border-white hover:text-white">Run test</button>
								{#if testResults.length > 0}
									<div class="space-y-1">
										{#each testResults as tr}
											<div class="flex items-center gap-2 text-[10px]"><span class="{tr.matched ? 'text-[var(--accent)]' : 'text-[#6e6e6e]'}">{tr.matched ? '✓ match' : '· no match'}</span><span class="text-[#8a8a8a]">{tr.action}</span></div>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Leads feed -->
			<div class="flex-1 overflow-y-auto">
				{#if loadingLeads && leads.length === 0}
					<div class="p-8 space-y-2">
						{#each { length: 6 } as _}<div class="h-14 bg-[#111] rounded-lg animate-pulse"></div>{/each}
					</div>
				{:else if leads.length === 0}
					<div class="flex items-center justify-center h-full text-center">
						<div>
							<p class="text-[#6e6e6e] text-sm">No leads yet{selectedSource ? ` from ${selectedSource.name}` : ''}</p>
							<p class="text-[#333] text-xs mt-1">Inbound leads will appear here as they arrive.</p>
						</div>
					</div>
				{:else}
					<div class="divide-y divide-[#1a1a1a]">
						{#each leads as lead}
							<div class="px-8 py-3 hover:bg-[#0d0d0d] transition-colors group">
								<div class="flex items-center gap-3">
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-2">
											<a href="/contacts/{lead.id}" class="text-sm text-white font-medium hover:underline truncate">{lead.name || lead.company || lead.email || lead.phone || 'Unknown lead'}</a>
											{#if lead.contact_score != null}<span class="text-xs font-mono {scoreColor(lead.contact_score)}">{lead.contact_score}</span>{/if}
										</div>
										<div class="flex items-center gap-2 text-xs text-[#7c7c7c] mt-0.5 flex-wrap">
											{#if lead.company}<span>{lead.company}</span>{/if}
											{#if lead.phone}<span class="font-mono">{lead.phone}</span>{/if}
											{#if lead.email}<span class="truncate">{lead.email}</span>{/if}
											{#if lead.lead_source}<span class="text-[#6e6e6e]">via {lead.lead_source}</span>{/if}
											<span class="text-[#333]">{timeAgo(lead.created_at)}</span>
										</div>
									</div>
									<div class="flex-shrink-0">
										{#if assigningLeadId === lead.id}
											<div class="flex items-center gap-1">
												<select bind:value={assignCampaignId} class="rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white">
													<option value="">Campaign…</option>
													{#each campaigns as c}<option value={c.id}>{c.name}</option>{/each}
												</select>
												<button onclick={() => assignLeadToCampaign(lead.id, assignCampaignId)} disabled={!assignCampaignId} class="text-xs text-[var(--accent)] hover:text-[var(--accent-hi)] disabled:opacity-30 px-1">Assign</button>
												<button onclick={() => { assigningLeadId = null; assignCampaignId = ''; }} class="text-xs text-[#7c7c7c] hover:text-white px-1"><Icon name="x" size={14} /></button>
											</div>
										{:else}
											<button onclick={() => { assigningLeadId = lead.id; assignCampaignId = ''; }} class="text-xs text-[#7c7c7c] hover:text-white opacity-0 group-hover:opacity-100 transition-opacity border border-[#2a2a2a] rounded px-2 py-1">→ Campaign</button>
										{/if}
									</div>
								</div>
							</div>
						{/each}
					</div>
					{#if leads.length < leadsTotal}
						<div class="p-4 text-center">
							<button onclick={loadMore} disabled={loadingLeads} class="rounded-lg border border-[#2a2a2a] px-4 py-2 text-xs text-[#888] hover:border-white hover:text-white disabled:opacity-40 transition-colors">
								{loadingLeads ? 'Loading…' : `Load more (${leads.length}/${leadsTotal})`}
							</button>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>
</div>
