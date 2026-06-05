<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { apiFetch } from '$lib/api';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	let callsToday = $state(0);
	let sessionActive = $state(false);
	let sessionSeconds = $state(0);
	let sessionTimer: ReturnType<typeof setInterval> | null = null;

	const currentPath = $derived($page.url.pathname);
	const onDialer = $derived(currentPath === '/dialer');

	function formatTime(secs: number): string {
		const m = Math.floor(secs / 60);
		const s = secs % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	async function loadTodayStats() {
		try {
			const today = new Date().toISOString().slice(0, 10);
			const res = await apiFetch(`/api/calls?limit=200`);
			if (res.ok) {
				const data: Array<{ created_at: string }> = await res.json();
				callsToday = data.filter(c =>
					c.created_at && c.created_at.slice(0, 10) === today
				).length;
			}
		} catch {}
	}

	function handleSessionStart() {
		sessionActive = true;
		sessionSeconds = 0;
		if (!sessionTimer) {
			sessionTimer = setInterval(() => sessionSeconds++, 1000);
		}
	}

	function handleSessionEnd() {
		sessionActive = false;
		if (sessionTimer) { clearInterval(sessionTimer); sessionTimer = null; }
		loadTodayStats();
	}

	function handleCallCompleted() {
		callsToday++;
	}

	onMount(() => {
		loadTodayStats();
		window.addEventListener('leados:session-start', handleSessionStart);
		window.addEventListener('leados:session-end', handleSessionEnd);
		window.addEventListener('leados:call-completed', handleCallCompleted);
	});

	onDestroy(() => {
		if (sessionTimer) clearInterval(sessionTimer);
		window.removeEventListener('leados:session-start', handleSessionStart);
		window.removeEventListener('leados:session-end', handleSessionEnd);
		window.removeEventListener('leados:call-completed', handleCallCompleted);
	});
</script>

<div class="fixed bottom-0 left-0 right-0 z-20 bg-[var(--c-surface-0)] border-t border-[var(--c-border)] flex items-center justify-between pl-16 pr-6 py-2">
	<div class="flex items-center gap-6">
		<div class="flex items-center gap-2">
			<span class="text-[var(--c-text-ghost)] text-xs">Today</span>
			<span class="text-white font-mono text-sm font-semibold">{callsToday}</span>
			<span class="text-[var(--c-text-ghost)] text-xs">calls</span>
		</div>
		{#if sessionActive}
			<div class="flex items-center gap-2">
				<span class="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse"></span>
				<span class="text-[var(--accent)] font-mono text-sm">{formatTime(sessionSeconds)}</span>
				<span class="text-[var(--c-text-ghost)] text-xs">session</span>
			</div>
		{/if}
	</div>
	<div class="flex items-center gap-3">
		{#if !onDialer}
			<button
				onclick={() => goto('/dialer')}
				class="rounded-lg bg-white px-4 py-1 text-xs font-semibold text-black hover:bg-[var(--c-accent-hover)] transition-colors"
			>
				▶ Dialer
			</button>
		{:else if sessionActive}
			<span class="text-xs text-[var(--accent)]">● Power Dialer Active</span>
		{:else}
			<span class="text-xs text-[var(--c-text-ghost)]">In Power Dialer</span>
		{/if}
	</div>
</div>
