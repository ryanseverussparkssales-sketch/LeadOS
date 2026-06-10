<script lang="ts">
    import { onMount } from 'svelte';
    import { apiFetch } from '$lib/api';

    interface Win {
        id: string; outcome: string; weight: number; created_at: string;
        contact: { name: string; company: string } | null;
        campaign: { name: string } | null;
    }

    let wins = $state<Win[]>([]);
    let loading = $state(true);

    onMount(async () => {
        try {
            // campaign_wins table has outcome, weight, contact_id, campaign_id
            const r = await apiFetch('/api/wins/recent?limit=15');
            if (r.ok) wins = await r.json();
        } catch {}
        loading = false;
    });

    function timeAgo(iso: string) {
        const d = Date.now() - new Date(iso).getTime();
        const m = Math.floor(d / 60000);
        if (m < 60) return `${m}m`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h`;
        return `${Math.floor(h / 24)}d`;
    }
</script>

<div class="flex flex-col h-full p-3">
    <p class="text-xs font-semibold text-white mb-3">Recent Wins</p>
    {#if loading}
        {#each {length: 4} as _}<div class="h-10 bg-[#1a1a1a] rounded-lg animate-pulse mb-1.5"></div>{/each}
    {:else if wins.length === 0}
        <div class="flex-1 flex items-center justify-center">
            <p class="text-xs text-[#333]">No wins yet — start dialing!</p>
        </div>
    {:else}
        <div class="flex-1 overflow-y-auto space-y-1">
            {#each wins as win}
                <div class="rounded-lg bg-[var(--accent)]/12 border border-[var(--accent)]/40 px-3 py-2 flex items-center justify-between">
                    <div>
                        <p class="text-xs text-[var(--accent)] font-medium">{win.contact?.name ?? 'Unknown'}</p>
                        <p class="text-[10px] text-[#7c7c7c]">{win.outcome?.replace(/_/g,' ')} · {win.campaign?.name ?? 'Campaign'}</p>
                    </div>
                    <div class="flex items-center gap-2">
                        {#if win.weight > 1}<span class="text-[10px] text-[var(--accent)] font-mono">×{win.weight}</span>{/if}
                        <span class="text-[10px] text-[#333]">{timeAgo(win.created_at)}</span>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>
