<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';

	// Cross-sell opportunities based on existing contacts
	interface Opportunity {
		contact_id: string;
		contact_name: string;
		company: string | null;
		phone: string;
		product: string;
		reason: string;
		score: number; // 1-3 priority
	}

	let opportunities = $state<Opportunity[]>([]);
	let loading = $state(true);
	let selectedProduct = $state('all');

	const PRODUCTS = [
		{ key: 'windows',    label: 'Windows',       icon: '🪟' },
		{ key: 'doors',      label: 'Doors',         icon: '🚪' },
		{ key: 'switches',   label: 'Light Switches', icon: '💡' },
		{ key: 'smart_home', label: 'Smart Home',     icon: '🏠' },
	];

	// Cross-sell logic: scan contacts for signals
	const CROSS_SELL_RULES = [
		{
			product: 'windows',
			label: 'Windows',
			icon: '🪟',
			signals: ['window', 'draft', 'cold', 'energy', 'glass', 'broken window', 'old house', 'renovation'],
			tagSignals: ['homeowner', 'remodel', 'home-improvement'],
		},
		{
			product: 'doors',
			label: 'Doors',
			icon: '🚪',
			signals: ['door', 'entry', 'security', 'front door', 'back door', 'patio', 'garage', 'renovation'],
			tagSignals: ['homeowner', 'remodel'],
		},
		{
			product: 'switches',
			label: 'Light Switches',
			icon: '💡',
			signals: ['electric', 'light', 'switch', 'outlet', 'wiring', 'electrical', 'breaker'],
			tagSignals: ['electrician', 'home-improvement', 'smart-home'],
		},
		{
			product: 'smart_home',
			label: 'Smart Home',
			icon: '🏠',
			signals: ['smart', 'alexa', 'google home', 'automation', 'iotty', 'connected', 'app control', 'voice control'],
			tagSignals: ['tech', 'smart-home', 'early-adopter'],
		},
	];

	onMount(async () => {
		// Load recent contacts with notes/tags for signal detection
		const r = await apiFetch('/api/contacts/filtered?limit=100&status=active');
		if (r.ok) {
			const d = await r.json();
			const contacts = d.data ?? d ?? [];
			const opps: Opportunity[] = [];

			for (const contact of contacts) {
				const searchText = [
					contact.notes ?? '',
					contact.company ?? '',
					contact.title ?? '',
					...(contact.tags?.map((t: any) => t.name ?? t) ?? []),
				].join(' ').toLowerCase();

				for (const rule of CROSS_SELL_RULES) {
					const signalMatch = rule.signals.find(s => searchText.includes(s));
					const tagMatch = rule.tagSignals.find(t => searchText.includes(t));

					if (signalMatch || tagMatch) {
						opps.push({
							contact_id: contact.id,
							contact_name: contact.name,
							company: contact.company,
							phone: contact.phone,
							product: rule.product,
							reason: signalMatch
								? `Notes mention "${signalMatch}"`
								: `Tagged as "${tagMatch}"`,
							score: tagMatch && signalMatch ? 3 : signalMatch ? 2 : 1,
						});
					}
				}
			}

			// Sort by score desc, dedupe (one opp per contact per product)
			const seen = new Set<string>();
			opportunities = opps
				.sort((a, b) => b.score - a.score)
				.filter(o => {
					const key = `${o.contact_id}-${o.product}`;
					if (seen.has(key)) return false;
					seen.add(key);
					return true;
				})
				.slice(0, 20);
		}
		loading = false;
	});

	const filtered = $derived(
		selectedProduct === 'all'
			? opportunities
			: opportunities.filter(o => o.product === selectedProduct)
	);

	const countByProduct = $derived(
		PRODUCTS.map(p => ({ ...p, count: opportunities.filter(o => o.product === p.key).length }))
	);
</script>

<div class="flex flex-col h-full bg-[var(--c-surface-1)] rounded-xl overflow-hidden">
	<div class="flex items-center justify-between px-4 pt-4 pb-2">
		<p class="text-xs text-[var(--c-text-muted)] uppercase tracking-widest font-semibold">Cross-Sell Leads</p>
		<span class="text-[10px] text-[#444]">{opportunities.length} opportunities</span>
	</div>

	<!-- Product filter tabs -->
	<div class="flex gap-1 px-3 pb-2 flex-wrap">
		<button onclick={() => selectedProduct = 'all'}
			class="px-2 py-1 rounded-lg text-[10px] transition-colors {selectedProduct === 'all' ? 'bg-white/15 text-white' : 'text-[#555] hover:text-white'}">
			All ({opportunities.length})
		</button>
		{#each countByProduct as p}
			{#if p.count > 0}
				<button onclick={() => selectedProduct = p.key}
					class="px-2 py-1 rounded-lg text-[10px] transition-colors {selectedProduct === p.key ? 'bg-white/15 text-white' : 'text-[#555] hover:text-white'}">
					{p.icon} {p.label} ({p.count})
				</button>
			{/if}
		{/each}
	</div>

	<!-- Opportunity list -->
	<div class="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
		{#if loading}
			{#each [1,2,3] as _}
				<div class="h-12 bg-[#111] rounded-lg animate-pulse"></div>
			{/each}
		{:else if filtered.length === 0}
			<div class="text-center py-8">
				<p class="text-[10px] text-[#333]">No cross-sell signals detected yet</p>
				<p class="text-[9px] text-[#222] mt-1">Signals come from contact notes and tags</p>
			</div>
		{:else}
			{#each filtered as opp}
				{@const product = PRODUCTS.find(p => p.key === opp.product)}
				<a href="/contacts/{opp.contact_id}"
					class="flex items-center gap-2 rounded-lg border border-[#1a1a1a] bg-[#111] px-3 py-2 hover:border-[#2a2a2a] transition-colors group">
					<span class="text-base shrink-0">{product?.icon ?? '📦'}</span>
					<div class="flex-1 min-w-0">
						<p class="text-xs text-white truncate group-hover:text-white">{opp.contact_name}</p>
						<p class="text-[9px] text-[#444] truncate">{opp.reason}</p>
					</div>
					<div class="flex items-center gap-1 shrink-0">
						{#each Array(opp.score) as _}
							<div class="w-1 h-1 rounded-full bg-green-500"></div>
						{/each}
					</div>
				</a>
			{/each}
		{/if}
	</div>
</div>
