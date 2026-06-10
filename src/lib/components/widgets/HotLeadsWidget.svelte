<script lang="ts">
    import { onMount } from 'svelte';
    import { apiFetch } from '$lib/api';

    interface HotLead {
        id: string; name: string; company: string; phone: string;
        lead_source: string; intent_label: string;
        created_at: string; contact_score: number | null;
    }

    let leads = $state<HotLead[]>([]);
    let loading = $state(true);

    onMount(async () => {
        try {
            const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
            const r = await apiFetch(`/api/leads-feed?since=${since}&limit=20`);
            if (r.ok) {
                const d = await r.json();
                // Filter for hot intent labels
                leads = (d.data ?? []).filter((l: any) =>
                    ['interested','positive_reply','callback_request','referral'].includes(l.intent_label ?? '')
                );
            }
        } catch {}
        loading = false;
    });

    function timeAgo(iso: string) {
        const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
        if (m < 60) return `${m}m ago`;
        return `${Math.floor(m / 60)}h ago`;
    }

    function intentColor(label: string) {
        if (label === 'interested' || label === 'positive_reply') return 'text-[var(--accent)] bg-[var(--accent)]/12';
        if (label === 'callback_request') return 'text-blue-400 bg-blue-950/50';
        return 'text-yellow-400 bg-yellow-950/50';
    }
</script>

<div class="flex flex-col h-full p-3">
    <div class="flex items-center justify-between mb-3">
        <p class="text-xs font-semibold text-white">🔥 Hot Leads</p>
        <span class="text-[10px] text-[#6e6e6e]">last 48h</span>
    </div>
    {#if loading}
        {#each {length: 3} as _}
            <div class="h-12 bg-[#1a1a1a] rounded-lg animate-pulse mb-2"></div>
        {/each}
    {:else if leads.length === 0}
        <div class="flex-1 flex items-center justify-center">
            <p class="text-xs text-[#333]">No hot leads right now</p>
        </div>
    {:else}
        <div class="flex-1 overflow-y-auto space-y-1.5">
            {#each leads as lead}
                <div class="rounded-lg bg-[#111] border border-[#1a1a1a] px-3 py-2 flex items-center justify-between">
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                            <p class="text-xs font-medium text-white truncate">{lead.name || 'Unknown'}</p>
                            <span class="text-[9px] px-1.5 py-0.5 rounded {intentColor(lead.intent_label)}">{lead.intent_label?.replace(/_/g,' ')}</span>
                        </div>
                        <p class="text-[10px] text-[#6e6e6e]">{lead.company || lead.lead_source} · {timeAgo(lead.created_at)}</p>
                    </div>
                    <div class="flex gap-1 ml-2 flex-shrink-0">
                        {#if lead.phone}
                            <a href="/dialer?contact={lead.id}" class="text-[10px] px-2 py-1 rounded-lg bg-white text-black font-semibold hover:bg-[#e5e5e5]">Call</a>
                        {/if}
                        <a href="/contacts/{lead.id}" class="text-[10px] px-2 py-1 rounded-lg border border-[#2a2a2a] text-[#8a8a8a] hover:text-white">→</a>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>
