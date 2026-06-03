<script lang="ts">
	import Dialer from '$lib/components/Dialer.svelte';
</script>

<svelte:head>
	<title>Dialer — LeadOS</title>
</svelte:head>

<div class="flex flex-col flex-1 h-full">
	<div class="border-b border-[#1e1e1e] px-8 py-4">
		<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Dialer</h2>
	</div>
	<Dialer />
</div>
