<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import Icon from '$lib/components/Icon.svelte';
    import { apiFetch } from '$lib/api';

    let device: any = null;
    let activeCall: any = $state(null);
    let callState = $state<'idle' | 'calling' | 'connected' | 'incoming'>('idle');
    let twilioReady = $state(false);
    let twilioError = $state('');
    let callDuration = $state(0);
    let durationInterval: ReturnType<typeof setInterval> | null = null;
    let muted = $state(false);

    let incomingCall: any = null;
    let incomingFrom = $state('');
    let incomingLine = $state('');

    let dialNumber = $state('');
    let contactSearch = $state('');
    let searchResults = $state<{id:string;name:string;phone:string;company:string|null}[]>([]);
    let searching = $state(false);
    let searchTimer: ReturnType<typeof setTimeout>;
    let phoneNumbers = $state<{id:string;phone_number:string;friendly_name:string|null;is_primary:boolean}[]>([]);

    const dialPad = [['1','2','3'],['4','5','6'],['7','8','9'],['*','0','#']];

    function fmt(s: number) { return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }

    function pressKey(key: string) {
        if (callState !== 'idle' && activeCall) { activeCall.sendDigits(key); return; }
        dialNumber += key;
    }
    function backspace() { dialNumber = dialNumber.slice(0, -1); }

    async function dial(num?: string) {
        const target = (num ?? dialNumber).trim();
        if (!target || !device || !twilioReady) return;
        const digits = target.replace(/\D/g, '');
        const e164 = target.startsWith('+') ? target
            : digits.length === 10 ? '+1' + digits
            : digits.length === 11 ? '+' + digits : '+' + digits;
        callState = 'calling'; twilioError = '';
        try {
            let callId: string | undefined;
            try {
                const startRes = await apiFetch('/api/calls/start', { method: 'POST', body: JSON.stringify({ phone_number: e164, call_type: 'manual' }) });
                if (startRes.ok) callId = (await startRes.json()).call_id;
            } catch { /* non-fatal */ }
            const callerId = phoneNumbers.find(n => n.is_primary)?.phone_number ?? phoneNumbers[0]?.phone_number;
            const params: Record<string, string> = { To: e164 };
            if (callId) params.CallId = callId;
            if (callerId) params.CallerId = callerId;
            activeCall = await device.connect({ params });
            activeCall.on('accept', () => { callState = 'connected'; durationInterval = setInterval(() => callDuration++, 1000); });
            activeCall.on('disconnect', () => { callState = 'idle'; activeCall = null; muted = false; if(durationInterval){clearInterval(durationInterval);durationInterval=null;} callDuration = 0; });
            activeCall.on('error', (e:any) => { twilioError = e.message; callState = 'idle'; });
        } catch(e) { callState = 'idle'; twilioError = String(e); }
    }

    function hangup() { activeCall?.disconnect(); incomingCall?.reject(); activeCall = null; incomingCall = null; callState = 'idle'; if(durationInterval){clearInterval(durationInterval);durationInterval=null;} callDuration = 0; }
    function answer() { if(!incomingCall) return; activeCall = incomingCall; incomingCall.accept(); callState = 'connected'; durationInterval = setInterval(() => callDuration++, 1000); incomingCall = null; }
    function reject() { incomingCall?.reject(); incomingCall = null; callState = 'idle'; }
    function toggleMute() { if(!activeCall) return; muted = !muted; activeCall.mute(muted); }

    async function searchContacts() {
        clearTimeout(searchTimer);
        if (!contactSearch.trim()) { searchResults = []; return; }
        searchTimer = setTimeout(async () => {
            searching = true;
            const r = await apiFetch(`/api/contacts/filtered?search=${encodeURIComponent(contactSearch)}&limit=5`);
            if (r.ok) { const d = await r.json(); searchResults = (d.data ?? d ?? []).filter((c:any) => c.phone).slice(0,5); }
            searching = false;
        }, 250);
    }

    async function initTwilio() {
        try {
            const { Device } = await import('@twilio/voice-sdk');
            const res = await apiFetch('/api/twilio/token', { method: 'POST' });
            if (!res.ok) return;
            const { token } = await res.json();
            // logLevel 4 (ERROR) — the SDK logger is a shared singleton; level 1 here turns on
            // debug spam for the global inbound device too and makes console triage misleading.
            device = new Device(token, { logLevel: 4, codecPreferences: ['opus', 'pcmu'] as any });
            device.on('error', (e:any) => { twilioError = e.message; });
            // Outbound-only: do NOT register() for incoming here. Inbound is owned by the
            // global Twilio store + IncomingCallBanner — a second registration on the same
            // identity stole inbound ring and tore down the shared device on unmount.
            twilioReady = true;
        } catch(e) { twilioError = String(e); }
    }

    onMount(async () => {
        const [_, nr] = await Promise.all([initTwilio(), apiFetch('/api/phone/numbers')]);
        phoneNumbers = nr.ok ? await nr.json() : [];
    });
    onDestroy(() => { clearInterval(durationInterval ?? undefined); try { device?.destroy(); } catch {} });
