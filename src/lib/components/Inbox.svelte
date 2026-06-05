<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { apiFetch } from '$lib/api';
	import { toastSuccess, toastError } from '$lib/stores/toast';

	let {
		currentUserRole = 'admin',
		currentUserName = '',
		showNewChannel = false,
		clients = [],
		teamMembers = [],
	}: {
		currentUserRole?: string;
		currentUserName?: string;
		showNewChannel?: boolean;
		clients?: { id: string; name: string }[];
		teamMembers?: { id: string; member_email: string; member_user_id: string | null }[];
	} = $props();

	interface Channel {
		id: string; name: string; channel_type: string;
		campaign_id: string | null; client_id: string | null;
		last_message: { content: string; sender_name: string; created_at: string } | null;
		unread_count: number;
	}
	interface Message {
		id: string; sender_id: string; sender_role: string; sender_name: string | null;
		content: string; created_at: string;
	}

	let channels = $state<Channel[]>([]);
	let selectedChannel = $state<Channel | null>(null);
	let messages = $state<Message[]>([]);
	let loadingChannels = $state(true);
	let loadingMessages = $state(false);
	let messageText = $state('');
	let sending = $state(false);
	let messagesEl = $state<HTMLElement | null>(null);

	// New channel form
	let showForm = $state(false);
	let newName = $state('');
	let newType = $state('general');
	let newParticipants = $state<string[]>([]);
	let creating = $state(false);

	// Poll for new messages every 5s when channel open
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	onMount(async () => {
		await loadChannels();
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
	});

	async function loadChannels() {
		loadingChannels = true;
		const r = await apiFetch('/api/messaging');
		if (r.ok) channels = await r.json();
		loadingChannels = false;
	}

	async function selectChannel(ch: Channel) {
		selectedChannel = ch;
		if (pollTimer) clearInterval(pollTimer);
		await loadMessages();
		pollTimer = setInterval(loadMessages, 5000);
	}

	async function loadMessages() {
		if (!selectedChannel) return;
		loadingMessages = true;
		const r = await apiFetch(`/api/messaging/${selectedChannel.id}/messages`);
		if (r.ok) {
			messages = await r.json();
			// Clear unread
			channels = channels.map(c => c.id === selectedChannel!.id ? { ...c, unread_count: 0 } : c);
			await tick();
			messagesEl?.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
		}
		loadingMessages = false;
	}

	async function send() {
		if (!messageText.trim() || !selectedChannel || sending) return;
		sending = true;
		const res = await apiFetch(`/api/messaging/${selectedChannel.id}/messages`, {
			method: 'POST',
			body: JSON.stringify({
				content: messageText.trim(),
				senderRole: currentUserRole,
				senderName: currentUserName,
			}),
		});
		if (res.ok) {
			const msg = await res.json();
			messages = [...messages, msg];
			messageText = '';
			channels = channels.map(c =>
				c.id === selectedChannel!.id ? { ...c, last_message: msg } : c
			);
			await tick();
			messagesEl?.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
		} else {
			toastError('Failed to send message — try again');
		}
		sending = false;
	}

	async function createChannel() {
		if (!newName.trim()) return;
		creating = true;
		const res = await apiFetch('/api/messaging', {
			method: 'POST',
			body: JSON.stringify({
				name: newName.trim(),
				channelType: newType,
				participantUserIds: newParticipants,
			}),
		});
		if (res.ok) {
			await loadChannels();
			showForm = false;
			newName = ''; newType = 'general'; newParticipants = [];
			toastSuccess('Channel created');
		} else {
			toastError('Failed to create channel — try again');
		}
		creating = false;
	}

	function timeAgo(iso: string) {
		const d = Date.now() - new Date(iso).getTime();
		const m = Math.floor(d / 60000);
		if (m < 60) return `${m}m`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h`;
		return `${Math.floor(h / 24)}d`;
	}

	function roleColor(role: string) {
		return role === 'admin' ? 'text-[var(--accent)]' : role === 'client' ? 'text-blue-400' : 'text-[var(--accent)]';
	}

	const CHANNEL_ICONS: Record<string, string> = { campaign: '📣', direct: '💬', general: '🗣' };
</script>

<div class="flex h-full overflow-hidden">
	<!-- Channel list -->
	<div class="w-full md:w-60 shrink-0 border-b md:border-b-0 md:border-r border-[#1e1e1e] bg-[#080808] flex flex-col">
		<div class="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
			<p class="text-xs text-[#555] uppercase tracking-widest">Inbox</p>
			{#if showNewChannel}
				<button onclick={() => showForm = !showForm}
					class="text-xs text-[#444] hover:text-white transition-colors">+</button>
			{/if}
		</div>

		{#if showForm}
			<div class="px-3 py-3 border-b border-[#1a1a1a] space-y-2 bg-[#0d0d0d]">
				<input bind:value={newName} placeholder="Channel name"
					class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white placeholder-[#333] focus:border-white focus:outline-none" />
				<select bind:value={newType} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white focus:outline-none">
					<option value="general">General</option>
					<option value="campaign">Campaign</option>
					<option value="direct">Direct</option>
				</select>
				{#if teamMembers.length > 0}
					<select multiple onchange={(e) => {
						newParticipants = Array.from((e.target as HTMLSelectElement).selectedOptions).map(o => o.value);
					}} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white focus:outline-none h-20">
						{#each teamMembers.filter(m => m.member_user_id) as m}
							<option value={m.member_user_id!}>{m.member_email}</option>
						{/each}
					</select>
				{/if}
				<button onclick={createChannel} disabled={creating || !newName.trim()}
					class="w-full rounded-lg bg-white py-1.5 text-xs font-semibold text-black disabled:opacity-40">
					{creating ? 'Creating…' : 'Create'}
				</button>
			</div>
		{/if}

		<div class="flex-1 overflow-y-auto">
			{#if loadingChannels}
				{#each [1,2,3] as _}<div class="mx-3 my-2 h-10 bg-[#111] rounded animate-pulse"></div>{/each}
			{:else if channels.length === 0}
				<p class="text-[10px] text-[#333] text-center py-8 px-3">No channels yet.<br/>Create one to start messaging.</p>
			{:else}
				{#each channels as ch}
					<button onclick={() => selectChannel(ch)}
						class="w-full text-left px-4 py-3 border-b border-[#111] transition-colors {selectedChannel?.id === ch.id ? 'bg-white/10' : 'hover:bg-white/5'}">
						<div class="flex items-center gap-2">
							<span class="text-xs">{CHANNEL_ICONS[ch.channel_type] ?? '💬'}</span>
							<p class="text-xs text-white font-medium truncate flex-1">{ch.name}</p>
							{#if ch.unread_count > 0}
								<span class="text-[10px] bg-white text-black rounded-full w-4 h-4 flex items-center justify-center font-bold shrink-0">{ch.unread_count}</span>
							{/if}
						</div>
						{#if ch.last_message}
							<p class="text-[10px] text-[#444] mt-0.5 truncate">
								{ch.last_message.sender_name ?? 'Someone'}: {ch.last_message.content}
							</p>
						{/if}
					</button>
				{/each}
			{/if}
		</div>
	</div>

	<!-- Message area -->
	<div class="flex-1 flex flex-col overflow-hidden">
		{#if !selectedChannel}
			<div class="flex-1 flex items-center justify-center">
				<div class="text-center">
					<p class="text-3xl mb-2">💬</p>
					<p class="text-xs text-[#444]">Select a channel to start messaging</p>
				</div>
			</div>
		{:else}
			<!-- Header -->
			<div class="px-5 py-3 border-b border-[#1e1e1e] flex items-center gap-3 bg-[#080808]">
				<span>{CHANNEL_ICONS[selectedChannel.channel_type] ?? '💬'}</span>
				<p class="text-sm text-white font-medium">{selectedChannel.name}</p>
				<span class="text-[10px] text-[#333] capitalize">{selectedChannel.channel_type}</span>
			</div>

			<!-- Messages -->
			<div bind:this={messagesEl} class="flex-1 overflow-y-auto px-5 py-4 space-y-3">
				{#each messages as msg}
					{@const isMe = currentUserRole === msg.sender_role && (msg.sender_name === currentUserName || !msg.sender_name)}
					<div class="flex gap-3 {isMe ? 'flex-row-reverse' : ''}">
						<div class="w-7 h-7 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center text-[10px] shrink-0 {roleColor(msg.sender_role)}">
							{msg.sender_role === 'admin' ? 'A' : msg.sender_role === 'client' ? 'C' : 'R'}
						</div>
						<div class="{isMe ? 'items-end' : 'items-start'} flex flex-col max-w-[75%]">
							<div class="flex items-center gap-2 mb-1">
								<p class="text-[10px] {roleColor(msg.sender_role)}">{msg.sender_name ?? msg.sender_role}</p>
								<p class="text-[10px] text-[#333]">{timeAgo(msg.created_at)}</p>
							</div>
							<div class="rounded-xl px-3 py-2 text-sm {isMe ? 'bg-white/10 text-white rounded-tr-sm' : 'bg-[#111] border border-[#2a2a2a] text-[#ccc] rounded-tl-sm'}">
								{msg.content}
							</div>
						</div>
					</div>
				{/each}
			</div>

			<!-- Input -->
			<div class="px-4 py-3 border-t border-[#1e1e1e] bg-[#080808] flex gap-2">
				<input bind:value={messageText}
					onkeydown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
					placeholder="Message…"
					class="flex-1 rounded-xl border border-[#2a2a2a] bg-[#111] px-4 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
				<button onclick={send} disabled={sending || !messageText.trim()}
					class="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40 transition-colors">
					{sending ? '…' : '↑'}
				</button>
			</div>
		{/if}
	</div>
</div>
