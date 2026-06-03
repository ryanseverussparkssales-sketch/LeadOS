<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { toastError } from '$lib/stores/toast';

	let { children, fallback }: { children: Snippet; fallback?: string } = $props();

	function handleRejection(e: PromiseRejectionEvent) {
		const reason = e.reason;
		console.error('[ErrorBoundary] Unhandled promise rejection:', reason);

		// Suppress auth/network noise that should not alarm the user.
		const msg: string = reason?.message ?? String(reason ?? '');
		if (!msg || msg === 'Failed to fetch') return;

		// Don't surface internal Supabase auth refresh errors as user-facing toasts.
		if (msg.toLowerCase().includes('refresh') || msg.toLowerCase().includes('auth')) return;

		toastError(msg.length > 120 ? msg.slice(0, 117) + '…' : msg, 6000);
	}

	onMount(() => {
		window.addEventListener('unhandledrejection', handleRejection);
		// Return cleanup from onMount — only runs client-side, never during SSR
		return () => {
			window.removeEventListener('unhandledrejection', handleRejection);
		};
	});
</script>

{@render children()}
