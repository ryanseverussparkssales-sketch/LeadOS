<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';

	interface Objection { id: string; objection: string; response: string; follow_up: string | null; }
	interface Script { id: string; title: string; opener: string | null; elevator_pitch: string | null; discovery: string | null; closing: string | null; client: { name: string } | null; campaign: { name: string } | null; objections: Objection[]; }

	let scripts = $state<Script[]>([]);
	let selected = $state<Script | null>(null);
	let loading = $state(true);

	onMount(async () => {
		const res = await apiFetch('/api/scripts');
		if (res.ok) {
			scripts = await res.json();
			if (scripts.length) selected = scripts[0];
		}
		loading = false;
	});
</script>

<svelte:head><title>Scripts — RogueOS SDR</title></svelte:head>

<div class="flex flex-1 overflow-hidden">
	<!-- Script list -->
	<div class="w-48 shrink-0 border-r border-[#1e1e1e] overflow-y-auto bg-[#080808]">
		{#if loading}
			<div class="p-4 space-y-2">
				{#each [1,2,3] as _}<div class="h-12 bg-[#111] rounded animate-pulse"></div>{/each}
			</div>
		{:else}
			{#each scripts as s}
				<button onclick={() => selected = s}
					class="w-full text-left px-4 py-3 border-b border-[#111] transition-colors {selected?.id === s.id ? 'bg-white/10' : 'hover:bg-white/5'}">
					<p class="text-xs text-white font-medium truncate">{s.title}</p>
					<p class="text-[10px] text-[#444] mt-0.5">{s.client?.name ?? 'Global'}</p>
				</button>
			{:else}
				<p class="text-xs text-[#444] text-center py-8">No scripts assigned</p>
			{/each}
		{/if}
	</div>

	<!-- Script detail -->
	<div class="flex-1 overflow-y-auto p-6">
		{#if selected}
			<div class="max-w-2xl space-y-5">
				<div>
					<h2 class="text-white text-lg font-semibold">{selected.title}</h2>
					<p class="text-xs text-[#555]">{selected.client?.name ?? 'Global'}{selected.campaign?.name ? ` · ${selected.campaign.name}` : ''}</p>
				</div>

				{#each [['Opener', selected.opener], ['Elevator Pitch', selected.elevator_pitch], ['Discovery', selected.discovery], ['Closing', selected.closing]] as [label, content]}
					{#if content}
						<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
							<p class="text-[10px] text-[#555] uppercase tracking-widest mb-3">{label}</p>
							<p class="text-sm text-[#ccc] leading-relaxed whitespace-pre-wrap">{content}</p>
						</div>
					{/if}
				{/each}

				{#if selected.objections?.length}
					<div>
						<p class="text-xs text-[#555] uppercase tracking-widest mb-3">Objection Handlers</p>
						{#each selected.objections as obj}
							<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 mb-3 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
								<p class="text-sm text-yellow-400 mb-2">"{obj.objection}"</p>
								<p class="text-sm text-[#ccc]">{obj.response}</p>
								{#if obj.follow_up}<p class="text-xs text-[#555] mt-2">↳ {obj.follow_up}</p>{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<div class="flex items-center justify-center h-full">
				<p class="text-xs text-[#444]">Select a script</p>
			</div>
		{/if}
	</div>
</div>
