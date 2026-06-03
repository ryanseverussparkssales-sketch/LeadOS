<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import { toastSuccess, toastError } from '$lib/stores/toast';

	interface Contact { id:string; name:string; company:string; }
	interface Task { id:string; title:string; description:string|null; task_type:string; priority:string; status:string; due_date:string|null; contact:Contact|null; ai_suggested:boolean; created_at:string; completed_at:string|null; }

	type FilterStatus = 'pending' | 'in_progress' | 'completed' | 'all';
	let filterStatus = $state<FilterStatus>('pending');
	let tasks = $state<Task[]>([]);
	let loading = $state(true);
	let contacts = $state<Contact[]>([]);

	// New task form
	let showNew = $state(false);
	let nTitle = $state(''); let nDesc = $state(''); let nType = $state('follow_up');
	let nPriority = $state('medium'); let nDue = $state(''); let nContact = $state('');
	let saving = $state(false);

	const TYPE_ICONS: Record<string,string> = { follow_up:'↩', email:'✉', call:'📞', meeting:'📅', other:'·' };
	const PRIORITY_COLORS: Record<string,string> = { urgent:'text-red-400', high:'text-orange-400', medium:'text-yellow-400', low:'text-[#666]' };

	onMount(async () => {
		const cr = await apiFetch('/api/contacts/filtered?limit=200');
		contacts = cr.ok ? await cr.json() : [];
		await load();
	});

	async function load() {
		loading = true;
		const params = new URLSearchParams();
		if (filterStatus !== 'all') params.set('status', filterStatus);
		const res = await apiFetch(`/api/tasks?${params}`);
		tasks = res.ok ? await res.json() : [];
		loading = false;
	}

	async function createTask() {
		if (!nTitle.trim()) return;
		saving = true;
		const res = await apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify({ title: nTitle, description: nDesc || null, taskType: nType, priority: nPriority, dueDate: nDue || null, contactId: nContact || null }) });
		if (res.ok) { tasks = [await res.json(), ...tasks]; showNew = false; nTitle = ''; nDesc = ''; nContact = ''; toastSuccess('Task created'); }
		else { toastError('Failed to create task'); }
		saving = false;
	}

	async function complete(task: Task) {
		const res = await apiFetch(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) });
		if (res.ok) {
			if (filterStatus !== 'all' && filterStatus !== 'completed') {
				tasks = tasks.filter(t => t.id !== task.id);
			} else {
				tasks = tasks.map(t => t.id === task.id ? { ...t, status: 'completed' } : t);
			}
			toastSuccess('Task completed');
		}
	}

	let confirmDeleteId = $state<string | null>(null);

	async function deleteTask(id: string) {
		await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' });
		tasks = tasks.filter(t => t.id !== id);
		confirmDeleteId = null;
	}

	function isOverdue(t: Task) { return t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed'; }
	function fmtDue(iso: string | null) {
		if (!iso) return null;
		const d = new Date(iso);
		const today = new Date(); today.setHours(0,0,0,0);
		const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000);
		if (diff < 0) return `${Math.abs(diff)}d overdue`;
		if (diff === 0) return 'Due today';
		if (diff === 1) return 'Due tomorrow';
		return `Due ${d.toLocaleDateString()}`;
	}

	// Priority + overdue quick filters
	let filterPriority = $state<string | null>(null);
	let filterOverdueOnly = $state(false);

	const displayedTasks = $derived(
		tasks.filter(t => {
			if (filterPriority && t.priority !== filterPriority) return false;
			if (filterOverdueOnly) {
				const isOv = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed';
				if (!isOv) return false;
			}
			return true;
		})
	);

	const pending = $derived(tasks.filter(t => t.status !== 'completed').length);
	const overdue = $derived(tasks.filter(t => isOverdue(t)).length);
</script>

<svelte:head><title>Tasks — LeadOS</title></svelte:head>

