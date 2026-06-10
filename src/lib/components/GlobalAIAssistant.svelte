<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { apiFetch } from '$lib/api';

	interface Message {
		role: 'user' | 'assistant';
		content: string;
		toolResults?: ToolResult[];
		timestamp: Date;
	}

	interface ToolResult {
		tool: string;
		result: any;
	}

	let open = $state(false);
	let messages = $state<Message[]>([]);
	let input = $state('');
	let loading = $state(false);
	let conversationHistory = $state<{ role: string; content: any }[]>([]);
	let messagesEl: HTMLElement;

	const QUICK_ACTIONS = [
		{ label: '📋 Create Task', prompt: 'Help me create a task' },
		{ label: '🔍 Find Contact', prompt: 'Find a contact' },
		{ label: '📊 Stats', prompt: 'What are my stats today?' },
		{ label: '📚 How To', prompt: 'How does the power dialer work?' },
		{ label: '⚡ Streamer Outreach', prompt: 'What is the status of our Huntt.gg streamer outreach?' },
	];

	async function send(text?: string) {
		const userText = (text ?? input).trim();
		if (!userText || loading) return;
		input = '';

		const userMsg: Message = { role: 'user', content: userText, timestamp: new Date() };
		messages = [...messages, userMsg];
		conversationHistory = [...conversationHistory, { role: 'user', content: userText }];
		loading = true;

		setTimeout(() => { if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight; }, 50);

		try {
			const r = await apiFetch('/api/ai/chat', {
				method: 'POST',
				body: JSON.stringify({ message: userText, conversationHistory: conversationHistory.slice(-20) }),
			});

			if (r.ok) {
				const d = await r.json();
				const replyText = d.reply ?? d.message ?? '';
				const assistantMsg: Message = {
					role: 'assistant',
					content: replyText,
					toolResults: d.toolResults ?? [],
					timestamp: new Date(),
				};
				messages = [...messages, assistantMsg];
				conversationHistory = [...conversationHistory, { role: 'assistant', content: replyText || '...' }];

				// Handle navigation tool results
				const navResult = d.toolResults?.find((t: any) => t.tool === 'navigate_to');
				if (navResult?.result?.navigate && navResult.result.path) {
					setTimeout(() => goto(navResult.result.path), 500);
				}
			} else {
				const errMsg: Message = {
					role: 'assistant',
					content: 'Something went wrong. Please try again.',
					timestamp: new Date(),
				};
				messages = [...messages, errMsg];
			}
		} catch (e) {
			console.error('AI error:', e);
			const errMsg: Message = {
				role: 'assistant',
				content: 'Connection error. Please try again.',
				timestamp: new Date(),
			};
			messages = [...messages, errMsg];
		} finally {
			loading = false;
			setTimeout(() => { if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight; }, 50);
		}
	}

	function handleKeyboard(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
			e.preventDefault();
			open = !open;
		}
		if (e.key === 'Escape' && open) open = false;
	}

	function handleAIEvent() {
		open = true;
	}

	onMount(() => {
		if (browser) {
			window.addEventListener('keydown', handleKeyboard);
			window.addEventListener('leados:ai', handleAIEvent);
		}
	});
	onDestroy(() => {
		if (browser) {
			window.removeEventListener('keydown', handleKeyboard);
			window.removeEventListener('leados:ai', handleAIEvent);
		}
	});

	function fmtToolResult(tr: ToolResult) {
		const r = tr.result;
		if (tr.tool === 'create_task' && r?.created) return { type: 'task', data: r.task };
		if (tr.tool === 'search_records') return { type: 'search', data: r };
		if (tr.tool === 'navigate_to' && r?.navigate) return { type: 'nav', data: r };
		if (tr.tool === 'log_activity' && r?.logged) return { type: 'activity', data: r };
		return null;
	}
</script>

<!-- Floating trigger button -->
<button
	onclick={() => open = !open}
	class="fixed bottom-6 right-6 z-[90] w-12 h-12 rounded-full bg-white text-black shadow-lg hover:scale-110 transition-transform duration-150 flex items-center justify-center text-xl"
	title="AI Assistant (Ctrl+J)"
	aria-label="Open AI Assistant">
	✦
</button>

