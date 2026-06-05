<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { page } from '$app/stores';
	import { get } from 'svelte/store';
	import { apiFetch } from '$lib/api';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import { toastSuccess, toastError } from '$lib/stores/toast';

	interface Contact { id:string; name:string; company:string; }
	interface Client { id:string; name:string; }
	interface Deal {
		id:string; title:string; value:number; stage:string; probability:number;
		expected_close:string|null; notes:string|null; contact:Contact|null; client:Client|null;
		won_at:string|null; lost_at:string|null; updated_at:string;
	}

	const STAGES = [
		{ key:'prospect',    label:'Prospect',    color:'#6b7280', prob:10 },
		{ key:'qualified',   label:'Qualified',   color:'#3b82f6', prob:25 },
		{ key:'demo',        label:'Demo',        color:'#eab308', prob:40 },
		{ key:'proposal',    label:'Proposal',    color:'#f97316', prob:60 },
		{ key:'negotiation', label:'Negotiation', color:'#a855f7', prob:80 },
		{ key:'won',         label:'Won ✓',       color:'#22c55e', prob:100 },
		{ key:'lost',        label:'Lost ✗',      color:'#ef4444', prob:0 },
	];

	let deals = $state<Deal[]>([]);
	let clients = $state<Client[]>([]);
	let loading = $state(true);
	let showNew = $state(false);
	let selectedDeal = $state<Deal | null>(null);
	let dragDealId = $state<string | null>(null);
	let showImportDeals = $state(false);
	let importCsv = $state('');
	let importingDeals = $state(false);
	let importResult = $state<{created:number;errors:number;errorRows:{row:number;error:string}[]}|null>(null);
	let importFileInput: HTMLInputElement;

	function handleImportFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => { importCsv = ev.target?.result as string; };
		reader.readAsText(file);
	}

	async function importDeals() {
		if (!importCsv) return;
		importingDeals = true;
		const res = await apiFetch('/api/deals/import', { method:'POST', body: JSON.stringify({ csv: importCsv }) });
		if (res.ok) { importResult = await res.json(); if (importResult!.created > 0) { const dr = await apiFetch('/api/deals'); if (dr.ok) deals = await dr.json(); } }
		else { toastError('Failed to import deals'); }
		importingDeals = false;
	}
	let showLostModal = $state(false);
	let pendingLostDealId = $state('');
	let lostReason = $state('');
	const LOST_REASONS = ['Price too high','No budget','Wrong timing','Chose competitor','Not a fit','No decision','Unresponsive','Other'];

	// New deal form
	let nTitle = $state(''); let nValue = $state(0); let nContact = $state('');
	let nClient = $state(''); let nClose = $state(''); let nNotes = $state('');
	let saving = $state(false);

	// Contact search-on-demand (replaces upfront 200-contact fetch)
	let contactSearchQuery = $state('');
	let pickerContacts = $state<Contact[]>([]);
	let searchingContacts = $state(false);

	async function searchPickerContacts() {
		if (!contactSearchQuery.trim()) { pickerContacts = []; return; }
		searchingContacts = true;
		try {
			const r = await apiFetch(`/api/contacts/filtered?search=${encodeURIComponent(contactSearchQuery)}&limit=10`);
			if (r.ok) { const d = await r.json(); pickerContacts = d.data ?? (Array.isArray(d) ? d : []); }
		} catch { /* non-fatal */ }
		searchingContacts = false;
	}

	onMount(async () => {
		const [dr, clr] = await Promise.all([apiFetch('/api/deals'), apiFetch('/api/clients')]);
		deals   = dr.ok ? await dr.json() : [];
		clients  = clr.ok ? await clr.json() : [];
		loading = false;

		// Auto-open deal from GlobalSearch deep link
		const dealId = get(page).url.searchParams.get('deal');
		if (dealId) {
			const found = deals.find(d => d.id === dealId);
			if (found) selectedDeal = found;
		}
	});

	function dealsInStage(stage: string) { return deals.filter(d => d.stage === stage); }
	function stageValue(stage: string) { return dealsInStage(stage).reduce((s, d) => s + d.value, 0); }
	function totalPipeline() { return deals.filter(d => d.stage !== 'lost').reduce((s, d) => s + (d.value * d.probability / 100), 0); }

	async function createDeal() {
		if (!nTitle.trim()) return;
		saving = true;
		const res = await apiFetch('/api/deals', { method: 'POST', body: JSON.stringify({ title: nTitle, value: nValue, contactId: nContact || null, clientId: nClient || null, expectedClose: nClose || null, notes: nNotes || null }) });
		if (res.ok) { deals = [await res.json(), ...deals]; showNew = false; nTitle = ''; nValue = 0; nContact = ''; nClose = ''; toastSuccess('Deal added'); }
		else { toastError('Failed to add deal'); }
		saving = false;
	}

	async function moveDeal(dealId: string, newStage: string) {
		if (newStage === 'lost') { pendingLostDealId = dealId; lostReason = ''; showLostModal = true; return; }
		const extra = newStage === 'won' ? { won_at: new Date().toISOString() } : {};
		const res = await apiFetch(`/api/deals/${dealId}`, { method: 'PATCH', body: JSON.stringify({ stage: newStage, ...extra }) });
		if (res.ok) { const updated = await res.json(); deals = deals.map(d => d.id === dealId ? updated : d); toastSuccess('Deal updated'); }
		else { toastError('Failed to move deal'); }
	}

	async function confirmLost() {
		const res = await apiFetch(`/api/deals/${pendingLostDealId}`, { method: 'PATCH', body: JSON.stringify({ stage: 'lost', lost_reason: lostReason, lost_at: new Date().toISOString() }) });
		if (res.ok) { const updated = await res.json(); deals = deals.map(d => d.id === pendingLostDealId ? updated : d); toastSuccess('Deal updated'); }
		else { toastError('Failed to update deal'); }
		showLostModal = false;
	}

	// Deal editing
	let editingDeal = $state(false);
	let dealEdit = $state<{title:string; value:string; expected_close:string; notes:string}>({
		title: '', value: '', expected_close: '', notes: ''
	});

	function startEditDeal() {
		if (!selectedDeal) return;
		editingDeal = true;
		dealEdit = {
			title: selectedDeal.title ?? '',
			value: String(selectedDeal.value ?? ''),
			expected_close: selectedDeal.expected_close?.slice(0, 10) ?? '',
			notes: selectedDeal.notes ?? '',
		};
	}

	async function saveDealEdit() {
		if (!selectedDeal) return;
		const res = await apiFetch(`/api/deals/${selectedDeal.id}`, {
			method: 'PATCH',
			body: JSON.stringify({
				title: dealEdit.title || undefined,
				value: dealEdit.value ? parseFloat(dealEdit.value) : undefined,
				expected_close: dealEdit.expected_close || undefined,
				notes: dealEdit.notes || undefined,
			})
		});
		if (res.ok) {
			const updated = await res.json();
			selectedDeal = { ...selectedDeal, ...updated };
			deals = deals.map(d => d.id === selectedDeal!.id ? { ...d, ...updated } : d);
			editingDeal = false;
			toastSuccess('Deal updated');
		} else {
			toastError('Failed to save deal');
		}
	}

	let confirmDeleteId = $state<string | null>(null);

	async function deleteDeal(id: string) {
		const res = await apiFetch(`/api/deals/${id}`, { method: 'DELETE' });
		if (res.ok) {
			deals = deals.filter(d => d.id !== id);
			if (selectedDeal?.id === id) selectedDeal = null;
			toastSuccess('Deal deleted');
		} else {
			toastError('Failed to delete deal');
		}
		confirmDeleteId = null;
	}

	// Drag and drop
	let dragOverStage = $state<string | null>(null);

	function dragStart(dealId: string) { dragDealId = dealId; }
	function dragOver(e: DragEvent) { e.preventDefault(); }
	function handleDragEnter(stage: string) { dragOverStage = stage; }
	function handleDragLeave() { dragOverStage = null; }
	async function drop(e: DragEvent, stage: string) {
		e.preventDefault();
		if (dragDealId && deals.find(d => d.id === dragDealId)?.stage !== stage) {
			await moveDeal(dragDealId, stage);
		}
		dragDealId = null;
		dragOverStage = null;
	}

	function fmt$(n: number) { return n >= 1000 ? `$${(n/1000).toFixed(0)}k` : `$${n}`; }
	function fmtDate(s: string | null) { return s ? new Date(s).toLocaleDateString() : '—'; }
