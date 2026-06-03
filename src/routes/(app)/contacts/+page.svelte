<script lang="ts">
	import { onMount } from 'svelte';
	import FilterSidebar from '$lib/components/FilterSidebar.svelte';
	import ContactRow from '$lib/components/ContactRow.svelte';
	import CSVImport from '$lib/components/CSVImportAdvanced.svelte';
	import NewContactModal from '$lib/components/NewContactModal.svelte';
	import { apiFetch } from '$lib/api';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import type { Contact, Filters, Tag } from '$lib/stores';
	import { toastSuccess, toastError } from '$lib/stores/toast';

	let contacts = $state<Contact[]>([]);
	let totalContacts = $state(0);
	let currentPage = $state(1);
	let totalPages = $state(1);
	let search = $state('');
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	let tags = $state<Tag[]>([]);
	let loading = $state(true);
	let showImport = $state(false);
	let showNewContact = $state(false);
	let showExport = $state(false);
	let activeFilters = $state<Filters>({});

	// ── Bulk selection ──────────────────────────────────────────
	let selectedIds = $state<Set<string>>(new Set());
	let showBulkTask = $state(false);
	let bulkTaskForm = $state({ title: '', taskType: 'follow_up', priority: 'medium', dueDate: '', description: '' });
	let bulkTaskSaving = $state(false);

	// Bulk activity
	let showBulkActivity = $state(false);
	let bulkActivityType = $state('note');
	let bulkActivityTitle = $state('');
	let bulkActivityDesc = $state('');
	let bulkActivityOutcome = $state('');
	let bulkActivityDate = $state(new Date().toISOString().slice(0, 16));
	let bulkActivitySaving = $state(false);
	let bulkActivityDone = $state('');

	// Quick note / task popovers
	let quickNoteContactId = $state<string | null>(null);
	let quickNoteContactName = $state('');
	let quickNoteText = $state('');
	let savingQuickNote = $state(false);

	let quickTaskContactId = $state<string | null>(null);
	let quickTaskContactName = $state('');
	let quickTaskTitle = $state('');
	let quickTaskDue = $state('');
	let savingQuickTask = $state(false);

	function openQuickNote(id: string, name: string) {
		quickNoteContactId = id;
		quickNoteContactName = name;
		quickNoteText = '';
	}

	function openQuickTask(id: string, name: string) {
		quickTaskContactId = id;
		quickTaskContactName = name;
		quickTaskTitle = '';
		quickTaskDue = '';
	}

	async function saveQuickNote() {
		if (!quickNoteContactId || !quickNoteText.trim()) return;
		savingQuickNote = true;
		try {
			const res = await apiFetch('/api/contacts/activity', {
				method: 'POST',
				body: JSON.stringify({
					contactId: quickNoteContactId,
					activityType: 'note',
					description: quickNoteText,
				})
			});
			if (res.ok) {
				toastSuccess('Note saved');
			} else {
				const body = await res.text().catch(() => '');
				toastError(`Failed to save note${body ? ': ' + body.slice(0, 80) : ''}`);
			}
		} catch {
			toastError('Network error saving note');
		} finally {
			quickNoteContactId = null;
			quickNoteText = '';
			savingQuickNote = false;
		}
	}

	async function saveQuickTask() {
		if (!quickTaskContactId || !quickTaskTitle.trim()) return;
		savingQuickTask = true;
		try {
			const res = await apiFetch('/api/tasks', {
				method: 'POST',
				body: JSON.stringify({
					title: quickTaskTitle,
					contact_id: quickTaskContactId,
					task_type: 'follow_up',
					priority: 'medium',
					status: 'pending',
					due_date: quickTaskDue ? new Date(quickTaskDue + 'T09:00:00').toISOString() : null,
				})
			});
			if (res.ok) {
				toastSuccess('Task created');
			} else {
				const body = await res.text().catch(() => '');
				toastError(`Failed to create task${body ? ': ' + body.slice(0, 80) : ''}`);
			}
		} catch {
			toastError('Network error creating task');
		} finally {
			quickTaskContactId = null;
			quickTaskTitle = '';
			savingQuickTask = false;
		}
	}

	// FIX 4: Bulk SMS
	let showBulkSms = $state(false);
	let bulkSmsBody = $state('');
	let sendingBulkSms = $state(false);
	let bulkSmsResult = $state('');

	async function sendBulkSms() {
		if (!bulkSmsBody.trim()) return;
		sendingBulkSms = true; bulkSmsResult = '';
		let sent = 0, failed = 0;
		const ids = [...selectedIds];
		const r = await apiFetch(`/api/contacts/filtered?ids=${ids.join(',')}&limit=${ids.length}`);
		if (!r.ok) { sendingBulkSms = false; bulkSmsResult = 'Failed to load contacts'; return; }
		const d = await r.json();
		const contactList = d.data ?? d ?? [];
		for (const c of contactList) {
			if (!c.phone) { failed++; continue; }
			const res = await apiFetch('/api/sms/send', {
				method: 'POST',
				body: JSON.stringify({ to: c.phone, body: bulkSmsBody, contactId: c.id }),
			});
			if (res.ok) sent++; else failed++;
		}
		bulkSmsResult = `✓ Sent to ${sent} contacts${failed ? `, ${failed} skipped (no phone)` : ''}`;
		setTimeout(() => { showBulkSms = false; bulkSmsResult = ''; bulkSmsBody = ''; }, 2500);
		sendingBulkSms = false;
	}

	const BULK_ACTIVITY_TYPES = [
		{ value: 'note', label: 'Note', icon: '📝' },
		{ value: 'call', label: 'Call', icon: '📞' },
		{ value: 'email', label: 'Email', icon: '✉️' },
		{ value: 'meeting', label: 'Meeting', icon: '📅' },
		{ value: 'demo', label: 'Demo', icon: '🎯' },
		{ value: 'linkedin', label: 'LinkedIn', icon: '💼' },
		{ value: 'follow_up', label: 'Follow-up', icon: '🔁' },
		{ value: 'other', label: 'Other', icon: '📌' },
	];

	async function createBulkActivity() {
		if (!bulkActivityDesc.trim() && !bulkActivityTitle.trim()) return;
		bulkActivitySaving = true;
		const res = await apiFetch('/api/contacts/activities/bulk', {
			method: 'POST',
			body: JSON.stringify({
				contactIds: [...selectedIds],
				activityType: bulkActivityType,
				title: bulkActivityTitle.trim() || null,
				description: bulkActivityDesc.trim() || null,
				outcome: bulkActivityOutcome || null,
				scheduledAt: bulkActivityDate || null,
			}),
		});
		if (res.ok) {
			const d = await res.json();
			bulkActivityDone = `✓ Logged activity for ${d.created} contact${d.created !== 1 ? 's' : ''}`;
			setTimeout(() => { showBulkActivity = false; bulkActivityDone = ''; bulkActivityTitle = ''; bulkActivityDesc = ''; }, 2000);
		}
		bulkActivitySaving = false;
	}

	const allSelected = $derived(contacts.length > 0 && contacts.every(c => selectedIds.has(c.id)));
	const someSelected = $derived(selectedIds.size > 0 && selectedIds.size < contacts.length);

	function toggleSelectAll() {
		if (allSelected) selectedIds = new Set();
		else selectedIds = new Set(contacts.map(c => c.id));
	}

	function toggleSelect(id: string) {
		const next = new Set(selectedIds);
		if (next.has(id)) next.delete(id); else next.add(id);
		selectedIds = next;
	}

	async function createBulkTasks() {
		if (!bulkTaskForm.title.trim() || !selectedIds.size) return;
		bulkTaskSaving = true;
		const count = selectedIds.size;
		const res = await apiFetch('/api/tasks/bulk', {
			method: 'POST',
			body: JSON.stringify({
				contactIds: [...selectedIds],
				...bulkTaskForm,
				dueDate: bulkTaskForm.dueDate || null,
			}),
		});
		if (res.ok) {
			toastSuccess(`${count} task${count !== 1 ? 's' : ''} created`);
			showBulkTask = false;
			selectedIds = new Set();
			bulkTaskForm = { title: '', taskType: 'follow_up', priority: 'medium', dueDate: '', description: '' };
		} else {
			toastError('Failed to create tasks');
		}
		bulkTaskSaving = false;
	}

	onMount(async () => {
		await Promise.all([loadContacts({}), loadTags()]);
	});

	async function loadTags() {
		try {
			const res = await apiFetch('/api/tags');
			if (res.ok) {
				try { tags = await res.json(); } catch { tags = []; }
			}
		} catch {
			// Non-fatal — filters just won't have tags pre-populated
			tags = [];
		}
	}

	async function loadContacts(f: Filters, page = 1) {
		loading = true;
		try {
			const params = new URLSearchParams();
			if (f.status) params.set('status', f.status);
			if (f.company) params.set('company', f.company);
			if (f.tags?.length) params.set('tags', f.tags.join(','));
			if (f.sortBy) params.set('sort', f.sortBy);
			if (f.sortDir) params.set('order', f.sortDir);
			if (f.contactType) params.set('contact_type', f.contactType);
			if (f.leadSource) params.set('lead_source', f.leadSource);
			if (f.isBusinessOnly) params.set('is_business', 'true');
			if (search.trim()) params.set('search', search.trim());
			params.set('page', String(page));
			params.set('limit', '50');
			const res = await apiFetch(`/api/contacts/filtered?${params}`);
			if (res.ok) {
				const d = await res.json();
				if (Array.isArray(d)) { contacts = d; totalContacts = d.length; totalPages = 1; }
				else { contacts = d.data ?? []; totalContacts = d.total ?? 0; totalPages = d.pages ?? 1; currentPage = page; }
			} else contacts = [];
		} finally {
			loading = false;
		}
	}

	function onSearchChange() {
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => loadContacts(activeFilters, 1), 300);
	}
