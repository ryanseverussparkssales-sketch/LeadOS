<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';
	import { toastSuccess, toastError } from '$lib/stores/toast';

	interface FlaggedContact {
		id:string; name:string; phone:string; company:string; title:string; email:string|null;
		own_pipeline_notes:string|null; own_pipeline_product:string|null; own_pipeline_flagged_at:string;
		tags:{id:string;name:string;color:string}[];
	}

	let contacts = $state<FlaggedContact[]>([]);
	let loading = $state(true);
	let filterProduct = $state('');

	onMount(async () => {
		const res = await apiFetch('/api/contacts/flag-own');
		contacts = res.ok ? await res.json() : [];
		loading = false;
	});

	async function unflag(id: string) {
		if (!confirm('Remove this contact from your personal leads?')) return;
		const res = await apiFetch('/api/contacts/flag-own', { method:'POST', body: JSON.stringify({ contactId: id, flagged: false }) });
		if (res.ok) {
			contacts = contacts.filter(c => c.id !== id);
			toastSuccess('Removed from your leads');
		} else {
			toastError('Failed to remove lead');
		}
	}

	const filtered = $derived(
		filterProduct ? contacts.filter(c => c.own_pipeline_product?.toLowerCase().includes(filterProduct.toLowerCase())) : contacts
	);

	const products = $derived([...new Set(contacts.map(c => c.own_pipeline_product).filter(Boolean))]);

	function fmtDate(iso: string) {
		const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
		if (diff === 0) return 'Today';
		if (diff === 1) return 'Yesterday';
		return `${diff} days ago`;
	}
</script>

<svelte:head><title>My Leads — Edelhaus</title></svelte:head>

<div class="flex flex-col flex-1 h-full overflow-y-auto">
	<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center justify-between">
		<div>
			<h2 class="text-white text-sm font-medium flex items-center gap-2">⭐ My Personal Leads <span class="text-[#6e6e6e] text-xs font-normal">({contacts.length})</span></h2>
			<p class="text-xs text-[#7c7c7c] mt-0.5">Contacts flagged as opportunities for your own products while on client campaigns</p>
		</div>
		{#if products.length > 1}
			<select bind:value={filterProduct} class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs text-white focus:border-white focus:outline-none">
				<option value="">All products</option>
				{#each products as p}<option value={p}>{p}</option>{/each}
			</select>
		{/if}
	</div>

	{#if loading}
		<div class="p-8 space-y-3">
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
		</div>
	{:else if filtered.length === 0}
		<div class="flex items-center justify-center py-16 text-center">
			<div>
				<p class="text-4xl mb-4">⭐</p>
				<p class="text-white text-sm font-medium">No personal leads yet</p>
				<p class="text-[#6e6e6e] text-xs mt-1 max-w-xs">While on a call during a client campaign, tap "Flag for My Pipeline" in the post-call screen to track contacts who might also want your own products</p>
			</div>
		</div>
	{:else}
		<div class="divide-y divide-[#1e1e1e]">
			{#each filtered as contact}
				<div class="flex items-start gap-4 px-8 py-5 hover:bg-[#111] transition-colors group">
					<div class="text-xl shrink-0 mt-0.5">⭐</div>
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-3 mb-1">
							<a href="/contacts/{contact.id}" class="text-white font-medium hover:underline">{contact.name}</a>
							{#if contact.own_pipeline_product}
								<span class="text-xs bg-yellow-900/30 text-yellow-400 border border-yellow-800/40 px-2 py-0.5 rounded-full">{contact.own_pipeline_product}</span>
							{/if}
						</div>
						<p class="text-xs text-[#8a8a8a]">{[contact.title, contact.company].filter(Boolean).join(' · ')}</p>
						{#if contact.own_pipeline_notes}
							<p class="text-xs text-[#888] mt-1 italic">"{contact.own_pipeline_notes}"</p>
						{/if}
						<div class="flex items-center gap-3 mt-2">
							{#each contact.tags as tag}
								<span class="text-xs px-1.5 py-0.5 rounded" style="background:{tag.color}20;color:{tag.color}">{tag.name}</span>
							{/each}
						</div>
					</div>
					<div class="text-right shrink-0 space-y-1">
						<p class="text-xs text-[#6e6e6e]">{fmtDate(contact.own_pipeline_flagged_at)}</p>
						<a href="/phone?number={encodeURIComponent(contact.phone)}" class="block text-xs text-[#7c7c7c] hover:text-[var(--accent-hi)] transition-colors">{contact.phone}</a>
						<div class="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-all">
							<a href="/contacts/{contact.id}" class="text-xs text-[#7c7c7c] hover:text-white">View →</a>
							<button onclick={() => unflag(contact.id)} class="text-xs text-red-700 hover:text-red-400">Remove</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
