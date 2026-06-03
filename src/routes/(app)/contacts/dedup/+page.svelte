<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';

	interface Contact { id:string; name:string; phone:string; company:string; phone_normalized:string; }
	let groups = $state<Contact[][]>([]);
	let loading = $state(true);
	let merging = $state<string|null>(null);

	onMount(load);

	async function load() {
		loading = true;
		const res = await apiFetch('/api/contacts/duplicates');
		groups = res.ok ? (await res.json()).groups : [];
		loading = false;
	}

	async function merge(primaryId: string, mergeId: string) {
		merging = mergeId;
		const res = await apiFetch('/api/contacts/merge', { method:'POST', body: JSON.stringify({ primaryId, mergeId }) });
		if (res.ok) {
			await load();
		}
		merging = null;
	}
</script>

<svelte:head><title>Find Duplicates — LeadOS</title></svelte:head>

<div class="flex flex-col flex-1 h-full overflow-y-auto">
	<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center gap-4">
		<a href="/contacts" class="text-xs text-[#555] hover:text-white">← Back</a>
		<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Duplicate Contacts</h2>
		<span class="text-xs text-[#444]">{groups.length} groups found</span>
	</div>

	<div class="p-8 max-w-3xl space-y-4">
		{#if loading}
			<p class="text-[#444] text-sm">Scanning for duplicates...</p>
		{:else if groups.length === 0}
			<div class="rounded-xl border border-[#2a2a2a] p-10 text-center">
				<p class="text-white text-sm">No duplicates found ✓</p>
				<p class="text-[#444] text-xs mt-1">All contacts have unique phone numbers</p>
			</div>
		{:else}
			{#each groups as group}
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111111] p-5">
					<p class="text-xs text-[#555] uppercase tracking-widest mb-3">Same phone: {group[0]?.phone_normalized}</p>
					<div class="space-y-2">
						{#each group as contact, i}
							<div class="flex items-center gap-3 rounded-lg border border-[#1e1e1e] p-3">
								<div class="flex-1">
									<p class="text-sm text-white">{contact.name}</p>
									<p class="text-xs text-[#555]">{contact.company || '—'} · {contact.phone}</p>
								</div>
								{#if i > 0}
									<button onclick={() => merge(group[0].id, contact.id)} disabled={merging === contact.id}
										class="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#999] hover:border-red-800 hover:text-red-400 disabled:opacity-40 transition-colors">
										{merging === contact.id ? 'Merging...' : 'Merge into first'}
									</button>
								{:else}
									<span class="text-xs text-green-400 px-3">Keep</span>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>
