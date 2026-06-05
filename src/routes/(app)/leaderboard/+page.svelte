<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';

	type Period = 'today' | 'week' | 'month' | 'all';
	let period = $state<Period>('month');
	let loading = $state(true);

	interface Agent { id:string; email:string; role:string; totalCalls:number; answered:number; callbacks:number; answerRate:number; callbackRate:number; avgDuration:number; avgQuality:number|null; callsPerHour:number|null; }
	interface BestHour { day:number; hour:number; total:number; answered:number; answerRate:number; avgDuration:number; }
	let agents = $state<Agent[]>([]);
	let bestHours = $state<BestHour[]>([]);

	const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
	const PERIOD_LABELS: Record<Period,string> = { today:'Today', week:'This Week', month:'This Month', all:'All Time' };

	onMount(() => load());

	async function load() {
		loading = true;
		const [lr, btr] = await Promise.all([apiFetch(`/api/leaderboard?period=${period}`), apiFetch('/api/analytics/best-times')]);
		if (lr.ok) { const d = await lr.json(); agents = d.agents; }
		if (btr.ok) { const d = await btr.json(); bestHours = d.bestHours; }
		loading = false;
	}

	function fmtDur(s: number) { return s >= 60 ? `${Math.floor(s/60)}m ${s%60}s` : `${s}s`; }
	function medal(i: number) { return ['🥇','🥈','🥉'][i] ?? `${i+1}`; }

	function qualityColor(q: number | null) {
		if (!q) return 'text-[#444]';
		if (q >= 8) return 'text-[var(--accent)]';
		if (q >= 6) return 'text-yellow-400';
		return 'text-red-400';
	}
</script>

<svelte:head><title>Leaderboard — RogueOS</title></svelte:head>

<div class="flex flex-col flex-1 h-full overflow-y-auto">
	<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center justify-between">
		<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Team Leaderboard</h2>
		<div class="flex gap-1">
			{#each (['today','week','month','all'] as Period[]) as p}
				<button onclick={() => { period = p; load(); }}
					class="rounded-lg px-3 py-1.5 text-xs transition-colors {period === p ? 'bg-white/10 text-white' : 'text-[#666] hover:text-white'}">
					{PERIOD_LABELS[p]}
				</button>
			{/each}
		</div>
	</div>

	<div class="p-8 space-y-6 max-w-4xl">
		{#if loading}
		<div class="p-8 space-y-3">
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
		</div>
	{:else}
			<!-- Agent rankings -->
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111111] overflow-hidden">
				<div class="px-6 py-3 border-b border-[#1e1e1e] grid grid-cols-7 text-xs text-[#555] uppercase tracking-widest">
					<span class="col-span-2">Agent</span>
					<span class="text-right">Calls</span>
					<span class="text-right">Answer %</span>
					<span class="text-right">Callback %</span>
					<span class="text-right">Avg Duration</span>
					<span class="text-right">Quality</span>
				</div>
				{#each agents as agent, i}
					<div class="px-6 py-4 border-b border-[#1e1e1e] last:border-0 grid grid-cols-7 items-center">
						<div class="col-span-2 flex items-center gap-3">
							<span class="text-lg w-6 text-center">{medal(i)}</span>
							<div>
								<p class="text-sm text-white truncate">{agent.email}</p>
								<p class="text-xs text-[#444] capitalize">{agent.role}</p>
							</div>
						</div>
						<p class="text-right text-white font-semibold">{agent.totalCalls}</p>
						<p class="text-right {agent.answerRate >= 30 ? 'text-[var(--accent)]' : agent.answerRate >= 15 ? 'text-yellow-400' : 'text-[#666]'}">{agent.answerRate}%</p>
						<p class="text-right text-[#888]">{agent.callbackRate}%</p>
						<p class="text-right text-[#666]">{agent.avgDuration ? fmtDur(agent.avgDuration) : '—'}</p>
						<p class="text-right {qualityColor(agent.avgQuality)}">{agent.avgQuality ?? '—'}</p>
					</div>
				{/each}
				{#if agents.length === 0}
					<p class="text-[#444] text-sm text-center py-8">No calls in this period</p>
				{/if}
			</div>

			<!-- Best times to call -->
			{#if bestHours.length > 0}
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111111] p-5">
					<p class="text-xs text-[#999] uppercase tracking-widest mb-4">Best Times to Call (based on your history)</p>
					<div class="space-y-2">
						{#each bestHours as slot}
							<div class="flex items-center gap-4">
								<p class="text-sm text-white w-32 shrink-0">{DAYS[slot.day]} {slot.hour}:00–{slot.hour+1}:00</p>
								<div class="flex-1 h-2 rounded-full bg-[#1a1a1a]">
									<div class="h-full rounded-full bg-[var(--accent)]/60" style="width:{slot.answerRate}%"></div>
								</div>
								<p class="text-sm text-[var(--accent)] w-12 text-right shrink-0">{slot.answerRate}%</p>
								<p class="text-xs text-[#444] w-16 text-right shrink-0">{slot.total} calls</p>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>
