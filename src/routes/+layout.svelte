<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';
	import ErrorBoundary from '$lib/components/ErrorBoundary.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<ErrorBoundary>
	{@render children()}
</ErrorBoundary>
