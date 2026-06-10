<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';

	interface Task { id:string; title:string; task_type:string; priority:string; due_date:string|null; status:string; contact:{name:string}|null; }

	let tasks = $state<Task[]>([]);
	const PRIORITY_DOT: Record<string,string> = { urgent:'bg-red-500', high:'bg-orange-400', medium:'bg-yellow-400', low:'bg-[#444]' };

	onMount(async () => {
		try {
			const res = await apiFetch('/api/tasks?status=pending');
			if (res.ok) tasks = (await res.json()).slice(0, 6);
		} catch (e) {
			console.error('[TasksWidget] fetch error:', e);
			// tasks stays [] — template shows "No pending tasks" empty state
		}
	});

	async function complete(id: string) {
		await apiFetch(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) });
		tasks = tasks.filter(t => t.id !== id);
	}

	function fmtDue(iso: string | null) {
		if (!iso) return '';
		const d = new Date(iso); const now = new Date();
		const diff = Math.ceil((d.getTime() - now.getTime()) / 86400000);
		if (diff < 0) return `${Math.abs(diff)}d overdue`;
		if (diff === 0) return 'today';
		return d.toLocaleDateString(undefined, { month:'short', day:'numeric' });
	}

	function isOverdue(t: Task) { return t.due_date && new Date(t.due_date) < new Date(); }
</script>

<div class="space-y-2 h-full overflow-y-auto">
	{#if tasks.length === 0}
		<div class="flex items-center justify-center h-full">
			<p class="text-xs text-[#6e6e6e]">No pending tasks</p>
		</div>
	{:else}
		{#each tasks as task}
			<div class="flex items-center gap-2 group">
				<button onclick={() => complete(task.id)} class="w-4 h-4 rounded-full border border-[#444] shrink-0 hover:border-[var(--accent)]/60 transition-colors flex items-center justify-center">
				</button>
				<div class="flex-1 min-w-0">
					<p class="text-xs text-white truncate">{task.title}</p>
					{#if task.contact}<p class="text-xs text-[#7c7c7c] truncate">{task.contact.name}</p>{/if}
				</div>
				<div class="shrink-0 flex items-center gap-1.5">
					<div class="w-1.5 h-1.5 rounded-full {PRIORITY_DOT[task.priority] ?? 'bg-[#444]'}"></div>
					{#if task.due_date}
						<p class="text-xs {isOverdue(task) ? 'text-red-400' : 'text-[#6e6e6e]'}">{fmtDue(task.due_date)}</p>
					{/if}
				</div>
			</div>
		{/each}
		<a href="/tasks" class="block text-center text-xs text-[#6e6e6e] hover:text-white pt-2">View all →</a>
	{/if}
</div>
