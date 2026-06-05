<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import ContactCard from './ContactCard.svelte';
	import CallPostMortem from './CallPostMortem.svelte';
	import { currentContact, callState } from '$lib/stores';
	import { apiFetch } from '$lib/api';
	import { toastSuccess, toastError } from '$lib/stores/toast';
	import {
		twilioDevice,
		twilioReady as twilioReadyStore,
		twilioError as twilioErrorStore,
		activeCall as activeCallStore,
		initTwilioDevice
	} from '$lib/stores/twilio';
	import DialerSidebar from './DialerSidebar.svelte';
	import DialButtonRenderer from './DialButtonRenderer.svelte';
	import Icon from './Icon.svelte';
	import AppointmentModal from '$lib/components/AppointmentModal.svelte';
	import WinCelebration from '$lib/components/WinCelebration.svelte';
	import type { Contact } from '$lib/stores';

	// Store-derived — drives the queue card only
	const contact = $derived($currentContact);
	const callPhase = $derived($callState);

	// Local capture — persists through state changes so postmortem always has the right contact
	let calledContact = $state<Contact | null>(null);

	let transcript   = $state('');
	let summary      = $state('');
	let currentCallId = $state<string | null>(null);

	let callDuration = $state(0);
	let processingSeconds = $state(0);

	let pollInterval:    ReturnType<typeof setInterval> | null = null;
	let durationTicker:  ReturnType<typeof setInterval> | null = null;
	let processingTicker: ReturnType<typeof setInterval> | null = null;

	// Twilio state now lives in the global store — Dialer reads from it reactively.
	// twilioReady / twilioError are Svelte writables; use $twilioReadyStore etc. in template.
	// Local refs are kept in sync with the store for use in imperative code (handleDial, endCall).
	let twilioReady  = $state(false);
	let twilioError  = $state('');

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let device: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let activeCall: any = null;

	// Keep local reactive vars in sync with the global store
	const unsubReady  = twilioReadyStore.subscribe(v  => { twilioReady  = v;  });
	const unsubError  = twilioErrorStore.subscribe(v  => { twilioError  = v ?? ''; });
	const unsubDevice = twilioDevice.subscribe(v      => { device       = v;  });
	const unsubActive = activeCallStore.subscribe(v   => { activeCall   = v;  });

	interface CallList { id: string; name: string; }
	interface Campaign { id: string; name: string; project: { name: string; client: { name: string } }; call_lists: CallList[]; }
	let campaigns = $state<Campaign[]>([]);
	let selectedListId = $state('');

	let phoneNumbers = $state<{id:string; phone_number:string; friendly_name:string; is_primary:boolean; status:string; calls_today:number; daily_limit:number}[]>([]);
	let selectedCallerId = $state('');

	// Call controls
	let callType = $state('cold_call');
	let powerDialer = $state(false);
	let powerDialDelay = $state(5); // seconds between auto-dials
	let showNumberPicker = $state(false);
	let numberSearch = $state('');
	let queueRemaining = $state<number | null>(null);
	// Shortcut hint — shown once per session until user presses ?
	let showShortcutHint = $state(
		typeof window !== 'undefined' && !sessionStorage.getItem('rogueos_hint_seen')
	);
	let countdown = $state(0);
	let countdownTimer: ReturnType<typeof setInterval> | null = null;

	// Tier-based feature flags
	let tierFeatures = $state({
		voicemailDrops: true,
		aiBrief: true,
		callRecording: true,
		multipleNumbers: true,
		advancedWidgets: true,
	});

	// Appointment modal — available during live call
	let showDialerAppointment = $state(false);

	// Win celebration
	const WIN_OUTCOMES_CELEBRATE = new Set(['appointment_set','demo_scheduled','meeting_confirmed','signed_up']);
	let celebrateContact = $state<string>('');
	let celebrateOutcome = $state<string>('');
	let showCelebration = $state(false);

	// Voicemail drops
	let vmDrops = $state<any[]>([]);
	let droppingVm = $state(false);
	let vmDropped = $state(false);

	// Calling-screen UI state
	let muted = $state(false);
	let showNotePanel = $state(false);
	let showVmMenu = $state(false);
	let showContactInfo = $state(false);
	let callNotes = $state('');

	// Pre-call brief
	let callBrief = $state<string | null>(null);
	let loadingBrief = $state(false);
	let briefTasks = $state<any[]>([]);

	// Load brief when contact changes
	$effect(() => {
		const contact = $currentContact;
		if (contact?.id && $callState === 'idle' && tierFeatures.aiBrief) {
			callBrief = null;
			briefTasks = [];
			loadingBrief = true;
			apiFetch(`/api/contacts/${contact.id}/brief`)
				.then(async r => {
					if (r.ok) {
						const d = await r.json();
						callBrief = d.brief;
						briefTasks = d.openTasks ?? [];
					}
				})
				.catch(() => {})
				.finally(() => { loadingBrief = false; });
		} else if (!contact) {
			callBrief = null;
			briefTasks = [];
		}
	});

	let beforeUnloadHandler: (e: BeforeUnloadEvent) => void;

	// Keyboard-shortcut / window event handlers — named so onDestroy can remove them (prevents leak).
	const onDialShortcut = () => { if ($callState === 'idle' && $currentContact) handleDial(); };
	const onKeydownHint = (e: KeyboardEvent) => {
		if (e.key === '?' && showShortcutHint) {
			showShortcutHint = false;
			sessionStorage.setItem('rogueos_hint_seen', '1');
		}
	};
	const onSetOutcomeShortcut = (e: Event) => {
		const ev = e as CustomEvent<string>;
		// Handled by CallPostMortem via its own listener; just log here.
		console.log('[shortcut] set outcome:', ev.detail);
	};

	// Bug 5: warn before leaving with an open postmortem
	beforeNavigate(({ cancel }) => {
		if ($callState === 'postmortem' && currentCallId) {
			const confirmed = window.confirm(
				'You have an unsaved call log. Leave without saving?'
			);
			if (!confirmed) cancel();
		}
	});

	onMount(async () => {
		// Load tier features
		const tierRes = await apiFetch('/api/portal/tier');
		if (tierRes.ok) {
			const d = await tierRes.json();
			tierFeatures = { ...tierFeatures, ...d.features };
		}

		// Bug 5: window-level guard for browser close/refresh
		beforeUnloadHandler = (e: BeforeUnloadEvent) => {
			if ($callState === 'postmortem' && currentCallId) {
				e.preventDefault();
				e.returnValue = 'You have an unsaved call log. Leave without saving?';
			}
		};
		window.addEventListener('beforeunload', beforeUnloadHandler);

		// Keyboard shortcut events from KeyboardShortcuts component (named handlers — removed in onDestroy)
		window.addEventListener('leados:dial', onDialShortcut);
		window.addEventListener('keydown', onKeydownHint);
		window.addEventListener('leados:end-call', handleEndCall);
		window.addEventListener('leados:skip', skipContact);  // Bug 3: call skipContact not loadNextContact
		window.addEventListener('leados:set-outcome', onSetOutcomeShortcut);

		// Handle ?incoming=1 — call was answered via the IncomingCallBanner before arriving here.
		// The active call is already in the global store; just sync local state to reflect it.
		const urlParams = new URLSearchParams(window.location.search);
		if (urlParams.get('incoming') === '1') {
			const existingCall = activeCall; // already synced from the store subscription above
			if (existingCall) {
				// The call is live — show the calling screen immediately
				calledContact = null; // inbound: no contact in queue, may be enriched later
				callState.set('calling');
				callDuration = 0;
				durationTicker = setInterval(() => callDuration++, 1000);
				existingCall.on('disconnect', () => {
					if (durationTicker) { clearInterval(durationTicker); durationTicker = null; }
					if ($callState === 'calling' || $callState === 'ringing') beginProcessing();
				});
			}
			// Clear the query param so refreshing the page doesn't re-trigger this
			history.replaceState({}, '', '/dialer');
		}

		await loadCampaigns();
		await loadVmDrops();
		await loadNextContact();
		await loadNumbers();
		// Twilio device is initialized globally by the layout onMount.
		// If it hasn't registered yet (e.g. layout is still in flight), initTwilio() is a no-op
		// because the store guard prevents double-init. The subscriptions above will reactively
		// update twilioReady / twilioError / device once registration completes.
	});

	onDestroy(() => {
		if (beforeUnloadHandler) window.removeEventListener('beforeunload', beforeUnloadHandler);
		window.removeEventListener('leados:dial', onDialShortcut);
		window.removeEventListener('keydown', onKeydownHint);
		window.removeEventListener('leados:end-call', handleEndCall);
		window.removeEventListener('leados:skip', skipContact);
		window.removeEventListener('leados:set-outcome', onSetOutcomeShortcut);
		clearAll();
		// Do NOT destroy the device here — it lives in the global store and persists across navigation.
		// The layout's onDestroy calls destroyDevice() when the whole app tears down.
		window.dispatchEvent(new CustomEvent('leados:session-end'));

		// Unsubscribe from global store subscriptions
		unsubReady();
		unsubError();
		unsubDevice();
		unsubActive();
	});

	function clearAll() {
		if (pollInterval)     { clearInterval(pollInterval);     pollInterval = null; }
		if (durationTicker)   { clearInterval(durationTicker);   durationTicker = null; }
		if (processingTicker) { clearInterval(processingTicker); processingTicker = null; }
		if (countdownTimer)   { clearInterval(countdownTimer);   countdownTimer = null; }
		countdown = 0;
	}

	async function loadNumbers() {
		try {
			const r = await apiFetch('/api/phone/numbers');
			if (r.ok) {
				const d = await r.json();
				phoneNumbers = (d.numbers ?? d ?? []).filter((n: {status:string}) => n.status === 'active');
				if (phoneNumbers.length > 0 && !selectedCallerId) {
					const primary = phoneNumbers.find(n => n.is_primary);
					selectedCallerId = (primary ?? phoneNumbers[0]).phone_number;
				}
			}
		} catch {}
	}

	async function loadVmDrops() {
		const res = await apiFetch('/api/voicemail-drops');
		vmDrops = res.ok ? await res.json() : [];
	}

	async function dropVoicemail(vmId: string) {
		if (!activeCall || droppingVm) return;
		droppingVm = true;

		// Bug 2: use DB call ID — server looks up the Twilio SID from the calls table
		const res = await apiFetch('/api/voicemail-drops/drop', {
			method: 'POST',
			body: JSON.stringify({
				vmDropId: vmId,
				callId: currentCallId,  // DB call ID, not Twilio SID
			}),
		});

		if (res.ok) {
			vmDropped = true;
			showVmMenu = false;
			setTimeout(() => {
				endCall();
			}, 1500);
		} else {
			toastError('Failed to drop voicemail — try again');
		}
		droppingVm = false;
	}

	function endCall() {
		if (activeCall) {
			activeCall.disconnect();
			activeCall = null;
			activeCallStore.set(null);
		}
	}

	async function loadCampaigns() {
		const res = await apiFetch('/api/campaigns');
		campaigns = res.ok ? await res.json() : [];
		for (const c of campaigns) {
			if (c.call_lists?.length) { selectedListId = c.call_lists[0].id; break; }
		}
	}

	async function loadNextContact() {
		try {
			const qs = selectedListId ? `?call_list_id=${selectedListId}` : '';
			const res = await apiFetch(`/api/calls/next${qs}`);
			if (!res.ok || res.status === 204) { currentContact.set(null); return; }
			currentContact.set(await res.json());
			callState.set('idle');
		} catch {
			currentContact.set(null);
			toastError('Could not load the next contact — check your connection');
		}
		// Refresh queue count in background
		refreshQueueCount();
	}

	async function refreshQueueCount() {
		if (!selectedListId) { queueRemaining = null; return; }
		try {
			const r = await apiFetch(`/api/call-lists/${selectedListId}/contacts?status=pending&count=true`);
			if (r.ok) {
				const d = await r.json();
				queueRemaining = d.count ?? d.total ?? (Array.isArray(d) ? d.length : null);
			}
		} catch { /* non-fatal */ }
	}

	// Undo skip state
	let lastSkippedContact = $state<typeof $currentContact | null>(null);
	let lastSkippedListId = $state<string | null>(null);
	let undoTimer: ReturnType<typeof setTimeout> | null = null;
	let showUndoToast = $state(false);

	// Bug 3: skip moves contact to back of queue before loading next
	async function skipContact() {
		const skipped = $currentContact;
		const listId = selectedListId;

		if (skipped && listId) {
			// Capture for potential undo
			lastSkippedContact = skipped;
			lastSkippedListId = listId;
			showUndoToast = true;

			// Clear any previous undo timer
			if (undoTimer) clearTimeout(undoTimer);
			undoTimer = setTimeout(() => {
				showUndoToast = false;
				lastSkippedContact = null;
				lastSkippedListId = null;
			}, 5000);

			try {
				await apiFetch(`/api/call-lists/${listId}/contacts/${skipped.id}/skip`, {
					method: 'POST',
				});
			} catch { /* non-fatal — still advance */ }
		}
		await loadNextContact();
	}

	async function undoSkip() {
		if (!lastSkippedContact || !lastSkippedListId) return;
		showUndoToast = false;
		if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }

		// Re-queue the skipped contact at position 0
		try {
			await apiFetch(`/api/call-lists/${lastSkippedListId}/contacts/${lastSkippedContact.id}/skip`, {
				method: 'DELETE', // unskip — reset to pending
			});
		} catch { /* non-fatal */ }

		// Restore it as current contact immediately
		currentContact.set(lastSkippedContact);
		callState.set('idle');
		lastSkippedContact = null;
		lastSkippedListId = null;
	}

	async function initTwilio() {
		// If the global store already has a device (initialized by layout onMount), nothing to do.
		// If it failed for some reason (e.g. user clicked Retry), re-run the global init.
		twilioErrorStore.set(null);
		await initTwilioDevice();
	}

	async function handleDial() {
		if (!contact || !device || !twilioReady) return;
		calledContact = contact;           // capture before state changes
		twilioError = '';

		// Bug 6: send call_type and call_list_id so server records them correctly
		const startRes = await apiFetch('/api/calls/start', {
			method: 'POST',
			body: JSON.stringify({
				contact_id: contact.id,
				campaign_id: selectedCampaign?.id ?? null,
				call_type: callType ?? 'cold_call',
				call_list_id: selectedListId ?? null,
			}),
		});
		if (!startRes.ok) { twilioError = 'Failed to create call record'; return; }
		const { call_id } = await startRes.json();
		currentCallId = call_id;

		try {
			const rawPhone = contact.phone_normalized ?? contact.phone;
			const digitsD = rawPhone.replace(/\D/g, '');
			const e164D = rawPhone.startsWith('+') ? rawPhone
				: digitsD.length === 10 ? '+1' + digitsD
				: digitsD.length === 11 && digitsD.startsWith('1') ? '+' + digitsD
				: '+' + digitsD;

			// Auto-select: local presence first, then least-used healthy number
			const bestNum = pickBestNumber(rawPhone);
			if (bestNum) selectedCallerId = bestNum;

			activeCall = await device.connect({ params: { To: e164D, CallId: call_id, CallerId: selectedCallerId || undefined } });

			// Track call against the chosen number (optimistic local + async persist)
			const usedIdx = phoneNumbers.findIndex(n => n.phone_number === selectedCallerId);
			if (usedIdx >= 0) {
				phoneNumbers[usedIdx] = { ...phoneNumbers[usedIdx], calls_today: phoneNumbers[usedIdx].calls_today + 1 };
				apiFetch(`/api/phone/numbers/${phoneNumbers[usedIdx].id}`, {
					method: 'PATCH',
					body: JSON.stringify({ calls_today: phoneNumbers[usedIdx].calls_today }),
				}).catch((err) => { console.error('[calls_today increment]', err); });
			}
			// Keep global store in sync
			activeCallStore.set(activeCall);

			// Show ringing state immediately — timer does NOT start yet
			callState.set('ringing');

			activeCall.on('accept', () => {
				// Other party picked up — now start the timer
				callDuration = 0;
				durationTicker = setInterval(() => callDuration++, 1000);
				callState.set('calling');
			});

			activeCall.on('disconnect', () => {
				if (durationTicker) { clearInterval(durationTicker); durationTicker = null; }
				activeCallStore.set(null);
				if ($callState === 'calling' || $callState === 'ringing') beginProcessing();
			});

			activeCall.on('error', (err: { message: string }) => {
				twilioErrorStore.set(err.message);
				activeCallStore.set(null);
				callState.set('idle');
			});
		} catch (err) {
			twilioError = err instanceof Error ? err.message : 'Call failed';
			callState.set('idle');
		}
	}

	function handleEndCall() {
		if (activeCall) { activeCall.disconnect(); activeCall = null; }
		else beginProcessing();
	}

	function toggleMute() {
		if (!activeCall) return;
		muted = !muted;
		if (muted) activeCall.mute(true);
		else activeCall.mute(false);
	}

	function triggerQualityScore(callId: string | null) {
		// Guard: only fire if we actually have a call ID
		if (!callId) return;
		// Fire and forget — don't block the UI, non-critical
		apiFetch(`/api/calls/${callId}/score`, { method: 'POST' }).catch(() => {});
	}

	function beginProcessing() {
		if (durationTicker) { clearInterval(durationTicker); durationTicker = null; }
		transcript = ''; summary = '';
		processingSeconds = 0;
		// Reset calling-screen UI state
		muted = false;
		showNotePanel = false;
		showVmMenu = false;
		showContactInfo = false;
		vmDropped = false;  // reset for next call
		callState.set('processing');

		// Elapsed timer — plain setInterval, increments $state directly
		processingTicker = setInterval(() => { processingSeconds++; }, 1000);

		// Poll for transcript every 2s
		if (pollInterval) clearInterval(pollInterval);
		pollInterval = setInterval(async () => {
			if (!currentCallId) return;
			try {
				const res = await apiFetch(`/api/calls/${currentCallId}`);
				const data = await res.json();
				// Bug 4: advance on processed_at even when transcript is null (absent/failed recording)
				if (data.raw_transcript || data.processed_at) {
					transcript = data.raw_transcript ?? '';
					summary    = data.summary ?? '';
					clearAll();
					callState.set('postmortem');
					if (currentCallId) triggerQualityScore(currentCallId);
				}
			} catch { /* keep polling */ }
		}, 2000);

		// Auto-advance after 90 seconds
		setTimeout(() => {
			if ($callState === 'processing') {
				const idAtTimeout = currentCallId;
				clearAll();
				callState.set('postmortem');
				if (idAtTimeout) triggerQualityScore(idAtTimeout);
			}
		}, 90_000);
	}

	function skipProcessing() {
		clearAll();
		callState.set('postmortem');   // calledContact is already set
	}

	async function handleSave(saveData: { notes: string; outcome: string }) {
		// Save to DB if we have a call record
		if (currentCallId) {
			try {
				const saveRes = await apiFetch(`/api/calls/${currentCallId}`, {
					method: 'PATCH',
					body: JSON.stringify({
						...saveData,
						contact_id: calledContact?.id,
					}),
				});
				if (!saveRes.ok) toastError('Call outcome failed to save — your logged outcome may be lost');
			} catch {
				toastError('Call outcome failed to save — your logged outcome may be lost');
			}
		}
		// Notify session bar of completed call
		window.dispatchEvent(new CustomEvent('leados:call-completed'));

		// Win celebration — fire before resetting so we have the contact name
		if (WIN_OUTCOMES_CELEBRATE.has(saveData.outcome)) {
			celebrateContact = calledContact?.name ?? '';
			celebrateOutcome = saveData.outcome;
			showCelebration  = true;
			// Actual reset happens after celebration dismisses (see onDone below)
			return;
		}

		// Reset and advance (non-win outcomes skip straight here)
		currentCallId  = null;
		calledContact  = null;
		transcript     = '';
		summary        = '';
		callNotes      = '';
		vmDropped      = false;
		await loadNextContact();
		if (powerDialer) {
			startCountdown();
		}
	}

	async function afterCelebration() {
		showCelebration = false;
		currentCallId  = null;
		calledContact  = null;
		transcript     = '';
		summary        = '';
		callNotes      = '';
		vmDropped      = false;
		await loadNextContact();
		if (powerDialer) startCountdown();
	}

	function formatDuration(s: number) {
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	}

	function togglePowerDialer() {
		powerDialer = !powerDialer;
		if (powerDialer) {
			window.dispatchEvent(new CustomEvent('leados:session-start'));
		} else {
			window.dispatchEvent(new CustomEvent('leados:session-end'));
		}
	}

	function cancelCountdown() {
		if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
		countdown = 0;
	}

	function startCountdown(seconds = powerDialDelay) {
		countdown = seconds;
		if (countdownTimer) clearInterval(countdownTimer);
		countdownTimer = setInterval(() => {
			countdown--;
			if (countdown <= 0) {
				cancelCountdown();
				if ($callState === 'idle' && $currentContact) handleDial();
			}
		}, 1000);
	}

	// ── Number health helpers ──────────────────────────────────────────────
	function numReputation(n: typeof phoneNumbers[0]) {
		const limit = n.daily_limit || 200;
		const ratio = n.calls_today / limit;
		if (ratio >= 0.9) return { icon: '🚫', cls: 'text-[var(--end-text)]',    tip: `${n.calls_today}/${limit} — spam risk, rotating` };
		if (ratio >= 0.7) return { icon: '⚠',  cls: 'text-yellow-400', tip: `${n.calls_today}/${limit} — approaching limit` };
		return             { icon: '●',  cls: 'text-[var(--call)]',   tip: `${n.calls_today}/${limit} — healthy` };
	}

	function pickBestNumber(contactPhone: string): string {
		if (!phoneNumbers.length) return selectedCallerId;
		const digits = (contactPhone ?? '').replace(/\D/g, '');
		const contactArea = digits.startsWith('1') ? digits.slice(1, 4) : digits.slice(0, 3);

		// Only use numbers under 90% of their daily limit
		const healthy = phoneNumbers.filter(n => n.calls_today < (n.daily_limit || 200) * 0.9);
		const pool = healthy.length ? healthy : phoneNumbers; // fallback: all numbers

		// 1. Local presence — same area code as contact
		const local = pool.find(n => {
			const nd = n.phone_number.replace(/\D/g, '');
			const na = nd.startsWith('1') ? nd.slice(1, 4) : nd.slice(0, 3);
			return na === contactArea;
		});
		if (local) return local.phone_number;

		// 2. Least-used healthy number
		const sorted = [...pool].sort((a, b) => a.calls_today - b.calls_today);
		return sorted[0].phone_number;
	}

	const selectedNumHealth = $derived(
		phoneNumbers.find(n => n.phone_number === selectedCallerId)
			? numReputation(phoneNumbers.find(n => n.phone_number === selectedCallerId)!)
			: null
	);

	const allLists = $derived(campaigns.flatMap(c =>
		(c.call_lists ?? []).map(l => ({
			id: l.id,
			label: `${c.project?.client?.name} › ${c.project?.name} › ${c.name} › ${l.name}`
		}))
	));

	const selectedCampaign = $derived(
		campaigns.find(c => c.call_lists?.some(l => l.id === selectedListId)) ?? null
	);
