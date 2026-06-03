<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount, onDestroy } from 'svelte';
	let { children }: { children: Snippet } = $props();

	let container: HTMLDivElement;
	let visible = $state(false);
	let observer: IntersectionObserver;

	onMount(() => {
		observer = new IntersectionObserver(([entry]) => {
			if (entry.isIntersecting) { visible = true; observer.disconnect(); }
		}, { rootMargin: '100px' });
		if (container) observer.observe(container);
	});

	onDestroy(() => observer?.disconnect());
</script>

<div bind:this={container}>
	{#if visible}
		{@render children()}
	{:else}
		<div class="animate-pulse bg-[#1a1a1a] rounded-lg h-full min-h-[120px]"></div>
	{/if}
</div>
