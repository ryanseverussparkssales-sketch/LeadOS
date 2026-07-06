<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * PageHeader — the established page header pattern.
	 * Display-font title, optional subtitle, right-aligned actions.
	 *
	 * Props:
	 *  - title:      page title (display font, weight 300)
	 *  - subtitle:   optional plain-text subtitle (text-xs #6e6e6e)
	 *  - titleSize:  title font-size in px (default 20; dashboard greeting uses 26)
	 *  - titleExtra: optional snippet rendered inline after the title (e.g. a count)
	 *  - sub:        optional rich subtitle snippet — takes precedence over `subtitle`
	 *  - actions:    optional snippet of right-aligned actions (buttons, selects…)
	 */
	interface Props {
		title: string;
		subtitle?: string;
		titleSize?: number;
		titleExtra?: Snippet;
		sub?: Snippet;
		actions?: Snippet;
	}
	let { title, subtitle, titleSize = 20, titleExtra, sub, actions }: Props = $props();
</script>

<header class="border-b border-[#1e1e1e] px-4 sm:px-8 py-4 flex flex-wrap items-center gap-3 justify-between shrink-0">
	<div class="min-w-0">
		<h2 style="font-family:var(--font-display);font-weight:300;font-size:{titleSize}px;letter-spacing:-.01em;color:#fff">
			{title}{#if titleExtra}{@render titleExtra()}{/if}
		</h2>
		{#if sub}
			{@render sub()}
		{:else if subtitle}
			<p class="text-xs text-[#6e6e6e] mt-0.5">{subtitle}</p>
		{/if}
	</div>
	{#if actions}
		<div class="flex flex-wrap items-center gap-2">
			{@render actions()}
		</div>
	{/if}
</header>
