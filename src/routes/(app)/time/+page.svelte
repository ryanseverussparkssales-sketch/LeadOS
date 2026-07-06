<script lang="ts">
	import { onMount } from 'svelte';
	import { titleFor } from '$lib/brand';
	import Icon from '$lib/components/Icon.svelte';
	import { apiFetch } from '$lib/api';
	import { toastSuccess, toastError } from '$lib/stores/toast';
	import DatePicker from '$lib/components/DatePicker.svelte';

	interface Client { id: string; name: string; }
	interface Project { id: string; name: string; }
	interface Campaign { id: string; name: string; }
	interface TimeEntry {
		id: string; description: string; duration_minutes: number;
		entry_date: string; billable: boolean; hourly_rate: number | null;
		client: Client | null; project: Project | null; campaign: Campaign | null;
	}

	let entries = $state<TimeEntry[]>([]);
	let clients = $state<Client[]>([]);
	let projects = $state<Project[]>([]);
	let campaigns = $state<Campaign[]>([]);
	let loading = $state(true);

	// Filters
	let filterClient = $state('');
	let filterProject = $state('');
	let filterDateFrom = $state('');
	let filterDateTo = $state('');

	// New entry form
	let newDesc = $state('');
	let newHours = $state(1);
	let newMins = $state(0);
	let newDate = $state(new Date().toISOString().slice(0, 10));
	let newClient = $state('');
	let newProject = $state('');
	let newCampaign = $state('');
	let newBillable = $state(true);
	let newRate = $state<number | null>(null);
	let saving = $state(false);

	onMount(async () => {
		const [cr, pr, camr] = await Promise.all([
			apiFetch('/api/clients'), apiFetch('/api/projects'), apiFetch('/api/campaigns')
		]);
		clients  = cr.ok ? await cr.json() : [];
		projects = pr.ok ? await pr.json() : [];
		campaigns = camr.ok ? await camr.json() : [];
		await load();
	});

	async function load() {
		loading = true;
		try {
			const params = new URLSearchParams();
			if (filterClient) params.set('client_id', filterClient);
			if (filterProject) params.set('project_id', filterProject);
			if (filterDateFrom) params.set('date_from', filterDateFrom);
			if (filterDateTo) params.set('date_to', filterDateTo);
			const res = await apiFetch(`/api/time-entries?${params}`);
			entries = res.ok ? await res.json() : [];
			if (!res.ok) toastError('Failed to load time entries — try refreshing');
		} catch (e) {
			toastError('Failed to load time entries — try refreshing');
		} finally {
			loading = false;
		}
	}

	async function addEntry() {
		const totalMins = newHours * 60 + newMins;
		if (totalMins <= 0) return;
		saving = true;
		const res = await apiFetch('/api/time-entries', {
			method: 'POST',
			body: JSON.stringify({
				clientId: newClient || undefined,
				projectId: newProject || undefined,
				campaignId: newCampaign || undefined,
				description: newDesc || undefined,
				durationMinutes: totalMins,
				billable: newBillable,
				hourlyRate: newRate || undefined,
				entryDate: newDate,
			}),
		});
		if (res.ok) {
			const entry = await res.json();
			entries = [entry, ...entries];
			newDesc = ''; newHours = 1; newMins = 0;
			newClient = ''; newProject = ''; newCampaign = '';
			toastSuccess('Time entry logged');
		} else {
			toastError('Failed to log time entry — try again');
		}
		saving = false;
	}

	async function deleteEntry(id: string) {
		if (!confirm('Delete this time entry? This cannot be undone.')) return;
		const res = await apiFetch(`/api/time-entries/${id}`, { method: 'DELETE' });
		if (res.ok) {
			entries = entries.filter(e => e.id !== id);
			toastSuccess('Time entry deleted');
		} else {
			toastError('Failed to delete time entry — try again');
		}
	}

	function fmtDuration(mins: number) {
		const h = Math.floor(mins / 60);
		const m = mins % 60;
		return m > 0 ? `${h}h ${m}m` : `${h}h`;
	}

	function fmtEarning(e: TimeEntry) {
		const rate = e.hourly_rate ?? newRate;
		if (!rate || !e.billable) return '';
		return `$${((e.duration_minutes / 60) * rate).toFixed(2)}`;
	}

	const totalMins = $derived(entries.reduce((s, e) => s + e.duration_minutes, 0));
	const billableMins = $derived(entries.filter(e => e.billable).reduce((s, e) => s + e.duration_minutes, 0));

	const filteredProjects = $derived(
		filterClient ? projects.filter((p: Project & { client?: {id:string} }) => (p as Project & {client?: {id:string}}).client?.id === filterClient || true) : projects
	);
</script>

<svelte:head><title>{titleFor('Time')}</title></svelte:head>

