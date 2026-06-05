<script lang="ts">
    import { onMount } from 'svelte';

    let calendlyUrl = $state('');
    let editing = $state(false);
    let inputUrl = $state('');

    onMount(() => {
        calendlyUrl = localStorage.getItem('rogueos_calendly_url') ?? '';
        inputUrl = calendlyUrl;
        if (!calendlyUrl) editing = true;
    });

    function save() {
        let url = inputUrl.trim();
        if (url && !url.startsWith('http')) url = 'https://' + url;
        calendlyUrl = url;
        localStorage.setItem('rogueos_calendly_url', url);
        editing = false;
    }

    function getEmbedUrl(url: string): string {
        // Convert calendly.com/username to embed URL
        return url.replace('calendly.com/', 'calendly.com/d/').includes('/d/')
            ? url
            : url + '?embed_type=Inline&hide_event_type_details=1&hide_gdpr_banner=1';
    }
</script>

<div class="flex flex-col h-full">
    {#if editing || !calendlyUrl}
        <div class="flex flex-col justify-center items-center h-full p-4 gap-3">
            <p class="text-sm text-white font-medium">📅 Calendly</p>
            <p class="text-xs text-[#555] text-center">Enter your Calendly URL to embed your scheduling page</p>
            <input bind:value={inputUrl} placeholder="calendly.com/your-link"
                class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
            <div class="flex gap-2 w-full">
                <button onclick={save} class="flex-1 rounded-lg bg-white py-2 text-xs font-semibold text-black">Save</button>
                {#if calendlyUrl}
                    <button onclick={() => editing = false} class="flex-1 rounded-lg border border-[#2a2a2a] py-2 text-xs text-[#666]">Cancel</button>
                {/if}
            </div>
        </div>
    {:else}
        <div class="flex items-center justify-between px-3 py-2 border-b border-[#1a1a1a] flex-shrink-0">
            <p class="text-xs font-medium text-white">📅 Scheduling</p>
            <button onclick={() => editing = true} class="text-[10px] text-[#444] hover:text-white">Edit</button>
        </div>
        <iframe
            src={getEmbedUrl(calendlyUrl)}
            class="flex-1 w-full border-0 rounded-b-xl"
            style="min-height: 200px"
            title="Calendly scheduling">
        </iframe>
    {/if}
</div>
