<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { apiFetch } from '$lib/api';

    interface Campaign {
        id: string; name: string; status: string; campaign_type: string;
        win_label: string|null; win_count: number; target_wins: number|null;
        win_outcome: string|null; daily_call_goal: number|null; calls_today: number;
        total_calls: number; calls_per_lead: number; followup_count: number;
    }

    const SETTINGS_KEY = 'leados_campaign_widget';

    let campaigns = $state<Campaign[]>([]);
    let selectedId = $state('');
    let campaign = $state<Campaign | null>(null);
    let loading = $state(true);
    let showPicker = $state(false);
    let newLeadsCount = $state(0);
    let pollInterval: ReturnType<typeof setInterval>;

    // Load campaigns for picker
    async function loadCampaigns() {
        const r = await apiFetch('/api/campaigns');
        campaigns = r.ok ? await r.json() : [];
        loading = false;
    }

    // Load selected campaign stats
    async function loadCampaign(id: string) {
        const r = await apiFetch(`/api/campaigns/${id}`);
        if (r.ok) campaign = await r.json();
        await checkNewLeads(id);
    }

    async function checkNewLeads(campaignId: string) {
        const r = await apiFetch(`/api/campaigns/${campaignId}/contacts?limit=100`);
        if (r.ok) {
            const d = await r.json();
            const contacts = d.contacts ?? [];
            newLeadsCount = contacts.filter((c: any) =>
                c.created_at && new Date(c.created_at).getTime() > Date.now() - 24 * 3600000
            ).length;
        }
    }

    onMount(async () => {
        // Restore saved selection
        const saved = localStorage.getItem(SETTINGS_KEY);
        if (saved) {
            try { const d = JSON.parse(saved); selectedId = d.campaignId ?? ''; } catch {}
        }

        await loadCampaigns();
        if (selectedId) await loadCampaign(selectedId);

        // Poll every 30s for fresh stats
        pollInterval = setInterval(() => {
            if (selectedId) loadCampaign(selectedId);
        }, 30000);
    });

    onDestroy(() => clearInterval(pollInterval));

    async function selectCampaign(id: string) {
        selectedId = id;
        showPicker = false;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ campaignId: id }));
        await loadCampaign(id);
    }

    // Computed stats
    const callsRemaining = $derived(
        campaign?.daily_call_goal
            ? Math.max(0, campaign.daily_call_goal - (campaign.calls_today ?? 0))
            : null
    );
    const callProgress = $derived(
        campaign?.daily_call_goal && campaign.daily_call_goal > 0
            ? Math.min(100, ((campaign.calls_today ?? 0) / campaign.daily_call_goal) * 100)
            : null
    );
    const winProgress = $derived(
        campaign?.target_wins && campaign.target_wins > 0
            ? Math.min(100, ((campaign.win_count ?? 0) / campaign.target_wins) * 100)
            : null
    );

    const TYPE_ICONS: Record<string,string> = { call: '📞', email: '✉️', sms: '💬', mixed: '⚡' };
</script>

