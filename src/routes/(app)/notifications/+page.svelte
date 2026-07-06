<script lang="ts">
    import { onMount } from 'svelte';
    import { titleFor } from '$lib/brand';
    import { apiFetch } from '$lib/api';
    import { toastSuccess, toastError } from '$lib/stores/toast';

    interface NotifData {
        totalCount: number;
        overdueTasks: { count: number; items: { id: string; title: string; due_date: string; priority: string; contact: { name: string } | null }[] };
        newLeads: { count: number; items: { id: string; name: string; company: string; lead_source: string; created_at: string }[] };
        voicemails: { count: number; items: { id: string; caller_id: string; received_at: string }[] };
        missedCalls: { count: number; items: { id: string; caller_id: string; received_at: string }[] };
    }

    let data = $state<NotifData | null>(null);
    let loading = $state(true);

    const PRIORITY_COLORS: Record<string, string> = {
        urgent: 'text-red-400 bg-red-400/10 border-red-400/20',
        high: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
        medium: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
        low: 'text-[#8a8a8a] bg-[#1a1a1a] border-[#2a2a2a]',
    };

    function fmtDate(iso: string) {
        const d = new Date(iso);
        const now = new Date();
        const diff = Math.floor((now.getTime() - d.getTime()) / 60000);
        if (diff < 60) return `${diff}m ago`;
        if (diff < 1440) return `${Math.floor(diff/60)}h ago`;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    async function completeTask(id: string) {
        const res = await apiFetch(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) });
        if (res.ok) {
            if (data) data = { ...data, overdueTasks: { ...data.overdueTasks, items: data.overdueTasks.items.filter(t => t.id !== id), count: data.overdueTasks.count - 1 }, totalCount: data.totalCount - 1 };
            toastSuccess('Task completed');
        } else {
            toastError('Failed to complete task — try again');
        }
    }

    onMount(async () => {
        try {
            const r = await apiFetch('/api/notifications');
            if (r.ok) data = await r.json();
            else toastError('Failed to load notifications — try refreshing');
        } catch (e) {
            toastError('Failed to load notifications — try refreshing');
        } finally {
            loading = false;
        }
    });
</script>

<svelte:head><title>{titleFor('Notifications')}</title></svelte:head>