</script>

<svelte:window onclick={(e) => {
	if (showVmMenu && !(e.target as Element)?.closest('.vm-menu-container')) showVmMenu = false;
	if (showNumberPicker && !(e.target as Element)?.closest('.number-picker-container')) { showNumberPicker = false; numberSearch = ''; }
}} />

<div class="flex flex-col flex-1 h-full">
	<!-- Header -->
	<div class="border-b border-[var(--c-border)] px-8 py-2.5 flex items-center gap-2 flex-wrap overflow-hidden">
		<span class="text-xs text-[var(--c-text-faint)] uppercase tracking-widest shrink-0">Calling from</span>
		{#if allLists.length}
			<select bind:value={selectedListId} onchange={loadNextContact}
				class="flex-1 min-w-0 truncate max-w-[200px] sm:max-w-none rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-surface-2)] px-3 h-8 text-xs text-white focus:border-white focus:outline-none">
				<option value="">— Any active contact —</option>
				{#each allLists as item}
					<option value={item.id}>{item.label}</option>
				{/each}
			</select>
		{:else}
			<span class="text-xs text-[var(--c-text-ghost)]">No call lists — set up Clients › Projects › Campaigns first</span>
		{/if}
		<select bind:value={callType}
			class="rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-surface-2)] px-2 h-8 text-xs text-white focus:border-white focus:outline-none">
			<option value="cold_call">Cold</option>
			<option value="follow_up">Follow-up</option>
			<option value="callback">Callback</option>
			<option value="demo">Demo</option>
			<option value="warm">Warm</option>
			<option value="referral">Referral</option>
			<option value="check_in">Check-in</option>
		</select>
		{#if phoneNumbers.length > 0 && (tierFeatures.multipleNumbers || phoneNumbers.length === 1)}
			<!-- Number picker — flat select up to 8 numbers, searchable popover above that -->
			{#if phoneNumbers.length <= 8}
				<div class="flex items-center gap-1">
					<select bind:value={selectedCallerId}
						class="rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-surface-2)] px-2 h-8 text-xs text-white focus:border-white focus:outline-none max-w-[160px] truncate"
						title="Caller ID — auto-selected by local presence & spam rotation">
						{#each phoneNumbers as num}
							{@const rep = numReputation(num)}
							<option value={num.phone_number}>{rep.icon} {num.friendly_name || num.phone_number}</option>
						{/each}
					</select>
					{#if selectedNumHealth}
						<span class="text-[10px] {selectedNumHealth.cls}" title={selectedNumHealth.tip}>{selectedNumHealth.icon}</span>
					{/if}
				</div>
			{:else}
				<!-- Searchable number popover for 9+ numbers -->
				<div class="relative number-picker-container">
					<button
						onclick={() => showNumberPicker = !showNumberPicker}
						class="flex items-center gap-1.5 rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-surface-2)] px-2 h-8 text-xs text-white hover:border-white transition-colors max-w-[180px]">
						{#if selectedNumHealth}
							<span class="text-[10px] {selectedNumHealth.cls}">{selectedNumHealth.icon}</span>
						{/if}
						<span class="truncate">{phoneNumbers.find(n => n.phone_number === selectedCallerId)?.friendly_name || selectedCallerId || 'Select number'}</span>
						<span class="text-[#444] ml-auto">▾</span>
					</button>
					{#if showNumberPicker}
						<div class="absolute top-full mt-1 left-0 w-72 rounded-xl border border-[var(--c-border-subtle)] bg-[#0d0d0d] shadow-2xl z-50 overflow-hidden" transition:slide={{ duration: 120 }}>
							<div class="px-3 pt-2.5 pb-2 border-b border-[#111]">
								<input
									bind:value={numberSearch}
									placeholder="Search numbers…"
									class="w-full bg-[#141414] border border-[#1e1e1e] rounded-lg px-3 py-1.5 text-xs text-white placeholder-[#333] focus:border-white focus:outline-none" />
							</div>
							<div class="max-h-48 overflow-y-auto">
								{#each phoneNumbers.filter(n =>
									!numberSearch ||
									n.phone_number.includes(numberSearch) ||
									(n.friendly_name ?? '').toLowerCase().includes(numberSearch.toLowerCase())
								) as num}
									{@const rep = numReputation(num)}
									<button
										onclick={() => { selectedCallerId = num.phone_number; showNumberPicker = false; numberSearch = ''; }}
										class="w-full flex items-center gap-3 px-3 py-2 hover:bg-[#141414] transition-colors text-left border-b border-[#080808] last:border-0
											{selectedCallerId === num.phone_number ? 'bg-[#141414]' : ''}">
										<span class="text-[10px] {rep.cls} shrink-0" title={rep.tip}>{rep.icon}</span>
										<div class="flex-1 min-w-0">
											<p class="text-xs text-white truncate">{num.friendly_name || num.phone_number}</p>
											{#if num.friendly_name}
												<p class="text-[9px] text-[#444] font-mono">{num.phone_number}</p>
											{/if}
										</div>
										<span class="text-[9px] text-[#333] shrink-0">{num.calls_today}/{num.daily_limit}</span>
									</button>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		{:else if phoneNumbers.length > 1 && !tierFeatures.multipleNumbers}
			<span class="text-xs text-yellow-600 border border-yellow-900/40 rounded-lg px-2 h-8 flex items-center gap-1" title="Upgrade to Pro for multiple numbers">
				🔒 {phoneNumbers[0]?.friendly_name || phoneNumbers[0]?.phone_number}
			</span>
		{/if}
		<!-- Power dialer toggle + delay selector -->
		<button onclick={togglePowerDialer}
			class="flex items-center gap-1.5 rounded-lg h-8 px-3 text-xs transition-colors {powerDialer ? 'bg-[var(--call)]/12 border border-[var(--call)]/40 text-[var(--call)]' : 'border border-[var(--c-border-subtle)] text-[var(--c-text-faint)] hover:text-white'}">
			<span>{powerDialer ? '⚡ ON' : '⚡ Power'}</span>
		</button>
		{#if powerDialer}
			<select bind:value={powerDialDelay}
				class="rounded-lg border border-[var(--call)]/40 bg-[var(--call)]/12 px-2 h-8 text-xs text-[var(--call)] focus:outline-none"
				title="Seconds between calls">
				{#each [3,5,10,15] as s}
					<option value={s}>{s}s</option>
				{/each}
			</select>
		{/if}
		<!-- Queue remaining -->
		{#if queueRemaining !== null && selectedListId}
			<span class="text-[10px] text-[#444] shrink-0" title="Contacts remaining in queue">
				{queueRemaining} left
			</span>
		{/if}
		<div class="flex items-center gap-1.5 shrink-0">
			<div class="w-2 h-2 rounded-full {twilioReady ? 'bg-[var(--call)]' : twilioError ? 'bg-[var(--end)]' : 'bg-yellow-500 animate-pulse'}"></div>
			<span class="text-xs text-[var(--c-text-faint)]">{twilioReady ? 'Ready' : twilioError ? 'Error' : 'Connecting...'}</span>
		</div>
		<!-- Keyboard shortcut hint — shown once per session -->
		{#if showShortcutHint}
			<button
				onclick={() => { showShortcutHint = false; sessionStorage.setItem('rogueos_hint_seen','1'); }}
				class="shrink-0 flex items-center gap-1 rounded-lg border border-[#1e1e1e] px-2 h-7 text-[10px] text-[#444] hover:text-white hover:border-[#333] transition-colors animate-pulse"
				title="Press ? to see all keyboard shortcuts">
				⌨ Press <kbd class="font-mono mx-0.5 text-[#555]">?</kbd> for shortcuts
			</button>
		{/if}
	</div>

	{#if twilioError}
		<div class="px-8 py-2 bg-[var(--end)]/12 border-b border-[var(--end)]/40 flex items-start justify-between gap-4">
			<div class="flex-1 min-w-0">
				<p class="text-xs text-[var(--end-text)]">⚠ {twilioError}</p>
				<p class="text-xs text-[var(--end-text)] mt-0.5">
					Need help? See the
					<a href="https://www.twilio.com/docs/voice/sdks/javascript/troubleshooting" target="_blank" rel="noopener noreferrer" class="underline hover:text-[var(--end-text)] transition-colors">Twilio Voice SDK troubleshooting guide</a>.
				</p>
			</div>
			<button onclick={initTwilio} class="shrink-0 text-xs text-[var(--end-text)] underline hover:text-[var(--end-text)] transition-colors">Retry</button>
		</div>
	{/if}

	<!-- Body -->
	<div class="flex-1 flex overflow-hidden">
		<!-- Left widget sidebar -->
		<DialerSidebar side="left" campaignId={selectedCampaign?.id ?? ''} />

		<!-- Center content -->
		<div class="flex-1 flex items-start justify-center p-8 overflow-y-auto">
			<div class="w-full max-w-lg">

			{#if callPhase === 'idle'}
				{#if countdown > 0}
					<div class="text-center py-20">
						<p class="text-xs text-[var(--c-text-faint)] uppercase tracking-widest mb-4">Next call in</p>
						<p class="text-7xl font-semibold text-white tabular-nums" style="font-family:var(--font-mono)">{countdown}</p>
						<p class="text-xs text-[var(--c-text-ghost)] mt-2">Auto-dialing in {countdown}s · power mode {powerDialDelay}s delay</p>
						<button onclick={cancelCountdown} class="mt-4 text-xs text-[var(--c-text-ghost)] hover:text-white underline">Cancel</button>
					</div>
				{:else if contact}
					<ContactCard {contact} onDial={handleDial} onSkip={skipContact} />

					<!-- Pre-call brief -->
					{#if callBrief || loadingBrief}
						<div class="mx-0 mt-3 rounded-xl bg-[#111] border border-[#1e2a1e] p-4">
							<div class="flex items-center gap-2 mb-2">
								<span class="text-[var(--call)] text-xs">✦</span>
								<p class="text-[10px] text-[var(--call)] uppercase tracking-widest font-semibold">Pre-Call Brief</p>
								{#if loadingBrief}<span class="text-[10px] text-[#333] ml-1">Generating...</span>{/if}
							</div>
							{#if !loadingBrief}
								<p class="text-xs text-[#ccc] leading-relaxed">{callBrief}</p>
								{#if briefTasks.length > 0}
									<div class="mt-2 pt-2 border-t border-[#1a1a1a]">
										{#each briefTasks as task}
											<p class="text-[10px] text-yellow-400">⚑ {task.title}</p>
										{/each}
									</div>
								{/if}
							{:else}
								<div class="h-3 w-3/4 bg-[#1a1a1a] rounded animate-pulse"></div>
							{/if}
						</div>
					{/if}
				{:else}
					<div class="text-center py-16">
						<p class="text-[var(--c-text-faint)] text-4xl mb-4">📞</p>
						{#if selectedListId}
							<p class="text-white text-sm font-medium mb-2">Queue empty</p>
							<p class="text-[var(--c-text-ghost)] text-xs mb-6">All contacts in this list have been called</p>
						{:else}
							<p class="text-white text-sm font-medium mb-2">No campaign selected</p>
							<p class="text-[var(--c-text-ghost)] text-xs mb-6">Select a campaign above to start dialing, or import contacts first</p>
						{/if}
						<div class="flex gap-3 justify-center">
							<a href="/campaigns" class="rounded-lg border border-[var(--c-border-subtle)] px-4 py-2 text-xs text-[#666] hover:text-white hover:border-white transition-colors">
								View Campaigns
							</a>
							<a href="/contacts" class="rounded-lg border border-[var(--c-border-subtle)] px-4 py-2 text-xs text-[#666] hover:text-white hover:border-white transition-colors">
								Import Contacts
							</a>
						</div>
					</div>
				{/if}

			{:else if callPhase === 'ringing'}
				<div class="text-center py-20">
					<div class="flex justify-center mb-6">
						<DialButtonRenderer callState="calling" onclick={() => {}} size={104} />
					</div>
					<p class="text-white font-medium mb-1">{calledContact?.name ?? 'Unknown'}</p>
					{#if calledContact?.company}<p class="text-xs text-[var(--c-text-faint)] mb-6">{calledContact.company}</p>{/if}
					<p class="text-xs text-[var(--c-text-ghost)] uppercase tracking-widest mb-8">Ringing…</p>
					<button onclick={handleEndCall} aria-label="End call"
						class="rounded-full bg-[var(--end)] hover:bg-[var(--end-hi)] text-white w-14 h-14 flex items-center justify-center mx-auto transition-colors">
						<Icon name="phoneOff" size={22} />
					</button>
				</div>

			{:else if callPhase === 'calling'}
				<div class="space-y-4">
					<!-- Contact info header -->

				<!-- Contact info header -->
				<div class="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4 flex items-center gap-4">
					<div class="w-10 h-10 rounded-full bg-[var(--c-surface-2)] flex items-center justify-center text-sm font-semibold text-[var(--c-text-dim)] shrink-0">
						{(calledContact?.name ?? '?')[0].toUpperCase()}
					</div>
					<div class="flex-1 min-w-0">
						<p class="text-sm text-white font-medium truncate">{calledContact?.name ?? '—'}</p>
						{#if calledContact?.company}<p class="text-xs text-[var(--c-text-faint)] truncate">{calledContact.company}</p>{/if}
					</div>
					<div class="text-right shrink-0">
						<p class="text-sm font-semibold text-[var(--call)] tabular-nums" style="font-family:var(--font-mono)">{formatDuration(callDuration)}</p>
						<p class="text-[10px] text-[var(--c-text-ghost)]">Live call</p>
					</div>
				</div>

				<!-- Call controls -->
				<div class="grid grid-cols-4 gap-2">
					<button onclick={toggleMute}
						class="rounded-xl border {muted ? 'border-[var(--end)]/40 bg-[var(--end)]/12 text-[var(--end-text)]' : 'border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text-dim)] hover:text-white'} p-3 flex flex-col items-center gap-1 transition-colors">
						<Icon name={muted ? 'micOff' : 'mic'} size={18} />
						<span class="text-[9px]">{muted ? 'Unmute' : 'Mute'}</span>
					</button>
					<button onclick={() => showNotePanel = !showNotePanel}
						class="rounded-xl border {showNotePanel ? 'border-blue-800 bg-blue-950/20 text-blue-400' : 'border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text-dim)] hover:text-white'} p-3 flex flex-col items-center gap-1 transition-colors">
						<Icon name="fileText" size={18} />
						<span class="text-[9px]">Notes</span>
					</button>
					<button onclick={() => showDialerAppointment = true}
						class="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text-dim)] hover:text-white p-3 flex flex-col items-center gap-1 transition-colors">
						<Icon name="calendar" size={18} />
						<span class="text-[9px]">Book</span>
					</button>
					{#if tierFeatures.voicemailDrops && vmDrops.length > 0}
						<div class="relative vm-menu-container">
							<button onclick={() => showVmMenu = !showVmMenu} disabled={vmDropped}
								class="w-full rounded-xl border {vmDropped ? 'border-[var(--call)]/40 bg-[var(--call)]/12 text-[var(--call)]' : 'border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text-dim)] hover:text-white'} p-3 flex flex-col items-center gap-1 transition-colors disabled:opacity-60">
								<Icon name={vmDropped ? 'check' : 'voicemail'} size={18} />
								<span class="text-[9px]">{vmDropped ? 'Dropped' : 'VM Drop'}</span>
							</button>
							{#if showVmMenu}
								<div class="absolute bottom-full mb-2 right-0 w-52 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] shadow-2xl z-20 overflow-hidden" transition:slide={{ duration: 120 }}>
									{#each vmDrops as vm}
										<button onclick={() => dropVoicemail(vm.id)}
											class="w-full text-left px-4 py-3 text-xs text-[var(--c-text)] hover:bg-[var(--c-surface-2)] transition-colors border-b border-[var(--c-border-subtle)] last:border-0">
											{vm.name ?? 'VM Drop'}
										</button>
									{/each}
								</div>
							{/if}
						</div>
					{:else}
						<button onclick={handleEndCall}
							class="rounded-xl border border-[var(--end)]/40 bg-[var(--end)]/12 text-[var(--end-text)] hover:bg-[var(--end-hi)] p-3 flex flex-col items-center gap-1 transition-colors">
							<Icon name="phoneOff" size={18} />
							<span class="text-[9px]">End</span>
						</button>
					{/if}
				</div>

				{#if showNotePanel}
					<div transition:slide={{ duration: 150 }}>
						<textarea bind:value={callNotes} rows="3" placeholder="Type notes while on the call…"
							class="w-full rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-3 text-xs text-white placeholder-[var(--c-text-ghost)] focus:border-white focus:outline-none resize-none"></textarea>
					</div>
				{/if}

				{#if tierFeatures.voicemailDrops && vmDrops.length > 0}
					<button onclick={handleEndCall}
						class="w-full rounded-xl border border-[var(--end)]/40 bg-[var(--end)]/12 text-[var(--end-text)] hover:bg-[var(--end-hi)] hover:text-white py-3 text-xs font-medium transition-colors flex items-center justify-center gap-2">
						<Icon name="phoneOff" size={15} /> End Call
					</button>
				{/if}
			</div>

		{:else if callPhase === 'processing'}
			<div class="text-center py-16">
				<div class="w-12 h-12 rounded-full border-2 border-[var(--c-border)] border-t-white animate-spin mx-auto mb-6"></div>
				<p class="text-sm text-white font-medium mb-1">Processing call…</p>
				<p class="text-xs text-[var(--c-text-ghost)] mb-6">Generating transcript & summary ({processingSeconds}s)</p>
				<button onclick={skipProcessing} class="text-xs text-[var(--c-text-ghost)] hover:text-white underline">
					Skip — log outcome manually
				</button>
			</div>

		{:else if callPhase === 'postmortem'}
			<CallPostMortem
				contact={calledContact}
				callId={currentCallId}
				transcript={transcript}
				summary={summary}
				notes={callNotes}
				onSave={handleSave}
			/>
		{/if}

			</div>
		</div>

		<!-- Right widget sidebar -->
		<DialerSidebar side="right" campaignId={selectedCampaign?.id ?? ''} />
	</div>
</div>

{#if showDialerAppointment && calledContact}
	<AppointmentModal
		contact={calledContact}
		callId={currentCallId}
		campaignId={selectedCampaign?.id ?? null}
		onClose={() => showDialerAppointment = false}
		onSaved={() => showDialerAppointment = false}
	/>
{/if}

<!-- Win celebration — full-screen cinematic moment -->
{#if showCelebration}
	<WinCelebration
		contactName={celebrateContact}
		outcome={celebrateOutcome}
		onDone={afterCelebration}
	/>
{/if}

<!-- Undo skip toast -->
{#if showUndoToast && lastSkippedContact}
	<div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] px-4 py-3 shadow-2xl" transition:slide={{ axis: 'y', duration: 200 }}>
		<span class="text-xs text-[#888]">Skipped <span class="text-white font-medium">{lastSkippedContact.name}</span></span>
		<button onclick={undoSkip}
			class="rounded-lg border border-white/20 bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20 transition-colors font-medium">
			Undo
		</button>
		<button onclick={() => { showUndoToast = false; }} class="text-[#444] hover:text-white text-xs transition-colors"><Icon name="x" size={14} /></button>
	</div>
{/if}
