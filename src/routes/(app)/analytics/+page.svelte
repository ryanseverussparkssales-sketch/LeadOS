<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';

	type Period = 'today' | 'week' | 'month' | 'all';

	interface Client { id: string; name: string; }
	interface Project { id: string; name: string; }
	interface Campaign { id: string; name: string; }

	let period    = $state<Period>('today');
	let clientId  = $state('');
	let projectId = $state('');
	let campaignId = $state('');
	let loading   = $state(true);
	let clients   = $state<Client[]>([]);
	let projects  = $state<Project[]>([]);
	let campaigns = $state<Campaign[]>([]);
	let data = $state<{
		callCount: number;
		totals: { twilio: number; groq: number; claude: number; total: number; minutes: number };
		avgCostPerCall: number;
		outcomes: Record<string, number>;
		time: { totalMins: number; billableMins: number; entries: number };
		daily: { date: string; calls: number; cost: number; timeMins: number }[];
		pricing: { twilio: number; groq: number; claudeInput: number; claudeOutput: number };
	} | null>(null);

	const periodLabels: Record<Period, string> = {
		today: 'Today', week: 'Last 7 days', month: 'This month', all: 'All time'
	};

	const outcomeColors: Record<string, string> = {
		answered: '#22c55e', voicemail: '#eab308', callback: '#3b82f6',
		not_interested: '#6b7280', do_not_call: '#ef4444', no_answer: '#374151', unlogged: '#1f2937'
	};

	onMount(async () => {
		const [cr, pr, camr] = await Promise.all([
			apiFetch('/api/clients'), apiFetch('/api/projects'), apiFetch('/api/campaigns')
		]);
		clients  = cr.ok ? await cr.json() : [];
		projects = pr.ok ? await pr.json() : [];
		campaigns = camr.ok ? await camr.json() : [];
		try {
			const dealsRes = await apiFetch('/api/deals?limit=500');
			if (dealsRes.ok) {
				const deals = await dealsRes.json();
				const active = deals.filter((d: any) => !['won','lost'].includes(d.stage));
				const won = deals.filter((d: any) => d.stage === 'won');
				const lost = deals.filter((d: any) => d.stage === 'lost');

				const totalPipeline = active.reduce((sum: number, d: any) => sum + (d.value ?? 0), 0);
				const weightedPipeline = active.reduce((sum: number, d: any) => {
					const prob = d.probability ?? 0;
					return sum + (d.value ?? 0) * (prob / 100);
				}, 0);
				const winRate = won.length + lost.length > 0
					? Math.round(won.length / (won.length + lost.length) * 100)
					: 0;
				const wonValue = won.reduce((sum: number, d: any) => sum + (d.value ?? 0), 0);

				pipelineData = { totalPipeline, weightedPipeline, winRate, wonValue, dealCount: active.length };
			}
		} catch {}
		await load();
	});

	async function load() {
		loading = true;
		const params = new URLSearchParams({ period });
		if (clientId)   params.set('client_id', clientId);
		if (projectId)  params.set('project_id', projectId);
		if (campaignId) params.set('campaign_id', campaignId);
		const res = await apiFetch(`/api/analytics?${params}`);
		data = res.ok ? await res.json() : null;
		loading = false;
	}

	function fmt$(n: number) { return `$${n.toFixed(4)}`; }
	function fmtMins(m: number) {
		const h = Math.floor(m / 60);
		const min = m % 60;
		return h > 0 ? `${h}h ${min}m` : `${min}m`;
	}

	let pipelineData = $state<any>(null);

	// Revenue analytics view
	type AnalyticsView = 'activity' | 'revenue';
	let analyticsView = $state<AnalyticsView>('activity');
	interface RevenueMonth { month: number; label: string; revenue: number; deals: number; }
	interface RevenueData { year: number; totalRevenue: number; dealCount: number; avgDealSize: number; monthly: RevenueMonth[]; }
	let revenueData = $state<RevenueData | null>(null);
	let revenueYear = $state(new Date().getFullYear());

	async function loadRevenue() {
		const res = await apiFetch(`/api/analytics/revenue?year=${revenueYear}`);
		revenueData = res.ok ? await res.json() : null;
	}
