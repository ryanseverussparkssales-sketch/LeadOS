<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { apiFetch } from '$lib/api';

	let open = $state(false);
	let query = $state('');
	let results = $state<{
		contacts: {id:string;name:string;company:string;phone:string;contact_type:string}[];
		calls: {id:string;created_at:string;summary:string|null;outcome:string|null;contact:{name:string;company:string}|null}[];
		campaigns: {id:string;name:string;project:{name:string;client:{name:string}}}[];
		scripts: {id:string;title:string}[];
		deals: {id:string;title:string;stage:string;value:number;contact:{name:string}|null}[];
	} | null>(null);
	let loading = $state(false);
	let selectedIdx = $state(0);
	let searchEl = $state<HTMLInputElement | undefined>(undefined);
	let debounce: ReturnType<typeof setTimeout> | null = null;

	const TYPE_COLORS: Record<string,string> = { lead:'text-blue-400', prospect:'text-yellow-400', customer:'text-[var(--accent)]', creator:'text-pink-400', partner:'text-[var(--accent)]', vendor:'text-[#888]' };
	const STAGE_COLORS: Record<string,string> = { prospect:'text-[#8a8a8a]', qualified:'text-blue-400', demo:'text-yellow-400', proposal:'text-orange-400', negotiation:'text-[var(--accent)]', won:'text-[var(--accent)]', lost:'text-red-400' };

	function openPalette() { open = true; query = ''; results = null; setTimeout(() => searchEl?.focus(), 50); }
	function closePalette() { open = false; query = ''; results = null; selectedIdx = 0; }

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); open ? closePalette() : openPalette(); }
		if (!open) return;
		if (e.key === 'Escape') closePalette();
		if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(selectedIdx + 1, allResults.length - 1); }
		if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx = Math.max(selectedIdx - 1, 0); }
		if (e.key === 'Enter' && allResults[selectedIdx]) { navigateTo(allResults[selectedIdx]); }
	}

	function navigateTo(item: ResultItem) {
		closePalette();
		if (item.href) goto(item.href);
	}

	interface ResultItem { label: string; sub: string; badge?: string; badgeColor?: string; href: string; category: string; }

	const allResults = $derived.by(() => {
		if (!results) return [];
		const items: ResultItem[] = [];
		for (const c of results.contacts) items.push({ label: c.name, sub: c.company || c.phone, badge: c.contact_type, badgeColor: TYPE_COLORS[c.contact_type], href: `/contacts/${c.id}`, category: 'Contacts' });
		for (const d of results.deals) items.push({ label: d.title, sub: d.contact?.name ?? `$${d.value}`, badge: d.stage, badgeColor: STAGE_COLORS[d.stage], href: `/pipeline?deal=${d.id}`, category: 'Deals' });
		for (const c of results.campaigns) items.push({ label: c.name, sub: `${c.project?.client?.name} › ${c.project?.name}`, href: `/campaigns?select=${c.id}`, category: 'Campaigns' });
		for (const s of results.scripts) items.push({ label: s.title, sub: 'Script', href: `/scripts`, category: 'Scripts' });
		for (const c of results.calls) items.push({ label: c.contact?.name ?? 'Unknown', sub: c.summary?.slice(0, 60) ?? c.outcome ?? 'Call', href: `/calls`, category: 'Calls' });
		return items;
	});

	async function search(q: string) {
		if (q.length < 2) { results = null; return; }
		loading = true;
		const res = await apiFetch(`/api/search?q=${encodeURIComponent(q)}`);
		if (res.ok) results = await res.json();
		loading = false;
		selectedIdx = 0;
	}

	function onInput() {
		if (debounce) clearTimeout(debounce);
		debounce = setTimeout(() => search(query), 200);
	}

	function handleSearchEvent() { openPalette(); }

	onMount(() => {
		window.addEventListener('keydown', handleKeydown);
		window.addEventListener('leados:search', handleSearchEvent);
		return () => {
			window.removeEventListener('keydown', handleKeydown);
			window.removeEventListener('leados:search', handleSearchEvent);
		};
	});
</script>

<!-- Trigger hint -->
<button onclick={openPalette}
	class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-xs text-[#7c7c7c] hover:text-white hover:border-[#444] transition-colors w-full">
	<span>Search...</span>
	<span class="ml-auto font-mono text-[#333]">⌘K</span>
</button>

<!-- Modal -->
{#if open}
	<div class="fixed inset-0 bg-black/60 z-[100] flex items-start justify-center pt-24"
		onclick={closePalette} role="dialog" aria-modal="true">
		<div class="w-[580px] bg-[#111111] border border-[#2a2a2a] rounded-xl shadow-2xl overflow-hidden"
			onclick={(e) => e.stopPropagation()}>

			<!-- Search input -->
			<div class="flex items-center gap-3 px-4 py-3 border-b border-[#1e1e1e]">
				<svg class="text-[#7c7c7c] shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
				</svg>
				<input
					bind:this={searchEl}
					bind:value={query}
					oninput={onInput}
					placeholder="Search contacts, deals, campaigns, scripts..."
					class="flex-1 bg-transparent text-white text-sm placeholder-[#444] focus:outline-none"
				/>
				{#if loading}<span class="text-xs text-[#6e6e6e] shrink-0">Searching...</span>{/if}
				<kbd class="text-xs text-[#333] border border-[#2a2a2a] rounded px-1.5 py-0.5 shrink-0">Esc</kbd>
			</div>

			<!-- Results -->
			<div class="max-h-80 overflow-y-auto">
				{#if query.length < 2}
					<p class="text-xs text-[#6e6e6e] text-center py-8">Type at least 2 characters to search</p>
				{:else if allResults.length === 0 && !loading}
					<p class="text-xs text-[#6e6e6e] text-center py-8">No results for "{query}"</p>
				{:else}
					{#each allResults as item, i}
						<button onclick={() => navigateTo(item)}
							class="w-full text-left flex items-center gap-3 px-4 py-3 border-b border-[#1a1a1a] transition-colors {selectedIdx === i ? 'bg-white/10' : 'hover:bg-white/5'}">
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2">
									<p class="text-sm text-white truncate">{item.label}</p>
									{#if item.badge}<span class="text-xs {item.badgeColor ?? 'text-[#7c7c7c]'} capitalize">{item.badge}</span>{/if}
								</div>
								<p class="text-xs text-[#7c7c7c] truncate">{item.sub}</p>
							</div>
							<span class="text-xs text-[#333] shrink-0">{item.category}</span>
						</button>
					{/each}
				{/if}
			</div>
		</div>
	</div>
{/if}
