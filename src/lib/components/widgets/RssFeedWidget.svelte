<script lang="ts">
	import { onMount } from 'svelte';

	interface FeedItem { title: string; link: string; pubDate: string; }
	let items = $state<FeedItem[]>([]);
	let loading = $state(true);
	let error = $state('');

	// Default: HubSpot sales blog — user can change in widget settings
	const FEED_URL = 'https://blog.hubspot.com/sales/rss.xml';

	onMount(async () => {
		try {
			// Use a CORS proxy for RSS feeds
			const proxy = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(FEED_URL)}&count=6`;
			const res = await fetch(proxy);
			const data = await res.json();
			if (data.status === 'ok') items = data.items.slice(0, 6);
			else error = 'Feed unavailable';
		} catch { error = 'Could not load feed'; }
		loading = false;
	});
</script>

<div class="h-full overflow-y-auto space-y-2">
	{#if loading}<p class="text-xs text-[#444] text-center py-4">Loading...</p>
	{:else if error}<p class="text-xs text-red-400 text-center py-4">{error}</p>
	{:else}
		{#each items as item}
			<a href={item.link} target="_blank" class="block hover:bg-white/5 rounded px-1 py-1.5 transition-colors group">
				<p class="text-xs text-white group-hover:underline leading-snug">{item.title}</p>
				<p class="text-xs text-[#444] mt-0.5">{new Date(item.pubDate).toLocaleDateString()}</p>
			</a>
		{/each}
	{/if}
</div>
