<script lang="ts">
	import { onMount } from 'svelte';
	import { titleFor } from '$lib/brand';
	import Icon from '$lib/components/Icon.svelte';
	import FilterSidebar from '$lib/components/FilterSidebar.svelte';
	import ContactRow from '$lib/components/ContactRow.svelte';
	import CSVImport from '$lib/components/CSVImportAdvanced.svelte';
	import NewContactModal from '$lib/components/NewContactModal.svelte';
	import { apiFetch } from '$lib/api';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import type { Contact, Filters, Tag } from '$lib/stores';
	import { toastSuccess, toastError, toastUndo } from '$lib/stores/toast';

	// ── In-app confirm dialog (replaces window.confirm) ─────────
	let confirmOpen = $state(false);
	let confirmState = $state<{
		title: string;
		message: string;
		confirmLabel: string;
		danger: boolean;
		onConfirm: () => void;
	}>({ title: '', message: '', confirmLabel: 'Confirm', danger: false, onConfirm: () => {} });

	function askConfirm(opts: { title: string; message?: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void }) {
		confirmState = {
			title: opts.title,
			message: opts.message ?? '',
			confirmLabel: opts.confirmLabel ?? 'Confirm',
			danger: opts.danger ?? false,
			onConfirm: opts.onConfirm,
		};
		confirmOpen = true;
	}

	// ── Overflow menu (secondary header actions) ────────────────
	let showOverflow = $state(false);

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
	let activeFilters = $state<Filters>({});

	// ── Columns (visibility persisted) + per-column filters ─────
	const COLUMN_DEFS = [
		{ key: 'phone',       label: 'Phone' },
		{ key: 'email',       label: 'Email' },
		{ key: 'title',       label: 'Title' },
		{ key: 'status',      label: 'Status' },
		{ key: 'lead_source', label: 'Lead Source' },
		{ key: 'tags',        label: 'Tags' },
		{ key: 'calls',       label: 'Calls' },
	];
	const COLS_KEY = 'edelhaus.contacts.columns';
	function loadCols(): string[] {
		try {
			const saved = JSON.parse(localStorage.getItem(COLS_KEY) ?? 'null');
			if (Array.isArray(saved) && saved.length) return saved.filter(k => COLUMN_DEFS.some(d => d.key === k));
		} catch { /* fall through to default */ }
		return ['phone', 'tags', 'calls'];
	}
	let visibleCols = $state<string[]>(['phone', 'tags', 'calls']);
	function toggleCol(key: string) {
		visibleCols = visibleCols.includes(key)
			? visibleCols.filter(k => k !== key)
			: COLUMN_DEFS.map(d => d.key).filter(k => visibleCols.includes(k) || k === key);
		try { localStorage.setItem(COLS_KEY, JSON.stringify(visibleCols)); } catch { /* private mode */ }
	}

	let colFilters = $state({ status: '', email: '', title: '', lead_source: '' });
	let showColFilters = $state(false);
	let colFilterTimer: ReturnType<typeof setTimeout> | null = null;
	function onColFilterChange() {
		if (colFilterTimer) clearTimeout(colFilterTimer);
		colFilterTimer = setTimeout(() => loadContacts(activeFilters, 1), 350);
	}
	function clearColFilters() {
		colFilters = { status: '', email: '', title: '', lead_source: '' };
		loadContacts(activeFilters, 1);
	}
	const colFiltersActive = $derived(Object.values(colFilters).some(Boolean));

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
			const res = await apiFetch('/api/contacts/activities', {
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

	function sendBulkSms() {
		if (!bulkSmsBody.trim()) return;
		const count = selectedIds.size;
		askConfirm({
			title: `Send SMS to ${count} contact${count !== 1 ? 's' : ''}?`,
			message: 'This sends real text messages. Contacts without a phone number will be skipped.',
			confirmLabel: 'Send',
			danger: true,
			onConfirm: doSendBulkSms,
		});
	}

	async function doSendBulkSms() {
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
		} else {
			toastError('Failed to log activity');
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

	// ── Workstream 2F: bulk actions (tag / campaign / call list / DNC / delete) ──
	let bulkCampaigns = $state<{ id: string; name: string }[]>([]);
	let bulkCallLists = $state<{ id: string; name: string; campaignName: string | null }[]>([]);
	let bulkPickersLoaded = $state(false);
	let bulkActionRunning = $state(false);

	async function loadBulkPickers() {
		if (bulkPickersLoaded) return;
		bulkPickersLoaded = true;
		try {
			const [cr, lr] = await Promise.all([apiFetch('/api/campaigns'), apiFetch('/api/call-lists')]);
			if (cr.ok) {
				const d = await cr.json();
				bulkCampaigns = (Array.isArray(d) ? d : []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }));
			}
			if (lr.ok) {
				const d = await lr.json();
				bulkCallLists = (Array.isArray(d) ? d : []).map((l: { id: string; name: string; campaign?: { name?: string } }) => ({
					id: l.id,
					name: l.name,
					campaignName: l.campaign?.name ?? null,
				}));
			}
		} catch {
			// Non-fatal — pickers just stay empty
		}
	}

	$effect(() => {
		if (selectedIds.size > 0) loadBulkPickers();
	});

	async function runBulkAction(
		action: 'add_tag' | 'assign_campaign' | 'add_to_call_list' | 'mark_dnc' | 'soft_delete',
		payload?: { tagId?: string; campaignId?: string; callListId?: string },
	) {
		if (!selectedIds.size || bulkActionRunning) return;
		// Snapshot the affected ids (and, for reversible actions, their prior state)
		// BEFORE mutating, so we can offer a genuine Undo afterwards.
		const affectedIds = [...selectedIds];
		const priorStatus = new Map<string, string>();
		if (action === 'mark_dnc') {
			for (const c of contacts) {
				if (selectedIds.has(c.id)) priorStatus.set(c.id, (c as { status?: string }).status || 'active');
			}
		}
		bulkActionRunning = true;
		try {
			const res = await apiFetch('/api/contacts/bulk', {
				method: 'POST',
				body: JSON.stringify({ ids: affectedIds, action, payload }),
			});
			if (res.ok) {
				const d = await res.json();
				const processed: number = d.processed ?? 0;
				selectedIds = new Set();
				await loadContacts(activeFilters, currentPage);
				// Reversible destructive actions get an Undo toast; everything else a plain success.
				if (action === 'soft_delete' && processed > 0) {
					toastUndo(
						`${processed} contact${processed !== 1 ? 's' : ''} deleted`,
						() => undoSoftDelete(affectedIds),
					);
				} else if (action === 'mark_dnc' && processed > 0) {
					toastUndo(
						`${processed} contact${processed !== 1 ? 's' : ''} marked Do Not Call`,
						() => undoMarkDnc(priorStatus),
					);
				} else {
					toastSuccess(`${processed} contact${processed !== 1 ? 's' : ''} updated${d.skipped ? `, ${d.skipped} skipped` : ''}`);
				}
			} else {
				const body = await res.text().catch(() => '');
				toastError(`Bulk action failed${body ? ': ' + body.slice(0, 100) : ''}`);
			}
		} catch {
			toastError('Network error running bulk action');
		} finally {
			bulkActionRunning = false;
		}
	}

	// Undo a soft-delete: clear deleted_at per contact via the existing
	// PATCH /api/contacts/[id] { restore: true } endpoint.
	async function undoSoftDelete(ids: string[]) {
		let restored = 0;
		for (const id of ids) {
			try {
				const res = await apiFetch(`/api/contacts/${id}`, {
					method: 'PATCH',
					body: JSON.stringify({ restore: true }),
				});
				if (res.ok) restored++;
			} catch { /* count only successful restores */ }
		}
		await loadContacts(activeFilters, currentPage);
		if (restored) toastSuccess(`${restored} contact${restored !== 1 ? 's' : ''} restored`);
		else toastError('Could not restore contacts');
	}

	// Undo a DNC mark: put each contact back to its captured prior status via
	// the existing PATCH /api/contacts/[id] { status } endpoint.
	async function undoMarkDnc(priorStatus: Map<string, string>) {
		let restored = 0;
		for (const [id, status] of priorStatus) {
			const target = status === 'do_not_call' ? 'active' : status;
			try {
				const res = await apiFetch(`/api/contacts/${id}`, {
					method: 'PATCH',
					body: JSON.stringify({ status: target }),
				});
				if (res.ok) restored++;
			} catch { /* count only successful restores */ }
		}
		await loadContacts(activeFilters, currentPage);
		if (restored) toastSuccess(`Restored status for ${restored} contact${restored !== 1 ? 's' : ''}`);
		else toastError('Could not restore contacts');
	}

	onMount(async () => {
		visibleCols = loadCols();
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
			if (colFilters.status) params.set('status', colFilters.status);
			if (colFilters.email.trim()) params.set('email', colFilters.email.trim());
			if (colFilters.title.trim()) params.set('title', colFilters.title.trim());
			if (colFilters.lead_source.trim()) params.set('lead_source', colFilters.lead_source.trim());
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

<svelte:head><title>{titleFor('Contacts')}</title></svelte:head>
<svelte:window onclick={(e: MouseEvent) => {
	if (!(e.target as Element)?.closest('.overflow-container')) showOverflow = false;
}} />

<div class="flex flex-col flex-1 h-full">
	<PageHeader title="Contacts">
		{#snippet titleExtra()}
			{#if !loading}
				<span class="text-[#6e6e6e] font-normal ml-2">({totalContacts})</span>
			{/if}
		{/snippet}
		{#snippet actions()}
			<!-- Primary actions: search + New Contact stay visible. -->
			<input bind:value={search} oninput={onSearchChange} placeholder="Search contacts..." class="rounded-lg border border-[var(--c-border)] bg-[var(--c-input)] px-3 py-1.5 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none w-36 sm:w-48" />
			<button onclick={() => { showNewContact = true; showImport = false; }}
				class="rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors">
				+ New
			</button>
			<!-- Secondary actions collapsed into a single overflow menu. -->
			<div class="relative overflow-container">
				<button onclick={() => showOverflow = !showOverflow} aria-label="More actions" aria-haspopup="menu" aria-expanded={showOverflow}
					class="rounded-lg border border-[var(--c-border)] px-3 py-1.5 text-sm leading-none text-[var(--c-text-muted)] hover:text-white hover:border-white transition-colors">
					⋯
				</button>
				{#if showOverflow}
					<div class="absolute right-0 top-full mt-1 bg-[var(--c-card)] border border-[var(--c-border-subtle)] rounded-xl shadow-2xl py-2 w-56 z-30" role="menu">
						<button onclick={() => { showImport = !showImport; showNewContact = false; }}
							class="w-full text-left px-4 py-2 text-sm text-[var(--c-text-secondary)] hover:text-white hover:bg-white/5 transition-colors">
							{showImport ? '⊟ Hide Import' : '⤓ Import CSV'}
						</button>

						<div class="border-t border-[var(--c-border)] my-1"></div>

						<div class="px-4 py-1 text-[10px] uppercase tracking-widest text-[var(--c-text-muted)]">Columns</div>
						{#each COLUMN_DEFS as col}
							<label class="flex items-center gap-2 px-4 py-1.5 text-sm text-[var(--c-text-secondary)] hover:text-white hover:bg-white/5 cursor-pointer transition-colors">
								<input type="checkbox" checked={visibleCols.includes(col.key)} onchange={() => toggleCol(col.key)} class="accent-blue-400" />
								{col.label}
							</label>
						{/each}
						<div class="px-4 py-1.5">
							<button onclick={() => { showColFilters = !showColFilters; }} class="text-xs text-[var(--c-text-muted)] hover:text-white transition-colors">
								{showColFilters ? 'Hide column filters' : 'Show column filters'}
							</button>
						</div>

						<div class="border-t border-[var(--c-border)] my-1"></div>

						<div class="px-4 py-1 text-[10px] uppercase tracking-widest text-[var(--c-text-muted)]">Export</div>
						<a href="/api/export?type=contacts" download class="block px-4 py-2 text-sm text-[var(--c-text-secondary)] hover:text-white hover:bg-white/5 transition-colors">
							Contacts CSV
						</a>
						<a href="/api/export?type=calls" download class="block px-4 py-2 text-sm text-[var(--c-text-secondary)] hover:text-white hover:bg-white/5 transition-colors">
							Calls CSV
						</a>

						<div class="border-t border-[var(--c-border)] my-1"></div>

						<a href="/contacts/dedup" class="block px-4 py-2 text-sm text-[var(--c-text-secondary)] hover:text-white hover:bg-white/5 transition-colors">
							🔗 Find duplicates
						</a>
					</div>
				{/if}
			</div>
		{/snippet}
	</PageHeader>

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
				<EmptyState icon="👥" title="No contacts yet" hint="Create one manually or import a CSV">
					{#snippet action()}
						<a href="/import" class="rounded-lg border border-[#2a2a2a] px-4 py-2 text-xs text-[#888] hover:border-white hover:text-white transition-colors">Import CSV</a>
						<button onclick={() => showNewContact = true} class="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5]">+ New Contact</button>
					{/snippet}
				</EmptyState>
			{:else}
				<div class="sticky top-0 z-10 bg-[var(--c-card)] px-4 py-2 border-b border-[var(--c-border)] grid text-xs uppercase tracking-wider text-[var(--c-text-muted)]" style="grid-template-columns: minmax(0,1fr) repeat({visibleCols.length}, auto);">
					<span>Name / Company</span>
					{#each COLUMN_DEFS.filter(d => visibleCols.includes(d.key)) as col}
						<span class="hidden sm:block px-3 {col.key === 'calls' ? 'text-right' : ''}">{col.label}</span>
					{/each}
				</div>
				{#if showColFilters || colFiltersActive}
					<div class="flex items-center gap-2 px-4 py-2 border-b border-[#1a1a1a] bg-[#0d0d0d] flex-wrap">
						<select bind:value={colFilters.status} onchange={onColFilterChange}
							class="rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white focus:border-white focus:outline-none">
							<option value="">Any status</option>
							{#each ['active', 'inactive', 'do_not_call', 'customer'] as st}
								<option value={st}>{st.replace(/_/g, ' ')}</option>
							{/each}
						</select>
						<input bind:value={colFilters.email} oninput={onColFilterChange} placeholder="Filter email…"
							class="rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none w-32" />
						<input bind:value={colFilters.title} oninput={onColFilterChange} placeholder="Filter title…"
							class="rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none w-32" />
						<input bind:value={colFilters.lead_source} oninput={onColFilterChange} placeholder="Filter lead source…"
							class="rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none w-36" />
						{#if colFiltersActive}
							<button onclick={clearColFilters} class="text-xs text-[#8a8a8a] hover:text-white transition-colors">✕ Clear</button>
						{/if}
					</div>
				{/if}
				<!-- Bulk actions bar -->
				{#if selectedIds.size > 0}
					<div class="flex items-center gap-3 px-8 py-4 bg-blue-400/10 border-b border-blue-400/20 text-xs text-blue-300 flex-wrap">
						<span class="font-medium">{selectedIds.size} selected</span>
						<button onclick={() => showBulkTask = true} class="px-3 py-1 bg-blue-400/20 hover:bg-blue-400/30 rounded text-blue-200 transition-colors">✅ Create Task for All</button>
						<button onclick={() => showBulkActivity = true}
							class="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#9a9a9a] hover:border-white hover:text-white transition-colors">
							📝 Log Activity ({selectedIds.size})
						</button>
				<!-- FIX 4: Bulk SMS button -->
					<button onclick={() => showBulkSms = true} class="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#9a9a9a] hover:border-white hover:text-white transition-colors">
						💬 SMS ({selectedIds.size})
					</button>
					<!-- Workstream 2F: bulk tag / campaign / call list / DNC / delete -->
					<select disabled={bulkActionRunning}
						onchange={(e) => { const el = e.currentTarget as HTMLSelectElement; const v = el.value; el.value = ''; if (v) runBulkAction('add_tag', { tagId: v }); }}
						class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-[#9a9a9a] focus:border-white focus:outline-none disabled:opacity-40">
						<option value="">🏷 Add tag…</option>
						{#each tags as t}
							<option value={t.id}>{t.name}</option>
						{/each}
					</select>
					<select disabled={bulkActionRunning}
						onchange={(e) => { const el = e.currentTarget as HTMLSelectElement; const v = el.value; el.value = ''; if (v) runBulkAction('assign_campaign', { campaignId: v }); }}
						class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-[#9a9a9a] focus:border-white focus:outline-none disabled:opacity-40">
						<option value="">📣 Assign campaign…</option>
						{#each bulkCampaigns as c}
							<option value={c.id}>{c.name}</option>
						{/each}
					</select>
					<select disabled={bulkActionRunning}
						onchange={(e) => { const el = e.currentTarget as HTMLSelectElement; const v = el.value; el.value = ''; if (v) runBulkAction('add_to_call_list', { callListId: v }); }}
						class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-[#9a9a9a] focus:border-white focus:outline-none disabled:opacity-40">
						<option value="">📋 Add to call list…</option>
						{#each bulkCallLists as l}
							<option value={l.id}>{l.name}{l.campaignName ? ` — ${l.campaignName}` : ''}</option>
						{/each}
					</select>
					<button disabled={bulkActionRunning}
						onclick={() => askConfirm({
							title: `Mark ${selectedIds.size} contact${selectedIds.size !== 1 ? 's' : ''} as Do Not Call?`,
							message: 'They will be flagged and skipped by the dialer. You can undo this.',
							confirmLabel: 'Mark DNC',
							danger: true,
							onConfirm: () => runBulkAction('mark_dnc'),
						})}
						class="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#9a9a9a] hover:border-white hover:text-white transition-colors disabled:opacity-40">
						🚫 DNC
					</button>
					<button disabled={bulkActionRunning}
						onclick={() => askConfirm({
							title: `Delete ${selectedIds.size} contact${selectedIds.size !== 1 ? 's' : ''}?`,
							message: 'They will no longer appear in your contact list. You can undo this.',
							confirmLabel: 'Delete',
							danger: true,
							onConfirm: () => runBulkAction('soft_delete'),
						})}
						class="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:border-red-400 hover:text-red-300 transition-colors disabled:opacity-40">
						🗑 Delete
					</button>
					{#if bulkActionRunning}
						<span class="text-[#8a8a8a]">Working…</span>
					{/if}
					<button onclick={() => selectedIds = new Set()} class="text-[#8a8a8a] hover:text-white transition-colors ml-auto">Deselect</button>
				</div>
			{/if}

			<!-- Select-all -->
			<div class="flex items-center gap-2 px-4 py-1.5 border-b border-[#1a1a1a] text-xs text-[#7c7c7c]">
				<input
				type="checkbox"
				checked={allSelected}
				onchange={toggleSelectAll}
				class="accent-blue-400"
				aria-label="Select all contacts on this page" />
				<span>Select all on page</span>
			</div>

			{#each contacts as contact}
				<div class="contact-row flex items-center border-b border-[var(--c-border-ghost)] transition-colors">
					<div class="pl-4 flex-shrink-0">
						<input type="checkbox" checked={selectedIds.has(contact.id)} onchange={() => toggleSelect(contact.id)} class="accent-blue-400" />
					</div>
					<div class="flex-1 min-w-0"><ContactRow {contact} columns={visibleCols} onQuickNote={openQuickNote} onQuickTask={openQuickTask} /></div>
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
					<span class="text-xs text-[#7c7c7c]">Page {currentPage} of {totalPages}</span>
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

<ConfirmDialog
	bind:open={confirmOpen}
	title={confirmState.title}
	message={confirmState.message}
	confirmLabel={confirmState.confirmLabel}
	danger={confirmState.danger}
	onConfirm={confirmState.onConfirm}
/>

	<!-- FIX 4: Bulk SMS modal -->
	{#if showBulkSms}
		<div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onclick={() => showBulkSms = false} role="dialog">
			<div class="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] p-6 w-full max-w-md" onclick={(e) => e.stopPropagation()}>
				<div class="flex items-center justify-between mb-4">
					<h3 class="text-white font-medium">Send SMS to {selectedIds.size} Contact{selectedIds.size !== 1 ? 's' : ''}</h3>
					<button onclick={() => showBulkSms = false} class="text-[#7c7c7c] hover:text-white text-sm"><Icon name="x" size={14} /></button>
				</div>
				<textarea bind:value={bulkSmsBody} placeholder="Message..." rows="4"
					class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none mb-3"></textarea>
				<p class="text-xs text-[#6e6e6e] mb-3">Contacts without a phone number will be skipped.</p>
				{#if bulkSmsResult}<p class="text-xs text-[var(--accent)] mb-2">{bulkSmsResult}</p>{/if}
				<div class="flex gap-2">
					<button onclick={() => showBulkSms = false} class="flex-1 rounded-lg border border-[#2a2a2a] py-2 text-xs text-[#9a9a9a] hover:border-white hover:text-white transition-colors">Cancel</button>
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
					<button onclick={() => showBulkActivity = false} class="text-[#7c7c7c] hover:text-white text-sm"><Icon name="x" size={14} /></button>
				</div>

				<div class="flex flex-wrap gap-1.5 mb-4">
					{#each BULK_ACTIVITY_TYPES as t}
						<button onclick={() => bulkActivityType = t.value}
							class="px-2.5 py-1 rounded-full text-xs transition-colors {bulkActivityType === t.value ? 'bg-white text-black' : 'border border-[#2a2a2a] text-[#8a8a8a] hover:border-[#555] hover:text-[#ccc]'}">
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
					<p class="text-xs text-[var(--accent)] mt-3">{bulkActivityDone}</p>
				{/if}

				<div class="flex gap-2 mt-5">
					<button onclick={() => showBulkActivity = false}
						class="flex-1 rounded-lg border border-[#2a2a2a] py-2 text-xs text-[#9a9a9a] hover:border-white hover:text-white transition-colors">
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
			<p class="text-xs text-[#7c7c7c]">Create follow-up tasks for {selectedIds.size} selected contact{selectedIds.size === 1 ? '' : 's'}.</p>
			<div class="flex gap-2 mt-4">
				<button onclick={() => showBulkTask = false} class="px-4 py-2 border border-[#333] rounded text-xs text-[#999] hover:border-white hover:text-white transition-colors">Cancel</button>
				<button onclick={createBulkTasks} disabled={bulkTaskSaving} class="px-4 py-2 bg-white text-black rounded text-xs font-semibold hover:bg-[#e5e5e5] disabled:opacity-50 transition-colors">{bulkTaskSaving ? 'Creating…' : 'Create Tasks'}</button>
			</div>
		</div>
	</div>
	{/if}

<style>
	/* Dense CRM table: subtle hover fill on each contact row. Dividers and the
	   sticky header are applied inline with design tokens. */
	.contact-row:hover {
		background: var(--c-input);
	}
</style>
