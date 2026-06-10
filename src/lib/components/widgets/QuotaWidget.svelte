<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';

	interface Quota { quota_type:string; target_value:number; period:string; period_start:string; period_end:string; }
	let quotas = $state<Quota[]>([]);
	let callCount = $state(0);
	let revenue = $state(0);

	onMount(async () => {
		const [qr, ar] = await Promise.all([apiFetch('/api/quotas'), apiFetch('/api/analytics?period=month')]);
		if (qr.ok) quotas = await qr.json();
		if (ar.ok) { const d = await ar.json(); callCount = d.callCount ?? 0; revenue = d.totals?.total ?? 0; }
	});

	function pct(current: number, target: number) { return Math.min(100, Math.round(current / target * 100)); }
	function color(p: number) { return p >= 100 ? 'bg-[var(--accent)]' : p >= 70 ? 'bg-yellow-400' : 'bg-white/30'; }
	function fmt$(n: number) { return n >= 1000 ? `$${(n/1000).toFixed(0)}k` : `$${n}`; }
</script>

<div class="space-y-3 h-full">
	{#if quotas.length === 0}
		<div class="flex items-center justify-center h-full">
			<div class="text-center">
				<p class="text-xs text-[#6e6e6e]">No quotas set</p>
				<a href="/settings" class="text-xs text-[#7c7c7c] underline hover:text-white">Set quotas in Settings →</a>
			</div>
		</div>
	{:else}
		{#each quotas as quota}
			{@const current = quota.quota_type === 'calls' ? callCount : revenue}
			{@const p = pct(current, quota.target_value)}
			<div>
				<div class="flex items-center justify-between mb-1">
					<p class="text-xs text-[#888] capitalize">{quota.quota_type} quota</p>
					<p class="text-xs text-white font-medium">{quota.quota_type === 'revenue' ? fmt$(Math.round(current)) : current} / {quota.quota_type === 'revenue' ? fmt$(quota.target_value) : quota.target_value}</p>
				</div>
				<div class="h-2 rounded-full bg-[#1a1a1a] overflow-hidden">
					<div class="h-full rounded-full transition-all {color(p)}" style="width:{p}%"></div>
				</div>
				<p class="text-xs text-[#6e6e6e] mt-0.5 text-right">{p}% of monthly quota</p>
			</div>
		{/each}
	{/if}
</div>
