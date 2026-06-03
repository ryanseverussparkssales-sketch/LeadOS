<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { apiFetch } from '$lib/api';
	import { supabase } from '$lib/services/auth';

	let data = $state<any>(null);
	let loading = $state(true);
	let lastRefresh = $state('');
	let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

	async function load() {
		const r = await apiFetch('/api/agency');
		if (r.ok) data = await r.json();
		lastRefresh = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		loading = false;
	}

	onMount(() => {
		load();

		// Supabase realtime — re-load stats whenever a call is inserted or updated
		// This replaces the 60s poll with instant updates on new calls/wins
		realtimeChannel = supabase
			.channel('agency-calls-realtime')
			.on('postgres_changes', {
				event: '*',
				schema: 'public',
				table: 'calls',
			}, () => {
				// Debounce: wait 800ms then reload so rapid call bursts don't spam the API
				clearTimeout((load as any)._debounce);
				(load as any)._debounce = setTimeout(load, 800);
			})
			.subscribe();

		// Fallback 5-minute poll in case realtime drops
		const interval = setInterval(load, 300_000);
		return () => clearInterval(interval);
	});

	onDestroy(() => {
		if (realtimeChannel) supabase.removeChannel(realtimeChannel);
	});

	function fmtDur(s: number | null) {
		if (!s) return '—';
		return `${Math.floor(s/60)}m ${s%60}s`;
	}

	const WIN_LABEL: Record<string,string> = {
		appointment_set: '📅 Appointment', demo_scheduled: '🖥 Demo',
		meeting_confirmed: '✓ Meeting', signed_up: '🎉 Signed Up',
		callback: '🔄 Callback', follow_up_agreed: '↩ Follow Up',
	};
</script>

<svelte:head><title>Agency — LeadOS</title></svelte:head>

