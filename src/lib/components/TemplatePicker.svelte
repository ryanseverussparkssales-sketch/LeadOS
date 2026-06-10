<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { apiFetch } from '$lib/api';

	let { type = 'email', onSelect, contactName = '', contactCompany = '' }: {
		type?: 'email' | 'sms';
		onSelect: (subject: string, body: string, templateId: string) => void;
		contactName?: string;
		contactCompany?: string;
	} = $props();

	interface Template { id:string; name:string; type:string; category:string; subject:string|null; body:string; use_count:number; }

	let templates = $state<Template[]>([]);
	let loading = $state(true);
	let open = $state(false);
	let filterCat = $state('');
	let search = $state('');

	const CATEGORIES = ['all','general','follow_up','thank_you','intro','proposal','breakup','custom'];
	const CAT_LABELS: Record<string,string> = { all:'All', general:'General', follow_up:'Follow-up', thank_you:'Thank You', intro:'Introduction', proposal:'Proposal', breakup:'Breakup', custom:'Custom' };

	onMount(async () => {
		const res = await apiFetch(`/api/templates?type=${type}`);
		if (res.ok) templates = await res.json();
		loading = false;
	});

	function substitute(text: string) {
		return text
			.replace(/\{name\}/gi, contactName || 'there')
			.replace(/\{company\}/gi, contactCompany || 'your company')
			.replace(/\{rep_name\}/gi, 'Ryan')
			.replace(/\{first_name\}/gi, contactName.split(' ')[0] || 'there');
	}

	async function useTemplate(t: Template) {
		const body = substitute(t.body);
		const subject = t.subject ? substitute(t.subject) : '';
		onSelect(subject, body, t.id);
		// Increment use count (fire-and-forget)
		apiFetch(`/api/templates/${t.id}`, { method:'PATCH' }).catch(() => {});
		open = false;
	}

	const filtered = $derived(templates.filter(t => {
		if (filterCat && filterCat !== 'all' && t.category !== filterCat) return false;
		if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.body.toLowerCase().includes(search.toLowerCase())) return false;
		return true;
	}));
</script>

<div class="relative">
	<button onclick={() => open = !open}
		class="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#999] hover:border-white hover:text-white transition-colors flex items-center gap-1.5">
		<span>📋</span> Templates
		{#if templates.length > 0}<span class="text-[#6e6e6e]">({templates.length})</span>{/if}
	</button>

	{#if open}
		<div class="absolute bottom-full mb-2 left-0 w-80 bg-[#111111] border border-[#2a2a2a] rounded-xl shadow-2xl z-50 overflow-hidden">
			<!-- Search + filter -->
			<div class="p-3 border-b border-[#1e1e1e] space-y-2">
				<input bind:value={search} placeholder="Search templates..." class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" />
				<div class="flex gap-1 flex-wrap">
					{#each CATEGORIES as cat}
						<button onclick={() => filterCat = cat === 'all' ? '' : cat}
							class="rounded px-2 py-0.5 text-xs transition-colors {(filterCat || 'all') === cat ? 'bg-white/10 text-white' : 'text-[#7c7c7c] hover:text-white'}">
							{CAT_LABELS[cat]}
						</button>
					{/each}
				</div>
			</div>

			<!-- Template list -->
			<div class="max-h-56 overflow-y-auto">
				{#if loading}
					<p class="text-xs text-[#6e6e6e] text-center py-4">Loading...</p>
				{:else if filtered.length === 0}
					<p class="text-xs text-[#6e6e6e] text-center py-4">No templates found</p>
				{:else}
					{#each filtered as t}
						<button onclick={() => useTemplate(t)}
							class="w-full text-left px-4 py-3 border-b border-[#1a1a1a] last:border-0 hover:bg-white/5 transition-colors">
							<div class="flex items-center justify-between mb-1">
								<p class="text-xs text-white font-medium truncate">{t.name}</p>
								<span class="text-xs text-[#333] shrink-0 ml-2">{t.use_count}×</span>
							</div>
							{#if t.subject}<p class="text-xs text-[#7c7c7c] truncate">Subject: {t.subject}</p>{/if}
							<p class="text-xs text-[#8a8a8a] truncate">{t.body.slice(0, 80)}...</p>
						</button>
					{/each}
				{/if}
			</div>

			<div class="p-2 border-t border-[#1e1e1e] flex justify-between items-center">
				<a href="/templates" onclick={() => open = false} class="text-xs text-[#6e6e6e] hover:text-white">Manage templates →</a>
				<button onclick={() => open = false} class="text-xs text-[#6e6e6e] hover:text-white"><Icon name="x" size={14} /></button>
			</div>
		</div>
	{/if}
</div>
