<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { apiFetch } from '$lib/api';
    import { toastSuccess } from '$lib/stores/toast';

    type Channel = 'all' | 'sms' | 'email';
    type Thread = {
        id: string;
        channel: 'sms' | 'email';
        contactName: string | null;
        contactId: string | null;
        contactScore: number | null;
        subject: string | null; // email only
        remoteNumber: string | null; // sms only
        lastBody: string;
        lastDirection: string;
        lastAt: string;
        unreadCount: number;
        isOptedOut?: boolean;
        intentLabel?: string | null; // most recent inbound intent
    };

    let channel = $state<Channel>('all');
    let threads = $state<Thread[]>([]);
    let selected = $state<Thread | null>(null);
    let messages = $state<any[]>([]);
    let loading = $state(true);
    let loadingMessages = $state(false);
    let replyBody = $state('');
    let replySubject = $state('');
    let sending = $state(false);
    let aiDraft = $state('');
    let loadingDraft = $state(false);
    let search = $state('');
    let messagesEl = $state<HTMLElement | null>(null);

    const filtered = $derived(
        threads
            .filter(t => channel === 'all' || t.channel === channel)
            .filter(t => !search.trim() || 
                t.contactName?.toLowerCase().includes(search.toLowerCase()) ||
                t.subject?.toLowerCase().includes(search.toLowerCase()) ||
                t.remoteNumber?.includes(search))
    );

    const totalUnread = $derived(threads.filter(t => t.unreadCount > 0).length);
    const smsUnread = $derived(threads.filter(t => t.channel === 'sms' && t.unreadCount > 0).length);
    const emailUnread = $derived(threads.filter(t => t.channel === 'email' && t.unreadCount > 0).length);

    onMount(loadAll);

    async function loadAll() {
        loading = true;
        const [smsRes, emailRes] = await Promise.all([
            apiFetch('/api/sms/threads?limit=100'),
            apiFetch('/api/emails/threads?limit=100'),
        ]);

        const combined: Thread[] = [];

        if (smsRes.ok) {
            const { threads: smsThreads } = await smsRes.json();
            for (const t of smsThreads ?? []) {
                combined.push({
                    id: t.id, channel: 'sms',
                    contactName: t.contacts?.name ?? null,
                    contactId: t.contact_id ?? null,
                    contactScore: t.contacts?.contact_score ?? null,
                    subject: null,
                    remoteNumber: t.remote_number,
                    lastBody: t.last_message_body ?? '',
                    lastDirection: t.last_message_direction ?? 'inbound',
                    lastAt: t.last_message_at,
                    unreadCount: t.unread_count ?? 0,
                    isOptedOut: t.is_opted_out,
                    intentLabel: t.recent_intent?.[0]?.intent_label ?? null,
                });
            }
        }

        if (emailRes.ok) {
            const { threads: emailThreads } = await emailRes.json();
            for (const t of emailThreads ?? []) {
                combined.push({
                    id: t.id, channel: 'email',
                    contactName: t.contacts?.name ?? null,
                    contactId: t.contact_id ?? null,
                    contactScore: t.contacts?.contact_score ?? null,
                    subject: t.subject,
                    remoteNumber: null,
                    lastBody: t.last_message_body ?? '',
                    lastDirection: t.last_message_direction ?? 'inbound',
                    lastAt: t.last_message_at,
                    unreadCount: t.unread_count ?? 0,
                });
            }
        }

        // Sort by last activity
        threads = combined.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
        loading = false;
    }

    async function selectThread(t: Thread) {
        selected = t;
        loadingMessages = true;
        messages = [];
        replyBody = ''; aiDraft = '';

        if (t.channel === 'sms') {
            const r = await apiFetch(`/api/sms?thread_id=${t.id}&limit=100`);
            if (r.ok) messages = await r.json();
            if (t.unreadCount > 0) {
                await apiFetch(`/api/sms/threads/${t.id}/read`, { method: 'POST' });
            }
            if (t.subject === null) replySubject = '';
        } else {
            const r = await apiFetch(`/api/emails/threads/${t.id}`);
            if (r.ok) messages = await r.json();
            await apiFetch(`/api/emails/threads/${t.id}`, { method: 'POST' }); // mark read
            replySubject = `Re: ${t.subject ?? ''}`;
        }

        threads = threads.map(th => th.id === t.id ? { ...th, unreadCount: 0 } : th);
        loadingMessages = false;

        await tick();
        if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    $effect(() => {
        if (messages.length && messagesEl) {
            const nearBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 100;
            if (nearBottom) {
                tick().then(() => { if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight; });
            }
        }
    });

    async function send() {
        if (!selected || !replyBody.trim()) return;
        sending = true;

        if (selected.channel === 'sms') {
            const r = await apiFetch('/api/sms/send', {
                method: 'POST',
                body: JSON.stringify({ to: selected.remoteNumber, body: replyBody, contactId: selected.contactId })
            });
            if (r.ok) {
                messages = [...messages, { direction: 'outbound', body: replyBody, sent_at: new Date().toISOString() }];
                threads = threads.map(t => t.id === selected!.id ? { ...t, lastBody: replyBody, lastDirection: 'outbound', lastAt: new Date().toISOString() } : t);
                replyBody = '';
            }
        } else {
            // Find the from_address from messages or use the thread's to_address
            const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound');
            const toAddr = lastInbound?.from_address ?? selected.remoteNumber;
            const r = await apiFetch('/api/emails/send', {
                method: 'POST',
                body: JSON.stringify({ to: toAddr, subject: replySubject, html: replyBody.replace(/\n/g,'<br>'), text: replyBody, contactId: selected.contactId })
            });
            if (r.ok) {
                messages = [...messages, { direction: 'outbound', body: replyBody, subject: replySubject, created_at: new Date().toISOString(), from_address: 'you' }];
                replyBody = '';
                toastSuccess('Email sent');
            }
        }
        sending = false;
    }

    async function getDraft() {
        if (!selected) return;
        loadingDraft = true; aiDraft = '';
        const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound');

        if (selected.channel === 'sms') {
            const r = await apiFetch('/api/sms/draft-reply', {
                method: 'POST',
                body: JSON.stringify({ threadId: selected.id, contactId: selected.contactId, lastMessages: messages.slice(-5).map(m => ({ direction: m.direction, body: m.body })) })
            });
            if (r.ok) { const d = await r.json(); aiDraft = d.draft ?? ''; }
        } else {
            const r = await apiFetch('/api/emails/draft-reply', {
                method: 'POST',
                body: JSON.stringify({ threadId: selected.id, contactId: selected.contactId, inboundBody: lastInbound?.body, inboundSubject: selected.subject })
            });
            if (r.ok) { const d = await r.json(); aiDraft = d.draft ?? ''; replySubject = d.subject ?? replySubject; }
        }
        loadingDraft = false;
    }

    function timeAgo(iso: string) {
        if (!iso) return '';
        const d = Date.now() - new Date(iso).getTime();
        const m = Math.floor(d/60000);
        if (m < 1) return 'now';
        if (m < 60) return `${m}m`;
        const h = Math.floor(m/60);
        if (h < 24) return `${h}h`;
        return new Date(iso).toLocaleDateString(undefined, { month:'short', day:'numeric' });
    }

    function intentBadge(label: string) {
        const map: Record<string,string> = {
            interested: 'bg-green-950 text-green-400', positive_reply: 'bg-green-950 text-green-400',
            callback_request: 'bg-blue-950 text-blue-400', objection: 'bg-yellow-950 text-yellow-400',
            question: 'bg-yellow-950 text-yellow-400', opt_out: 'bg-red-950 text-red-400',
            referral: 'bg-purple-950 text-purple-400',
        };
        return map[label] ?? 'bg-[#1a1a1a] text-[#555]';
    }
</script>

<svelte:head><title>Inbox — LeadOS</title></svelte:head>

<div class="flex flex-col flex-1 h-full overflow-hidden">
    <!-- Header -->
    <div class="border-b border-[var(--c-border)] px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div class="flex items-center gap-4">
            <h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Inbox</h2>
            <div class="flex gap-1">
                {#each (['all','sms','email'] as Channel[]) as ch}
                    <button onclick={() => channel = ch}
                        class="px-3 py-1 rounded-lg text-xs font-medium transition-colors {channel === ch ? 'bg-white text-black' : 'text-[#555] hover:text-white border border-[var(--c-border-subtle)]'}">
                        {ch === 'all' ? `All${totalUnread ? ` (${totalUnread})` : ''}` : ch === 'sms' ? `SMS${smsUnread ? ` (${smsUnread})` : ''}` : `Email${emailUnread ? ` (${emailUnread})` : ''}`}
                    </button>
                {/each}
            </div>
        </div>
        <input bind:value={search} placeholder="Search..." class="rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-surface-2)] px-3 py-1.5 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none w-48" />
    </div>

    <div class="flex flex-1 overflow-hidden">
        <!-- Thread list -->
        <div class="w-72 shrink-0 border-r border-[var(--c-border)] overflow-y-auto">
            {#if loading}
                {#each {length: 6} as _}
                    <div class="p-4 border-b border-[var(--c-border)]">
                        <div class="h-3 w-32 bg-[var(--c-surface-2)] rounded animate-pulse mb-2"></div>
                        <div class="h-2.5 w-48 bg-[var(--c-surface-2)] rounded animate-pulse"></div>
                    </div>
                {/each}
            {:else if filtered.length === 0}
                <div class="flex flex-col items-center justify-center h-48 text-center px-4">
                    <p class="text-[#555] text-sm">No messages</p>
                </div>
            {:else}
                {#each filtered as t}
                    <button onclick={() => selectThread(t)} class="w-full text-left px-4 py-3 border-b border-[var(--c-border)] transition-colors {selected?.id === t.id ? 'bg-white/10' : 'hover:bg-white/5'}">
                        <div class="flex items-start gap-3">
                            <span class="text-base mt-0.5 flex-shrink-0">{t.channel === 'sms' ? '💬' : '✉️'}</span>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center justify-between gap-1">
                                    <p class="text-xs font-semibold truncate {t.unreadCount > 0 ? 'text-white' : 'text-[#777]'}">{t.contactName ?? t.remoteNumber ?? 'Unknown'}</p>
                                    <div class="flex items-center gap-1 flex-shrink-0">
                                        <p class="text-[10px] text-[#444]">{timeAgo(t.lastAt)}</p>
                                        {#if t.unreadCount > 0}
                                            <span class="bg-white text-black text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{t.unreadCount > 9 ? '9+' : t.unreadCount}</span>
                                        {/if}
                                    </div>
                                </div>
                                {#if t.subject}<p class="text-xs text-[#555] truncate">{t.subject}</p>{/if}
                                <p class="text-xs text-[#444] truncate">{t.lastDirection === 'outbound' ? '→ ' : ''}{t.lastBody}</p>
                                {#if t.intentLabel}
                                    <span class="text-[9px] px-1.5 py-0.5 rounded mt-0.5 inline-block
                                        {t.intentLabel === 'interested' || t.intentLabel === 'positive_reply' ? 'bg-green-950/50 text-green-400' :
                                         t.intentLabel === 'callback_request' ? 'bg-blue-950/50 text-blue-400' :
                                         t.intentLabel === 'opt_out' ? 'bg-red-950/50 text-red-400' :
                                         'bg-[#1a1a1a] text-[#444]'}">
                                        {t.intentLabel.replace(/_/g, ' ')}
                                    </span>
                                {/if}
                            </div>
                        </div>
                    </button>
                {/each}
            {/if}
        </div>

        <!-- Message view -->
        <div class="flex-1 flex flex-col overflow-hidden">
            {#if !selected}
                <div class="flex flex-col items-center justify-center flex-1">
                    <p class="text-[#333] text-5xl mb-4">📬</p>
                    <p class="text-[#555] text-sm">Select a conversation</p>
                </div>
            {:else}
                <!-- Thread header -->
                <div class="border-b border-[var(--c-border)] px-8 py-4 flex items-center justify-between flex-shrink-0 bg-[var(--c-surface-1)]">
                    <div>
                        <div class="flex items-center gap-2">
                            <span>{selected.channel === 'sms' ? '💬' : '✉️'}</span>
                            <p class="text-white font-semibold text-sm">{selected.contactName ?? selected.remoteNumber ?? 'Unknown'}</p>
                            {#if selected.contactScore}
                                <span class="text-xs font-mono {selected.contactScore >= 70 ? 'text-green-400' : 'text-[#555]'}">{selected.contactScore}</span>
                            {/if}
                        </div>
                        {#if selected.subject}<p class="text-xs text-[#555] mt-0.5">{selected.subject}</p>{/if}
                    </div>
                    {#if selected.contactId}
                        <a href="/contacts/{selected.contactId}" class="text-xs border border-[var(--c-border-subtle)] rounded-lg px-3 py-1.5 text-[#555] hover:text-white hover:border-white transition-colors">View Contact →</a>
                    {:else}
                        <button onclick={async () => {
                            const r = await apiFetch('/api/contacts/create', { method:'POST', body: JSON.stringify({ phone: selected!.remoteNumber, lead_source:'inbound_reply' }) });
                            if (r.ok) { const c = await r.json(); selected = { ...selected!, contactId: c.id, contactName: c.name }; toastSuccess('Contact created'); }
                        }} class="text-xs border border-[var(--c-border-subtle)] rounded-lg px-3 py-1.5 text-[#555] hover:text-white transition-colors">+ Create Contact</button>
                    {/if}
                </div>

                <!-- Messages -->
                <div class="flex-1 overflow-y-auto p-4 space-y-2" bind:this={messagesEl}>
                    {#if loadingMessages}
                        <div class="flex justify-center py-10"><div class="w-4 h-4 rounded-full bg-[#333] animate-pulse"></div></div>
                    {:else}
                        {#each messages as msg}
                            {@const out = msg.direction === 'outbound'}
                            <div class="flex {out ? 'justify-end' : 'justify-start'}">
                                <div class="max-w-[72%] {out ? 'bg-white text-black rounded-2xl rounded-br-sm' : 'bg-[var(--c-surface-2)] text-white rounded-2xl rounded-bl-sm'} px-4 py-2.5">
                                    {#if msg.subject && selected.channel === 'email'}
                                        <p class="text-[10px] {out ? 'text-black/60' : 'text-[#555]'} mb-1 font-medium">{msg.subject}</p>
                                    {/if}
                                    <p class="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                                    <div class="flex items-center gap-2 mt-1">
                                        <p class="text-[10px] {out ? 'text-black/50' : 'text-[#444]'}">{timeAgo(msg.sent_at ?? msg.created_at)}</p>
                                        {#if msg.intent_label && !out}
                                            <span class="text-[9px] px-1.5 py-0.5 rounded {intentBadge(msg.intent_label)}">{msg.intent_label.replace(/_/g,' ')}</span>
                                        {/if}
                                    </div>
                                </div>
                            </div>
                        {/each}
                    {/if}
                </div>

                <!-- AI draft suggestion -->
                {#if aiDraft}
                    <div class="mx-4 mb-2 rounded-xl bg-[var(--c-surface-1)] border border-[var(--c-border-subtle)] p-3">
                        <div class="flex justify-between items-center mb-1">
                            <p class="text-[10px] text-[#555] uppercase tracking-widest">✦ AI Draft</p>
                            <button onclick={() => aiDraft = ''} class="text-[#333] hover:text-white text-xs">✕</button>
                        </div>
                        <p class="text-xs text-[#888] mb-2 whitespace-pre-wrap">{aiDraft}</p>
                        <button onclick={() => { replyBody = aiDraft; aiDraft = ''; }} class="text-xs bg-[var(--c-surface-2)] border border-[var(--c-border-subtle)] rounded-lg px-3 py-1 hover:border-white text-white transition-colors">Use draft</button>
                    </div>
                {/if}

                <!-- Reply -->
                {#if selected.isOptedOut}
                    <div class="p-4 border-t border-[var(--c-border)] text-center"><p class="text-xs text-red-400">Opted out of SMS</p></div>
                {:else}
                    <div class="p-4 border-t border-[var(--c-border)] space-y-2 flex-shrink-0">
                        {#if selected.channel === 'email'}
                            <input bind:value={replySubject} placeholder="Subject" class="w-full rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-surface-2)] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
                        {/if}
                        <textarea bind:value={replyBody} placeholder="Type a reply..." rows="3"
                            class="w-full rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-surface-2)] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none"></textarea>
                        <button onclick={sendReply} disabled={sendingReply}
                            class="self-end rounded-lg bg-white text-black px-4 py-2 text-xs font-semibold hover:bg-[#e5e5e5] disabled:opacity-50 transition-colors">
                            {sendingReply ? 'Sending…' : 'Send'}
                        </button>
                    </div>
                {/if}
            {/if}
        </div>
    </div>
</div>
