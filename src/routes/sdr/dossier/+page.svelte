<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';

	interface KnowledgeItem { id: string; title: string; knowledge_type: string; content: string; }
	interface Client { id: string; name: string; industry: string | null; website: string | null; description: string | null; }

	let clients = $state<Client[]>([]);
	let selectedClientId = $state('');
	let knowledge = $state<KnowledgeItem[]>([]);
	let loadingKnowledge = $state(false);

	const TYPE_ICONS: Record<string, string> = {
		general: '📋',
		talking_points: '💬',
		objections: '🛡',
		product: '📦',
		pricing: '💰',
		brand_voice: '🎤',
		materials: '📎',
		icp: '🎯',
		custom: '✏️',
	};

	const TYPE_ORDER = ['brand_voice', 'icp', 'product', 'talking_points', 'objections', 'pricing', 'materials', 'general', 'custom'];

	const selectedClient = $derived(clients.find(c => c.id === selectedClientId) ?? null);

	const groupedKnowledge = $derived(() => {
		const groups: Record<string, KnowledgeItem[]> = {};
		for (const item of knowledge) {
			const type = item.knowledge_type ?? 'general';
			if (!groups[type]) groups[type] = [];
			groups[type].push(item);
		}
		// Return in preferred order
		return TYPE_ORDER
			.filter(t => groups[t]?.length)
			.map(t => ({ type: t, items: groups[t] }));
	});

	onMount(async () => {
		const r = await apiFetch('/api/clients');
		if (r.ok) clients = await r.json();
		if (clients.length) selectedClientId = clients[0].id;
	});

	$effect(() => {
		if (!selectedClientId) return;
		loadingKnowledge = true;
		apiFetch(`/api/client-knowledge?client_id=${selectedClientId}`)
			.then(async r => { if (r.ok) knowledge = await r.json(); })
			.finally(() => { loadingKnowledge = false; });
	});

	function typeLabel(type: string) {
		const MAP: Record<string, string> = {
			brand_voice: 'Brand Voice & Tone', icp: 'Ideal Customer Profile',
			product: 'Product & Service', talking_points: 'Key Talking Points',
			objections: 'Objection Handlers', pricing: 'Pricing',
			materials: 'Materials & Links', general: 'General', custom: 'Notes',
		};
		return MAP[type] ?? type;
	}
</script>

<svelte:head><title>Client Dossier — RogueOS SDR</title></svelte:head>

<div class="flex-1 overflow-hidden flex flex-col">
	<!-- Client selector header -->
	<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center gap-4 bg-[#080808]">
		<p class="text-xs text-[#555] uppercase tracking-widest shrink-0">Client Brief</p>
		<select bind:value={selectedClientId}
			class="flex-1 max-w-xs rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-1.5 text-sm text-white focus:outline-none focus:border-white">
			{#each clients as c}<option value={c.id}>{c.name}</option>{/each}
		</select>
		{#if selectedClient?.website}
			<a href={selectedClient.website} target="_blank" rel="noopener noreferrer"
				class="text-xs text-[#444] hover:text-white transition-colors">↗ Website</a>
		{/if}
	</div>

	<div class="flex-1 overflow-y-auto">
		{#if clients.length === 0 && !loadingKnowledge}
			<div class="flex items-center justify-center h-full text-center px-8">
				<div>
					<p class="text-3xl mb-3">📋</p>
					<p class="text-white text-sm font-medium">No client briefs yet</p>
					<p class="text-xs text-[#555] mt-2">Your manager will add brand guides, talking points, and objection handlers here before campaigns start.</p>
				</div>
			</div>
		{:else if !selectedClientId}
			<div class="flex items-center justify-center h-full">
				<p class="text-xs text-[#444]">Select a client above to view their brief</p>
			</div>
		{:else}
			<!-- Client hero -->
			{#if selectedClient}
				<div class="px-8 py-6 border-b border-[#1e1e1e] bg-[#0a0a0a]">
					<h1 class="text-xl font-semibold text-white">{selectedClient.name}</h1>
					{#if selectedClient.industry}<p class="text-xs text-[#555] mt-0.5">{selectedClient.industry}</p>{/if}
					{#if selectedClient.description}
						<p class="text-sm text-[#888] mt-3 max-w-2xl leading-relaxed">{selectedClient.description}</p>
					{/if}
				</div>
			{/if}

			<!-- Knowledge sections -->
			<div class="px-8 py-6 space-y-8 max-w-3xl">
				{#if loadingKnowledge}
					{#each [1,2,3] as _}
						<div class="space-y-2">
							<div class="h-4 w-32 bg-[#1a1a1a] rounded animate-pulse"></div>
							<div class="h-20 bg-[#111] rounded-xl animate-pulse"></div>
						</div>
					{/each}
				{:else if knowledge.length === 0}
					<div class="text-center py-16">
						<p class="text-3xl mb-3">📋</p>
						<p class="text-white text-sm">No dossier content yet</p>
						<p class="text-xs text-[#555] mt-1">Your manager adds brand guides, talking points, and objection handlers here</p>
					</div>
				{:else}
					{#each groupedKnowledge() as group}
						<div>
							<div class="flex items-center gap-2 mb-3">
								<span class="text-base">{TYPE_ICONS[group.type] ?? '📋'}</span>
								<h2 class="text-xs text-[#666] uppercase tracking-widest font-semibold">{typeLabel(group.type)}</h2>
							</div>
							<div class="space-y-3">
								{#each group.items as item}
									<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-3">
							<p class="text-xs font-semibold text-white mb-1">{item.title}</p>
							<p class="text-xs text-[#888] whitespace-pre-wrap leading-relaxed">{item.content}</p>
						</div>
					{/each}
					</div>
				</div>
			{/each}
			{/if}
		</div>
	{/if}
	</div>
</div>