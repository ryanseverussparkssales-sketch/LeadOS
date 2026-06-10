<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import Icon from '$lib/components/Icon.svelte';
    import { apiFetch } from '$lib/api';

    interface Lead {
        id: string; name: string; company: string|null; phone: string|null;
        email: string|null; lead_source: string|null; created_at: string;
        status: string; contact_score: number|null;
    }

    let leads = $state<Lead[]>([]);
    let loading = $state(true);
    let seenIds = $state<Set<string>>(new Set());
    let campaigns = $state<{id:string;name:string}[]>([]);
    let assigningId = $state<string | null>(null);
    let assignCampaignId = $state('');
    let addingToCalendar = $state<string | null>(null);
    let pollInterval: ReturnType<typeof setInterval>;

    // Lead source badge colors
    const SOURCE_COLORS: Record<string, string> = {
        webhook: 'text-blue-400 bg-blue-400/10',
        zapier: 'text-orange-400 bg-orange-400/10',
        facebook: 'text-blue-300 bg-blue-300/10',
        google: 'text-yellow-400 bg-yellow-400/10',
        linkedin: 'text-blue-500 bg-blue-500/10',
        website: 'text-[var(--accent)] bg-[var(--accent)]/12',
        web_scrape: 'text-[var(--accent)] bg-[var(--accent)]/12',
        csv_import: 'text-[#888] bg-[#1a1a1a]',
        manual: 'text-[#8a8a8a] bg-[#1a1a1a]',
    };

    const LEAD_SOURCES = ['webhook','zapier','facebook','google','linkedin','website','web_scrape'];

    async function loadLeads() {
        const r = await apiFetch('/api/contacts/filtered?sort=created_at&order=desc&limit=20');
        if (r.ok) {
            const all = await r.json();
            const filtered = (all.data ?? all ?? [])
                .filter((c: Lead) => LEAD_SOURCES.includes(c.lead_source ?? '') ||
                    (Date.now() - new Date(c.created_at).getTime() < 24 * 3600000))
                .slice(0, 12);
            leads = filtered;
        }
        loading = false;
    }

    async function loadCampaigns() {
        const r = await apiFetch('/api/campaigns?status=active');
        if (r.ok) campaigns = (await r.json()).map((c: any) => ({id: c.id, name: c.name}));
    }

    async function addToCampaign(lead: Lead, campaignId: string) {
        if (!campaignId) return;
        addingToCalendar = lead.id;
        await apiFetch(`/api/campaigns/${campaignId}/contacts`, {
            method: 'POST',
            body: JSON.stringify({ mode: 'existing', contactIds: [lead.id] }),
        });
        assigningId = null;
        assignCampaignId = '';
        addingToCalendar = null;
        seenIds = new Set([...seenIds, lead.id]);
    }

    async function dismiss(id: string) {
        await apiFetch(`/api/contacts/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'prospect' }) });
        leads = leads.filter(l => l.id !== id);
    }

    const newCount = $derived(leads.filter(l => !seenIds.has(l.id)).length);

    function fmtTime(iso: string) {
        const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
        if (diff < 1) return 'just now';
        if (diff < 60) return `${diff}m ago`;
        if (diff < 1440) return `${Math.floor(diff/60)}h ago`;
        return `${Math.floor(diff/1440)}d ago`;
    }

    onMount(() => {
        loadLeads();
        loadCampaigns();
        pollInterval = setInterval(loadLeads, 30000);
    });
    onDestroy(() => clearInterval(pollInterval));
</script>

<div class="leads-widget">
    <div class="lw-header">
        <div class="lw-title-row">
            <span class="lw-title">Live Leads</span>
            {#if newCount > 0}
                <span class="lw-badge">{newCount} new</span>
            {/if}
        </div>
        <a href="/leads-inbox" class="lw-link">Sources →</a>
    </div>

    {#if loading}
        <div class="lw-empty">Loading...</div>
    {:else if leads.length === 0}
        <div class="lw-empty">
            <p>No recent leads</p>
            <a href="/leads" class="lw-setup">Set up lead sources →</a>
        </div>
    {:else}
        <div class="lw-list">
            {#each leads as lead (lead.id)}
                {@const isNew = !seenIds.has(lead.id)}
                <div class="lw-item" class:lw-item-new={isNew}>
                    {#if isNew}<div class="lw-new-dot"></div>{/if}
                    <div class="lw-info" onclick={() => seenIds = new Set([...seenIds, lead.id])}>
                        <a href="/contacts/{lead.id}" class="lw-name">{lead.name}</a>
                        {#if lead.company}<p class="lw-company">{lead.company}</p>{/if}
                        {#if lead.phone}<p class="lw-phone">{lead.phone}</p>{/if}
                    </div>
                    <div class="lw-meta">
                        {#if lead.lead_source}
                            <span class="lw-source {SOURCE_COLORS[lead.lead_source] ?? 'text-[#7c7c7c]'}">
                                {lead.lead_source.replace(/_/g,' ')}
                            </span>
                        {/if}
                        <span class="lw-time">{fmtTime(lead.created_at)}</span>
                    </div>
                    <div class="lw-actions">
                        {#if lead.phone}
                            <a href="/phone?number={lead.phone}" class="lw-btn lw-btn-call" title="Call now">📞</a>
                        {/if}
                        <button onclick={() => { assigningId = assigningId === lead.id ? null : lead.id; assignCampaignId = ''; }}
                            class="lw-btn lw-btn-campaign" title="Add to campaign">📣</button>
                        <button onclick={() => dismiss(lead.id)} class="lw-btn lw-btn-dismiss" title="Dismiss"><Icon name="x" size={14} /></button>
                    </div>
                    {#if assigningId === lead.id}
                        <div class="lw-assign">
                            <select bind:value={assignCampaignId} class="lw-assign-select">
                                <option value="">Choose campaign...</option>
                                {#each campaigns as c}<option value={c.id}>{c.name}</option>{/each}
                            </select>
                            <button onclick={() => addToCampaign(lead, assignCampaignId)}
                                disabled={!assignCampaignId || addingToCalendar === lead.id}
                                class="lw-assign-btn">
                                {addingToCalendar === lead.id ? '...' : 'Add'}
                            </button>
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
.leads-widget { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.lw-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; flex-shrink: 0; }
.lw-title-row { display: flex; align-items: center; gap: 6px; }
.lw-title { font-size: 11px; font-weight: 600; color: #888; letter-spacing: 1px; text-transform: uppercase; }
.lw-badge { background: #ef4444; color: #fff; font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 99px; }
.lw-link { font-size: 10px; color: #555; text-decoration: none; }
.lw-link:hover { color: #ccc; }
.lw-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; gap: 4px; text-align: center; }
.lw-empty p { font-size: 11px; color: #444; }
.lw-setup { font-size: 10px; color: #555; text-decoration: none; }
.lw-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; }
.lw-item { display: grid; grid-template-columns: 1fr auto auto; align-items: start; gap: 6px; padding: 7px 6px; border-radius: 6px; position: relative; transition: background 0.1s; }
.lw-item:hover { background: #0d0d0d; }
.lw-item-new { border-left: 2px solid #3b82f6; padding-left: 8px; }
.lw-new-dot { position: absolute; top: 9px; left: -5px; width: 8px; height: 8px; border-radius: 50%; background: #3b82f6; box-shadow: 0 0 6px #3b82f6; }
.lw-info { min-width: 0; }
.lw-name { font-size: 12px; color: #ccc; font-weight: 500; text-decoration: none; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lw-name:hover { color: #fff; }
.lw-company { font-size: 10px; color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
.lw-phone { font-size: 10px; color: #444; font-family: monospace; margin-top: 1px; }
.lw-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.lw-source { font-size: 9px; padding: 1px 5px; border-radius: 3px; white-space: nowrap; }
.lw-time { font-size: 9px; color: #333; white-space: nowrap; }
.lw-actions { display: flex; gap: 3px; }
.lw-btn { background: none; border: 1px solid #1a1a1a; border-radius: 5px; padding: 3px 6px; font-size: 11px; cursor: pointer; color: #666; transition: all 0.1s; }
.lw-btn:hover { border-color: #333; color: #ccc; }
.lw-btn-call:hover { border-color: #22c55e; color: #22c55e; }
.lw-btn-campaign:hover { border-color: #3b82f6; color: #3b82f6; }
.lw-btn-dismiss:hover { border-color: #ef4444; color: #ef4444; }
.lw-assign { grid-column: 1 / -1; display: flex; gap: 6px; padding-top: 4px; }
.lw-assign-select { flex: 1; background: #111; border: 1px solid #2a2a2a; border-radius: 5px; padding: 4px 8px; color: #ccc; font-size: 11px; outline: none; }
.lw-assign-btn { background: #3b82f6; color: #fff; border: none; border-radius: 5px; padding: 4px 10px; font-size: 11px; cursor: pointer; font-weight: 600; }
.lw-assign-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
