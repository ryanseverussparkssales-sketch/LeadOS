<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { apiFetch } from '$lib/api';
	import CSVImport from '$lib/components/CSVImport.svelte';
	import ContactRow from '$lib/components/ContactRow.svelte';
	import type { Contact } from '$lib/stores';

	interface Client { id: string; name: string; }
	interface Project { id: string; name: string; client: Client; }
	interface CallList { id: string; name: string; status: string; project: Project; call_list_contacts: [{count: number}]; }

	let lists = $state<CallList[]>([]);
	let loading = $state(true);
	let contacts = $state<Contact[]>([]);
	let selected = $state<CallList | null>(null);
	let loadingContacts = $state(false);
	let showImport = $state(false);
	let filterClient = $state('');

	// All contacts for "add existing" modal
	let allContacts = $state<Contact[]>([]);
	let showAddExisting = $state(false);
	let addSearch = $state('');
	let selectedToAdd = $state<string[]>([]);

	onMount(async () => {
		await loadLists();
		// Pre-select from URL param
		const idParam = $page.url.searchParams.get('id');
		if (idParam) {
			const found = lists.find(l => l.id === idParam);
			if (found) await selectList(found);
		}
	});

	async function loadLists() {
		const res = await apiFetch('/api/call-lists');
		lists = res.ok ? await res.json() : [];
	}

	async function selectList(list: CallList) {
		selected = list;
		loadingContacts = true;
		const res = await apiFetch(`/api/call-lists/${list.id}/contacts`);
		contacts = res.ok ? await res.json() : [];
		loadingContacts = false;
	}

	async function removeContact(contactId: string) {
		if (!selected) return;
		await apiFetch(`/api/call-lists/${selected.id}/contacts`, {
			method: 'DELETE',
			body: JSON.stringify({ contact_id: contactId }),
		});
		contacts = contacts.filter(c => c.id !== contactId);
	}

	async function loadAllContacts() {
		const res = await apiFetch('/api/contacts/filtered?limit=200');
		if (res.ok) {
			const payload = await res.json();
			// /api/contacts/filtered returns { data: [], total, ... } — not a plain array
			allContacts = Array.isArray(payload) ? payload : (payload.data ?? []);
		} else {
			allContacts = [];
		}
		showAddExisting = true;
	}

	async function addSelectedContacts() {
		if (!selected || !selectedToAdd.length) return;
		await apiFetch(`/api/call-lists/${selected.id}/contacts`, {
			method: 'POST',
			body: JSON.stringify({ contact_ids: selectedToAdd }),
		});
		selectedToAdd = [];
		showAddExisting = false;
		await selectList(selected);
	}

	const filteredAll = $derived(
		addSearch
			? allContacts.filter(c =>
				c.name.toLowerCase().includes(addSearch.toLowerCase()) ||
				c.company?.toLowerCase().includes(addSearch.toLowerCase())
			)
			: allContacts
	);

	const uniqueClients = $derived(
		[...new Map(lists.map(l => [l.project?.client?.id, l.project?.client])).values()].filter(Boolean)
	);

	const filteredLists = $derived(
		filterClient ? lists.filter(l => l.project?.client?.id === filterClient) : lists
	);

	function contactCount(list: CallList) {
		return list.call_list_contacts?.[0]?.count ?? 0;
	}
</script>

<svelte:head><title>Call Lists — LeadOS</title></svelte:head>

