<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { browser } from '$app/environment';
    import { apiFetch } from '$lib/api';

    interface Message {
        role: 'user' | 'assistant';
        content: string;
        streaming?: boolean;
    }

    let messages = $state<Message[]>([]);
    let input = $state('');
    let loading = $state(false);
    let model = $state<'claude-haiku-4-5-20251001' | 'claude-sonnet-4-5'>('claude-sonnet-4-5');
    let threadEl = $state<HTMLElement | null>(null);
    let copied = $state<string | null>(null);

    const modelLabel = $derived(model === 'claude-sonnet-4-5' ? 'Sonnet' : 'Haiku');

    async function send() {
        const text = input.trim();
        if (!text || loading) return;
        input = '';

        messages = [...messages, { role: 'user', content: text }];
        loading = true;

        // Placeholder for streaming response
        messages = [...messages, { role: 'assistant', content: '', streaming: true }];
        const idx = messages.length - 1;

        await tick();
        scrollToBottom();

        try {
            const res = await apiFetch('/api/ai/claude', {
                method: 'POST',
                body: JSON.stringify({
                    model,
                    messages: messages
                        .filter(m => !m.streaming)
                        .map(m => ({ role: m.role, content: m.content })),
                }),
            });

            if (!res.ok || !res.body) {
                messages[idx] = { role: 'assistant', content: 'Something went wrong. Try again.' };
                loading = false;
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let accumulated = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                accumulated += decoder.decode(value, { stream: true });
                messages = messages.map((m, i) =>
                    i === idx ? { ...m, content: accumulated } : m
                );
                scrollToBottom();
            }

            // Mark as done (remove streaming flag)
            messages = messages.map((m, i) =>
                i === idx ? { role: 'assistant', content: accumulated } : m
            );
        } catch {
            messages = messages.map((m, i) =>
                i === idx ? { role: 'assistant', content: 'Network error. Try again.' } : m
            );
        }

        loading = false;
        await tick();
        scrollToBottom();
    }

    function scrollToBottom() {
        if (threadEl) {
            threadEl.scrollTop = threadEl.scrollHeight;
        }
    }

    function copyMessage(content: string, id: string) {
        if (browser) navigator.clipboard.writeText(content);
        copied = id;
        setTimeout(() => copied = null, 1500);
    }

    function clearChat() {
        messages = [];
        input = '';
    }

    // Basic markdown renderer — handles bold, italic, code, bullets, headers
    function renderMarkdown(text: string): string {
        return text
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
                `<pre class="bg-[#0a0a0a] rounded-lg p-3 text-xs overflow-x-auto my-2 border border-[#1a1a1a]"><code>${code.trim()}</code></pre>`)
            .replace(/`([^`]+)`/g, '<code class="bg-[#1a1a1a] px-1.5 py-0.5 rounded text-xs font-mono">$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            .replace(/^### (.+)$/gm, '<p class="text-sm font-bold text-white mt-3 mb-1">$1</p>')
            .replace(/^## (.+)$/gm, '<p class="text-sm font-bold text-white mt-3 mb-1">$1</p>')
            .replace(/^# (.+)$/gm, '<p class="text-base font-bold text-white mt-3 mb-1">$1</p>')
            .replace(/^[•\-\*] (.+)$/gm, '<div class="flex gap-2 my-0.5"><span class="text-[#7c7c7c] flex-shrink-0">•</span><span>$1</span></div>')
            .replace(/^(\d+)\. (.+)$/gm, '<div class="flex gap-2 my-0.5"><span class="text-[#7c7c7c] flex-shrink-0 w-4">$1.</span><span>$2</span></div>')
            .replace(/\n\n/g, '<br/><br/>')
            .replace(/\n/g, '<br/>');
    }

    const STARTERS = [
        'Help me write a cold email',
        'Brainstorm ideas for...',
        'Explain how to...',
        'Summarize this for me',
    ];
</script>

<div class="flex flex-col h-full bg-[#0a0a0a] rounded-xl overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2.5 border-b border-[#1a1a1a] flex-shrink-0">
        <div class="flex items-center gap-2">
            <span class="text-sm font-bold text-white" style="font-family: var(--font-mono)">✦</span>
            <p class="text-xs font-semibold text-white">Claude</p>
        </div>
        <div class="flex items-center gap-2">
            <!-- Model toggle -->
            <button onclick={() => model = model === 'claude-sonnet-4-5' ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-5'}
                class="text-[10px] px-2 py-0.5 rounded border border-[#2a2a2a] text-[#7c7c7c] hover:border-white hover:text-white transition-colors font-mono">
                {modelLabel}
            </button>
            {#if messages.length > 0}
                <button onclick={clearChat} class="text-[10px] text-[#333] hover:text-white transition-colors">Clear</button>
            {/if}
        </div>
    </div>

    <!-- Messages -->
    <div class="flex-1 overflow-y-auto px-3 py-3 space-y-4" bind:this={threadEl}>
        {#if messages.length === 0}
            <!-- Empty state with starter chips -->
            <div class="flex flex-col items-center justify-center h-full gap-4 py-6">
                <div class="text-center">
                    <p class="text-2xl mb-2">✦</p>
                    <p class="text-xs text-white font-medium">Ask Claude anything</p>
                    <p class="text-[10px] text-[#333] mt-1">Writing · Research · Brainstorming · Code</p>
                </div>
                <div class="flex flex-col gap-1.5 w-full">
                    {#each STARTERS as starter}
                        <button onclick={() => { input = starter; }}
                            class="text-left rounded-lg border border-[#1a1a1a] px-3 py-2 text-xs text-[#7c7c7c] hover:border-[#333] hover:text-[#888] transition-colors">
                            {starter}
                        </button>
                    {/each}
                </div>
            </div>
        {:else}
            {#each messages as msg, i}
                {#if msg.role === 'user'}
                    <div class="flex justify-end">
                        <div class="max-w-[85%] bg-white/10 rounded-2xl rounded-br-sm px-3 py-2">
                            <p class="text-xs text-white leading-relaxed">{msg.content}</p>
                        </div>
                    </div>
                {:else}
                    <div class="group flex flex-col gap-1">
                        <div class="text-xs text-[#ccc] leading-relaxed prose-dark">
                            {#if msg.streaming && !msg.content}
                                <!-- Typing indicator -->
                                <div class="flex gap-1 items-center py-1">
                                    <span class="w-1.5 h-1.5 bg-[#555] rounded-full animate-bounce" style="animation-delay: 0ms"></span>
                                    <span class="w-1.5 h-1.5 bg-[#555] rounded-full animate-bounce" style="animation-delay: 150ms"></span>
                                    <span class="w-1.5 h-1.5 bg-[#555] rounded-full animate-bounce" style="animation-delay: 300ms"></span>
                                </div>
                            {:else}
                                {@html renderMarkdown(msg.content)}
                                {#if msg.streaming}
                                    <span class="inline-block w-1 h-3 bg-[#555] ml-0.5 animate-pulse"></span>
                                {/if}
                            {/if}
                        </div>
                        {#if !msg.streaming && msg.content}
                            <button
                                onclick={() => copyMessage(msg.content, String(i))}
                                class="self-start text-[9px] text-[#222] hover:text-[#7c7c7c] transition-colors opacity-0 group-hover:opacity-100">
                                {copied === String(i) ? '✓ copied' : 'copy'}
                            </button>
                        {/if}
                    </div>
                {/if}
            {/each}
        {/if}
    </div>

    <!-- Input -->
    <div class="px-3 pb-3 pt-2 flex-shrink-0 border-t border-[#111]">
        <div class="flex gap-2 items-end">
            <textarea
                bind:value={input}
                placeholder="Ask anything..."
                rows="1"
                onkeydown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        send();
                    }
                }}
                oninput={(e) => {
                    const t = e.currentTarget;
                    t.style.height = 'auto';
                    t.style.height = Math.min(t.scrollHeight, 96) + 'px';
                }}
                class="flex-1 rounded-xl border border-[#1a1a1a] bg-[#111] px-3 py-2 text-xs text-white placeholder-[#333] focus:border-[#333] focus:outline-none resize-none leading-relaxed min-h-[34px]"
                style="overflow-y: auto;">
            </textarea>
            <button
                onclick={send}
                disabled={loading || !input.trim()}
                class="rounded-xl bg-white w-8 h-8 flex items-center justify-center flex-shrink-0 hover:bg-[#e5e5e5] disabled:opacity-30 disabled:cursor-default transition-all">
                <span class="text-black text-xs font-bold">{loading ? '…' : '↑'}</span>
            </button>
        </div>
        <p class="text-[9px] text-[#222] mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
        </div>
    </div>
