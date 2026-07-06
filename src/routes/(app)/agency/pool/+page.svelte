<script lang="ts">
	import { onMount } from 'svelte';
	import { titleFor } from '$lib/brand';
	import { apiFetch } from '$lib/api';
	import { toastSuccess, toastError } from '$lib/stores/toast';

	interface Contact { id: string; name: string; phone: string; company: string | null; contact_type: string; status: string; call_count: number; last_called_at: string | null; }
	interface CallList { id: string; name: string; campaign_id: string; campaign?: { name: string; project?: { name: string; client?: { name: string } } }; }
	interface TeamMember { id: string; member_email: string; member_user_id: string | null; }

	let contacts = $state<Contact[]>([]);
	let callLists = $state<CallList[]>([]);
	let teamMembers = $state<TeamMember[]>([]);
	let loading = $state(true);

	let filterClient = $state('');
	let filterStatus = $state('active');
	let search = $state('');
	let selectedIds = $state(new Set<string>());
	let assignToList = $state('');
	let assigning = $state(false);

	// Pagination
	let page = $state(0);
	const PAGE_SIZE = 50;

	async function loadData() {
		loading = true;
		const [contactsRes, listsRes, teamRes] = await Promise.all([
			apiFetch(`/api/contacts/filtered?limit=200&status=${filterStatus}&search=${encodeURIComponent(search)}`),
			apiFetch('/api/call-lists'),
			apiFetch('/api/team'),
		]);
		if (contactsRes.ok) { const d = await contactsRes.json(); contacts = d.data ?? d ?? []; }
		if (listsRes.ok) callLists = await listsRes.json();
		if (teamRes.ok) teamMembers = (await teamRes.json()).filter((m: TeamMember) => m.member_user_id);
		loading = false;
	}

	onMount(loadData);

	let searchDebounce: ReturnType<typeof setTimeout>;
	function debouncedSearch() {
		clearTimeout(searchDebounce);
		searchDebounce = setTimeout(loadData, 300);
	}

	function toggleSelect(id: string) {
		const s = new Set(selectedIds);
		s.has(id) ? s.delete(id) : s.add(id);
		selectedIds = s;
	}

	function selectAll() {
		selectedIds = new Set(pageContacts.map(c => c.id));
	}

	function clearSelection() { selectedIds = new Set(); }

	async function assignSelected() {
		if (!assignToList || selectedIds.size === 0) return;
		assigning = true;
		const res = await apiFetch(`/api/campaigns/${getListCampaignId(assignToList)}/contacts`, {
			method: 'POST',
			body: JSON.stringify({ mode: 'existing', contactIds: [...selectedIds] }),
		});
		if (res.ok) {
			const d = await res.json();
			toastSuccess(`Added ${d.added ?? selectedIds.size} contacts to queue`);
			selectedIds = new Set();
		} else { toastError('Failed to assign — check campaign exists'); }
		assigning = false;
	}

	function getListCampaignId(listId: string) {
		return callLists.find(l => l.id === listId)?.campaign_id ?? listId;
	}

	const pageContacts = $derived(contacts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
	const totalPages = $derived(Math.ceil(contacts.length / PAGE_SIZE));

	// Group call lists by client for the dropdown
	const groupedLists = $derived(() => {
		const groups: Record<string, { client: string; lists: CallList[] }> = {};
		for (const l of callLists) {
			const client = l.campaign?.project?.client?.name ?? 'Other';
			if (!groups[client]) groups[client] = { client, lists: [] };
			groups[client].lists.push(l);
		}
		return Object.values(groups);
	});
</script>

<svelte:head><title>{titleFor('Lead Pool')}</title></svelte:head>

<div class="flex flex-col flex-1 h-full overflow-hidden">
	<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center gap-4 shrink-0">
		<div>
			<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Lead Pool Distribution</h2>
			<p class="text-[10px] text-[#6e6e6e] mt-0.5">Select contacts and assign them to a campaign call queue</p>
		</div>
	</div>

	<!-- Toolbar -->
	<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center gap-3 shrink-0 flex-wrap">
		<input bind:value={search} oninput={debouncedSearch} placeholder="Search contacts…"
			class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none w-52" />

		<select bind:value={filterStatus} onchange={loadData} class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white focus:outline-none">
			<option value="active">Active contacts</option>
			<option value="">All contacts</option>
		</select>

		<span class="text-xs text-[#6e6e6e]">{contacts.length} contacts</span>

		{#if selectedIds.size > 0}
			<div class="flex items-center gap-2 ml-auto">
				<span class="text-xs text-white font-medium">{selectedIds.size} selected</span>
				<select bind:value={assignToList} class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white focus:border-white focus:outline-none">
					<option value="">→ Assign to campaign…</option>
					{#each groupedLists() as group}
						<optgroup label={group.client}>
							{#each group.lists as list}
								<option value={list.id}>{list.campaign?.name ?? list.name}</option>
							{/each}
						</optgroup>
					{/each}
				</select>
				<button onclick={assignSelected} disabled={assigning || !assignToList}
					class="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40 hover:bg-[#e5e5e5]">
					{assigning ? 'Assigning…' : 'Assign'}
				</button>
				<button onclick={clearSelection} class="text-xs text-[#6e6e6e] hover:text-white">✕ Clear</button>
			</div>
		{/if}
	</div>

	<!-- Contact table -->
	<div class="flex-1 overflow-y-auto">
		{#if loading}
			<div class="flex items-center justify-center h-32">
				<div class="w-4 h-4 rounded-full bg-white animate-pulse"></div>
			</div>
		{:else}
			<div class="overflow-x-auto"><table class="w-full text-xs min-w-[600px]">
				<thead class="sticky top-0 bg-[#0d0d0d] border-b border-[#1a1a1a]">
					<tr class="text-[#6e6e6e]">
						<th class="px-4 py-2.5 text-left w-8">
							<input type="checkbox" onchange={(e) => (e.target as HTMLInputElement).checked ? selectAll() : clearSelection()} />
						</th>
						<th class="px-2 py-2.5 text-left">Name</th>
						<th class="px-2 py-2.5 text-left">Company</th>
						<th class="px-2 py-2.5 text-left">Phone</th>
						<th class="px-2 py-2.5 text-left">Type</th>
						<th class="px-2 py-2.5 text-right">Calls</th>
						<th class="px-4 py-2.5 text-right">Last called</th>
					</tr>
				</thead>
				<tbody>
					{#each pageContacts as contact}
						<tr onclick={() => toggleSelect(contact.id)}
							class="border-b border-[#111] cursor-pointer transition-colors {selectedIds.has(contact.id) ? 'bg-white/10' : 'hover:bg-white/3'}">
							<td class="px-4 py-2.5">
								<input type="checkbox" checked={selectedIds.has(contact.id)} onchange={() => toggleSelect(contact.id)} onclick={(e) => e.stopPropagation()} />
							</td>
							<td class="px-2 py-2.5 text-white font-medium">{contact.name}</td>
							<td class="px-2 py-2.5 text-[#7c7c7c]">{contact.company ?? '—'}</td>
							<td class="px-2 py-2.5 text-[#8a8a8a] font-mono">{contact.phone}</td>
							<td class="px-2 py-2.5">
								<span class="text-[9px] capitalize px-1.5 py-0.5 rounded {contact.contact_type === 'creator' ? 'text-pink-400 bg-pink-950/30' : 'text-[#7c7c7c] bg-[#1a1a1a]'}">{contact.contact_type ?? 'lead'}</span>
							</td>
							<td class="px-2 py-2.5 text-right text-[#6e6e6e]">{contact.call_count ?? 0}</td>
							<td class="px-4 py-2.5 text-right text-[#333]">
								{contact.last_called_at ? new Date(contact.last_called_at).toLocaleDateString() : 'Never'}
							</td>
						</tr>
					{/each}
				</tbody>
			</table></div>

			<!-- Pagination -->
			{#if totalPages > 1}
				<div class="flex items-center justify-center gap-3 py-4 border-t border-[#1a1a1a]">
					<button onclick={() => page = Math.max(0, page - 1)} disabled={page === 0}
						class="px-3 py-1 rounded border border-[#2a2a2a] text-xs text-[#7c7c7c] hover:text-white disabled:opacity-30">← Prev</button>
					<span class="text-xs text-[#6e6e6e]">Page {page + 1} of {totalPages}</span>
					<button onclick={() => page = Math.min(totalPages - 1, page + 1)} disabled={page === totalPages - 1}
						class="px-3 py-1 rounded border border-[#2a2a2a] text-xs text-[#7c7c7c] hover:text-white disabled:opacity-30">Next →</button>
				</div>
			{/if}
		{/if}
	</div>
</div>