<div class="flex flex-col flex-1 h-full">
	<div class="border-b border-[#1e1e1e] px-8 py-4">
		<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Time Tracking</h2>
	</div>

	<div class="flex flex-1 overflow-hidden">
		<!-- Left: filters + add form -->
		<div class="w-72 shrink-0 border-r border-[#1e1e1e] flex flex-col overflow-y-auto">

			<!-- Filters -->
			<div class="p-4 border-b border-[#1e1e1e] space-y-3">
				<p class="text-xs text-[#999] uppercase tracking-widest">Filters</p>
				<select bind:value={filterClient} onchange={load}
					class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white focus:border-white focus:outline-none">
					<option value="">All clients</option>
					{#each clients as c}<option value={c.id}>{c.name}</option>{/each}
				</select>
				<select bind:value={filterProject} onchange={load}
					class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white focus:border-white focus:outline-none">
					<option value="">All projects</option>
					{#each projects as p}<option value={p.id}>{p.name}</option>{/each}
				</select>
				<div class="grid grid-cols-2 gap-2">
					<DatePicker bind:value={filterDateFrom} onchange={(v) => { filterDateFrom = v; load(); }} />
					<DatePicker bind:value={filterDateTo} onchange={(v) => { filterDateTo = v; load(); }} />
				</div>
			</div>

			<!-- Totals -->
			<div class="p-4 border-b border-[#1e1e1e] grid grid-cols-2 gap-3">
				<div class="rounded-lg bg-[#111] border border-[#2a2a2a] p-3">
					<p class="text-xs text-[#7c7c7c] mb-1">Total</p>
					<p class="text-white text-sm font-medium">{fmtDuration(totalMins)}</p>
				</div>
				<div class="rounded-lg bg-[#111] border border-[#2a2a2a] p-3">
					<p class="text-xs text-[#7c7c7c] mb-1">Billable</p>
					<p class="text-[var(--accent)] text-sm font-medium">{fmtDuration(billableMins)}</p>
				</div>
			</div>

			<!-- Add entry form -->
			<div class="p-4 space-y-3 flex-1">
				<p class="text-xs text-[#999] uppercase tracking-widest">Log Time</p>

				<input bind:value={newDesc} placeholder="Description (optional)"
					class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" />

				<div class="grid grid-cols-2 gap-2">
					<div>
						<label class="text-xs text-[#7c7c7c] block mb-1">Hours</label>
						<input type="number" bind:value={newHours} min="0" max="24"
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white focus:border-white focus:outline-none" />
					</div>
					<div>
						<label class="text-xs text-[#7c7c7c] block mb-1">Minutes</label>
						<input type="number" bind:value={newMins} min="0" max="59" step="5"
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white focus:border-white focus:outline-none" />
					</div>
				</div>

				<DatePicker bind:value={newDate} onchange={(v) => newDate = v} />

				<select bind:value={newClient}
					class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white focus:border-white focus:outline-none">
					<option value="">No client</option>
					{#each clients as c}<option value={c.id}>{c.name}</option>{/each}
				</select>
				<select bind:value={newProject}
					class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white focus:border-white focus:outline-none">
					<option value="">No project</option>
					{#each projects as p}<option value={p.id}>{p.name}</option>{/each}
				</select>
				<select bind:value={newCampaign}
					class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white focus:border-white focus:outline-none">
					<option value="">No campaign</option>
					{#each campaigns as c}<option value={c.id}>{c.name}</option>{/each}
				</select>

				<div class="flex items-center gap-2">
					<input type="checkbox" id="billable" bind:checked={newBillable} class="rounded" />
					<label for="billable" class="text-xs text-[#999]">Billable</label>
					{#if newBillable}
						<input type="number" bind:value={newRate} placeholder="$/hr" min="0"
							class="ml-auto w-20 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white focus:border-white focus:outline-none" />
					{/if}
				</div>

				<button onclick={addEntry} disabled={saving || (newHours === 0 && newMins === 0)}
					class="w-full rounded-lg bg-white py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40 transition-colors">
					{saving ? 'Saving...' : 'Log Time Entry'}
				</button>
			</div>
		</div>

		<!-- Right: entries list -->
		<div class="flex-1 overflow-y-auto">
			{#if loading}
		<div class="p-8 space-y-3">
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
		</div>
	{:else if entries.length === 0}
				<div class="flex items-center justify-center py-16 text-center">
					<div>
						<p class="text-[#7c7c7c] text-sm">No time entries yet</p>
						<p class="text-[#333] text-xs mt-1">Log time using the form on the left</p>
					</div>
				</div>
			{:else}
				<div class="divide-y divide-[#1e1e1e]">
					{#each entries as entry}
						<div class="flex items-center gap-4 px-6 py-3 hover:bg-[#111] transition-colors group">
							<div class="w-16 shrink-0 text-right">
								<p class="text-white text-sm font-medium" style="font-family: var(--font-mono)">{fmtDuration(entry.duration_minutes)}</p>
								{#if entry.billable}
									<p class="text-xs text-[var(--accent)]">{fmtEarning(entry)}</p>
								{:else}
									<p class="text-xs text-[#6e6e6e]">non-billable</p>
								{/if}
							</div>
							<div class="flex-1 min-w-0">
								<p class="text-white text-sm truncate">{entry.description || '—'}</p>
								<p class="text-xs text-[#7c7c7c] truncate">
									{[entry.client?.name, entry.project?.name, entry.campaign?.name].filter(Boolean).join(' › ') || 'No project'}
								</p>
							</div>
							<div class="text-right shrink-0">
								<p class="text-xs text-[#7c7c7c]">{new Date(entry.entry_date).toLocaleDateString()}</p>
							</div>
							<button onclick={() => deleteEntry(entry.id)}
								class="opacity-0 group-hover:opacity-100 text-xs text-red-700 hover:text-red-400 transition-all shrink-0"><Icon name="x" size={14} /></button>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
