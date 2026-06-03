<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';

	interface TrashItem {
		id: string;
		name: string;
		deleted_at: string;
		phone?: string;
		company?: string;
	}

	interface TrashData {
		contacts: TrashItem[];
		clients: TrashItem[];
		campaigns: TrashItem[];
		projects: TrashItem[];
		deals: TrashItem[];
	}

	type TabKey = 'all' | 'contacts' | 'clients' | 'campaigns' | 'projects' | 'deals';

	let data = $state<TrashData | null>(null);
	let loading = $state(true);
	let loadError = $state(false);
	let activeTab = $state<TabKey>('all');
	let confirmTarget = $state<{ type: string; id: string; name: string } | null>(null);

	const tabs: { key: TabKey; label: string }[] = [
		{ key: 'all', label: 'All' },
		{ key: 'contacts', label: 'Contacts' },
		{ key: 'clients', label: 'Clients' },
		{ key: 'campaigns', label: 'Campaigns' },
		{ key: 'projects', label: 'Projects' },
		{ key: 'deals', label: 'Deals' },
	];

	const badgeColors: Record<string, string> = {
		contacts: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
		clients: 'bg-purple-500/15 text-purple-400 border border-purple-500/20',
		campaigns: 'bg-green-500/15 text-green-400 border border-green-500/20',
		projects: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20',
		deals: 'bg-orange-500/15 text-orange-400 border border-orange-500/20',
	};

	async function fetchTrash() {
		loading = true;
		loadError = false;
		try {
			const r = await apiFetch('/api/trash');
			if (r.ok) data = await r.json();
		} catch (err) {
			console.error('[trash] Failed to load:', err);
			loadError = true;
		} finally {
			loading = false;
		}
	}

	onMount(fetchTrash);

	function timeAgo(dateStr: string): string {
		const diff = Date.now() - new Date(dateStr).getTime();
		const h = Math.floor(diff / 3600000);
		if (h < 1) return 'just now';
		if (h < 24) return `${h}h ago`;
		const d = Math.floor(h / 24);
		if (d < 30) return `${d}d ago`;
		return `${Math.floor(d / 30)}mo ago`;
	}

	const allItems = $derived(
		data
			? [
					...data.contacts.map((x) => ({ ...x, type: 'contacts' })),
					...data.clients.map((x) => ({ ...x, type: 'clients' })),
					...data.campaigns.map((x) => ({ ...x, type: 'campaigns' })),
					...data.projects.map((x) => ({ ...x, type: 'projects' })),
					...data.deals.map((x) => ({ ...x, type: 'deals' })),
				].sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime())
			: []
	);

	const visibleItems = $derived(
		activeTab === 'all'
			? allItems
			: allItems.filter((x) => x.type === activeTab)
	);

	const totalCount = $derived(allItems.length);

	function tabCount(key: TabKey): number {
		if (!data) return 0;
		if (key === 'all') return totalCount;
		return (data as any)[key]?.length ?? 0;
	}

	async function restore(type: string, id: string) {
		const res = await apiFetch(`/api/${type}/${id}`, {
			method: 'PATCH',
			body: JSON.stringify({ restore: true }),
		});
		if (res.ok && data) {
			data = { ...data, [type]: (data as any)[type].filter((x: TrashItem) => x.id !== id) };
		}
	}

	function askPermanentDelete(type: string, id: string, name: string) {
		confirmTarget = { type, id, name };
	}

	async function confirmPermanentDelete() {
		if (!confirmTarget) return;
		const { type, id } = confirmTarget;
		confirmTarget = null;
		const res = await apiFetch(`/api/${type}/${id}?permanent=true`, { method: 'DELETE' });
		if (res.ok && data) {
			data = { ...data, [type]: (data as any)[type].filter((x: TrashItem) => x.id !== id) };
		}
	}

	function daysUntilPurge(dateStr: string): number {
		const deleted = new Date(dateStr).getTime();
		const purgeAt = deleted + 30 * 24 * 3600000;
		return Math.max(0, Math.ceil((purgeAt - Date.now()) / 86400000));
	}
</script>

<svelte:head><title>Trash — LeadOS</title></svelte:head>

