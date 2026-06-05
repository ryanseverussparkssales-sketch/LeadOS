<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';

	type Period = 'month' | 'quarter' | 'year';
	let period = $state<Period>('month');
	let loading = $state(true);
	let data = $state<{
		wonCount:number; lostCount:number; winRate:number; wonRevenue:number; avgDealSize:number;
		lostReasons:[string,number][]; monthly:{month:string;won:number;lost:number;revenue:number}[];
	}|null>(null);

	onMount(() => load());
	async function load() {
		loading = true;
		const res = await apiFetch(`/api/analytics/win-loss?period=${period}`);
		data = res.ok ? await res.json() : null;
		loading = false;
	}

	function fmt$(n: number) { return n >= 1000 ? `$${(n/1000).toFixed(0)}k` : `$${n}`; }
	const PERIOD_LABELS: Record<Period,string> = { month:'This Month', quarter:'This Quarter', year:'This Year' };
</script>

<svelte:head><title>Win/Loss — Edelhaus</title></svelte:head>

<div class="flex flex-col flex-1 h-full overflow-y-auto">
	<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center justify-between">
		<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Win/Loss Analysis</h2>
		<div class="flex gap-1">
			{#each (['month','quarter','year'] as Period[]) as p}
				<button onclick={() => { period = p; load(); }} class="rounded-lg px-3 py-1.5 text-xs transition-colors {period === p ? 'bg-white/10 text-white' : 'text-[#666] hover:text-white'}">{PERIOD_LABELS[p]}</button>
			{/each}
		</div>
	</div>

	{#if loading}
		<div class="p-8 space-y-3">
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
		</div>
	{:else if data}
		<div class="p-8 space-y-6 max-w-4xl">
			<!-- KPIs -->
			<div class="grid grid-cols-5 gap-4">
				{#each [
					{ label:'Win Rate', value: data.winRate + '%', color: data.winRate >= 30 ? 'text-[var(--accent)]' : data.winRate >= 15 ? 'text-yellow-400' : 'text-red-400' },
					{ label:'Deals Won', value: data.wonCount.toString(), color:'text-[var(--accent)]' },
					{ label:'Deals Lost', value: data.lostCount.toString(), color:'text-red-400' },
					{ label:'Revenue Won', value: fmt$(data.wonRevenue), color:'text-white' },
					{ label:'Avg Deal Size', value: fmt$(Math.round(data.avgDealSize)), color:'text-white' },
				] as kpi}
					<div class="rounded-xl border border-[#2a2a2a] bg-[#111111] p-4">
						<p class="text-xs text-[#555] mb-1">{kpi.label}</p>
						<p class="text-xl font-semibold {kpi.color}">{kpi.value}</p>
					</div>
				{/each}
			</div>

			<!-- Lost Reasons -->
			{#if data.lostReasons.length > 0}
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111111] p-5">
					<p class="text-xs text-[#999] uppercase tracking-widest mb-4">Lost Reasons</p>
					<div class="space-y-2">
						{#each data.lostReasons as [reason, count]}
							<div class="flex items-center gap-4">
								<p class="text-sm text-white flex-1 capitalize">{reason}</p>
								<p class="text-sm font-medium text-red-400 w-8 text-right">{count}</p>
								<div class="w-32 h-1.5 rounded-full bg-[#1a1a1a]">
									<div class="h-full rounded-full bg-red-500/50" style="width:{data.lostCount ? (count/data.lostCount*100).toFixed(0) : 0}%"></div>
								</div>
								<p class="text-xs text-[#444] w-8">{data.lostCount ? (count/data.lostCount*100).toFixed(0) : 0}%</p>
							</div>
						{/each}
					</div>
				</div>
			{:else}
				<div class="rounded-xl border border-[#1e1e1e] p-8 text-center">
					<p class="text-[#444] text-sm">No losses recorded yet — or lost reason wasn't captured</p>
					<p class="text-[#333] text-xs mt-1">When you mark a deal as Lost, add a reason to see it here</p>
				</div>
			{/if}

			<!-- Monthly trend -->
			{#if data.monthly.length > 0}
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111111] p-5">
					<p class="text-xs text-[#999] uppercase tracking-widest mb-4">Monthly Trend</p>
					<table class="w-full text-sm">
						<thead><tr class="border-b border-[#1e1e1e]">
							<th class="text-left text-xs text-[#555] font-medium py-2">Month</th>
							<th class="text-right text-xs text-[#555] font-medium py-2 text-[var(--accent)]">Won</th>
							<th class="text-right text-xs text-[#555] font-medium py-2 text-red-400">Lost</th>
							<th class="text-right text-xs text-[#555] font-medium py-2">Revenue</th>
							<th class="text-right text-xs text-[#555] font-medium py-2">Win %</th>
						</tr></thead>
						<tbody>
							{#each data.monthly as row}
								<tr class="border-b border-[#1a1a1a]">
									<td class="py-2 text-[#888]">{row.month}</td>
									<td class="py-2 text-right text-[var(--accent)]">{row.won}</td>
									<td class="py-2 text-right text-red-400">{row.lost}</td>
									<td class="py-2 text-right text-white">{fmt$(row.revenue)}</td>
									<td class="py-2 text-right text-[#666]">{row.won+row.lost ? Math.round(row.won/(row.won+row.lost)*100) : 0}%</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	{/if}
</div>
