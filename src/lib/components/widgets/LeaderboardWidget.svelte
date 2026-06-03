<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';

	interface Agent { email:string; totalCalls:number; answerRate:number; avgQuality:number|null; }
	let agents = $state<Agent[]>([]);

	onMount(async () => {
		const res = await apiFetch('/api/leaderboard?period=month');
		if (res.ok) { const d = await res.json(); agents = d.agents?.slice(0,5) ?? []; }
	});

	const MEDALS = ['🥇','🥈','🥉'];
</script>

<div class="space-y-2 h-full overflow-y-auto">
	{#if agents.length === 0}
		<p class="text-xs text-[#444] text-center py-4">No team data yet</p>
	{:else}
		{#each agents as agent, i}
			<div class="flex items-center gap-2">
				<span class="text-sm w-5">{MEDALS[i] ?? `${i+1}`}</span>
				<div class="flex-1 min-w-0">
					<p class="text-xs text-white truncate">{agent.email}</p>
					<p class="text-xs text-[#555]">{agent.totalCalls} calls · {agent.answerRate}% answer</p>
				</div>
				{#if agent.avgQuality}
					<p class="text-xs {agent.avgQuality >= 8 ? 'text-green-400' : 'text-yellow-400'} shrink-0">{agent.avgQuality}</p>
				{/if}
			</div>
		{/each}
		<a href="/leaderboard" class="block text-xs text-[#444] hover:text-white text-center pt-1">Full leaderboard →</a>
	{/if}
</div>