<div class="flex flex-col flex-1 h-full">
	<div class="border-b border-[#1e1e1e] px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-2">
		<div class="flex items-center gap-3">
			<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Tasks</h2>
			{#if overdue > 0}<span class="text-xs bg-red-900/30 text-red-400 px-2 py-0.5 rounded-full">{overdue} overdue</span>{/if}
			{#if pending > 0}<span class="text-xs text-[#555]">{pending} pending</span>{/if}
		</div>
		<div class="flex flex-wrap gap-2">
			<!-- Filter tabs -->
			{#each (['pending','in_progress','completed','all'] as FilterStatus[]) as s}
				<button onclick={() => { filterStatus = s; load(); }}
					class="rounded-lg px-3 py-1.5 text-xs transition-colors {filterStatus === s ? 'bg-white/10 text-white' : 'text-[#666] hover:text-white'} capitalize">
					{s === 'in_progress' ? 'In Progress' : s}
				</button>
			{/each}
			<button onclick={() => showNew = !showNew}
				class="rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors">
				+ New Task
			</button>
		</div>
	</div>

	{#if showNew}
		<div class="border-b border-[#1e1e1e] bg-[#0d0d0d] px-8 py-4">
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 max-w-4xl">
				<div class="sm:col-span-2 lg:col-span-2">
					<input bind:value={nTitle} placeholder="Task title..." class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
				</div>
				<select bind:value={nContact} class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
					<option value="">No contact</option>
					{#each contacts as c}<option value={c.id}>{c.name}</option>{/each}
				</select>
				<DatePicker bind:value={nDue} onchange={(v) => nDue = v} />
				<div class="sm:col-span-2 lg:col-span-2">
					<textarea bind:value={nDesc} rows="2" placeholder="Description (optional)" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none"></textarea>
				</div>
				<select bind:value={nType} class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
					<option value="follow_up">Follow Up</option>
					<option value="email">Email</option>
					<option value="call">Call Back</option>
					<option value="meeting">Meeting</option>
					<option value="other">Other</option>
				</select>
				<select bind:value={nPriority} class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
					<option value="low">Low</option>
					<option value="medium">Medium</option>
					<option value="high">High</option>
					<option value="urgent">Urgent</option>
				</select>
				<div class="sm:col-span-2 lg:col-span-4 flex gap-2">
					<button onclick={createTask} disabled={saving || !nTitle.trim()} class="rounded-lg bg-white px-5 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40">
						{saving ? 'Creating...' : 'Create Task'}
					</button>
					<button onclick={() => showNew = false} class="text-xs text-[#555] hover:text-white px-3">Cancel</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Priority + overdue quick-filter chips -->
	<div class="flex gap-2 flex-wrap px-8 py-4 border-b border-[var(--c-border)]">
		<button onclick={() => filterOverdueOnly = !filterOverdueOnly}
			class="px-3 py-1 rounded-lg text-xs transition-colors {filterOverdueOnly ? 'bg-red-950 text-red-400 border border-red-900' : 'border border-[var(--c-border-subtle)] text-[#555] hover:text-white'}">
			🔴 Overdue
		</button>
		{#each (['urgent','high','medium','low'] as string[]) as pri}
			<button onclick={() => filterPriority = filterPriority === pri ? null : pri}
				class="px-3 py-1 rounded-lg text-xs capitalize transition-colors {filterPriority === pri ? 'bg-white text-black' : 'border border-[var(--c-border-subtle)] text-[#555] hover:text-white'}">
				{pri}
			</button>
		{/each}
		{#if filterPriority || filterOverdueOnly}
			<button onclick={() => { filterPriority = null; filterOverdueOnly = false; }}
				class="px-3 py-1 rounded-lg text-xs text-[#444] hover:text-white">
				✕ Clear
			</button>
		{/if}
	</div>

	<div class="flex-1 overflow-y-auto">
		{#if loading}
	{:else if displayedTasks.length === 0}
			<div class="flex items-center justify-center py-16 text-center">
				<div>
					{#if filterPriority || filterOverdueOnly}
						<p class="text-[#444] text-sm">No tasks match the active filters</p>
						<button onclick={() => { filterPriority = null; filterOverdueOnly = false; }} class="mt-2 text-xs text-white underline">Clear filters</button>
					{:else}
						<p class="text-[#444] text-sm">No tasks</p>
						<button onclick={() => showNew = true} class="mt-2 text-xs text-white underline">Create one</button>
					{/if}
				</div>
			</div>
		{:else}
			<div class="divide-y divide-[#1e1e1e]">
				{#each displayedTasks as task}
					<div class="flex items-center gap-4 px-8 py-4 hover:bg-[#111] transition-colors group {isOverdue(task) ? 'border-l-2 border-red-900' : ''}">
						<!-- Complete checkbox -->
						<button onclick={() => complete(task)} class="w-5 h-5 rounded-full border-2 shrink-0 transition-colors {task.status === 'completed' ? '