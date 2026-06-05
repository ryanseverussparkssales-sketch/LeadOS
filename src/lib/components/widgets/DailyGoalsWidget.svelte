<script lang="ts">
    import { onMount } from 'svelte';
    import { apiFetch } from '$lib/api';

    interface CampaignGoal {
        id: string; name: string;
        calls_today: number; daily_call_goal: number;
        win_count: number; target_wins: number;
        win_label: string | null;
    }

    let campaigns = $state<CampaignGoal[]>([]);
    let loading = $state(true);

    onMount(async () => {
        try {
            const r = await apiFetch('/api/campaigns?status=active');
            if (r.ok) {
                const all = await r.json();
                campaigns = all
                    .filter((c: any) => c.daily_call_goal > 0)
                    .slice(0, 6);
            }
        } catch {}
        loading = false;
    });

    function pct(val: number, max: number): number {
        if (!max) return 0;
        return Math.min(100, Math.round(val / max * 100));
    }
</script>

<div class="flex flex-col h-full p-3">
    <p class="text-xs font-semibold text-white mb-3">Today's Goals</p>
    {#if loading}
        {#each {length: 3} as _}<div class="h-14 bg-[#1a1a1a] rounded-lg animate-pulse mb-2"></div>{/each}
    {:else if campaigns.length === 0}
        <p class="text-xs text-[#333] text-center mt-4">No active campaigns with call goals</p>
    {:else}
        <div class="flex-1 overflow-y-auto space-y-3">
            {#each campaigns as c}
                <div>
                    <div class="flex justify-between text-[10px] mb-1">
                        <span class="text-[#888] truncate flex-1 mr-2">{c.name}</span>
                        <span class="text-white font-mono flex-shrink-0">{c.calls_today}/{c.daily_call_goal}</span>
                    </div>
                    <div class="w-full h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                        <div class="h-full rounded-full transition-all {pct(c.calls_today, c.daily_call_goal) >= 100 ? 'bg-[var(--accent)]' : pct(c.calls_today, c.daily_call_goal) >= 60 ? 'bg-yellow-500' : 'bg-white/40'}"
                            style="width:{pct(c.calls_today, c.daily_call_goal)}%"></div>
                    </div>
                    {#if c.target_wins}
                        <div class="flex justify-between text-[10px] mt-1.5 mb-0.5">
                            <span class="text-[#555]">{c.win_label ?? 'Wins'}</span>
                            <span class="text-[var(--accent)] font-mono">{c.win_count}/{c.target_wins}</span>
                        </div>
                        <div class="w-full h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                            <div class="h-full bg-[var(--accent)] rounded-full" style="width:{pct(c.win_count, c.target_wins)}%"></div>
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</div>
