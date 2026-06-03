<script lang="ts">
	import { onMount } from 'svelte';

	let online = $state(true);
	let reconnecting = $state(false);

	function handleOnline() { online = true; reconnecting = false; }
	function handleOffline() { online = false; }

	onMount(() => {
		online = navigator.onLine;
		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);
		// return cleanup — runs client-side only, avoids SSR window reference
		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	});
</script>

{#if !online}
	<div class="fixed top-0 left-0 right-0 z-[500] bg-red-900 text-white text-xs text-center py-2 flex items-center justify-center gap-2">
		<div class="w-2 h-2 rounded-full bg-red-400 animate-pulse"></div>
		<span>No internet connection — some features may not work</span>
	</div>
{/if}
