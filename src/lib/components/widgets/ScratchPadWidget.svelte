<script lang="ts">
    import { onMount } from 'svelte';

    let notes = $state('');
    let saved = $state(false);
    let saveTimer: ReturnType<typeof setTimeout> | null = null;

    onMount(() => {
        notes = localStorage.getItem('rogueos_scratchpad') ?? '';
    });

    function handleInput() {
        if (saveTimer) clearTimeout(saveTimer);
        saved = false;
        saveTimer = setTimeout(() => {
            localStorage.setItem('rogueos_scratchpad', notes);
            saved = true;
            setTimeout(() => saved = false, 1500);
        }, 800);
    }
</script>

<div class="flex flex-col h-full p-3">
    <div class="flex items-center justify-between mb-2">
        <p class="text-xs font-semibold text-white">📋 Scratch Pad</p>
        {#if saved}<span class="text-[10px] text-[var(--accent)]">Saved</span>{/if}
    </div>
    <textarea bind:value={notes} oninput={handleInput}
        placeholder="Quick notes, phone numbers, ideas..."
        class="flex-1 rounded-lg bg-[#111] border border-[#1a1a1a] px-3 py-2 text-xs text-[#ccc] placeholder-[#333] focus:border-[#333] focus:outline-none resize-none leading-relaxed"
        style="font-family: var(--font-mono)">
    </textarea>
</div>