<!-- Backdrop -->
{#if open}
	<div class="fixed inset-0 z-[95] bg-black/40" onclick={() => open = false} role="presentation"></div>
{/if}

<!-- Panel -->
<div class="fixed top-0 right-0 h-screen w-[min(420px,100vw)] z-[96] flex flex-col bg-[#0a0a0a] border-l border-[#1e1e1e] shadow-2xl transition-transform duration-300 {open ? 'translate-x-0' : 'translate-x-full'}">
	<!-- Header -->
	<div class="flex items-center justify-between px-5 py-4 border-b border-[#1e1e1e]">
		<div>
			<p class="text-white text-sm font-semibold">✦ Edelhaus AI</p>
			<p class="text-xs text-[#7c7c7c] mt-0.5">Create, find, navigate, learn · Ctrl+J</p>
		</div>
		<button onclick={() => open = false} class="text-[#6e6e6e] hover:text-white text-sm p-1 rounded transition-colors" aria-label="Close"><Icon name="x" size={14} /></button>
	</div>

	<!-- Quick actions (empty state) -->
	{#if messages.length === 0}
		<div class="px-4 py-3 border-b border-[#111] flex flex-wrap gap-2">
			{#each QUICK_ACTIONS as action}
				<button onclick={() => send(action.prompt)}
					class="text-xs border border-[#2a2a2a] text-[#9a9a9a] px-2.5 py-1.5 rounded-lg hover:border-white hover:text-white transition-colors">
					{action.label}
				</button>
			{/each}
		</div>
		<div class="flex-1 flex items-center justify-center p-8 text-center">
			<div>
				<p class="text-4xl mb-3">✦</p>
				<p class="text-sm text-[#888] font-medium">How can I help?</p>
				<p class="text-xs text-[#6e6e6e] mt-2">Create tasks · Find records · Get tutorials · Navigate · Log activities</p>
			</div>
		</div>
	{:else}
		<!-- Messages -->
		<div bind:this={messagesEl} class="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
			{#each messages as msg}
				<div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
					<div class="max-w-[85%] {msg.role === 'user' ? 'bg-white/10 text-white' : 'bg-[#111] border border-[#1e1e1e] text-[#ccc]'} rounded-xl px-3 py-2.5">
						<p class="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>

						<!-- Tool result cards -->
						{#if msg.toolResults?.length}
							<div class="mt-2 space-y-1.5">
								{#each msg.toolResults as tr}
									{#if tr.result}
										{@const fmt = fmtToolResult(tr)}
										{#if fmt?.type === 'task'}
											<div class="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/12 px-3 py-2">
												<p class="text-xs text-[var(--accent)] font-medium">✓ Task Created</p>
												<p class="text-xs text-[#888] mt-0.5">{fmt.data?.title}</p>
												{#if fmt.data?.due_date}<p class="text-xs text-[#7c7c7c]">Due: {new Date(fmt.data.due_date).toLocaleDateString()}</p>{/if}
											</div>
										{:else if fmt?.type === 'search' && fmt.data?.results?.length}
											<div class="rounded-lg border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2">
												<p class="text-xs text-[#7c7c7c] mb-1">{fmt.data.count} results for "{fmt.data.query}"</p>
												{#each fmt.data.results.slice(0, 3) as r}
													<div class="py-1 border-b border-[#1a1a1a] last:border-0">
														<p class="text-xs text-white">{r.name ?? r.title}</p>
														{#if r.company}<p class="text-xs text-[#7c7c7c]">{r.company}</p>{/if}
													</div>
												{/each}
											</div>
										{:else if fmt?.type === 'nav'}
											<div class="rounded-lg border border-blue-800/40 bg-blue-950/20 px-3 py-1.5 inline-flex items-center gap-1.5">
												<span class="text-xs text-blue-400">→ Navigating to /{fmt.data.page}</span>
											</div>
										{:else if fmt?.type === 'activity'}
											<div class="rounded-lg border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-1.5">
												<p class="text-xs text-[#888]">✓ Activity logged for {fmt.data.contact}</p>
											</div>
										{/if}
									{/if}
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{/each}

			{#if loading}
				<div class="flex justify-start">
					<div class="bg-[#111] border border-[#1e1e1e] rounded-xl px-3 py-2.5">
						<div class="flex gap-1">
							<div class="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style="animation-delay:0ms"></div>
							<div class="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style="animation-delay:150ms"></div>
							<div class="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style="animation-delay:300ms"></div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Quick actions when messages exist -->
	{#if messages.length > 0}
		<div class="px-3 py-2 border-t border-[#111] flex gap-2 overflow-x-auto scrollbar-hide">
			{#each QUICK_ACTIONS.slice(0, 3) as action}
				<button onclick={() => send(action.prompt)}
					class="text-xs border border-[#1e1e1e] text-[#7c7c7c] px-2 py-1 rounded-lg hover:border-[#333] hover:text-[#888] transition-colors whitespace-nowrap flex-shrink-0">
					{action.label}
				</button>
			{/each}
			<button onclick={() => { messages = []; conversationHistory = []; }}
				class="text-xs text-[#333] hover:text-[#7c7c7c] transition-colors whitespace-nowrap flex-shrink-0 ml-auto">
				Clear
			</button>
		</div>
	{/if}

	<!-- Input -->
	<div class="p-3 border-t border-[#1e1e1e]">
		<div class="flex gap-2">
			<textarea
				bind:value={input}
				placeholder="Ask anything or give a command..."
				rows="2"
				class="flex-1 rounded-xl border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-white placeholder-[#333] focus:border-[#444] focus:outline-none resize-none"
				onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}></textarea>
			<button onclick={() => send()} disabled={loading || !input.trim()}
				class="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40 self-end">
				{loading ? '...' : '↑'}
			</button>
		</div>
		<p class="text-xs text-[#333] mt-1.5">Enter to send · Shift+Enter for new line · Ctrl+J to toggle</p>
	</div>
</div>

<style>
.scrollbar-hide { scrollbar-width: none; }
.scrollbar-hide::-webkit-scrollbar { display: none; }
</style>