<div class="flex flex-col flex-1 h-full overflow-y-auto">
	<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center justify-between shrink-0">
		<div>
			<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Agency Command Center</h2>
			<p class="text-[10px] text-[#444] mt-0.5">Live view of all clients, campaigns, and your team</p>
		</div>
		<div class="flex items-center gap-3">
			{#if lastRefresh}<p class="text-[10px] text-[#333]">Updated {lastRefresh}</p>{/if}
			<button onclick={load} class="text-xs text-[#444] hover:text-white border border-[#2a2a2a] px-3 py-1.5 rounded-lg transition-colors">↺ Refresh</button>
		</div>
	</div>

	{#if loading}
		<div class="flex items-center justify-center flex-1">
			<div class="w-4 h-4 rounded-full bg-white animate-pulse"></div>
		</div>
	{:else if data}
		<div class="p-8 space-y-8 max-w-6xl mx-auto w-full">

			<!-- Today's team totals -->
			<div>
				<p style="font-family:var(--font-label);font-size:9px;letter-spacing:.2em;color:var(--c-text-faint);margin-bottom:16px">Today — Full Team</p>
				<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
					{#each [
						{ label: 'Dials',        value: data.teamTotals.dials,                      color: 'text-white' },
						{ label: 'Connect Rate', value: `${data.teamTotals.connectRate}%`,           color: 'text-blue-400' },
						{ label: 'Appointments', value: data.teamTotals.wins,                       color: 'text-green-400' },
						{ label: 'Answered',     value: data.teamTotals.answered,                   color: 'text-[#888]' },
					] as stat, i}
						<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors stat-value-animate"
							style="animation-delay:{i * 80}ms">
							<p class="text-3xl font-bold {stat.color} tabular-nums" style="letter-spacing:-.03em">{stat.value}</p>
							<p style="font-family:var(--font-label);font-size:9px;letter-spacing:.14em;color:var(--c-text-faint);margin-top:6px">{stat.label.toUpperCase()}</p>
						</div>
					{/each}
				</div>
			</div>

			<div class="grid grid-cols-1 lg:grid-cols-2 gap-8">

				<!-- SDR workload -->
				<div>
					<p class="text-xs text-[#444] uppercase tracking-widest mb-4">SDR Team ({data.sdrStats.length} reps)</p>
					{#if data.sdrStats.length === 0}
						<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-6 text-center hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
							<p class="text-xs text-[#444]">No SDRs yet. Invite your team in <a href="/team" class="underline hover:text-white">Team</a>.</p>
						</div>
					{:else}
						<div class="space-y-2">
							{#each data.sdrStats.sort((a: any, b: any) => b.todayCalls - a.todayCalls) as rep}
								{@const connectRate = rep.todayCalls > 0 ? Math.round((rep.todayAnswered / rep.todayCalls) * 100) : 0}
								{@const needsLeads = rep.queueSize < 10}
								<div class="rounded-xl border {needsLeads ? 'border-yellow-800/30 bg-yellow-950/5' : 'border-[#2a2a2a] bg-[#111]'} p-4">
									<div class="flex items-center justify-between mb-2">
										<div class="flex items-center gap-2">
											<div class="w-7 h-7 rounded-full bg-[#1a1a1a] flex items-center justify-center text-xs font-semibold text-[#666]">
												{rep.member_email[0].toUpperCase()}
											</div>
											<p class="text-sm text-white">{rep.member_email.split('@')[0]}</p>
											{#if needsLeads}
												<span class="text-[9px] text-yellow-400 border border-yellow-800/30 px-1.5 py-0.5 rounded">Needs leads</span>
											{/if}
										</div>
										<p class="text-xs text-[#555]">{rep.queueSize} in queue</p>
									</div>
									<div class="grid grid-cols-3 gap-2 text-center">
										<div>
											<p class="text-sm font-semibold text-white">{rep.todayCalls}</p>
											<p class="text-[9px] text-[#444]">dials</p>
										</div>
										<div>
											<p class="text-sm font-semibold text-blue-400">{connectRate}%</p>
											<p class="text-[9px] text-[#444]">connect</p>
										</div>
										<div>
											<p class="text-sm font-semibold text-green-400">{rep.todayWins}</p>
											<p class="text-[9px] text-[#444]">wins</p>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
					<a href="/agency/pool" class="block mt-3 text-center text-xs text-[#444] hover:text-white border border-[#1a1a1a] rounded-lg py-2 transition-colors">
						📋 Distribute leads to reps →
					</a>
				</div>

				<!-- Clients & campaigns -->
				<div>
					<p class="text-xs text-[#444] uppercase tracking-widest mb-4">Clients ({data.clients.length})</p>
					<div class="space-y-3">
						{#each data.clients as client}
							{@const activeCamps = (client.projects ?? []).flatMap((p: any) => p.campaigns ?? []).filter((c: any) => c.status === 'active')}
							{@const pendingCamps = (client.projects ?? []).flatMap((p: any) => p.campaigns ?? []).filter((c: any) => c.status === 'pending_approval')}
							<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
								<div class="flex items-center justify-between mb-2">
									<p class="text-sm text-white font-medium">{client.name}</p>
									<div class="flex gap-1.5">
										{#if activeCamps.length > 0}
											<span class="text-[9px] bg-green-950 text-green-400 px-1.5 py-0.5 rounded">{activeCamps.length} active</span>
										{/if}
										{#if pendingCamps.length > 0}
											<span class="text-[9px] bg-orange-950 text-orange-400 px-1.5 py-0.5 rounded animate-pulse">{pendingCamps.length} pending</span>
										{/if}
									</div>
								</div>
								{#each activeCamps.slice(0,3) as camp}
									<div class="flex items-center justify-between text-[10px] py-1 border-t border-[#111]">
										<span class="text-[#666] truncate">{camp.name}</span>
										<span class="text-[#444] shrink-0 ml-2">{camp.win_count ?? 0}/{camp.target_wins ?? '—'} wins · {camp.calls_today ?? 0} calls today</span>
									</div>
								{/each}
								{#if pendingCamps.length > 0}
									<a href="/campaigns?status=pending_approval" class="block mt-1 text-[9px] text-yellow-600 hover:text-yellow-400 transition-colors">
										⏳ {pendingCamps.length} campaign{pendingCamps.length > 1 ? 's' : ''} need activation →
									</a>
								{/if}
							</div>
						{/each}
						{#if data.clients.length === 0}
							<div class="rounded-xl border border-[#1a1a1a] bg-[#111] p-6 text-center">
								<p class="text-xs text-[#444]">No clients yet. <a href="/clients" class="underline hover:text-white">Add your first client →</a></p>
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Recent wins feed -->
			{#if data.recentWins.length > 0}
				<div>
					<p class="text-xs text-[#444] uppercase tracking-widest mb-4">Recent Wins — Last 7 days</p>
					<div class="grid grid-cols-1 md:grid-cols-2 gap-2">
						{#each data.recentWins.slice(0,10) as win}
							<div class="rounded-xl border border-[#1a1a1a] bg-[#111] px-4 py-3 flex items-center gap-3">
								<span class="text-sm shrink-0">{WIN_LABEL[win.outcome]?.split(' ')[0] ?? '✓'}</span>
								<div class="flex-1 min-w-0">
									<p class="text-xs text-white truncate">{win.contact?.name ?? 'Unknown'}</p>
									<p class="text-[9px] text-[#444]">{(win.contact?.company ?? '')} · {WIN_LABEL[win.outcome]?.slice(2) ?? win.outcome}</p>
								</div>
								<p class="text-[9px] text-[#333] shrink-0">{new Date(win.created_at).toLocaleDateString()}</p>
							</div>
						{/each}
					</div>
				</div>
			{/if}

		</div>
	{/if}
</div>