<div class="flex flex-col flex-1 h-full overflow-y-auto">
    <div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center justify-between">
        <div>
            <h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Notifications</h2>
            {#if data?.totalCount}<p class="text-xs text-[#7c7c7c] mt-0.5">{data.totalCount} items need attention</p>{/if}
        </div>
        {#if data?.totalCount === 0}
            <span class="text-xs text-[var(--accent)]">✓ All clear</span>
        {/if}
    </div>

    {#if loading}
		<div class="p-8 space-y-3">
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
		</div>
	{:else if data}
        <div class="p-8 space-y-6 max-w-2xl">

            <!-- Overdue Tasks -->
            {#if data.overdueTasks.count > 0}
                <section>
                    <div class="flex items-center gap-2 mb-3">
                        <span class="text-base">✅</span>
                        <h3 class="text-white text-sm font-medium">Overdue Tasks</h3>
                        <span class="text-xs bg-red-500/20 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">{data.overdueTasks.count}</span>
                    </div>
                    <div class="space-y-2">
                        {#each data.overdueTasks.items as task}
                            <div class="rounded-xl border border-[#2a2a2a] bg-[#111] px-4 py-3 flex items-center justify-between group hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-2">
                                        <p class="text-sm text-white">{task.title}</p>
                                        <span class="text-xs px-1.5 py-0.5 rounded border {PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.low}">{task.priority}</span>
                                    </div>
                                    {#if task.contact}<p class="text-xs text-[#7c7c7c] mt-0.5">{task.contact.name}</p>{/if}
                                    <p class="text-xs text-red-400 mt-0.5">Due {new Date(task.due_date).toLocaleDateString('en-US', {month:'short',day:'numeric'})}</p>
                                </div>
                                <div class="flex gap-2 ml-4">
                                    <a href="/tasks" class="text-xs text-[#6e6e6e] hover:text-white border border-[#1e1e1e] px-2.5 py-1.5 rounded-lg transition-colors">Open</a>
                                    <button onclick={() => completeTask(task.id)} class="text-xs text-[var(--accent)] hover:text-[var(--accent-hi)] border border-[var(--accent)]/40 px-2.5 py-1.5 rounded-lg transition-colors">Done ✓</button>
                                </div>
                            </div>
                        {/each}
                    </div>
                </section>
            {/if}

            <!-- New Leads -->
            {#if data.newLeads.count > 0}
                <section>
                    <div class="flex items-center gap-2 mb-3">
                        <span class="text-base">🔍</span>
                        <h3 class="text-white text-sm font-medium">New Leads (24h)</h3>
                        <span class="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">{data.newLeads.count}</span>
                    </div>
                    <div class="space-y-2">
                        {#each data.newLeads.items as lead}
                            <div class="rounded-xl border border-[#2a2a2a] bg-[#111] px-4 py-3 flex items-center justify-between hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
                                <div>
                                    <p class="text-sm text-white">{lead.name}</p>
                                    {#if lead.company}<p class="text-xs text-[#7c7c7c]">{lead.company}</p>{/if}
                                    <p class="text-xs text-[#6e6e6e] mt-0.5">{lead.lead_source?.replace(/_/g,' ')} · {fmtDate(lead.created_at)}</p>
                                </div>
                                <a href="/contacts/{lead.id}" class="text-xs text-blue-400 hover:text-blue-300 border border-blue-400/20 px-2.5 py-1.5 rounded-lg transition-colors ml-4">View →</a>
                            </div>
                        {/each}
                    </div>
                </section>
            {/if}

            <!-- Voicemails -->
            {#if data.voicemails.count > 0}
                <section>
                    <div class="flex items-center gap-2 mb-3">
                        <span class="text-base">📳</span>
                        <h3 class="text-white text-sm font-medium">Unread Voicemails</h3>
                        <span class="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 rounded-full">{data.voicemails.count}</span>
                    </div>
                    <div class="space-y-2">
                        {#each data.voicemails.items as vm}
                            <div class="rounded-xl border border-[#2a2a2a] bg-[#111] px-4 py-3 flex items-center justify-between hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
                                <div>
                                    <p class="text-sm text-white font-mono">{vm.caller_id}</p>
                                    <p class="text-xs text-[#6e6e6e] mt-0.5">{fmtDate(vm.received_at)}</p>
                                </div>
                                <a href="/numbers" class="text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-400/20 px-2.5 py-1.5 rounded-lg transition-colors ml-4">Listen →</a>
                            </div>
                        {/each}
                    </div>
                </section>
            {/if}

            <!-- Missed Calls -->
            {#if data.missedCalls.count > 0}
                <section>
                    <div class="flex items-center gap-2 mb-3">
                        <span class="text-base">📵</span>
                        <h3 class="text-white text-sm font-medium">Missed Calls</h3>
                        <span class="text-xs bg-orange-500/20 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded-full">{data.missedCalls.count}</span>
                    </div>
                    <div class="space-y-2">
                        {#each data.missedCalls.items as call}
                            <div class="rounded-xl border border-[#2a2a2a] bg-[#111] px-4 py-3 flex items-center justify-between hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
                                <div>
                                    <p class="text-sm text-white font-mono">{call.caller_id}</p>
                                    <p class="text-xs text-[#6e6e6e] mt-0.5">{fmtDate(call.received_at)}</p>
                                </div>
                                <a href="/phone?number={call.caller_id}" class="text-xs text-orange-400 hover:text-orange-300 border border-orange-400/20 px-2.5 py-1.5 rounded-lg transition-colors ml-4">Call back →</a>
                            </div>
                        {/each}
                    </div>
                </section>
            {/if}

            <!-- All clear -->
            {#if data.totalCount === 0}
                <div class="flex flex-col items-center justify-center py-16 text-center">
                    <p class="text-4xl mb-4">✓</p>
                    <p class="text-white text-sm font-medium">You're all caught up</p>
                    <p class="text-xs text-[#6e6e6e] mt-1">No overdue tasks, new leads, voicemails, or missed calls</p>
                </div>
            {/if}

        </div>
    {/if}
</div>
