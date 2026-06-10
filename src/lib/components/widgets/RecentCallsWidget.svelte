<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';

	interface Call { id:string; created_at:string; outcome:string|null; call_duration_seconds:number|null; contact:{name:string;company:string}|null; }
	let calls = $state<Call[]>([]);

	const outcomeColors: Record<string,string> = {
		answered:'text-[var(--accent)]', voicemail:'text-yellow-400', callback:'text-blue-400',
		not_interested:'text-[#7c7c7c]', do_not_call:'text-red-400', no_answer:'text-[#6e6e6e]'
	};

	onMount(async () => {
		try {
			const res = await apiFetch('/api/calls?limit=6');
			if (res.ok) calls = await res.json();
		} catch (e) {
			console.error('[RecentCallsWidget] fetch error:', e);
			// calls stays [] — template shows empty state gracefully
		}
	});

	function fmt(iso:string) { return new Date(iso).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); }
	function fmtDur(s:number|null) { if(!s) return '—'; return `${Math.floor(s/60)}m ${s%60}s`; }
</script>

<div class="space-y-2 overflow-y-auto h-full">
	{#if calls.length === 0}
		<p class="text-[#6e6e6e] text-xs text-center py-4">No calls yet today</p>
	{:else}
		{#each calls as call}
			<div class="flex items-center gap-3 py-1.5">
				<div class="flex-1 min-w-0">
					<p class="text-white text-xs font-medium truncate">{call.contact?.name ?? '—'}</p>
					<p class="text-[#7c7c7c] text-xs truncate">{call.contact?.company ?? ''}</p>
				</div>
				<div class="text-right shrink-0">
					<p class="text-xs {outcomeColors[call.outcome??''] ?? 'text-[#6e6e6e]'} capitalize">
						{call.outcome?.replace(/_/g,' ') ?? '—'}
					</p>
					<p class="text-xs text-[#333]">{fmt(call.created_at)}</p>
				</div>
			</div>
		{/each}
	{/if}
</div>