</script>

<svelte:head><title>Analytics — LeadOS</title></svelte:head>

<div class="flex flex-col flex-1 h-full overflow-y-auto">
	<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center gap-4 flex-wrap">
		<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Analytics</h2>

		<!-- Period -->
		<div class="flex gap-1">
			{#each (['today', 'week', 'month', 'all'] as Period[]) as p}
				<button onclick={() => { period = p; load(); }}
					class="rounded-lg px-3 py-1.5 text-xs transition-colors {period === p ? 'bg-white/10 text-white' : 'text-[#666] hover:text-white'}">
					{periodLabels[p]}
				</button>
			{/each}
		</div>

		<!-- Filters -->
		<div class="flex gap-2 ml-auto">
			<select bind:value={clientId} onchange={load}
				class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs text-white focus:border-white focus:outline-none">
				<option value="">All clients</option>
				{#each clients as c}<option value={c.id}>{c.name}</option>{/each}
			</select>
			<select bind:value={projectId} onchange={load}
				class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs text-white focus:border-white focus:outline-none">
				<option value="">All projects</option>
				{#each projects as p}<option value={p.id}>{p.name}</option>{/each}
			</select>
			<select bind:value={campaignId} onchange={load}
				class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs text-white focus:border-white focus:outline-none">
				<option value="">All campaigns</option>
				{#each campaigns as c}<option value={c.id}>{c.name}</option>{/each}
			</select>
		</div>
		<!-- View toggle -->
		<div class="flex gap-1 ml-4">
			<button onclick={() => analyticsView = 'activity'} class="rounded-lg px-3 py-1.5 text-xs transition-colors {analyticsView === 'activity' ? 'bg-white/10 text-white' : 'text-[#666] hover:text-white'}">Activity</button>
			<button onclick={() => { analyticsView = 'revenue'; loadRevenue(); }} class="rounded-lg px-3 py-1.5 text-xs transition-colors {analyticsView === 'revenue' ? 'bg-white/10 text-white' : 'text-[#666] hover:text-white'}">Revenue</button>
		</div>
	</div>

	{#if analyticsView === 'revenue'}
		{#if revenueData}
			<div class="p-8 max-w-4xl space-y-6">
				<div class="flex items-center gap-4">
					<p class="text-white text-sm font-medium">Revenue {revenueYear}</p>
					<button onclick={() => { revenueYear--; loadRevenue(); }} class="text-xs text-[#555] hover:text-white px-2">← {revenueYear - 1}</button>
					<button onclick={() => { revenueYear++; loadRevenue(); }} class="text-xs text-[#555] hover:text-white px-2">{revenueYear + 1} →</button>
				</div>
				<div class="grid grid-cols-3 gap-4">
					{#each [['Total Revenue', '$' + (revenueData.totalRevenue >= 1000 ? (revenueData.totalRevenue/1000).toFixed(0) + 'k' : revenueData.totalRevenue)],['Deals Closed', revenueData.dealCount.toString()],['Avg Deal Size', '$' + Math.round(revenueData.avgDealSize)]] as [l,v]}
						<div class="rounded-xl border border-[#2a2a2a] bg-[#111111] p-5"><p class="text-xs text-[#555] mb-2">{l}</p><p class="text-white text-2xl font-semibold">{v}</p></div>
					{/each}
				</div>
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111111] p-5">
					<p class="text-xs text-[#999] uppercase tracking-widest mb-4">Monthly Revenue</p>
					<div class="flex items-end gap-2 h-32">
						{#each revenueData.monthly as m}
							{@const max = Math.max(...revenueData.monthly.map(x => x.revenue), 1)}
							<div class="flex-1 flex flex-col items-center gap-1">
								<div class="w-full rounded-t bg-white/20 hover:bg-white/40 transition-colors relative group" style="height:{Math.max(4, m.revenue/max*100)}%">
									<div class="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[#111] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">${m.revenue >= 1000 ? (m.revenue/1000).toFixed(0) + 'k' : m.revenue} · {m.deals} deals</div>
								</div>
								<p class="text-xs text-[#444]">{m.label}</p>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{:else}
			<div class="flex items-center justify-center py-24"><p class="text-[#444] text-sm">No revenue data yet</p></div>
		{/if}
	{:else}
		{#if pipelineData}
			<div class="px-8 pt-6 max-w-5xl">
				<p class="text-[10px] text-[#444] uppercase tracking-widest mb-3">Pipeline</p>
				<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
					<div class="bg-[var(--c-surface-1)] border border-[var(--c-border)] rounded-xl p-4">
						<p class="text-[10px] text-[#555] uppercase tracking-widest mb-1">Total Pipeline</p>
						<p class="text-2xl text-white font-bold font-mono">${(pipelineData.totalPipeline / 1000).toFixed(0)}k</p>
						<p class="text-[10px] text-[#444] mt-0.5">{pipelineData.dealCount} open deals</p>
					</div>
					<div class="bg-[var(--c-surface-1)] border border-[var(--c-border)] rounded-xl p-4">
						<p class="text-[10px] text-[#555] uppercase tracking-widest mb-1">Weighted</p>
						<p class="text-2xl text-white font-bold font-mono">${(pipelineData.weightedPipeline / 1000).toFixed(0)}k</p>
						<p class="text-[10px] text-[#444] mt-0.5">by probability</p>
					</div>
					<div class="bg-[var(--c-surface-1)] border border-[var(--c-border)] rounded-xl p-4">
						<p class="text-[10px] text-[#555] uppercase tracking-widest mb-1">Win Rate</p>
						<p class="text-2xl font-bold font-mono {pipelineData.winRate >= 50 ? 'text-green-400' : 'text-white'}">{pipelineData.winRate}%</p>
						<p class="text-[10px] text-[#444] mt-0.5">closed deals</p>
					</div>
					<div class="bg-[var(--c-surface-1)] border border-[var(--c-border)] rounded-xl p-4">
						<p class="text-[10px] text-[#555] uppercase tracking-widest mb-1">Won Value</p>
						<p class="text-2xl text-green-400 font-bold font-mono">${(pipelineData.wonValue / 1000).toFixed(0)}k</p>
						<p class="text-[10px] text-[#444] mt-0.5">this period</p>
					</div>
				</div>
			</div>
		{/if}
		{#if loading}
		<div class="flex items-center justify-center py-24">
			<p class="text-[#444] text-sm">Loading...</p>
		</div>
	{:else if data}
		<div class="p-8 space-y-6 max-w-5xl">
			<!-- KPI cards -->
			<div class="grid grid-cols-5 gap-4">
				{#each [
					{ label: 'Calls', value: data.callCount.toString() },
					{ label: 'Call Cost', value: fmt$(data.totals.total) },
					{ label: 'Talk Time', value: fmtMins(data.totals.minutes) },
					{ label: 'Time Logged', value: fmtMins(data.time.totalMins) },
					{ label: 'Billable Time', value: fmtMins(data.time.billableMins) },
				] as card}
					<div class="rounded-xl border border-[#2a2a2a] bg-[#111111] p-5">
						<p class="text-xs text-[#555] uppercase tracking-widest mb-2">{card.label}</p>
						<p class="text-white text-xl font-semibold">{card.value}</p>
					</div>
				{/each}
			</div>

			<!-- Cost + Outcomes -->
			<div class="grid grid-cols-2 gap-4">
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111111] p-5">
					<p class="text-xs text-[#999] uppercase tracking-widest mb-4">API Cost Breakdown</p>
					<div class="space-y-3">
						{#each [
							{ label: 'Twilio (calling)', cost: data.totals.twilio },
							{ label: 'Groq (transcription)', cost: data.totals.groq },
							{ label: 'Claude (AI summary)', cost: data.totals.claude },
						] as row}
							<div class="flex items-center justify-between">
								<p class="text-sm text-white">{row.label}</p>
								<p class="text-sm" style="font-family