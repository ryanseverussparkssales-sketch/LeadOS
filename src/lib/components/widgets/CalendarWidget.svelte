<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';

	let connected = $state(false);
	let setupError = $state(false);

	onMount(async () => {
		try {
			const r = await apiFetch('/api/calendar/events');
			if (r.status === 404 || r.status === 401 || r.status === 403) {
				setupError = true;
				return;
			}
			if (r.ok) {
				connected = true;
				// future: load events here
			}
		} catch {
			setupError = true;
		}
	});
</script>

<div class="h-full flex flex-col items-center justify-center space-y-3">
	{#if setupError || !connected}
		<div class="text-center space-y-2">
			<p class="text-2xl">📅</p>
			<p class="text-xs text-[#7c7c7c]">Google Calendar not connected</p>
			<a href="/settings"
				class="block rounded-lg border border-[#2a2a2a] px-4 py-2 text-xs text-[#7c7c7c] hover:border-white hover:text-white transition-colors">
				Connect in Settings →
			</a>
		</div>
	{:else}
		<p class="text-xs text-[#6e6e6e]">Calendar connected</p>
	{/if}
</div>
