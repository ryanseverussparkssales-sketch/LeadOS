<script lang="ts">
    import { onMount } from 'svelte';
    import { apiFetch } from '$lib/api';
    import { toastSuccess, toastError } from '$lib/stores/toast';

    type Company = { id: string; name: string; phone: string|null; city: string|null; company_type: string; };
    let groups = $state<Company[][]>([]);
    let loading = $state(true);
    let merging = $state<string | null>(null);

    onMount(async () => {
        const r = await apiFetch('/api/companies/duplicates');
        groups = r.ok ? await r.json() : [];
        loading = false;
    });

    async function merge(group: Company[], keepId: string) {
        if (!confirm('Merge these duplicates into the selected company? This cannot be undone.')) return;
        merging = keepId;
        const mergeIds = group.filter(c => c.id !== keepId).map(c => c.id);
        const r = await apiFetch('/api/companies/merge', { method: 'POST', body: JSON.stringify({ keepId, mergeIds }) });
        if (r.ok) { groups = groups.filter(g => !g.some(c => c.id === keepId)); toastSuccess('Companies merged'); }
        else { toastError('Failed to merge companies'); }
        merging = null;
    }
</script>

<svelte:head><title>Company Dedup — Edelhaus</title></svelte:head>

<div class="flex flex-col flex-1 h-full overflow-y-auto">
    <div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center justify-between">
        <div>
            <h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Company Deduplication</h2>
            <p class="text-xs text-[#555] mt-0.5">Companies with similar names that may be duplicates</p>
        </div>
        <a href="/companies" class="text-xs text-[#444] hover:text-white">← Back</a>
    </div>
    <div class="p-8 max-w-2xl space-y-4">
        {#if loading}
            <p class="text-xs text-[#444]">Scanning for duplicates...</p>
        {:else if groups.length === 0}
            <div class="text-center py-12">
                <p class="text-[var(--accent)] text-sm">✓ No duplicate companies found</p>
            </div>
        {:else}
            <p class="text-xs text-[#555]">{groups.length} potential duplicate group{groups.length !== 1 ? 's' : ''} found</p>
            {#each groups as group}
                <div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
                    <p class="text-xs text-[#555] mb-3">Keep one — others will be merged into it:</p>
                    {#each group as co}
                        <div class="flex items-center justify-between py-2 border-b border-[#1a1a1a] last:border-0">
                            <div>
                                <p class="text-sm text-white">{co.name}</p>
                                <p class="text-xs text-[#555]">{[co.company_type, co.city].filter(Boolean).join(' · ')}</p>
                            </div>
                            <button onclick={() => merge(group, co.id)} disabled={merging === co.id}
                                class="text-xs bg-white text-black px-3 py-1.5 rounded-lg font-medium hover:bg-[#e5e5e5] disabled:opacity-40">
                                {merging === co.id ? '...' : 'Keep this'}
                            </button>
                        </div>
                    {/each}
                </div>
            {/each}
        {/if}
    </div>
</div>