</script>

<svelte:head><title>Pipeline — RogueOS</title></svelte:head>

<div class="flex flex-col flex-1 h-full overflow-hidden">
	<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center justify-between shrink-0">
		<div>
			<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Deal Pipeline</h2>
			<p class="text-xs text-[#444] mt-0.5">Weighted forecast: <span class="text-[var(--accent)]">{fmt$(Math.round(totalPipeline()))}</span></p>
		</div>
		<button onclick={() => window.open('/api/export?type=deals', '_blank')} class="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#999] hover:border-white hover:text-white transition-colors">↓ Export</button>
		<button onclick={() => showImportDeals = !showImportDeals} class="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#999] hover:border-white hover:text-white transition-colors">↑ Import CSV</button>
		<button onclick={() => showNew = !showNew}
			class="rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors">
			+ New Deal
		</button>
	</div>

	{#if showImportDeals}
	<div class="border-b border-[#1e1e1e] bg-[#0d0d0d] px-8 py-4">
		<div class="max-w-xl space-y-3">
			<p class="text-xs text-white font-medium">Import Deals from CSV</p>
			<p class="text-xs text-[#555]">Required: title/deal/name column. Optional: value, stage, contact, client, close date, notes</p>
			<input bind:this={importFileInput} type="file" accept=".csv" onchange={handleImportFile} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white file:mr-3 file:rounded file:border-0 file:bg-white/10 file:text-white file:text-xs file:px-2 file:py-1" />
			{#if importCsv}
				<button onclick={importDeals} disabled={importingDeals} class="rounded-lg bg-white px-5 py-2 text-xs font-semibold text-black disabled:opacity-40 hover:bg-[#e5e5e5]">{importingDeals ? 'Importing...' : 'Import Deals'}</button>
			{/if}
			{#if importResult}
				<div class="rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] p-3 text-xs space-y-1">
					<p class="text-[var(--accent)]">✓ {importResult.created} deals imported</p>
					{#if importResult.errors > 0}<p class="text-red-400">{importResult.errors} errors</p>{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}

{#if showNew}
		<div class="border-b border-[#1e1e1e] bg-[#0d0d0d] px-8 py-4">
			<div class="grid grid-cols-5 gap-3 max-w-4xl">
				<div class="col-span-2"><input bind:value={nTitle} placeholder="Deal title *" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" /></div>
				<div><input type="number" bind:value={nValue} placeholder="Value ($)" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" /></div>
				<div><DatePicker bind:value={nClose} onchange={(v) => nClose = v} /></div>
				<div class="flex gap-2">
					<button onclick={createDeal} disabled={saving || !nTitle.trim()} class="flex-1 rounded-lg bg-white py-2 text-xs font-semibold text-black disabled:opacity-40 hover:bg-[#e5e5e5]">{saving ? '...' : 'Add'}</button>
					<button onclick={() => showNew = false} class="text-xs text-[#555] hover:text-white px-2"><Icon name="x" size={14} /></button>
				</div>
				<div class="relative">
					<input
						bind:value={contactSearchQuery}
						oninput={searchPickerContacts}
						placeholder={searchingContacts ? 'Searching...' : 'Search contact...'}
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none"
					/>
					{#if pickerContacts.length > 0}
						<div class="absolute z-20 top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-lg max-h-40 overflow-y-auto">
							<button onclick={() => { nContact = ''; contactSearchQuery = ''; pickerContacts = []; }} class="w-full text-left px-3 py-2 text-xs text-[#555] hover:bg-white/5">No contact</button>
							{#each pickerContacts as c}
								<button onclick={() => { nContact = c.id; contactSearchQuery = c.name; pickerContacts = []; }} class="w-full text-left px-3 py-2 text-xs text-white hover:bg-white/5 truncate">{c.name}{c.company ? ` · ${c.company}` : ''}</button>
							{/each}
						</div>
					{/if}
				</div>
				<div><select bind:value={nClient} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white focus:border-white focus:outline-none"><option value="">No client</option>{#each clients as c}<option value={c.id}>{c.name}</option>{/each}</select></div>
				<div class="col-span-3"><input bind:value={nNotes} placeholder="Notes" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" /></div>
			</div>
		</div>
	{/if}

	<!-- Kanban board -->
	<div class="flex-1 overflow-x-auto overflow-y-hidden">
	{#if loading}
		<div class="flex gap-4 p-6 overflow-x-auto h-full">
			{#each {length: 6} as _}
				<div class="flex-shrink-0 w-[240px]">
					<div class="h-6 w-24 bg-[#1a1a1a] rounded animate-pulse mb-3"></div>
					{#each {length: 3} as __}
						<div class="rounded-xl bg-[#111] border border-[#1a1a1a] p-3 mb-2">
							<div class="h-3 w-3/4 bg-[#1a1a1a] rounded animate-pulse mb-2"></div>
							<div class="h-2.5 w-1/2 bg-[#1a1a1a] rounded animate-pulse mb-2"></div>
							<div class="h-2.5 w-2/3 bg-[#1a1a1a] rounded animate-pulse"></div>
						</div>
					{/each}
				</div>
			{/each}
		</div>
	{:else}
		<div class="flex h-full gap-3 p-4 min-w-max">
			{#each STAGES as stage}
				<div class="w-56 shrink-0 flex flex-col h-full"
					ondragover={dragOver}
					ondragenter={() => handleDragEnter(stage.key)}
					ondragleave={handleDragLeave}
					ondrop={(e) => drop(e, stage.key)}>

					<!-- Stage header -->
					<div class="mb-2 px-2">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<div class="w-2 h-2 rounded-full" style="background-color:{stage.color}"></div>
								<p class="text-xs font-medium text-white">{stage.label}</p>
								<span class="text-xs text-[#444]">{dealsInStage(stage.key).length}</span>
							</div>
							{#if stageValue(stage.key) > 0}
								<p class="text-xs text-[#555]">{fmt$(stageValue(stage.key))}</p>
							{/if}
						</div>
					</div>

					<!-- Deal cards -->
					<div class="flex-1 overflow-y-auto space-y-2 min-h-[60px] rounded-xl border p-2 transition-colors {dragOverStage === stage.key ? 'border-white/30 bg-white/5' : 'border-[#1e1e1e] bg-[#0a0a0a]'}">
						{#each dealsInStage(stage.key) as deal}
							{@const daysStale = Math.floor((Date.now() - new Date(deal.updated_at ?? deal.created_at).getTime()) / (1000 * 60 * 60 * 24))}
							<div
								draggable="true"
								ondragstart={() => dragStart(deal.id)}
								onclick={() => { selectedDeal = deal; confirmDeleteId = null; }}
								class="rounded-lg border border-[#2a2a2a] bg-[#111111] p-3 cursor-grab active:cursor-grabbing hover:border-[#444] transition-colors group">

								<p class="text-sm text-white font-medium mb-1 truncate">{deal.title}</p>
								{#if deal.contact}<p class="text-xs text-[#555] truncate">{deal.contact.name}{deal.contact.company ? ` · ${deal.contact.company}` : ''}</p>{/if}
								<div class="flex items-center justify-between mt-2">
									<p class="text-sm font-semibold" style="color:{stage.color}">{fmt$(deal.value)}</p>
									<p class="text-xs text-[#333]">{deal.probability}%</p>
								</div>
								{#if deal.expected_close}
									<p class="text-xs text-[#444] mt-1">Close: {fmtDate(deal.expected_close)}</p>
								{/if}
								{#if daysStale >= 14 && deal.stage !== 'won' && deal.stage !== 'lost'}
									<div class="mt-1.5 flex items-center gap-1">
										<span class="w-1.5 h-1.5 rounded-full bg-orange-500/60 flex-shrink-0"></span>
										<span class="text-[9px] text-orange-400/60">{daysStale}d stale</span>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
	</div>
</div>

<!-- Deal detail sidebar -->
{#if selectedDeal}
	<div class="fixed right-0 top-0 h-full w-80 bg-[#111111] border-l border-[#2a2a2a] z-40 overflow-y-auto p-6 space-y-4">
		<!-- Panel header with edit toggle -->
		<div class="flex items-center justify-between mb-4">
			{#if editingDeal}
				<input bind:value={dealEdit.title} class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white font-semibold focus:border-white focus:outline-none mr-2" />
				<button onclick={saveDealEdit} class="text-xs bg-white text-black px-3 py-1 rounded-lg font-semibold mr-1">Save</button>
				<button onclick={() => editingDeal = false} class="text-xs text-[#555] hover:text-white">Cancel</button>
			{:else}
				<p class="text-white font-semibold flex-1">{selectedDeal.title}</p>
				<button onclick={startEditDeal} class="text-xs text-[#444] hover:text-white border border-[#2a2a2a] rounded-lg px-2.5 py-1 transition-colors mr-2">Edit</button>
				<button onclick={() => { selectedDeal = null; confirmDeleteId = null; editingDeal = false; }} class="text-[#555] hover:text-white"><Icon name="x" size={14} /></button>
			{/if}
		</div>

		{#if editingDeal}
			<div class="space-y-2 mb-4">
				<div>
					<label class="text-xs text-[#555] block mb-1">Value ($)</label>
					<input bind:value={dealEdit.value} type="number" placeholder="0"
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" />
			</div>
			<div class="flex gap-2">
				<button onclick={saveDealEdit} class="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors">Save</button>
				<button onclick={() => editingDeal = false} class="rounded-lg border border-[#333] px-4 py-2 text-xs text-[#999] hover:border-white hover:text-white transition-colors">Cancel</button>
			</div>
		</div>
	{/if}
	</div>
{/if}
