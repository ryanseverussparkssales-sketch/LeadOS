<script lang="ts">
	import { impersonatingOwner, impersonatingLabel, stopImpersonation } from '$lib/stores/impersonation';
	import Icon from '$lib/components/Icon.svelte';

	function exit() {
		stopImpersonation();
		// Full reload so every view refetches without the impersonation header.
		window.location.href = '/admin';
	}
</script>

{#if $impersonatingOwner}
	<div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-[120] flex items-center gap-3 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] px-4 py-2 text-sm font-medium shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
		<Icon name="user" size={14} />
		<span>Viewing as <strong>{$impersonatingLabel ?? 'account'}</strong></span>
		<button onclick={exit} class="rounded-full bg-black/20 px-2.5 py-0.5 text-xs hover:bg-black/30 transition-colors">Exit</button>
	</div>
{/if}