</script>

<div class="pw">
    <!-- Status bar -->
    <div class="pw-status">
        <div class="pw-dot" class:ready={twilioReady} class:error={!!twilioError} class:active={callState !== 'idle'}></div>
        <span class="pw-status-txt">
            {#if callState === 'connected'}Connected · {fmt(callDuration)}
            {:else if callState === 'calling'}Calling...
            {:else if callState === 'incoming'}Incoming call
            {:else if twilioError}Error
            {:else if twilioReady}Ready
            {:else}Connecting...{/if}
        </span>
    </div>

    <!-- Incoming call banner -->
    {#if callState === 'incoming'}
        <div class="pw-incoming">
            <div class="pw-inc-info">
                <span class="pw-inc-label">Incoming</span>
                <span class="pw-inc-num">{incomingFrom}</span>
                {#if incomingLine}<span class="pw-inc-line">on {incomingLine}</span>{/if}
            </div>
            <div class="pw-inc-btns">
                <button onclick={answer} class="pw-ans">Answer</button>
                <button onclick={reject} class="pw-rej"><Icon name="x" size={14} /></button>
            </div>
        </div>
    {/if}

    <!-- Contact search -->
    {#if callState === 'idle'}
        <div class="pw-search-wrap">
            <input bind:value={contactSearch} oninput={searchContacts}
                placeholder="Search contact..." class="pw-search" />
            {#if searchResults.length > 0}
                <div class="pw-results">
                    {#each searchResults as c}
                        <button onclick={() => { dialNumber = c.phone; contactSearch = ''; searchResults = []; }} class="pw-result">
                            <span class="pw-r-name">{c.name}</span>
                            <span class="pw-r-phone">{c.phone}</span>
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}

    <!-- Number display -->
    <div class="pw-display">
        <span class="pw-number" class:pw-number-dim={!dialNumber}>{dialNumber || '+1 000 000 0000'}</span>
        {#if dialNumber && callState === 'idle'}
            <button onclick={backspace} class="pw-back">⌫</button>
        {/if}
    </div>

    <!-- Dial pad -->
    {#if callState === 'idle' || (callState === 'connected' && activeCall)}
        <div class="pw-pad">
            {#each dialPad as row}
                {#each row as key}
                    <button onclick={() => pressKey(key)} class="pw-key">
                        {key}
                    </button>
                {/each}
            {/each}
        </div>
    {/if}

    <!-- Action buttons -->
    <div class="pw-actions">
        {#if callState === 'idle'}
            <button onclick={() => dial()} disabled={!twilioReady || !dialNumber.trim()} class="pw-call-btn">
                📞 Call
            </button>
        {:else if callState === 'calling'}
            <button onclick={hangup} class="pw-hangup-btn">Cancel</button>
        {:else if callState === 'connected'}
            <button onclick={toggleMute} class="pw-mute-btn" class:pw-muted={muted}>{muted ? '🔇 Muted' : '🎤 Mute'}</button>
            <button onclick={hangup} class="pw-hangup-btn">End Call</button>
        {/if}
    </div>

    <!-- Active lines -->
    {#if phoneNumbers.length > 0 && callState === 'idle'}
        <div class="pw-lines">
            {#each phoneNumbers.slice(0,2) as n}
                <div class="pw-line">
                    <div class="pw-line-dot" class:pw-line-primary={n.is_primary}></div>
                    <span class="pw-line-label">{n.friendly_name ?? n.phone_number}</span>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
.pw { display: flex; flex-direction: column; gap: 8px; height: 100%; background: #050508; border-radius: 10px; padding: 10px; }
.pw-status { display: flex; align-items: center; gap: 6px; }
.pw-dot { width: 7px; height: 7px; border-radius: 50%; background: #f59e0b; animation: blink 1.5s ease infinite; flex-shrink: 0; }
.pw-dot.ready { background: #22c55e; animation: none; }
.pw-dot.error { background: #ef4444; animation: none; }
.pw-dot.active { background: #22c55e; animation: blink 0.8s ease infinite; }
.pw-status-txt { font-size: 10px; color: #666; font-family: monospace; letter-spacing: 0.5px; }
@keyframes blink { 0%,100%{opacity:1}50%{opacity:0.3} }

.pw-incoming { background: #1a0800; border: 1px solid #f59e0b30; border-radius: 8px; padding: 8px 10px; display: flex; align-items: center; justify-content: space-between; }
.pw-inc-info { display: flex; flex-direction: column; gap: 1px; }
.pw-inc-label { font-size: 9px; color: #f59e0b; letter-spacing: 2px; text-transform: uppercase; }
.pw-inc-num { font-size: 13px; color: #fff; font-weight: 600; font-family: monospace; }
.pw-inc-line { font-size: 10px; color: #666; }
.pw-inc-btns { display: flex; gap: 5px; }
.pw-ans { background: #22c55e; color: #000; border: none; border-radius: 6px; padding: 6px 12px; font-size: 11px; font-weight: 700; cursor: pointer; }
.pw-rej { background: #ef4444; color: #fff; border: none; border-radius: 6px; padding: 6px 10px; font-size: 11px; cursor: pointer; }

.pw-search-wrap { position: relative; }
.pw-search { width: 100%; background: #0d0d0d; border: 1px solid #1e1e1e; border-radius: 8px; padding: 8px 10px; color: #ccc; font-size: 12px; outline: none; box-sizing: border-box; }
.pw-search:focus { border-color: #2a2a2a; }
.pw-search::placeholder { color: #333; }
.pw-results { position: absolute; top: 100%; left: 0; right: 0; background: #0d0d0d; border: 1px solid #1e1e1e; border-radius: 8px; margin-top: 2px; overflow: hidden; z-index: 20; }
.pw-result { display: flex; justify-content: space-between; padding: 7px 10px; width: 100%; background: none; border: none; cursor: pointer; text-align: left; }
.pw-result:hover { background: #111; }
.pw-r-name { font-size: 11px; color: #ccc; }
.pw-r-phone { font-size: 10px; color: #555; font-family: monospace; }

.pw-display { background: #0a0a0a; border: 1px solid #1a1a1a; border-radius: 8px; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; min-height: 44px; }
.pw-number { font-size: 18px; font-family: monospace; font-weight: 600; letter-spacing: 1px; color: #fff; flex: 1; }
.pw-number-dim { color: #222; font-weight: 400; font-size: 13px; }
.pw-back { background: none; border: none; color: #555; font-size: 16px; cursor: pointer; padding: 2px 6px; }
.pw-back:hover { color: #ccc; }

.pw-pad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.pw-key { background: #111; border: 1px solid #1e1e1e; border-radius: 8px; padding: 12px 0; font-size: 16px; font-weight: 600; color: #ccc; cursor: pointer; transition: all 0.1s; text-align: center; }
.pw-key:hover { background: #1a1a1a; border-color: #2a2a2a; color: #fff; }
.pw-key:active { background: #222; transform: scale(0.95); }

.pw-actions { display: flex; gap: 6px; }
.pw-call-btn { flex: 1; background: #22c55e; color: #000; border: none; border-radius: 8px; padding: 12px 0; font-size: 14px; font-weight: 700; cursor: pointer; transition: background 0.15s; }
.pw-call-btn:hover { background: #16a34a; }
.pw-call-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.pw-mute-btn { flex: 1; background: #0d0d0d; border: 1px solid #1e1e1e; color: #888; border-radius: 8px; padding: 10px 0; font-size: 12px; cursor: pointer; transition: all 0.15s; }
.pw-mute-btn:hover { border-color: #2a2a2a; color: #ccc; }
.pw-muted { border-color: #ef4444 !important; color: #ef4444 !important; }
.pw-hangup-btn { flex: 1; background: #ef4444; color: #fff; border: none; border-radius: 8px; padding: 10px 0; font-size: 12px; font-weight: 600; cursor: pointer; }
.pw-hangup-btn:hover { background: #dc2626; }

.pw-lines { border-top: 1px solid #0d0d0d; padding-top: 7px; display: flex; flex-direction: column; gap: 3px; margin-top: auto; }
.pw-line { display: flex; align-items: center; gap: 5px; }
.pw-line-dot { width: 5px; height: 5px; border-radius: 50%; background: #1a1a1a; flex-shrink: 0; }
.pw-line-dot.pw-line-primary { background: #22c55e; }
.pw-line-label { font-size: 9px; color: #444; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
