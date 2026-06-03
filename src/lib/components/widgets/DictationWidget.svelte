<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { apiFetch } from '$lib/api';

    interface DictationEntry {
        id: string;
        text: string;
        title: string | null;
        brainstorm: BrainstormResult | null;
        createdAt: string;
    }

    interface BrainstormResult {
        summary: string;
        actionItems: string[];
        ideas: string[];
        followUps: string[];
    }

    // Dictation state
    let isListening = $state(false);
    let transcript = $state('');
    let interimText = $state('');
    let supported = $state(true);
    let recognition: any = null;

    // Saved entries
    let entries = $state<DictationEntry[]>([]);
    let activeEntry = $state<DictationEntry | null>(null);
    let view = $state<'record' | 'saved'>('record');

    // Brainstorm state
    let brainstorming = $state(false);
    let brainstormResult = $state<BrainstormResult | null>(null);

    const STORAGE_KEY = 'leados_dictation_entries';

    onMount(() => {
        // Load saved entries
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) entries = JSON.parse(saved);
        } catch {}

        // Check Web Speech API support
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) { supported = false; return; }

        recognition = new SR();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
            let final = '';
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    final += result[0].transcript + ' ';
                } else {
                    interim += result[0].transcript;
                }
            }
            if (final) transcript += final;
            interimText = interim;
        };

        recognition.onerror = (event: any) => {
            if (event.error !== 'no-speech') {
                console.error('[Dictation]', event.error);
                isListening = false;
            }
        };

        recognition.onend = () => {
            if (isListening) {
                // Auto-restart on end (keeps recording until user stops)
                try { recognition.start(); } catch {}
            }
        };
    });

    onDestroy(() => {
        if (recognition && isListening) {
            isListening = false;
            recognition.stop();
        }
    });

    function toggleListening() {
        if (!recognition) return;
        if (isListening) {
            isListening = false;
            interimText = '';
            recognition.stop();
        } else {
            isListening = true;
            interimText = '';
            try { recognition.start(); } catch {}
        }
    }

    function saveEntry() {
        if (!transcript.trim()) return;
        const entry: DictationEntry = {
            id: Date.now().toString(),
            text: transcript.trim(),
            title: null,
            brainstorm: brainstormResult,
            createdAt: new Date().toISOString(),
        };
        entries = [entry, ...entries];
        persistEntries();
        transcript = '';
        brainstormResult = null;
        interimText = '';
    }

    function deleteEntry(id: string) {
        entries = entries.filter(e => e.id !== id);
        if (activeEntry?.id === id) activeEntry = null;
        persistEntries();
    }

    function persistEntries() {
        try {
            // Keep last 50 entries
            const toSave = entries.slice(0, 50);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
        } catch {}
    }

    function clearTranscript() {
        transcript = '';
        brainstormResult = null;
        interimText = '';
    }

    async function runBrainstorm() {
        const text = transcript.trim();
        if (!text || brainstorming) return;
        brainstorming = true;
        brainstormResult = null;

        try {
            const res = await apiFetch('/api/dictation/brainstorm', {
                method: 'POST',
                body: JSON.stringify({ text }),
            });
            if (res.ok) brainstormResult = await res.json();
        } catch {}
        brainstorming = false;
    }

    function formatTime(iso: string): string {
        const d = new Date(iso);
        const now = new Date();
        const diff = now.getTime() - d.getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
</script>

<div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2.5 border-b border-[var(--c-border)] flex-shrink-0">
        <div class="flex items-center gap-2">
            <span class="text-sm">🎙️</span>
            <p class="text-xs font-semibold text-white">Dictation</p>
        </div>
        <div class="flex gap-1">
            <button onclick={() => view = 'record'}
                class="px-2.5 py-1 rounded text-[10px] transition-colors {view === 'record' ? 'bg-white text-black font-semibold' : 'text-[#555] hover:text-white'}">
                Record
            </button>
            <button onclick={() => view = 'saved'}
                class="px-2.5 py-1 rounded text-[10px] transition-colors {view === 'saved' ? 'bg-white text-black font-semibold' : 'text-[#555] hover:text-white'}">
                Saved {entries.length > 0 ? `(${entries.length})` : ''}
            </button>
        </div>
    </div>

    {#if view === 'record'}
        <!-- RECORD VIEW -->
        <div class="flex flex-col flex-1 overflow-hidden p-3 gap-3">

            {#if !supported}
                <div class="flex-1 flex items-center justify-center text-center">
                    <p class="text-xs text-[#444]">Speech recognition not supported in this browser.<br/>Try Chrome or Edge.</p>
                </div>
            {:else}
                <!-- Mic button + status -->
                <div class="flex items-center gap-3 flex-shrink-0">
                    <button onclick={toggleListening}
                        class="relative w-12 h-12 rounded-full transition-all flex items-center justify-center flex-shrink-0
                               {isListening
                                   ? 'bg-red-600 hover:bg-red-500 shadow-[0_0_20px_rgba(220,38,38,0.5)]'
                                   : 'bg-[#1a1a1a] border border-[#2a2a2a] hover:border-white'}">
                        {#if isListening}
                            <!-- Pulse ring -->
                            <span class="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-25"></span>
                        {/if}
                        <span class="text-lg relative z-10">{isListening ? '⏹' : '🎙️'}</span>
                    </button>
                    <div class="flex-1 min-w-0">
                        {#if isListening}
                            <p class="text-xs text-red-400 font-medium flex items-center gap-1.5">
                                <span class="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block"></span>
                                Listening...
                            </p>
                            {#if interimText}
                                <p class="text-[10px] text-[#444] truncate mt-0.5 italic">{interimText}</p>
                            {/if}
                        {:else if transcript}
                            <p class="text-xs text-[#666]">Tap mic to continue, or save</p>
                        {:else}
                            <p class="text-xs text-[#444]">Tap mic to start dictating</p>
                        {/if}
                    </div>
                </div>

                <!-- Transcript area -->
                <div class="flex-1 relative min-h-0">
                    <textarea
                        bind:value={transcript}
                        placeholder="Your words will appear here as you speak..."
                        class="w-full h-full rounded-xl border border-[var(--c-border-subtle)] bg-[var(--c-surface-1)] px-3 py-2.5 text-sm text-[#ccc] placeholder-[#333] focus:border-[#555] focus:outline-none resize-none leading-relaxed"
                        style="font-family: var(--font-mono); font-size: 11px;">
                    </textarea>
                </div>

                <!-- Brainstorm result -->
                {#if brainstormResult}
                    <div class="rounded-xl border border-[#1e2a1e] bg-green-950/10 p-3 flex-shrink-0">
                        <div class="flex items-center gap-1.5 mb-2">
                            <span class="text-green-400 text-xs">✦</span>
                            <p class=" text-green-400 font-semibold " style="font-family:var(--font-label);font-size:9px;letter-spacing:.2em;text-transform:uppercase">Brainstorm</p>
                        </div>
                        <p class="text-xs text-[#ccc] mb-2 leading-relaxed">{brainstormResult.summary}</p>
                        {#if brainstormResult.actionItems?.length}
                            <p class=" text-[#555]  mb-1" style="font-family:var(--font-label);font-size:9px;letter-spacing:.2em;text-transform:uppercase">Action Items</p>
                            {#each brainstormResult.actionItems as item}
                                <p class="text-xs text-[#888] flex gap-1.5 mb-0.5"><span class="text-white flex-shrink-0">→</span>{item}</p>
                            {/each}
                        {/if}
                        {#if brainstormResult.ideas?.length}
                            <p class=" text-[#555]  mt-2 mb-1" style="font-family:var(--font-label);font-size:9px;letter-spacing:.2em;text-transform:uppercase">Ideas</p>
                            {#each brainstormResult.ideas as idea}
                                <p class="text-xs text-[#888] flex gap-1.5 mb-0.5"><span class="text-yellow-400 flex-shrink-0">◆</span>{idea}</p>
                            {/each}
                        {/if}
                    </div>
                {/if}

                <!-- Action buttons -->
                {#if transcript.trim()}
                    <div class="flex gap-2 flex-shrink-0">
                        <button onclick={runBrainstorm} disabled={brainstorming}
                            class="flex-1 rounded-lg border border-[#2a2a2a] py-2 text-xs text-[#666] hover:border-green-900 hover:text-green-400 disabled:opacity-40 transition-colors">
                            {brainstorming ? '✦ Thinking...' : '✦ Brainstorm'}
                        </button>
                        <button onclick={saveEntry}
                            class="flex-1 rounded-lg bg-white py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors">
                            Save
                        </button>
                        <button onclick={clearTranscript}
                            class="rounded-lg border border-[#2a2a2a] px-3 py-2 text-xs text-[#444] hover:text-red-400 hover:border-red-900 transition-colors">
                            ✕
                        </button>
                    </div>
                {/if}
            {/if}
        </div>

    {:else}
        <!-- SAVED ENTRIES VIEW -->
        <div class="flex-1 overflow-y-auto">
            {#if entries.length === 0}
                <div class="flex flex-col items-center justify-center h-32 text-center px-4">
                    <p class="text-xs text-[#333]">No saved notes yet</p>
                    <p class="text-[10px] text-[#222] mt-1">Record something and tap Save</p>
                </div>
            {:else}
                <!-- Entry list or expanded view -->
                {#if activeEntry}
                    <div class="p-3">
                        <button onclick={() => activeEntry = null}
                            class="text-xs text-[#555] hover:text-white mb-3 flex items-center gap-1">
                            ← Back
                        </button>
                        <p class="text-[10px] text-[#444] mb-2">{formatTime(activeEntry.createdAt)}</p>
                        <p class="text-xs text-[#ccc] leading-relaxed whitespace-pre-wrap mb-3" style="font-family: var(--font-mono)">{activeEntry.text}</p>
                        {#if activeEntry.brainstorm}
                            <div class="rounded-xl border border-[#1e2a1e] bg-green-950/10 p-3">
                                <p class="text-[10px] text-green-400 font-semibold mb-2">✦ Brainstorm</p>
                                <p class="text-xs text-[#ccc] mb-2">{activeEntry.brainstorm.summary}</p>
                                {#each activeEntry.brainstorm.actionItems ?? [] as item}
                                    <p class="text-xs text-[#888] mb-0.5">→ {item}</p>
                                {/each}
                            </div>
                        {/if}
                    </div>
                {:else}
                    {#each entries as entry}
                        <div class="flex items-start justify-between px-3 py-2.5 border-b border-[var(--c-border)] hover:bg-white/5 transition-colors group">
                            <button onclick={() => activeEntry = entry} class="flex-1 text-left min-w-0">
                                <p class="text-xs text-white truncate">{entry.text.slice(0, 60)}{entry.text.length > 60 ? '...' : ''}</p>
                                <div class="flex items-center gap-2 mt-0.5">
                                    <p class="text-[10px] text-[#444]">{formatTime(entry.createdAt)}</p>
                                    {#if entry.brainstorm}<span class="text-[9px] text-green-400">✦ brainstorm</span>{/if}
                                </div>
                            </button>
                            <button onclick={() => deleteEntry(entry.id)}
                                class="text-[#222] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all ml-2 text-xs flex-shrink-0">
                                ✕
                            </button>
                        </div>
                    {/each}
                {/if}
            {/if}
        </div>
    {/if}
</div>