<div class="cw-root">
    {#if !selectedId || showPicker}
        <!-- Campaign picker -->
        <div class="cw-picker">
            <p class="cw-picker-title">Choose a Campaign</p>
            {#if loading}
                <p class="cw-empty">Loading...</p>
            {:else if campaigns.length === 0}
                <p class="cw-empty">No campaigns yet</p>
            {:else}
                <div class="cw-list">
                    {#each campaigns as c}
                        <button onclick={() => selectCampaign(c.id)} class="cw-list-item">
                            <span class="cw-list-icon">{TYPE_ICONS[c.campaign_type] ?? '📣'}</span>
                            <div class="cw-list-info">
                                <span class="cw-list-name">{c.name}</span>
                                <span class="cw-list-status">{c.status}</span>
                            </div>
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    {:else if campaign}
        <!-- Campaign stats -->
        <div class="cw-header">
            <div class="cw-name-row">
                <span class="cw-icon">{TYPE_ICONS[campaign.campaign_type] ?? '📣'}</span>
                <span class="cw-name">{campaign.name}</span>
            </div>
            <button onclick={() => showPicker = true} class="cw-switch" title="Switch campaign">⇄</button>
        </div>

        <!-- New leads notification -->
        {#if newLeadsCount > 0}
            <div class="cw-newleads">
                <div class="cw-nl-dot"></div>
                <span class="cw-nl-text">{newLeadsCount} new contact{newLeadsCount !== 1 ? 's' : ''} added today</span>
                <a href="/campaigns" class="cw-nl-link">View →</a>
            </div>
        {/if}

        <!-- Daily call goal -->
        {#if campaign.daily_call_goal}
            <div class="cw-stat-block">
                <div class="cw-stat-header">
                    <span class="cw-stat-label">TODAY'S CALLS</span>
                    <span class="cw-stat-value">
                        <span class:cw-complete={callsRemaining === 0}>{campaign.calls_today ?? 0}</span>
                        <span class="cw-stat-of"> / {campaign.daily_call_goal}</span>
                    </span>
                </div>
                <div class="cw-bar">
                    <div class="cw-bar-fill cw-bar-calls" style="width:{callProgress}%"></div>
                </div>
                {#if callsRemaining !== null && callsRemaining > 0}
                    <p class="cw-stat-sub">{callsRemaining} calls remaining today</p>
                {:else if callsRemaining === 0}
                    <p class="cw-stat-sub cw-done">✓ Daily goal reached!</p>
                {/if}
            </div>
        {:else}
            <div class="cw-stat-block">
                <div class="cw-stat-header">
                    <span class="cw-stat-label">TOTAL CALLS</span>
                    <span class="cw-stat-value">{campaign.total_calls ?? 0}</span>
                </div>
                <p class="cw-stat-sub">{campaign.calls_today ?? 0} today</p>
            </div>
        {/if}

        <!-- Win goal -->
        {#if campaign.win_outcome || campaign.win_label}
            <div class="cw-stat-block">
                <div class="cw-stat-header">
                    <span class="cw-stat-label">{campaign.win_label ?? campaign.win_outcome ?? 'WINS'}</span>
                    <span class="cw-stat-value">
                        <span class:cw-complete={winProgress === 100}>{campaign.win_count ?? 0}</span>
                        {#if campaign.target_wins}<span class="cw-stat-of"> / {campaign.target_wins}</span>{/if}
                    </span>
                </div>
                {#if winProgress !== null}
                    <div class="cw-bar">
                        <div class="cw-bar-fill cw-bar-wins" class:cw-bar-complete={winProgress >= 100} style="width:{winProgress}%"></div>
                    </div>
                {/if}
            </div>
        {/if}

        <!-- Pending follow-ups -->
        {#if (campaign.followup_count ?? 0) > 0}
            <div class="cw-followups">
                <span class="cw-followup-icon">📋</span>
                <span class="cw-followup-text">{campaign.followup_count} pending follow-ups</span>
                <a href="/tasks?campaign={campaign.id}" class="cw-followup-link">View →</a>
            </div>
        {/if}

        <!-- Quick actions -->
        <div class="cw-actions">
            <a href="/dialer?campaign={campaign.id}" class="cw-action-btn cw-action-dial">
                📞 Open Dialer
            </a>
            <a href="/campaigns" class="cw-action-btn cw-action-view">
                Details
            </a>
        </div>
    {/if}
</div>

<style>
.cw-root { display: flex; flex-direction: column; gap: 10px; height: 100%; font-size: 12px; }
.cw-picker-title { font-size: 10px; color: #555; letter-spacing: 2px; text-transform: uppercase; }
.cw-empty { font-size: 11px; color: #444; text-align: center; padding: 12px 0; }
.cw-list { display: flex; flex-direction: column; gap: 2px; max-height: 200px; overflow-y: auto; }
.cw-list-item { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 6px; border: none; background: none; cursor: pointer; text-align: left; width: 100%; }
.cw-list-item:hover { background: #111; }
.cw-list-icon { font-size: 14px; flex-shrink: 0; }
.cw-list-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.cw-list-name { font-size: 12px; color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cw-list-status { font-size: 10px; color: #555; text-transform: capitalize; }
.cw-header { display: flex; align-items: center; justify-content: space-between; }
.cw-name-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.cw-icon { font-size: 14px; flex-shrink: 0; }
.cw-name { font-size: 13px; color: #fff; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cw-switch { background: none; border: 1px solid #2a2a2a; color: #555; border-radius: 4px; padding: 2px 7px; font-size: 12px; cursor: pointer; flex-shrink: 0; }
.cw-switch:hover { border-color: #555; color: #ccc; }
.cw-stat-block { background: #0d0d0d; border: 1px solid #1a1a1a; border-radius: 8px; padding: 10px 12px; }
.cw-stat-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
.cw-stat-label { font-size: 9px; color: #555; letter-spacing: 2px; text-transform: uppercase; }
.cw-stat-value { font-size: 18px; font-weight: 600; color: #fff; font-variant-numeric: tabular-nums; }
.cw-stat-of { font-size: 12px; color: #444; font-weight: 400; }
.cw-bar { height: 4px; background: #1a1a1a; border-radius: 2px; overflow: hidden; margin-bottom: 4px; }
.cw-bar-fill { height: 100%; border-radius: 2px; transition: width 0.5s ease; }
.cw-bar-calls { background: #3b82f6; }
.cw-bar-wins { background: #22c55e; }
.cw-bar-complete { background: #22c55e; }
.cw-stat-sub { font-size: 10px; color: #555; }
.cw-done { color: #22c55e; }
.cw-complete { color: #22c55e; }
.cw-followups { display: flex; align-items: center; gap: 6px; background: #0d0d0d; border: 1px solid #1a1a1a; border-radius: 8px; padding: 8px 12px; }
.cw-followup-icon { font-size: 13px; }
.cw-followup-text { font-size: 11px; color: #888; flex: 1; }
.cw-followup-link { font-size: 10px; color: #555; text-decoration: none; }
.cw-followup-link:hover { color: #ccc; }
.cw-actions { display: flex; gap: 6px; margin-top: auto; }
.cw-action-btn { flex: 1; text-align: center; padding: 7px 0; border-radius: 8px; font-size: 11px; font-weight: 500; text-decoration: none; transition: all 0.15s; }
.cw-action-dial { background: #22c55e; color: #000; }
.cw-action-dial:hover { background: #16a34a; }
.cw-action-view { border: 1px solid #2a2a2a; color: #777; }
.cw-action-view:hover { border-color: #555; color: #ccc; }
.cw-newleads { display: flex; align-items: center; gap: 6px; background: #001b3d; border: 1px solid #3b82f630; border-radius: 8px; padding: 7px 10px; }
.cw-nl-dot { width: 7px; height: 7px; border-radius: 50%; background: #3b82f6; box-shadow: 0 0 6px #3b82f6; animation: pulse 1.5s ease infinite; flex-shrink: 0; }
@keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.4} }
.cw-nl-text { font-size: 11px; color: #60a5fa; flex: 1; }
.cw-nl-link { font-size: 10px; color: #3b82f6; text-decoration: none; }
.cw-nl-link:hover { color: #93c5fd; }
</style>
