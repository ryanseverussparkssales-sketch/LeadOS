<script lang="ts">
	import { apiFetch } from '$lib/api';

	interface Message { role: 'user' | 'assistant'; content: string; }

	let messages = $state<Message[]>([
		{ role: 'assistant', content: "Hi! I'm your RogueOS AI assistant. Ask me about your contacts, tasks, calls, pipeline, or anything in your CRM.\n\nTry: *\"How many callbacks do I have this week?\"* or *\"Show me my overdue tasks\"*" }
	]);
	let input = $state('');
	let loading = $state(false);
	let scrollEl = $state<HTMLDivElement | undefined>(undefined);

	const SUGGESTIONS = [
		"Show my overdue tasks",
		"How many calls this week?",
		"Who has a callback?",
		"What's in my pipeline?",
	];

	async function send() {
		const text = input.trim();
		if (!text || loading) return;
		input = '';

		const userMsg: Message = { role: 'user', content: text };
		messages = [...messages, userMsg];
		loading = true;

		// Build conversation history (exclude initial greeting, exclude the message we just added)
		const previousMessages = messages
			.slice(1, -1)
			.map(m => ({ role: m.role, content: m.content }));

		try {
			const res = await apiFetch('/api/ai/chat', {
				method: 'POST',
				body: JSON.stringify({
					message: text,
					conversationHistory: previousMessages.slice(-20),
				}),
			});

			if (res.ok) {
				const data = await res.json();
				messages = [...messages, { role: 'assistant', content: data.reply }];
			} else {
				messages = [...messages, { role: 'assistant', content: '⚠ Something went wrong. Try again.' }];
			}
		} catch {
			messages = [...messages, { role: 'assistant', content: '⚠ Network error. Please try again.' }];
		} finally {
			loading = false;
			setTimeout(() => scrollEl?.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' }), 50);
		}
	}

	function clearChat() {
		messages = [messages[0]]; // Keep greeting
	}

	// Simple markdown-like rendering: bold, italic, bullet points, newlines
	function renderText(text: string): string {
		return text
			.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
			.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
			.replace(/\*(.+?)\*/g, '<em class="text-[#aaa]">$1</em>')
			.replace(/`(.+?)`/g, '<code class="bg-[#1a1a1a] px-1 rounded text-xs font-mono text-[var(--accent)]">$1</code>')
			.replace(/^• (.+)$/gm, '<div class="flex gap-1.5 my-0.5"><span class="text-[#555] mt-0.5">•</span><span>$1</span></div>')
			.replace(/^- (.+)$/gm, '<div class="flex gap-1.5 my-0.5"><span class="text-[#555] mt-0.5">–</span><span>$1</span></div>')
			.replace(/\n/g, '<br/>');
	}
</script>

<div class="flex flex-col h-full bg-[#0d0d0d] rounded-xl border border-[#1e1e1e] overflow-hidden">
	<!-- Header -->
	<div class="flex items-center justify-between px-4 py-3 border-b border-[#1e1e1e]">
		<div class="flex items-center gap-2">
			<div class="w-6 h-6 rounded-full bg-gradient-to-br from-[var(--accent)] to-blue-600 flex items-center justify-center text-xs font-bold text-white">A</div>
			<span class="text-sm font-medium text-white">AI Assistant</span>
			<span class="text-[10px] text-[#444] bg-[#1a1a1a] px-1.5 py-0.5 rounded">Claude Haiku</span>
		</div>
		<button onclick={clearChat} class="text-xs text-[#444] hover:text-[#888] transition-colors" title="Clear conversation">Clear</button>
	</div>

	<!-- Messages -->
	<div bind:this={scrollEl} class="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
		{#each messages as msg}
			<div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
				<div class="max-w-[85%] {msg.role === 'user'
					? 'bg-white/10 text-white rounded-2xl rounded-br-sm px-3 py-2 text-sm'
					: 'text-[#ccc] text-sm leading-relaxed'
				}">
					{#if msg.role === 'assistant'}
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						<div class="prose-sm">{@html renderText(msg.content)}</div>
					{:else}
						{msg.content}
					{/if}
				</div>
			</div>
		{/each}

		{#if loading}
			<div class="flex justify-start">
				<div class="flex gap-1 px-3 py-2">
					<span class="w-1.5 h-1.5 bg-[#555] rounded-full animate-bounce" style="animation-delay:0ms"></span>
					<span class="w-1.5 h-1.5 bg-[#555] rounded-full animate-bounce" style="animation-delay:150ms"></span>
					<span class="w-1.5 h-1.5 bg-[#555] rounded-full animate-bounce" style="animation-delay:300ms"></span>
				</div>
			</div>
		{/if}
	</div>

	<!-- Suggestions (only show when only greeting is visible) -->
	{#if messages.length === 1}
		<div class="px-4 pb-2 flex flex-wrap gap-1.5">
			{#each SUGGESTIONS as s}
				<button
					onclick={() => { input = s; send(); }}
					class="text-xs px-2.5 py-1 rounded-full border border-[#2a2a2a] text-[#666] hover:border-[#444] hover:text-[#ccc] transition-colors"
				>{s}</button>
			{/each}
		</div>
	{/if}

	<!-- Input -->
	<div class="border-t border-[#1e1e1e] p-3 flex gap-2">
		<input
			bind:value={input}
			onkeydown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
			placeholder="Ask anything about your CRM…"
			disabled={loading}
			class="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#444] focus:border-[#444] focus:outline-none disabled:opacity-50 transition-colors"
		/>
		<button
			onclick={send}
			disabled={loading || !input.trim()}
			class="px-3 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-30 rounded-lg text-white transition-colors text-sm"
			title="Send (Enter)"
		>↑</button>
	</div>
</div>
