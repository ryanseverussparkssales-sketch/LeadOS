<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';

	interface Slot { day:number; hour:number; answerRate:number; total:number; }
	let slots = $state<Slot[]>([]);
	const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

	onMount(async () => {
		const res = await apiFetch('/api/analytics/best-times');
		if (res.ok) { const d = await res.json(); slots = d.bestHours?.slice(0,5) ?? []; }
	});
</script>

<div class="space-y-2 h-full overflow-y-auto">
	{#if slots.length === 0}
		<p class="text-xs text-[#6e6e6e] text-center py-4">Make more calls to see patterns</p>
	{:else}
		<p class="text-xs text-[#7c7c7c] mb-2">Based on your call history</p>
		{#each slots as slot}
			<div class="flex items-center gap-3">
				<p class="text-xs text-white w-24 shrink-0">{DAYS[slot.day]} {slot.hour}:00</p>
				<div class="flex-1 h-1.5 rounded-full bg-[#1a1a1a]">
					<div class="h-full rounded-full bg-[var(--accent)]/12" style="width:{slot.answerRate}%"></div>
				</div>
				<p class="text-xs text-[var(--accent)] w-8 text-right shrink-0">{slot.answerRate}%</p>
			</div>
		{/each}
	{/if}
</div>