</script>

<svelte:head><title>Contacts — LeadOS</title></svelte:head>
<svelte:window onclick={(e: MouseEvent) => { if (!(e.target as Element)?.closest('.export-container')) showExport = false; }} />

<div class="flex flex-col flex-1 h-full">
	<div class="border-b border-[#1e1e1e] px-4 sm:px-8 py-4 flex flex-wrap items-center gap-3 justify-between">
		<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">
			Contacts
			{#if !loading}
				<span class="text-[#444] font-normal ml-2">({totalContacts})</span>
			{/if}
		</h2>
		<div class="flex flex-wrap items-center gap-2">
			<input bind:value={search} oninput={onSearchChange} placeholder="Search contacts..." class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none w-36 sm:w-48" />
			<button onclick={() => { showNewContact = true; showImport = false; }}
				class="rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors">
				+ New
			</button>
			<button onclick={() => { showImport = !showImport; showNewContact = false; }}
				class="rounded-lg border border-[#2a2a2a] px-4 py-1.5 text-xs text-[#999] hover:border-white hover:text-white transition-colors">
				{showImport ? 'Hide Import' : 'Import'}
			</button>
			<div class="relative export-container">
				<button onclick={() => showExport = !showExport}
					class="rounded-lg border border-[var(--c-border-subtle)] px-4 py-1.5 text-xs text-[#666] hover:text-white hover:border-white transition-colors">
					↓ Export
				</button>
				{#if showExport}
					<div class="absolute right-0 top-full mt-1 bg-[#111] border border-[var(--c-border-subtle)] rounded-xl shadow-2xl py-2 w-48 z-20">
						<a href="/api/export?type=contacts" download class="block px-4 py-2 text-sm text-[#888] hover:text-white hover:bg-white/5 transition-colors">
							Contacts CSV
						</a>
						<a href="/api/export?type=calls" download class="block px-4 py-2 text-sm text-[#888] hover:text-white hover:bg-white/5 transition-colors">
							Calls CSV
						</a>
					</div>
				{/if}
			</div>
			<!-- FIX 5: Dedup link -->
			<a href="/contacts/dedup" class="rounded-lg border border-[#2a2a2a] px-3 py-2 text-xs text-[#666] hover:border-white hover:text-white transition-colors">
				🔗 Dedup
			</a>
		</div>
	</div>

	{#if showImport}
		<div class="border-b border-[#1e1e1e] p-8 bg-[#0d0d0d]">
			<CSVImport onImportDone={() => { showImport = false; loadContacts({}); }} />
		</div>
	{/if}

	<div class="flex flex-1 overflow-hidden">
		<div class="p-6 border-r border-[#1e1e1e] overflow-y-auto">
			<FilterSidebar onFilterChange={(f) => { activeFilters = f; loadContacts(f, 1); }} {tags} />
		</div>

		<div class="flex-1 overflow-y-auto">
			{#if loading}
				<div class="skeleton-list">
					{#each {length: 8} as _}
						<div class="skeleton-row">
							<div class="skel skel-check"></div>
							<div class="skel skel-name"></div>
							<div class="skel skel-phone"></div>
							<div class="skel skel-tags"></div>
							<div class="skel skel-small"></div>
						</div>
					{/each}
				</div>
			{:else if contacts.length === 0}
				<div class="flex items-center justify-center py-24 text-center">
					<div>
						<p class="text-[#555] text-sm">No contacts yet</p>
						<p class="text-[#333] text-xs mt-1">Create one manually or import a CSV</p>
						<div class="mt-4 flex gap-3 justify-center">
							<a href="/import" class="rounded-lg border border-[#2a2a2a] px-4 py-2 text-xs text-[#888] hover:border-white hover:text-white transition-colors">Import CSV</a>
							<button onclick={() => showNewContact = true} class="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5]">+ New Contact</button>
						</div>
					</div>
				</div>
			{:else}
				<div class="px-4 py-2 border-b border-[#1e1e1e] grid text-xs text-[#444]" style="grid-template-columns: minmax(0,1fr) repeat(3, auto);">
					<span>Name / Company</span>
					<span class="hidden sm:block px-3">Phone</span>
					<span class="hidden md:block px-3">Tags</span>
					<span class="hidden sm:block text-right px-3">Calls</span>
				</div>
				<!-- Bulk actions bar -->
				{#if selectedIds.size > 0}
					<div class="flex items-center gap-3 px-8 py-4 bg-blue-400/10 border-b border-blue-400/20 text-xs text-blue-300 flex-wrap">
						<span class="font-medium">{selectedIds.size} selected</span>
						<button onclick={() => showBulkTask = true} class="px-3 py-1 bg-blue-400/20 hover:bg-blue-400/30 rounded text-blue-200 transition-colors">✅ Create Task for All</button>
						<button onclick={() => showBulkActivity = true}
							class="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#777] hover:border-white hover:text-white transition-colors">
							📝 Log Activity ({selectedIds.size})
						</button>
				<!-- FIX 4: Bulk SMS button -->
					<button onclick={() => showBulkSms = true} class="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#777] hover:border-white hover:text-white transition-colors">
						💬 SMS ({selectedIds.size})
					</button>
					<button onclick={() => selectedIds = new Set()} class="text-[#666] hover:text-white transition-colors ml-auto">Deselect</button>
				</div>
			{/if}

			<!-- Select-all -->
			<div class="flex items-center gap-2 px-4 py-1.5 border-b border-[#1a1a1a] text-xs text-[#555]">
				<input
				type="checkbox"
				checked={allSelected}
				onchange={toggleSelectAll}
				class="accent-blue-400"
				aria-label="Select all contacts on this page" />
				<span>Select all on page</span>
			</div>

			{#each contacts as contact}
				<div class="flex items-center border-b border-[#1a1a1a]">
					<div class="pl-4 flex-shrink-0">
						<input type="checkbox" checked={selectedIds.has(contact.id)} onchange={() => toggleSelect(contact.id)} class="accent-blue-400" />
					</div>
					<div class="flex-1 min-w-0"><ContactRow {contact} onQuickNote={openQuickNote} onQuickTask={openQuickTask} /></div>
				</div>
			{/each}

			{#if totalPages > 1}
				<div class="flex items-center justify-center gap-4 py-4 border-t border-[#1e1e1e]">
					<button
						onclick={() => loadContacts(activeFilters, currentPage - 1)}
						disabled={currentPage <= 1}
						class="px-3 py-1.5 rounded border border-[#2a2a2a] text-xs text-[#999] hover:border-white hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
						← Prev
					</button>
					<span class="text-xs text-[#555]">Page {currentPage} of {totalPages}</span>
					<button
						onclick={() => loadContacts(activeFilters, currentPage + 1)}
						disabled={currentPage >= totalPages}
						class="px-3 py-1.5 rounded border border-[#2a2a2a] text-xs text-[#999] hover:border-white hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
						Next →
					</button>
				</div>
			{/if}
		{/if}
		</div>
	</div>
</div>

{#if showNewContact}
	<NewContactModal
		onClose={() => showNewContact = false}
		onCreated={() => loadContacts({})}
	/>
{/if}

	<!-- FIX 4: Bulk SMS modal -->
	{#if showBulkSms}
		<div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onclick={() => showBulkSms = false} role="dialog">
			<div class="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] p-6 w-full max-w-md" onclick={(e) => e.stopPropagation()}>
				<div class="flex items-center justify-between mb-4">
					<h3 class="text-white font-medium">Send SMS to {selectedIds.size} Contact{selectedIds.size !== 1 ? 's' : ''}</h3>
					<button onclick={() => showBulkSms = false} class="text-[#555] hover:text-white text-sm">✕</button>
				</div>
				<textarea bind:value={bulkSmsBody} placeholder="Message..." rows="4"
					class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none mb-3"></textarea>
				<p class="text-xs text-[#444] mb-3">Contacts without a phone number will be skipped.</p>
				{#if bulkSmsResult}<p class="text-xs text-green-400 mb-2">{bulkSmsResult}</p>{/if}
				<div class="flex gap-2">
					<button onclick={() => showBulkSms = false} class="flex-1 rounded-lg border border-[#2a2a2a] py-2 text-xs text-[#777] hover:border-white hover:text-white transition-colors">Cancel</button>
					<button onclick={sendBulkSms} disabled={sendingBulkSms || !bulkSmsBody.trim()}
						class="flex-1 rounded-lg bg-white py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40">
						{sendingBulkSms ? 'Sending...' : `Send to ${selectedIds.size}`}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Bulk activity modal -->
	{#if showBulkActivity}
		<div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
			onclick={() => showBulkActivity = false} role="dialog" aria-modal="true">
			<div class="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] p-6 w-full max-w-md"
				onclick={(e) => e.stopPropagation()}>
				<div class="flex items-center justify-between mb-4">
					<h3 class="text-white font-medium text-sm">Log Activity for {selectedIds.size} Contact{selectedIds.size !== 1 ? 's' : ''}</h3>
					<button onclick={() => showBulkActivity = false} class="text-[#555] hover:text-white text-sm">✕</button>
				</div>

				<div class="flex flex-wrap gap-1.5 mb-4">
					{#each BULK_ACTIVITY_TYPES as t}
						<button onclick={() => bulkActivityType = t.value}
							class="px-2.5 py-1 rounded-full text-xs transition-colors {bulkActivityType === t.value ? 'bg-white text-black' : 'border border-[#2a2a2a] text-[#666] hover:border-[#555] hover:text-[#ccc]'}">
							{t.icon} {t.label}
						</button>
					{/each}
				</div>

				<div class="space-y-3">
					<input bind:value={bulkActivityTitle} placeholder="Title (optional)"
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
					<textarea bind:value={bulkActivityDesc} placeholder="Notes, outcome, next steps..."
						rows="4" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none"></textarea>
					<input type="datetime-local" bind:value={bulkActivityDate}
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white focus:border-white focus:outline-none" />
				</div>

				{#if bulkActivityDone}
					<p class="text-xs text-green-400 mt-3">{bulkActivityDone}</p>
				{/if}

				<div class="flex gap-2 mt-5">
					<button onclick={() => showBulkActivity = false}
						class="flex-1 rounded-lg border border-[#2a2a2a] py-2 text-xs text-[#777] hover:border-white hover:text-white transition-colors">
						Cancel
					</button>
					<button onclick={createBulkActivity}
						disabled={bulkActivitySaving || (!bulkActivityDesc.trim() && !bulkActivityTitle.trim())}
						class="flex-1 rounded-lg bg-white py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40">
						{bulkActivitySaving ? 'Logging...' : `Log for ${selectedIds.size} contacts`}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Bulk task modal -->
	{#if showBulkTask}
		<div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onclick={() => showBulkTask = false}>
			<div class="bg-[#111] border border-[#2a2a2a] rounded-xl p-6 w-full max-w-md mx-4 space-y-3">
			<p class="text-white font-semibold text-sm mb-4">Create Tasks</p>
			<p class="text-xs text-[#555]">Create follow-up tasks for {selectedIds.size} selected contact{selectedIds.size === 1 ? '' : 's'}.</p>
			<div class="flex gap-2 mt-4">
				<button onclick={() => showBulkTask = false} class="px-4 py-2 border border-[#333] rounded text-xs text-[#999] hover:border-white hover:text-white transition-colors">Cancel</button>
				<button onclick={createBulkTasks} class="px-4 py-2 bg-white text-black rounded text-xs font-semibold hover:bg-[#e5e5e5] transition-colors">Create Tasks</button>
			</div>
		</div>
	</div>
	{/if}
