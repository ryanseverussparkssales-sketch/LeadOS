<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * EmptyState — centered empty-list placeholder matching the design system.
	 * icon: emoji/glyph shown in a bordered tile; title: primary line;
	 * hint: secondary line; action: optional snippet of buttons/links.
	 */
	interface Props {
		icon?: string;
		title: string;
		hint?: string;
		action?: Snippet;
	}
	let { icon = '○', title, hint, action }: Props = $props();
</script>

<div class="flex items-center justify-center py-24 text-center">
	<div>
		<div class="w-16 h-16 rounded-2xl border border-[#1a1a1a] bg-[#080808] flex items-center justify-center mx-auto mb-5">
			<span class="text-2xl" aria-hidden="true">{icon}</span>
		</div>
		<p class="text-[#7c7c7c] text-sm">{title}</p>
		{#if hint}
			<p class="text-[#333] text-xs mt-1">{hint}</p>
		{/if}
		{#if action}
			<div class="mt-4 flex gap-3 justify-center">
				{@render action()}
			</div>
		{/if}
	</div>
</div>
