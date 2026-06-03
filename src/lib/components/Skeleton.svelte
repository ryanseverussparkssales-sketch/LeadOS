<script lang="ts">
	let { lines = 3, height = 'h-4', className = '' }: { lines?: number; height?: string; className?: string } = $props();
</script>

<div class="space-y-2 {className}">
	{#each Array(lines) as _, i}
		<div class="{height} rounded-lg bg-[#1a1a1a] animate-pulse" style="width:{i === lines-1 && lines > 1 ? '60%' : '100%'}"></div>
	{/each}
</div>
