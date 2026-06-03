<script lang="ts">
	let { feature = 'This feature', tier = 'Pro', description = '' }: {
		feature?: string;
		tier?: 'Pro' | 'Agency';
		description?: string;
	} = $props();
</script>

<div class="rounded-xl border border-yellow-800/30 bg-yellow-950/10 p-6 text-center space-y-3">
	<p class="text-2xl">🔒</p>
	<p class="text-white font-semibold text-sm">{feature} is a {tier} feature</p>
	{#if description}
		<p class="text-xs text-[#666] leading-relaxed max-w-xs mx-auto">{description}</p>
	{/if}
	<a href="/#pricing" target="_blank"
		class="inline-block rounded-lg bg-white px-5 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors">
		Upgrade to {tier} →
	</a>
</div>
