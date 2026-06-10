<script lang="ts">
    import { onMount } from 'svelte';
    import { apiFetch } from '$lib/api';
    import Inbox from '$lib/components/Inbox.svelte';

    let data = $state<any>(null);
    let loading = $state(true);
    let activeTab = $state<'dashboard' | 'overview' | 'wins' | 'approvals' | 'invoices' | 'messages' | 'docs'>('dashboard');
    let agencyName = $state('Edelhaus');

    interface WinEntry { id: string; outcome: string; created_at: string; contact: { name: string; company: string; phone: string } | null; call_duration_seconds: number | null; summary: string | null; recording_url: string | null; raw_transcript: string | null; }
    let wins = $state<WinEntry[]>([]);
    let expandedWin = $state<string | null>(null); // expanded win for transcript

    interface RepInfo { member_email: string; interview_score: number | null; username?: string | null; }
    interface PendingCampaign { id: string; name: string; status: string; reps?: RepInfo[]; }
    let pendingApprovals = $state<PendingCampaign[]>([]);
    let approving = $state<string | null>(null);

    interface Invoice { id: string; created_at: string; period: string; base_fee: number; appointment_bonus: number; total: number; status: string; }
    let invoices = $state<Invoice[]>([]);

    interface ClientDoc { id: string; title: string; doc_type: string; url: string; description: string | null; from_client: boolean; submitted_by_name: string | null; created_at: string; }
    let clientDocs = $state<ClientDoc[]>([]);

    // Client doc upload
    let showUploadForm = $state(false);
    let uploadTitle = $state('');
    let uploadUrl = $state('');
    let uploadType = $state('file');
    let uploadDesc = $state('');
    let uploading = $state(false);
    let uploadMsg = $state('');

    async function submitDoc() {
        if (!uploadTitle.trim() || !uploadUrl.trim()) return;
        uploading = true; uploadMsg = '';
        const res = await apiFetch('/api/client-docs', {
            method: 'POST',
            body: JSON.stringify({ title: uploadTitle.trim(), url: uploadUrl.trim(), docType: uploadType, description: uploadDesc || undefined }),
        });
        if (res.ok) {
            const d = await res.json();
            clientDocs = [d, ...clientDocs];
            uploadTitle = ''; uploadUrl = ''; uploadDesc = '';
            showUploadForm = false;
            uploadMsg = '✓ Submitted successfully';
        } else { uploadMsg = 'Failed to submit. Please try again.'; }
        uploading = false;
    }

    const client = $derived(data?.client ?? null);
    const stats = $derived(data?.stats ?? {});
    const projects = $derived(data?.projects ?? data?.campaigns ?? []);
    const insights = $derived(data?.insights ?? null);
    const recentCalls = $derived(data?.recentCalls ?? []);
    const agencyDocs = $derived(clientDocs.filter(d => !d.from_client));
    const myDocs = $derived(clientDocs.filter(d => d.from_client));

    const WIN_OUTCOMES = new Set(['appointment_set','demo_scheduled','meeting_confirmed','signed_up','investment_interest','callback']);

    onMount(async () => {
        const r = await apiFetch('/api/portal/client');
        if (r.ok) {
            data = await r.json();
            // agency_name comes from the portal/client response — avoids settings permission issues
            if (data?.agencyName) agencyName = data.agencyName;
        }
        loading = false;

        const [winsRes, campRes, invRes, docsRes] = await Promise.all([
            apiFetch('/api/calls?limit=100'),
            apiFetch('/api/campaigns'),
            apiFetch('/api/invoices'),
            apiFetch('/api/client-docs'),
        ]);

        if (winsRes.ok) {
            const d = await winsRes.json();
            const allCalls = d.calls ?? d ?? [];
            wins = allCalls.filter((c: any) => WIN_OUTCOMES.has(c.outcome ?? ''));
        }
        if (campRes.ok) {
            const camps = await campRes.json();
            const pending = camps.filter((c: any) => c.status === 'pending_approval');
            // Load assigned reps for each pending campaign to show in approval card
            const enriched = await Promise.all(pending.map(async (camp: any) => {
                const sdrRes = await apiFetch(`/api/campaigns/${camp.id}/sdrs`);
                const reps = sdrRes.ok ? (await sdrRes.json()).map((s: any) => ({
                    member_email: s.team_member?.member_email ?? '',
                    interview_score: null,
                    username: null,
                })) : [];
                return { ...camp, reps };
            }));
            pendingApprovals = enriched;
        }
        if (invRes.ok) invoices = await invRes.json();
        if (docsRes.ok) clientDocs = await docsRes.json();

        // agencyName already set from portal/client response above
    });

    async function approveScript(campaignId: string, approved: boolean) {
        approving = campaignId;
        const res = await apiFetch(`/api/campaigns/${campaignId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: approved ? 'active' : 'draft' }),
        });
        if (res.ok) pendingApprovals = pendingApprovals.filter(c => c.id !== campaignId);
        approving = null;
    }

    function connectRate() { return stats.connectRate ?? 0; }

    function formatDuration(secs: number): string {
        const m = Math.floor(secs / 60); const s = secs % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function timeAgo(iso: string): string {
        const d = Date.now() - new Date(iso).getTime();
        const m = Math.floor(d / 60000);
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        return `${Math.floor(h / 24)}d ago`;
    }

    function winPct(campaign: any): number {
        if (!campaign.target_wins || campaign.target_wins === 0) return 0;
        return Math.min(100, Math.round((campaign.win_count ?? 0) / campaign.target_wins * 100));
    }

    function winLabel(outcome: string): string {
        const MAP: Record<string,string> = {
            appointment_set: '📅 Appointment Set', demo_scheduled: '🖥 Demo Scheduled',
            meeting_confirmed: '✓ Meeting', signed_up: '🎉 Signed Up',
            investment_interest: '💰 Interested', callback: '🔄 Callback',
        };
        return MAP[outcome] ?? outcome.replace(/_/g, ' ');
    }
</script>

<svelte:head><title>{client?.name ?? 'Client Portal'} — {agencyName}</title></svelte:head>

<div class="flex flex-col min-h-screen bg-[#0a0a0a] text-white">
    <!-- Header -->
    <header class="border-b border-[#1e1e1e] bg-[#080808]">
        <div class="max-w-6xl mx-auto px-6 py-6 flex items-start justify-between">
            <div>
                <p class="mb-2" style="font-family:var(--font-label);font-size:9px;letter-spacing:.22em;color:var(--c-text-faint)">{agencyName}</p>
                {#if loading}
                    <div class="h-8 w-56 bg-[#1a1a1a] rounded animate-pulse"></div>
                {:else}
                    <h1 style="font-family:var(--font-display);font-weight:300;font-size:30px;letter-spacing:-.01em;color:#fff;line-height:1">{client?.name ?? 'Your Account'}</h1>
                    {#if client?.industry}<p class="mt-1" style="font-family:var(--font-label);font-size:9px;letter-spacing:.14em;color:var(--c-text-faint)">{client.industry.toUpperCase()}</p>{/if}
                {/if}
            </div>
            <div class="text-right">
                <p class="text-xs text-[#7c7c7c]">Portal access</p>
                <p class="text-xs text-[#333]">{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
            </div>
        </div>

        <!-- Stats bar -->
        {#if !loading}
        <div class="max-w-6xl mx-auto px-6 pb-5 grid grid-cols-4 gap-4">
            <div class="bg-[#111] border border-[#1a1a1a] rounded-xl p-4">
                <p class="text-[#7c7c7c] text-[10px] uppercase tracking-widest mb-1">Calls Made</p>
                <p class="text-white text-2xl font-bold font-mono">{stats.totalCalls ?? 0}</p>
                <p class="text-[#6e6e6e] text-[10px] mt-0.5">last 30 days</p>
            </div>
            <div class="bg-[#111] border border-[#1a1a1a] rounded-xl p-4">
                <p class="text-[#7c7c7c] text-[10px] uppercase tracking-widest mb-1">Connect Rate</p>
                <p class="text-white text-2xl font-bold font-mono">{connectRate()}%</p>
                <p class="text-[#6e6e6e] text-[10px] mt-0.5">{stats.answeredCalls ?? 0} answered</p>
            </div>
            <div class="bg-[#111] border border-[var(--accent)]/40 rounded-xl p-4">
                <p class="text-[#7c7c7c] text-[10px] uppercase tracking-widest mb-1">Appointments Set</p>
                <p class="text-[var(--accent)] text-2xl font-bold font-mono">{wins.length}</p>
                <p class="text-[#6e6e6e] text-[10px] mt-0.5">this month</p>
            </div>
            <div class="bg-[#111] border border-[#1a1a1a] rounded-xl p-4">
                <p class="text-[#7c7c7c] text-[10px] uppercase tracking-widest mb-1">Avg Call Length</p>
                <p class="text-white text-2xl font-bold font-mono">{formatDuration(stats.avgCallDuration ?? 0)}</p>
                <p class="text-[#6e6e6e] text-[10px] mt-0.5">per connected call</p>
            </div>
        </div>
        {/if}

        <!-- Tabs -->
        <div class="max-w-6xl mx-auto px-6 flex gap-0 border-t border-[#1a1a1a]">
            {#each [
                ['dashboard', 'Dashboard'],
                ['overview', 'Overview'],
                ['wins', `Wins ${wins.length ? `(${wins.length})` : ''}`],
                ['approvals', pendingApprovals.length ? `Approvals 🔴` : 'Approvals'],
                ['invoices', 'Invoices'],
                ['docs', 'Docs'],
                ['messages', 'Messages'],
            ] as [val, label]}
                <button onclick={() => activeTab = val as any}
                    class="px-5 py-3 text-xs font-medium transition-colors border-b-2 {activeTab === val ? 'border-white text-white' : 'border-transparent text-[#7c7c7c] hover:text-white'}">
                    {label}
                </button>
            {/each}
        </div>
    </header>

    <!-- Content -->
    <main class="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        {#if loading}
            <div class="space-y-4">
                {#each [1,2,3] as _}<div class="h-24 bg-[#111] rounded-xl animate-pulse"></div>{/each}
            </div>
        {:else}

        <!-- DASHBOARD -->
        {#if activeTab === 'dashboard'}
            <div class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="bg-[#111] border border-[var(--accent)]/40 rounded-xl p-6">
                        <p class="text-[#7c7c7c] text-[10px] uppercase tracking-widest mb-2">Appointments set</p>
                        <p class="text-[var(--accent)] text-4xl font-bold font-mono">{wins.length}</p>
                        <p class="text-[#6e6e6e] text-xs mt-1">this month</p>
                    </div>
                    <div class="bg-[#111] border border-[#1a1a1a] rounded-xl p-6">
                        <p class="text-[#7c7c7c] text-[10px] uppercase tracking-widest mb-2">Connect rate</p>
                        <p class="text-white text-4xl font-bold font-mono">{connectRate()}%</p>
                        <p class="text-[#6e6e6e] text-xs mt-1">{stats.answeredCalls ?? 0} of {stats.totalCalls ?? 0} answered</p>
                    </div>
                    <div class="bg-[#111] border border-[#1a1a1a] rounded-xl p-6">
                        <p class="text-[#7c7c7c] text-[10px] uppercase tracking-widest mb-2">Calls made</p>
                        <p class="text-white text-4xl font-bold font-mono">{stats.totalCalls ?? 0}</p>
                        <p class="text-[#6e6e6e] text-xs mt-1">last 30 days</p>
                    </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div class="bg-[#111] border border-[#1a1a1a] rounded-xl p-5">
                        <p class="text-xs text-[#6e6e6e] uppercase tracking-widest mb-4">Campaign progress</p>
                        {#each projects as project}
                            {#each (project.campaigns ?? []) as c}
                                {#if c.target_wins}
                                    <div class="mb-3">
                                        <div class="flex justify-between text-xs mb-1"><span class="text-white truncate mr-2">{c.name}</span><span class="text-[var(--accent)] font-mono shrink-0">{c.win_count ?? 0}/{c.target_wins}</span></div>
                                        <div class="w-full h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden"><div class="h-full bg-[var(--accent)] rounded-full" style="width:{winPct(c)}%"></div></div>
                                    </div>
                                {/if}
                            {/each}
                        {/each}
                        {#if !projects.some((p: any) => (p.campaigns ?? []).some((c: any) => c.target_wins))}
                            <p class="text-xs text-[#7c7c7c]">No active campaign targets yet.</p>
                        {/if}
                    </div>
                    <div class="bg-[#111] border border-[#1a1a1a] rounded-xl p-5">
                        <div class="flex items-center justify-between mb-4">
                            <p class="text-xs text-[#6e6e6e] uppercase tracking-widest">Recent wins</p>
                            <button onclick={() => activeTab = 'wins'} class="text-[10px] text-[#7c7c7c] hover:text-white transition-colors">View all →</button>
                        </div>
                        {#if wins.length === 0}
                            <p class="text-xs text-[#7c7c7c]">No appointments logged yet.</p>
                        {:else}
                            <div class="space-y-2.5">
                                {#each wins.slice(0, 5) as win}
                                    <div class="flex items-center justify-between gap-2">
                                        <div class="min-w-0">
                                            <p class="text-sm text-white truncate">{win.contact?.name ?? 'Unknown'}</p>
                                            <p class="text-[10px] text-[var(--accent)]">{winLabel(win.outcome)}</p>
                                        </div>
                                        <span class="text-[10px] text-[#6e6e6e] shrink-0">{timeAgo(win.created_at)}</span>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            </div>

        <!-- OVERVIEW -->
        {:else if activeTab === 'overview'}
            {#if insights}
                <div class="bg-[#111] border border-[#1e2a1e] rounded-xl p-6 mb-6">
                    <div class="flex items-center gap-2 mb-3">
                        <span class="text-[var(--accent)] text-sm">✦</span>
                        <p class="text-xs text-[var(--accent)] uppercase tracking-widest font-semibold">Campaign Intelligence</p>
                    </div>
                    {#each insights.split('\n').filter((l: string) => l.trim()) as line}
                        <p class="text-sm text-[#ccc] leading-relaxed">{line}</p>
                    {/each}
                </div>
            {/if}

            <div class="space-y-4">
                <h2 class="text-xs text-[#6e6e6e] uppercase tracking-widest">Active Campaigns</h2>
                {#each projects as project}
                    {#each (project.campaigns ?? []) as campaign}
                        {#if campaign.status !== 'archived'}
                            <div class="bg-[#111] border border-[#1a1a1a] rounded-xl p-5">
                                <div class="flex items-center justify-between mb-3">
                                    <div>
                                        <p class="text-xs text-[#6e6e6e]">{project.name}</p>
                                        <p class="text-sm text-white font-semibold mt-0.5">{campaign.name}</p>
                                    </div>
                                    <span class="text-[10px] px-2 py-0.5 rounded-full capitalize {campaign.status === 'active' ? 'bg-[var(--accent)]/12 text-[var(--accent)] border border-[var(--accent)]/40' : campaign.status === 'pending_approval' ? 'bg-yellow-950 text-yellow-400 border border-yellow-900' : 'bg-[#1a1a1a] text-[#7c7c7c]'}">
                                        {campaign.status === 'pending_approval' ? '⏳ Awaiting your approval' : campaign.status}
                                    </span>
                                </div>
                                <div class="grid grid-cols-3 gap-4">
                                    <div>
                                        <p class="text-[10px] text-[#6e6e6e] mb-1">Total Calls</p>
                                        <p class="text-sm text-white font-mono">{campaign.total_calls ?? 0}</p>
                                    </div>
                                    {#if campaign.daily_call_goal}
                                        <div>
                                            <p class="text-[10px] text-[#6e6e6e] mb-1">Today</p>
                                            <p class="text-sm text-white font-mono">{campaign.calls_today ?? 0}/{campaign.daily_call_goal}</p>
                                        </div>
                                    {/if}
                                    {#if campaign.target_wins}
                                        <div>
                                            <p class="text-[10px] text-[#6e6e6e] mb-1">{campaign.win_label ?? 'Wins'}</p>
                                            <div class="flex items-center gap-2">
                                                <p class="text-sm text-[var(--accent)] font-mono">{campaign.win_count ?? 0}/{campaign.target_wins}</p>
                                            </div>
                                            <div class="w-full h-1 bg-[#1a1a1a] rounded-full mt-1 overflow-hidden">
                                                <div class="h-full bg-[var(--accent)] rounded-full" style="width:{winPct(campaign)}%"></div>
                                            </div>
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        {/if}
                    {/each}
                {/each}
            </div>

        <!-- WINS LOG -->
        {:else if activeTab === 'wins'}
            <div class="space-y-3">
                <div class="flex items-center justify-between mb-2">
                    <h2 class="text-xs text-[#6e6e6e] uppercase tracking-widest">Appointment & Win Log</h2>
                    <p class="text-xs text-[#7c7c7c]">{wins.length} total</p>
                </div>
                {#if wins.length === 0}
                    <div class="text-center py-20">
                        <p class="text-3xl mb-3">📅</p>
                        <p class="text-white text-sm">No appointments logged yet</p>
                        <p class="text-xs text-[#7c7c7c] mt-1">They'll appear here as your SDR team works the campaign</p>
                    </div>
                {:else}
                    {#each wins.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) as win}
                        <div class="bg-[#111] border border-[#1a1a1a] rounded-xl overflow-hidden">
                            <button onclick={() => expandedWin = expandedWin === win.id ? null : win.id}
                                class="w-full p-4 flex items-start gap-4 text-left hover:bg-white/3 transition-colors">
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-2 mb-1">
                                        <p class="text-sm text-white font-medium">{win.contact?.name ?? 'Unknown contact'}</p>
                                        {#if win.contact?.company}<p class="text-xs text-[#7c7c7c]">at {win.contact.company}</p>{/if}
                                    </div>
                                    <p class="text-xs text-[var(--accent)]">{winLabel(win.outcome)}</p>
                                    {#if win.summary}<p class="text-xs text-[#7c7c7c] mt-1 leading-relaxed">{win.summary.slice(0, 120)}{win.summary.length > 120 ? '…' : ''}</p>{/if}
                                </div>
                                <div class="text-right shrink-0">
                                    <p class="text-xs text-[#6e6e6e]">{timeAgo(win.created_at)}</p>
                                    {#if win.call_duration_seconds}<p class="text-[10px] text-[#333] mt-1">{formatDuration(win.call_duration_seconds)}</p>{/if}
                                    {#if win.recording_url || win.raw_transcript}
                                        <p class="text-[9px] text-[#7c7c7c] mt-1">{expandedWin === win.id ? '▲' : '▼'} {win.recording_url ? '🎧' : ''}{win.raw_transcript ? '📝' : ''}</p>
                                    {/if}
                                </div>
                            </button>
                            {#if expandedWin === win.id}
                                <div class="px-4 pb-4 border-t border-[#1a1a1a] pt-3 space-y-3">
                                    {#if win.recording_url}
                                        <div>
                                            <p class="text-[10px] text-[#6e6e6e] uppercase tracking-widest mb-2">🎧 Call Recording</p>
                                            <audio controls src="/api/calls/recording?call_id={win.id}"
                                                class="w-full h-8" style="filter: invert(0.7) sepia(0.2)"></audio>
                                        </div>
                                    {/if}
                                    {#if win.raw_transcript}
                                        <div>
                                            <p class="text-[10px] text-[#6e6e6e] uppercase tracking-widest mb-2">📝 Transcript</p>
                                            <div class="rounded-lg bg-[#0d0d0d] border border-[#1a1a1a] p-3 max-h-40 overflow-y-auto">
                                                <p class="text-xs text-[#8a8a8a] leading-relaxed whitespace-pre-wrap font-mono">{win.raw_transcript.slice(0, 1500)}{win.raw_transcript.length > 1500 ? '\n[truncated]' : ''}</p>
                                            </div>
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    {/each}
                {/if}
            </div>

        <!-- APPROVALS -->
        {:else if activeTab === 'approvals'}
            <div class="space-y-3">
                <h2 class="text-xs text-[#6e6e6e] uppercase tracking-widest mb-2">Campaigns Awaiting Your Approval</h2>
                {#if pendingApprovals.length === 0}
                    <div class="text-center py-20">
                        <p class="text-3xl mb-3">✓</p>
                        <p class="text-white text-sm">Nothing to approve</p>
                        <p class="text-xs text-[#7c7c7c] mt-1">New campaigns from your agency will appear here for sign-off.</p>
                    </div>
                {:else}
                    {#each pendingApprovals as camp}
                        <div class="bg-[#111] border border-yellow-900/40 rounded-xl p-5">
                            <div class="flex items-start justify-between gap-4">
                                <div class="min-w-0">
                                    <p class="text-sm text-white font-semibold">{camp.name}</p>
                                    <p class="text-xs text-yellow-400 mt-0.5">⏳ Awaiting your approval</p>
                                    {#if camp.reps && camp.reps.length}
                                        <p class="text-xs text-[#7c7c7c] mt-2">Assigned reps: {camp.reps.map(r => r.member_email).filter(Boolean).join(', ')}</p>
                                    {/if}
                                </div>
                                <div class="flex gap-2 shrink-0">
                                    <button onclick={() => approveScript(camp.id, true)} disabled={approving === camp.id}
                                        class="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-hi)] disabled:opacity-40 transition-colors">
                                        {approving === camp.id ? '…' : 'Approve'}
                                    </button>
                                    <button onclick={() => approveScript(camp.id, false)} disabled={approving === camp.id}
                                        class="rounded-lg border border-[#2a2a2a] px-4 py-2 text-xs text-[#888] hover:border-red-900 hover:text-red-400 disabled:opacity-40 transition-colors">
                                        Send back
                                    </button>
                                </div>
                            </div>
                        </div>
                    {/each}
                {/if}
            </div>

        <!-- INVOICES -->
        {:else if activeTab === 'invoices'}
            <div class="space-y-3">
                <h2 class="text-xs text-[#6e6e6e] uppercase tracking-widest mb-2">Invoices</h2>
                {#if invoices.length === 0}
                    <div class="text-center py-20">
                        <p class="text-3xl mb-3">🧾</p>
                        <p class="text-white text-sm">No invoices yet</p>
                        <p class="text-xs text-[#7c7c7c] mt-1">Invoices from your agency will appear here.</p>
                    </div>
                {:else}
                    <div class="overflow-x-auto rounded-xl border border-[#1a1a1a]">
                        <table class="w-full text-sm min-w-[560px]">
                            <thead>
                                <tr class="text-left text-xs text-[#7c7c7c] border-b border-[#1a1a1a]">
                                    <th class="px-4 py-2.5 font-medium">Period</th>
                                    <th class="px-4 py-2.5 font-medium text-right">Base</th>
                                    <th class="px-4 py-2.5 font-medium text-right">Bonus</th>
                                    <th class="px-4 py-2.5 font-medium text-right">Total</th>
                                    <th class="px-4 py-2.5 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each invoices as inv}
                                    <tr class="border-b border-[#141414]">
                                        <td class="px-4 py-2.5 text-white">{inv.period ?? new Date(inv.created_at).toLocaleDateString()}</td>
                                        <td class="px-4 py-2.5 text-right text-[#aaa] font-mono">${(inv.base_fee ?? 0).toLocaleString()}</td>
                                        <td class="px-4 py-2.5 text-right text-[#aaa] font-mono">${(inv.appointment_bonus ?? 0).toLocaleString()}</td>
                                        <td class="px-4 py-2.5 text-right text-white font-mono">${(inv.total ?? 0).toLocaleString()}</td>
                                        <td class="px-4 py-2.5"><span class="text-xs px-2 py-0.5 rounded-full {inv.status === 'paid' ? 'bg-[var(--accent)]/12 text-[var(--accent)]' : 'bg-yellow-500/10 text-yellow-400'}">{inv.status}</span></td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                {/if}
            </div>

        <!-- DOCS -->
        {:else if activeTab === 'docs'}
            <div class="space-y-5">
                <div class="flex items-center justify-between">
                    <h2 class="text-xs text-[#6e6e6e] uppercase tracking-widest">Documents</h2>
                    <button onclick={() => showUploadForm = !showUploadForm}
                        class="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#888] hover:border-white hover:text-white transition-colors">
                        {showUploadForm ? '✕ Cancel' : '+ Share a document'}
                    </button>
                </div>

                {#if showUploadForm}
                    <div class="bg-[#111] border border-[#1a1a1a] rounded-xl p-4 space-y-3">
                        <input bind:value={uploadTitle} placeholder="Document title"
                            class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
                        <input bind:value={uploadUrl} placeholder="Link / URL (Google Drive, Dropbox, etc.)"
                            class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
                        <input bind:value={uploadDesc} placeholder="Description (optional)"
                            class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
                        <div class="flex items-center gap-3">
                            <button onclick={submitDoc} disabled={uploading || !uploadTitle.trim() || !uploadUrl.trim()}
                                class="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-white/90 disabled:opacity-40 transition-colors">
                                {uploading ? 'Submitting…' : 'Submit'}
                            </button>
                            {#if uploadMsg}<span class="text-xs {uploadMsg.startsWith('✓') ? 'text-[var(--accent)]' : 'text-red-400'}">{uploadMsg}</span>{/if}
                        </div>
                    </div>
                {/if}

                <div>
                    <p class="text-[10px] text-[#7c7c7c] uppercase tracking-widest mb-2">From your agency</p>
                    {#if agencyDocs.length === 0}
                        <p class="text-xs text-[#6e6e6e]">No documents shared yet.</p>
                    {:else}
                        <div class="space-y-2">
                            {#each agencyDocs as doc}
                                <a href={doc.url} target="_blank" rel="noopener noreferrer"
                                    class="flex items-center justify-between rounded-lg bg-[#111] border border-[#1a1a1a] px-4 py-3 hover:border-[#2a2a2a] transition-colors">
                                    <div class="min-w-0">
                                        <p class="text-sm text-white truncate">{doc.title}</p>
                                        {#if doc.description}<p class="text-xs text-[#7c7c7c] truncate">{doc.description}</p>{/if}
                                    </div>
                                    <span class="text-xs text-[#6e6e6e] shrink-0 ml-3">↗ open</span>
                                </a>
                            {/each}
                        </div>
                    {/if}
                </div>

                <div>
                    <p class="text-[10px] text-[#7c7c7c] uppercase tracking-widest mb-2">Shared by you</p>
                    {#if myDocs.length === 0}
                        <p class="text-xs text-[#6e6e6e]">You haven't shared any documents yet.</p>
                    {:else}
                        <div class="space-y-2">
                            {#each myDocs as doc}
                                <a href={doc.url} target="_blank" rel="noopener noreferrer"
                                    class="flex items-center justify-between rounded-lg bg-[#111] border border-[#1a1a1a] px-4 py-3 hover:border-[#2a2a2a] transition-colors">
                                    <div class="min-w-0">
                                        <p class="text-sm text-white truncate">{doc.title}</p>
                                        {#if doc.description}<p class="text-xs text-[#7c7c7c] truncate">{doc.description}</p>{/if}
                                    </div>
                                    <span class="text-xs text-[#6e6e6e] shrink-0 ml-3">↗ open</span>
                                </a>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>

        <!-- MESSAGES -->
        {:else if activeTab === 'messages'}
            <div class="h-[70vh]">
                <Inbox currentUserRole="client" currentUserName={client?.name ?? ''} />
            </div>
        {/if}
{/if}
    </div>