<div class="flex flex-col flex-1 h-full">
	<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center gap-4">
		<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Call Lists</h2>
		<select bind:value={filterClient}
			class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs text-white focus:border-white focus:outline-none">
			<option value="">All clients</option>
			{#if !loading}
				{#each uniqueClients as client}
					<option value={client?.id}>{client?.name}</option>
				{/each}
			{/if}
		</select>
	</div>

{#if loading}
	<div class="flex-1 p-8 space-y-3">
		{#each [1,2,3,4,5] as _}
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
		{/each}
	</div>
{:else}

	<div class="flex flex-1 overflow-hidden">
		<!-- List panel -->
		<div class="w-72 shrink-0 border-r border-[#1e1e1e] overflow-y-auto">
			{#each filteredLists as list}
				<button onclick={() => selectList(list)}
					class="w-full text-left px-4 py-3 border-b border-[#1e1e1e] transition-colors {selected?.id === list.id ? 'bg-white/10' : 'hover:bg-white/5'}">
					<p class="text-sm text-white font-medium truncate">{list.name}</p>
					<p class="text-xs text-[#555] mt-0.5">{list.project?.client?.name} › {list.project?.name}</p>
					<p class="text-xs text-[#444] mt-0.5">{contactCount(list)} contacts</p>
				</button>
			{:else}
				<p class="text-center text-[#444] text-xs py-8">No call lists — create from Projects view</p>
			{/each}
		</div>

		<!-- Detail panel -->
		<div class="flex-1 flex flex-col overflow-hidden">
			{#if selected}
				<!-- Header -->
				<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center justify-between">
					<div>
						<p class="text-white text-sm font-medium">{selected.name}</p>
						<p class="text-xs text-[#555]">{selected.project?.client?.name} › {selected.project?.name}</p>
					</div>
					<div class="flex gap-2">
						<button onclick={loadAllContacts}
							class="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#999] hover:border-white hover:text-white transition-colors">
							+ Add Existing
						</button>
						<button onclick={() => showImport = !showImport}
							class="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#999] hover:border-white hover:text-white transition-colors">
							{showImport ? 'Hide Import' : '+ Import CSV'}
						</button>
					</div>
				</div>

				{#if showImport}
					<div class="border-b border-[#1e1e1e] p-6 bg-[#0d0d0d]">
						<CSVImport />
					</div>
				{/if}

				<!-- Contacts in list -->
				<div class="flex-1 overflow-y-auto">
					{#if loadingContacts}
						<div class="flex items-center justify-center py-16">
							<p class="text-[#444] text-sm">Loading...</p>
						</div>
					{:else if contacts.length === 0}
						<div class="flex flex-col items-center justify-center py-16 gap-3 text-center px-8">
							<p class="text-[#555] text-sm">No contacts in this list yet</p>
							<p class="text-xs text-[#333]">Import contacts via the Import Center or add from Contacts page</p>
							<a href="/import" class="text-xs text-white underline hover:no-underline">Go to Import</a>
						</div>
					{:else}
						{#each contacts as contact}
							<div class="flex items-center group">
								<div class="flex-1">
									<ContactRow {contact} />
								</div>
								<button onclick={() => removeContact(contact.id)}
									class="px-4 opacity-0 group-hover:opacity-100 text-xs text-red-600 hover:text-red-400 transition-all">
									Remove
								</button>
							</div>
						{/each}
						<p class="text-center text-xs text-[#333] py-4">{contacts.length} contacts</p>
					{/if}
				</div>
			{:else}
				<div class="flex items-center justify-center flex-1">
					<p class="text-[#444] text-sm">Select a call list to view contacts</p>
				</div>
			{/if}
		</div>
	</div>
{/if}
</div>

<!-- Add Existing Contacts modal -->
{#if showAddExisting}
	<div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onclick={() => showAddExisting = false} role="dialog" aria-modal="true">
		<div class="bg-[#111111] border border-[#2a2a2a] rounded-xl w-[560px] max-h-[70vh] flex flex-col" onclick={(e) => e.stopPropagation()}>
			<div class="p-4 border-b border-[#2a2a2a] flex items-center justify-between">
				<p class="text-white text-sm font-medium">Add contacts to "{selected?.name}"</p>
				<button onclick={() => showAddExisting = false} class="text-[#666] hover:text-white">✕</button>
			</div>
			<div class="p-4 border-b border-[#2a2a2a]">
				<input bind:value={addSearch} placeholder="Search contacts..."
					class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
			</div>
			<div class="flex-1 overflow-y-auto">
				{#each filteredAll as contact}
					<label class="flex items-center gap-3 px-8 py-4 hover:bg-white/5 cursor-pointer border-b border-[#1e1e1e]">
						<input type="checkbox"
							checked={selectedToAdd.includes(contact.id)}
							onchange={() => {
								selectedToAdd = selectedToAdd.includes(contact.id)
									? selectedToAdd.filter(id => id !== contact.id)
									: [...selectedToAdd, contact.id];
							}} />
						<div class="flex-1 min-w-0">
							<p class="text-sm text-white truncate">{contact.name}</p>
							<p class="text-xs text-[#555] truncate">{contact.company || contact.phone}</p>
						</div>
					</label>
				{/each}
			</div>
			<div class="p-4 border-t border-[#2a2a2a] flex items-center justify-between">
				<p class="text-xs text-[#555]">{selectedToAdd.length} selected</p>
				<button onclick={addSelectedContacts} disabled={!selectedToAdd.length}
					class="rounded-lg bg-white px-5 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40">
					Add to List
				</button>
			</div>
		</div>
	</div>
{/if}