<div class="flex flex-col flex-1 h-full overflow-y-auto bg-[#0a0a0a]">
	<!-- Header -->
	<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center justify-between shrink-0">
		<div>
			<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Trash</h2>
			<p class="text-xs text-[#555] mt-0.5">Deleted items — restored or permanently removed</p>
		</div>
		<p class="text-xs text-[#444]">Items auto-purge after 30 days</p>
	</div>

	<!-- Tabs -->
	<div class="border-b border-[#1e1e1e] px-8 flex gap-1 shrink-0">
		{#each tabs as tab}
			<button
				onclick={() => (activeTab = tab.key)}
				class="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors relative
					{activeTab === tab.key
						? 'text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-white'
						: 'text-[#555] hover:text-[#888]'}"
			>
				{tab.label}
				{#if tabCount(tab.key) > 0}
					<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-[#1e1e1e] text-[#666]">
						{tabCount(tab.key)}
					</span>
				{/if}
			</button>
		{/each}
	</div>

	<!-- Body -->
	<div class="flex-1 px-8 py-6">
		{#if loading}
			<!-- Skeleton -->
			<div class="flex flex-col gap-2">
				{#each Array(5) as _}
					<div class="h-16 rounded-lg bg-[#111] animate-pulse border border-[#1a1a1a]"></div>
				{/each}
			</div>

		{:else if loadError}
			<!-- Network error state -->
			<div class="flex flex-col items-center justify-center py-24 text-center">
				<p class="text-[#555] text-sm font-medium mb-3">Failed to load trash</p>
				<button
					onclick={fetchTrash}
					class="px-4 py-2 text-xs font-medium rounded-md bg-[#1a1a1a] text-[#888] hover:bg-[#222] hover:text-white transition-colors border border-[#252525]"
				>
					Retry
				</button>
			</div>

		{:else if !data || visibleItems.length === 0}
			<!-- Empty state -->
			<div class="flex flex-col items-center justify-center py-24 text-center">
				<div class="w-12 h-12 rounded-full bg-[#1e1e1e] flex items-center justify-center mb-4">
					<svg class="w-6 h-6 text-[#444]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
					</svg>
				</div>
				<p class="text-[#555] text-sm font-medium">Trash is empty</p>
				<p class="text-[#333] text-xs mt-1">Nothing to restore or permanently delete</p>
			</div>

		{:else}
			<!-- Item list -->
			<div class="flex flex-col gap-2">
				{#each visibleItems as item (item.id + item.type)}
					{@const days = daysUntilPurge(item.deleted_at)}
					<div class="flex items-center gap-4 px-4 py-3 rounded-lg bg-[#0f0f0f] border border-[#1a1a1a] hover:border-[#252525] transition-colors group">
						<!-- Type badge -->
						<span class="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 {badgeColors[item.type]}">
							{item.type.slice(0, -1)}
						</span>

						<!-- Name & meta -->
						<div class="flex-1 min-w-0">
							<p class="text-white text-sm font-medium truncate">{item.name}</p>
							<div class="flex items-center gap-3 mt-0.5">
								{#if item.phone}
									<span class="text-[#444] text-xs">{item.phone}</span>
								{/if}
								{#if item.company}
									<span class="text-[#444] text-xs">{item.company}</span>
								{/if}
								<span class="text-[#333] text-xs">Deleted {timeAgo(item.deleted_at)}</span>
							</div>
						</div>

						<!-- Purge countdown -->
						<span class="text-[10px] text-[#333] shrink-0 hidden group-hover:block">
							{days}d until purge
						</span>

						<!-- Actions -->
						<div class="flex items-center gap-2 shrink-0">
							<button
								onclick={() => restore(item.type, item.id)}
								class="px-3 py-1.5 text-xs font-medium rounded-md bg-[#1a1a1a] text-[#888] hover:bg-[#222] hover:text-white transition-colors border border-[#252525]"
							>
								Restore
							</button>
							<button
								onclick={() => askPermanentDelete(item.type, item.id, item.name)}
								class="px-3 py-1.5 text-xs font-medium rounded-md bg-red-500/10 text-red-500/70 hover:bg-red-500/15 hover:text-red-400 transition-colors border border-red-500/10"
							>
								Delete
							</button>
						</div>
					</div>
				{/each}
			</div>

			<!-- Footer notice -->
			<p class="text-xs text-[#333] mt-6 text-center">
				Items are permanently deleted after 30 days
			</p>
		{/if}
	</div>
</div>

<!-- Confirm dialog -->
{#if confirmTarget}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 bg-black/60 z-40 flex items-center justify-center"
		onclick={() => (confirmTarget = null)}
		role="presentation"
	>
		<!-- Modal -->
		<div
			class="bg-[#111] border border-[#252525] rounded-xl p-6 w-full max-w-sm mx-4 z-50 shadow-2xl"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-labelledby="confirm-title"
		>
			<div class="flex items-center gap-3 mb-4">
				<div class="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
					<svg class="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
					</svg>
				</div>
				<div>
					<h3 id="confirm-title" class="text-white text-sm font-medium">Permanently delete?</h3>
					<p class="text-[#555] text-xs mt-0.5 truncate max-w-[200px]">{confirmTarget.name}</p>
				</div>
			</div>
			<p class="text-[#555] text-xs mb-5">
				This action cannot be undone. The record will be removed from the database immediately.
			</p>
			<div class="flex gap-2">
				<button
					onclick={() => (confirmTarget = null)}
					class="flex-1 px-3 py-2 text-xs font-medium rounded-md bg-[#1a1a1a] text-[#888] hover:bg-[#222] hover:text-white transition-colors border border-[#252525]"
				>
					Cancel
				</button>
				<button
					onclick={confirmPermanentDelete}
					class="flex-1 px-3 py-2 text-xs font-medium rounded-md bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors border border-red-500/20"
				>
					Delete forever
				</button>
			</div>
		</div>
	</div>
{/if}
