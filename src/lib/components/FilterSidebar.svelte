<script lang="ts">
	import type { Filters, Tag } from '$lib/stores';

	let { onFilterChange, tags = [] }: { onFilterChange: (f: Filters) => void; tags?: Tag[] } = $props();

	let status = $state('');
	let contactType = $state('');
	let leadSource = $state('');
	let isBusinessOnly = $state(false);
	let company = $state('');
	let selectedTags = $state<string[]>([]);
	let sortBy = $state('name');
	let sortDir = $state<'asc' | 'desc'>('asc');

	function update() {
		onFilterChange({
			status: status || undefined,
			company: company || undefined,
			tags: selectedTags.length ? selectedTags : undefined,
			sortBy,
			sortDir,
			contactType: contactType || undefined,
			leadSource: leadSource || undefined,
			isBusinessOnly: isBusinessOnly || undefined,
		});
	}

	function toggleTag(id: string) {
		selectedTags = selectedTags.includes(id)
			? selectedTags.filter(t => t !== id)
			: [...selectedTags, id];
		update();
	}

	function clearAll() {
		status = ''; company = ''; selectedTags = []; sortBy = 'name'; sortDir = 'asc';
		contactType = ''; leadSource = ''; isBusinessOnly = false;
		update();
	}
</script>

<div class="w-[220px] shrink-0 space-y-5">
	<div>
		<label class="block text-xs text-[#999] uppercase tracking-widest mb-2">Status</label>
		<select bind:value={status} onchange={update} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
			<option value="">All</option>
			<option value="active">Active</option>
			<option value="do_not_call">Do Not Call</option>
			<option value="archived">Archived</option>
		</select>
	</div>

	<div>
		<label class="block text-xs text-[#999] uppercase tracking-widest mb-2">Company</label>
		<input
			type="text"
			bind:value={company}
			oninput={update}
			placeholder="Search..."
			class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none"
		/>
	</div>

	{#if tags.length > 0}
		<div>
			<label class="block text-xs text-[#999] uppercase tracking-widest mb-2">Tags</label>
			<div class="space-y-2">
				{#each tags as tag}
					<label class="flex items-center gap-2 cursor-pointer">
						<input
							type="checkbox"
							checked={selectedTags.includes(tag.id)}
							onchange={() => toggleTag(tag.id)}
							class="rounded"
						/>
						<span class="text-sm" style="color: {tag.color}">{tag.name}</span>
					</label>
				{/each}
			</div>
		</div>
	{/if}

	<div>
		<label class="block text-xs text-[#999] uppercase tracking-widest mb-2">Type</label>
		<select bind:value={contactType} onchange={update} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
			<option value="">All types</option>
			<option value="lead">Lead</option>
			<option value="prospect">Prospect</option>
			<option value="customer">Customer</option>
			<option value="partner">Partner</option>
			<option value="vendor">Vendor</option>
		</select>
	</div>

	<div>
		<label class="block text-xs text-[#999] uppercase tracking-widest mb-2">Lead Source</label>
		<select bind:value={leadSource} onchange={update} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
			<option value="">All sources</option>
			<option value="cold_call">Cold Call</option>
			<option value="csv_import">CSV Import</option>
			<option value="web_scrape">Web Scrape</option>
			<option value="referral">Referral</option>
			<option value="manual">Manual</option>
			<option value="linkedin">LinkedIn</option>
			<option value="website">Website</option>
		</select>
	</div>

	<label class="flex items-center gap-2 cursor-pointer">
		<input type="checkbox" bind:checked={isBusinessOnly} onchange={update} class="rounded" />
		<span class="text-sm text-white">B2B only</span>
	</label>

	<div>
		<label class="block text-xs text-[#999] uppercase tracking-widest mb-2">Sort By</label>
		<select bind:value={sortBy} onchange={update} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none mb-2">
			<option value="name">Name</option>
			<option value="company">Company</option>
			<option value="last_called_at">Last Called</option>
			<option value="call_count">Call Count</option>
		</select>
		<div class="flex gap-2">
			<button
				onclick={() => { sortDir = 'asc'; update(); }}
				class="flex-1 py-1 text-xs rounded border transition-colors {sortDir === 'asc' ? 'border-white text-white' : 'border-[#2a2a2a] text-[#8a8a8a] hover:border-[#444]'}"
			>ASC</button>
			<button
				onclick={() => { sortDir = 'desc'; update(); }}
				class="flex-1 py-1 text-xs rounded border transition-colors {sortDir === 'desc' ? 'border-white text-white' : 'border-[#2a2a2a] text-[#8a8a8a] hover:border-[#444]'}"
			>DESC</button>
		</div>
	</div>

	<button onclick={clearAll} class="w-full py-2 text-xs text-[#7c7c7c] hover:text-white transition-colors">
		Clear Filters
	</button>
</div>
