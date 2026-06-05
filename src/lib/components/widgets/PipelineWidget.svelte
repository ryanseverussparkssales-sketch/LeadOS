<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';

	interface Deal { stage:string; value:number; probability:number; }
	let deals = $state<Deal[]>([]);
	const STAGES = ['prospect','qualified','demo','proposal','negotiation'];
	const COLORS: Record<string,string> = { prospect:'#6b7280', qualified:'#3b82f6', demo:'#eab308', proposal:'#f97316', negotiation:'#a855f7' };

	onMount(async () => {
		const res = await apiFetch('/api/deals');
		if (res.ok) deals = await res.json();
	});

	const weighted = $derived(deals.filter(d => !['won','lost'].includes(d.stage)).reduce((s,d) => s + d.value * d.probability / 100, 0));
	const total = $derived(deals.filter(d => !['won','lost'].includes(d.stage)).reduce((s,d) => s + d.value, 0));
	const won = $derived(deals.filter(d => d.stage === 'won').reduce((s,d) => s + d.value, 0));
	function stageCount(s: string) { return deals.filter(d => d.stage === s).length; }
	function fmt$(n: number) { return n >= 1000 ? `$${(n/1000).toFixed(0)}k` : `$${n}`; }
</script>

<div class="space-y-3 h-full">
	<div class="grid grid-cols-2 gap-2">
		<div class="rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] p-2.5">
			<p class="text-xs text-[#555] mb-0.5">Weighted</p>
			<p class="text-white text-base font-semibold">{fmt$(Math.round(weighted))}</p>
		</div>
		<div class="rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] p-2.5">
			<p class="text-xs text-[#555] mb-0.5">Won</p>
			<p class="text-[var(--accent)] text-base font-semibold">{fmt$(won)}</p>
		</div>
	</div>
	<div class="space-y-1.5">
		{#each STAGES as stage}
			<div class="flex items-center gap-2">
				<div class="w-2 h-2 rounded-full shrink-0" style="background-color:{COLORS[stage]}"></div>
				<p class="text-xs text-[#666] flex-1 capitalize">{stage}</p>
				<p class="text-xs text-white">{stageCount(stage)}</p>
			</div>
		{/each}
	</div>
	<a href="/pipeline" class="block text-xs text-[#444] hover:text-white text-center">Open pipeline →</a>
</div>
