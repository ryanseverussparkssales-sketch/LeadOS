<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';
	import { toastSuccess, toastError } from '$lib/stores/toast';

	interface Task { id: string; title: string; due_date: string | null; priority: string; status: string; contact?: { name: string; phone: string } | null; }
	let callbacks = $state<Task[]>([]);
	let loading = $state(true);

	onMount(async () => {
		const res = await apiFetch('/api/tasks?task_type=callback&status=pending&limit=50');
		if (res.ok) callbacks = await res.json();
		loading = false;
	});

	function fmtDate(iso: string | null) {
		if (!iso) return 'No date';
		const d = new Date(iso);
		const today = new Date();
		const diff = Math.floor((d.getTime() - today.getTime()) / 86400000);
		if (diff === 0) return 'Today';
		if (diff === 1) return 'Tomorrow';
		if (diff === -1) return 'Yesterday (overdue)';
		if (diff < 0) return `${Math.abs(diff)} days overdue`;
		return d.toLocaleDateString();
	}

	const PRIORITY_COLORS: Record<string, string> = { high: 'text-red-400', medium: 'text-yellow-400', low: 'text-[#555]' };

	async function completeCallback(id: string) {
		const res = await apiFetch(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) });
		if (res.ok) {
			callbacks = callbacks.filter(c => c.id !== id);
			toastSuccess('Callback marked done');
		} else {
			toastError('Failed to complete callback — try again');
		}
	}
</script>

<svelte:head><title>My Callbacks — Edelhaus SDR</title></svelte:head>

<div class="flex-1 overflow-y-auto p-8">
	<div class="flex items-center justify-between mb-6">
		<h2 class="text-white text-lg font-semibold">My Callbacks</h2>
		<p class="text-xs text-[#555]">{callbacks.length} pending</p>
	</div>

	{#if loading}
		<div class="space-y-3">
			{#each [1,2,3] as _}<div class="h-16 bg-[#111] rounded-xl animate-pulse"></div>{/each}
		</div>
	{:else if callbacks.length === 0}
		<div class="text-center py-20">
			<p class="text-4xl mb-3">✓</p>
			<p class="text-white text-sm">No callbacks scheduled</p>
			<p class="text-xs text-[#555] mt-1">Log a callback after a call in the dialer</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each callbacks.sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '')) as cb}
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111] px-5 py-4 flex items-center gap-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-2 mb-1">
							<span class="text-xs {PRIORITY_COLORS[cb.priority] ?? 'text-[#555]'} font-semibold capitalize">{cb.priority}</span>
							<p class="text-sm text-white font-medium truncate">{cb.title}</p>
						</div>
						{#if cb.contact}
							<p class="text-xs text-[#555]">{cb.contact.name} · {cb.contact.phone}</p>
						{/if}
					</div>
					<div class="text-right shrink-0">
						<p class="text-xs text-[#777] mb-2">{fmtDate(cb.due_date)}</p>
						<button onclick={() => completeCallback(cb.id)}
							class="rounded-lg bg-[var(--accent)]/12 border border-[var(--accent)]/40 px-3 py-1 text-xs text-[var(--accent)] hover:bg-[var(--accent-hi)] transition-colors">
							✓ Done
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
