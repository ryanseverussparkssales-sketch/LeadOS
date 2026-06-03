<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';

	type Tab = 'numbers' | 'voicemail' | 'missed';
	let tab = $state<Tab>('numbers');

	interface PhoneNumber { id:string; phone_number:string; friendly_name:string|null; status:string; is_primary:boolean; twilio_phone_sid:string|null; record_incoming:boolean; voicemail_greeting:string|null; client:{name:string}|null; campaign:{name:string}|null; }
	interface Voicemail { id:string; caller_id:string; duration_seconds:number; transcript:string|null; recording_url:string|null; status:string; received_at:string; phone_number:{phone_number:string}|null; }
	interface MissedCall { id:string; caller_id:string; returned:boolean; received_at:string; notes:string|null; phone_number:{phone_number:string}|null; }
	interface SearchResult { phoneNumber:string; friendlyName:string; locality:string; region:string; type:string; monthlyFee:number; }

	let numbers = $state<PhoneNumber[]>([]);
	let voicemails = $state<Voicemail[]>([]);
	let missedCalls = $state<MissedCall[]>([]);
	let clients = $state<{id:string;name:string}[]>([]);
	let campaigns = $state<{id:string;name:string}[]>([]);
	let loading = $state(true);

	// Add number form (manual)
	let showAdd = $state(false);
	let newPhone = $state(''); let newFriendly = $state(''); let newClient = $state('');
	let newCampaign = $state(''); let newGreeting = $state('Please leave a message after the tone.');
	let newPrimary = $state(false); let newSid = $state('');
	let saving = $state(false);
	let addError = $state('');
	let editingGreetingId = $state<string|null>(null);
	let editingGreetingText = $state('');

	// Buy Numbers panel
	type NumberType = 'local' | 'tollfree';
	let showBuy = $state(false);
	let searchType = $state<NumberType>('local');
	let searchAreaCode = $state('');
	let searchContains = $state('');
	let searchResults = $state<SearchResult[]>([]);
	let searching = $state(false);
	let searchError = $state('');

	// Purchase modal
	let purchaseTarget = $state<SearchResult | null>(null);
	let purchaseClientId = $state('');
	let purchaseCampaignId = $state('');
	let purchaseFriendly = $state('');
	let purchasePrimary = $state(false);
	let purchasing = $state(false);
	let purchaseMsg = $state('');
	let purchaseError = $state('');

	// Release state
	let releasingId = $state<string|null>(null);

	// Per-number settings (forwarding, voicemail, SMS)
	let expandedNumId = $state<string | null>(null);
	let editingNum = $state<{
		voicemail_greeting?: string;
		forwardingNumber?: string;
		forwardingEnabled?: boolean;
		smsEnabled?: boolean;
		voicemailEnabled?: boolean;
		ringTimeout?: number;
	}>({});
	let savingNumSettings = $state(false);

	function openNumSettings(num: PhoneNumber) {
		expandedNumId = num.id;
		editingNum = {
			voicemail_greeting: num.voicemail_greeting ?? '',
			forwardingNumber: (num as any).forwarding_number ?? '',
			forwardingEnabled: (num as any).forwarding_enabled ?? false,
			smsEnabled: (num as any).sms_enabled ?? true,
			voicemailEnabled: (num as any).voicemail_enabled ?? true,
			ringTimeout: (num as any).ring_timeout_seconds ?? 20,
		};
	}

	async function saveNumSettings(numId: string) {
		savingNumSettings = true;
		const res = await apiFetch(`/api/phone/numbers/${numId}`, {
			method: 'PUT',
			body: JSON.stringify({
				voicemail_greeting: editingNum.voicemail_greeting,
				forwarding_number: editingNum.forwardingNumber,
				forwarding_enabled: editingNum.forwardingEnabled,
				sms_enabled: editingNum.smsEnabled,
				voicemail_enabled: editingNum.voicemailEnabled,
				ring_timeout_seconds: editingNum.ringTimeout,
			}),
		});
		if (res.ok) {
			const updated = await res.json();
			numbers = numbers.map(n => n.id === numId ? { ...n, ...updated } : n);
			expandedNumId = null;
		}
		savingNumSettings = false;
	}

	// Voicemail
	let selectedVoicemail = $state<Voicemail | null>(null);

	// Webhook copy feedback
	let copiedId = $state<string|null>(null);

	const appOrigin = typeof window !== 'undefined' ? window.location.origin : (import.meta.env.PUBLIC_APP_URL ?? 'https://lead-os-livid.vercel.app');

	async function saveGreeting(numId: string) {
		const res = await apiFetch(`/api/phone/numbers/${numId}`, { method:'PUT', body: JSON.stringify({ voicemail_greeting: editingGreetingText }) });
		if (res.ok) { numbers = numbers.map(n => n.id === numId ? { ...n, voicemail_greeting: editingGreetingText } : n); editingGreetingId = null; }
	}

	// A2P registration status
	interface A2PStatus {
		configured: boolean;
		overallStatus: 'registered' | 'pending' | 'unregistered';
		brands: Array<{ sid: string; brandName: string; status: string; failureReason: string | null; }>;
		campaigns: Array<{ sid: string; name: string; usecase: string; }>;
		numbers: Array<{ phoneNumber: string; sid: string; callerIdName: string | null; smsCapable: boolean; }>;
		registrationUrl: string;
		error?: string;
	}

	let a2pStatus = $state<A2PStatus | null>(null);
	let loadingA2P = $state(false);

	// CNAM editing
	let editingCnamSid = $state<string | null>(null);
	let cnamInput = $state('');
	let savingCnam = $state(false);
	let cnamMsg = $state('');

	async function loadA2PStatus() {
		loadingA2P = true;
		const r = await apiFetch('/api/phone/a2p-status');
		if (r.ok) a2pStatus = await r.json();
		loadingA2P = false;
	}

	async function saveCnam(phoneSid: string) {
		if (!cnamInput.trim()) return;
		savingCnam = true; cnamMsg = '';
		const r = await apiFetch('/api/phone/a2p-status', {
			method: 'POST',
			body: JSON.stringify({ phoneSid, callerIdName: cnamInput }),
		});
		if (r.ok) {
			const d = await r.json();
			cnamMsg = `Saved "${d.callerIdName}" — propagates to carriers in 2-4 weeks`;
			if (a2pStatus) {
				a2pStatus = { ...a2pStatus, numbers: a2pStatus.numbers.map(n => n.sid === phoneSid ? { ...n, callerIdName: d.callerIdName } : n) };
			}
			editingCnamSid = null;
		} else {
			const e = await r.json().catch(() => ({}));
			cnamMsg = `Error: ${(e as any).message ?? 'Failed to update'}`;
		}
		savingCnam = false;
	}

	onMount(async () => {
		const seedRes = await apiFetch('/api/phone/setup', { method: 'POST' });
		if (seedRes.ok) { const s = await seedRes.json(); if (s.created) console.log('[setup] Seeded primary number:', s.number?.phone_number); }

		const [nr, vr, mr, cr, camr] = await Promise.all([
			apiFetch('/api/phone/numbers'), apiFetch('/api/phone/voicemails'),
			apiFetch('/api/phone/missed-calls'), apiFetch('/api/clients'), apiFetch('/api/campaigns')
		]);
		numbers   = nr.ok ? await nr.json() : [];
		voicemails = vr.ok ? await vr.json() : [];
		missedCalls = mr.ok ? await mr.json() : [];
		clients   = cr.ok ? await cr.json() : [];
		campaigns = camr.ok ? await camr.json() : [];
		loading = false;

		loadA2PStatus();
	});

	async function addNumber() {
		if (!newPhone) return;
		saving = true; addError = '';
		const res = await apiFetch('/api/phone/numbers', { method: 'POST', body: JSON.stringify({
			phoneNumber: newPhone, friendlyName: newFriendly || undefined,
			clientId: newClient || undefined, campaignId: newCampaign || undefined,
			twilioPhoneSid: newSid || undefined, voicemailGreeting: newGreeting, isPrimary: newPrimary,
		})});
		if (res.ok) {
			numbers = [await res.json(), ...numbers];
			showAdd = false; newPhone = ''; addError = '';
		} else {
			try { const d = await res.json(); addError = d.message ?? d.error ?? `Error ${res.status}`; }
			catch { addError = `Server error ${res.status} — check Supabase for constraint issues`; }
		}
		saving = false;
	}

	async function toggleStatus(num: PhoneNumber) {
		const newStatus = num.status === 'active' ? 'paused' : 'active';
		const res = await apiFetch(`/api/phone/numbers/${num.id}`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) });
		if (res.ok) numbers = numbers.map(n => n.id === num.id ? { ...n, status: newStatus } : n);
	}

	async function deleteNumber(id: string) {
		if (!confirm('Remove this number from LeadOS? (It will not be released from Twilio — use Release for that.)')) return;
		await apiFetch(`/api/phone/numbers/${id}`, { method: 'DELETE' });
		numbers = numbers.filter(n => n.id !== id);
	}

	async function releaseNumber(num: PhoneNumber) {
		if (!num.twilio_phone_sid) {
			if (!confirm(`Remove ${num.phone_number} from LeadOS? (No Twilio SID on record — will only remove from LeadOS.)`)) return;
			await apiFetch(`/api/phone/numbers/${num.id}`, { method: 'DELETE' });
			numbers = numbers.filter(n => n.id !== num.id);
			return;
		}
		if (!confirm(`Release ${num.phone_number} back to Twilio? This cancels the number and stops billing. This cannot be undone.`)) return;
		releasingId = num.id;
		const r = await apiFetch(`/api/phone/provision?sid=${encodeURIComponent(num.twilio_phone_sid)}&id=${num.id}`, { method: 'DELETE' });
		if (r.ok) {
			numbers = numbers.filter(n => n.id !== num.id);
		} else {
			const d = await r.json().catch(() => ({}));
			alert('Release failed: ' + ((d as any).message ?? (d as any).error ?? 'Unknown error'));
		}
		releasingId = null;
	}

	async function copyWebhook(num: PhoneNumber) {
		const url = `${appOrigin}/api/phone/incoming`;
		await navigator.clipboard.writeText(url).catch(() => {});
		copiedId = num.id;
		setTimeout(() => { if (copiedId === num.id) copiedId = null; }, 2000);
	}

	async function searchNumbers() {
		if (searching) return;
		searching = true; searchError = ''; searchResults = [];

		const params = new URLSearchParams({ type: searchType, limit: '20' });
		if (searchAreaCode.trim()) params.set('areaCode', searchAreaCode.trim());
		if (searchContains.trim()) params.set('contains', searchContains.trim());

		const r = await apiFetch(`/api/phone/provision?${params}`);
		if (r.ok) {
			const d = await r.json();
			searchResults = d.numbers;
			if (d.numbers.length === 0) searchError = 'No numbers found. Try a different area code or remove filters.';
		} else {
			searchError = 'Search failed. Check that Twilio credentials are configured.';
		}
		searching = false;
	}

	function openPurchaseModal(num: SearchResult) {
		purchaseTarget = num;
		purchaseFriendly = '';
		purchaseClientId = '';
		purchaseCampaignId = '';
		purchasePrimary = false;
		purchaseMsg = '';
		purchaseError = '';
	}

	async function purchaseNumber() {
		if (!purchaseTarget || purchasing) return;
		purchasing = true; purchaseError = ''; purchaseMsg = '';

		const r = await apiFetch('/api/phone/provision', {
			method: 'POST',
			body: JSON.stringify({
				phoneNumber: purchaseTarget.phoneNumber,
				friendlyName: purchaseFriendly || purchaseTarget.friendlyName,
				clientId: purchaseClientId || undefined,
				campaignId: purchaseCampaignId || undefined,
				isPrimary: purchasePrimary,
			}),
		});

		const d = await r.json();
		if ((r.ok || r.status === 201) && d.registered && d.number) {
			// Full success
			numbers = [d.number, ...numbers];
			purchaseMsg = `✓ ${d.number.phone_number} added successfully`;
			searchResults = searchResults.filter(n => n.phoneNumber !== d.number.phone_number);
			setTimeout(() => { purchaseTarget = null; }, 3500);
		} else if (r.status === 207 && d.purchased) {
			// Twilio purchase OK but DB save failed — auto-retry via /api/phone/numbers
			purchaseMsg = 'Purchased from Twilio — saving to LeadOS...';
			const retryRes = await apiFetch('/api/phone/numbers', {
				method: 'POST',
				body: JSON.stringify({
					phoneNumber: d.phoneNumber,
					twilioPhoneSid: d.twilioSid,
					isPrimary: purchasePrimary,
					clientId: purchaseClientId || undefined,
					campaignId: purchaseCampaignId || undefined,
				}),
			});
			if (retryRes.ok) {
				const saved = await retryRes.json();
				numbers = [saved, ...numbers];
				purchaseMsg = `✓ ${d.phoneNumber} added successfully`;
				searchResults = searchResults.filter(n => n.phoneNumber !== d.phoneNumber);
				setTimeout(() => { purchaseTarget = null; }, 3500);
			} else {
				purchaseMsg = '';
				purchaseError = `Purchased in Twilio (SID: ${d.twilioSid ?? 'unknown'}) but couldn't save. Use "Add Existing" with ${d.phoneNumber} to link it manually.`;
			}
		} else {
			purchaseError = d.message ?? d.error ?? 'Purchase failed';
		}
		purchasing = false;
	}

	async function markVoicemailRead(vm: Voicemail) {
		const res = await apiFetch(`/api/phone/voicemails/${vm.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'read' }) });
		if (res.ok) voicemails = voicemails.map(v => v.id === vm.id ? { ...v, status: 'read' } : v);
		selectedVoicemail = vm;
	}

	async function markReturned(mc: MissedCall) {
		const res = await apiFetch(`/api/phone/missed-calls/${mc.id}`, { method: 'PATCH', body: JSON.stringify({ returned: true }) });
		if (res.ok) missedCalls = missedCalls.map(m => m.id === mc.id ? { ...m, returned: true } : m);
	}

	function fmtTime(iso: string) { return new Date(iso).toLocaleString(); }
	function fmtDur(s: number) { return `${Math.floor(s/60)}m ${s%60}s`; }

	const unreadVoicemails = $derived(voicemails.filter(v => v.status === 'unread').length);
	const unreturned = $derived(missedCalls.filter(m => !m.returned).length);

	// ─── GREETING RECORDER ───────────────────────────────────────────────────────
	let recording = $state(false);
	let recordedBlob = $state<Blob | null>(null);
	let recordingDuration = $state(0);
	let mediaRecorder: MediaRecorder | null = null;
	let recordingTimer: ReturnType<typeof setInterval> | null = null;
	let recordingChunks: Blob[] = [];
	let audioPreviewUrl = $state<string | null>(null);
	let uploadingGreeting = $state(false);

	function toastSuccess(msg: string) { window.dispatchEvent(new CustomEvent('leados:toast', { detail: { type: 'success', message: msg } })); }
	function toastError(msg: string) { window.dispatchEvent(new CustomEvent('leados:toast', { detail: { type: 'error', message: msg } })); }

	async function startRecording() {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			recordingChunks = [];
			recordingDuration = 0;
			mediaRecorder = new MediaRecorder(stream);

			mediaRecorder.ondataavailable = (e) => {
				if (e.data.size > 0) recordingChunks.push(e.data);
			};

			mediaRecorder.onstop = () => {
				const blob = new Blob(recordingChunks, { type: 'audio/webm' });
				recordedBlob = blob;
				audioPreviewUrl = URL.createObjectURL(blob);
				stream.getTracks().forEach(t => t.stop());
			};

			mediaRecorder.start(100);
			recording = true;
			recordingTimer = setInterval(() => recordingDuration++, 1000);
		} catch (e: any) {
			toastError('Microphone access denied — check browser permissions');
		}
	}

	function stopRecording() {
		if (mediaRecorder && mediaRecorder.state !== 'inactive') {
			mediaRecorder.stop();
		}
		recording = false;
		if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
	}

	async function uploadGreeting(phoneNumberId: string) {
		if (!recordedBlob) return;
		uploadingGreeting = true;

		try {
			const { supabase: sb } = await import('$lib/services/auth');
			const filename = `voicemail-greeting-${phoneNumberId}-${Date.now()}.webm`;

			const { error } = await sb.storage
				.from('assets')
				.upload(`voicemail-greetings/${filename}`, recordedBlob, {
					contentType: 'audio/webm',
					upsert: true,
				});

			if (error) throw error;

			const { data: { publicUrl } } = sb.storage
				.from('assets')
				.getPublicUrl(`voicemail-greetings/${filename}`);

			await apiFetch(`/api/phone/numbers/${phoneNumberId}`, {
				method: 'PUT',
				body: JSON.stringify({ voicemail_greeting_url: publicUrl }),
			});

			toastSuccess('Greeting uploaded and saved');
			recordedBlob = null;
			audioPreviewUrl = null;
		} catch (e: any) {
			toastError('Upload failed: ' + (e.message ?? 'Unknown error'));
		}
		uploadingGreeting = false;
	}
</script>

<svelte:head><title>Phone Manager — LeadOS</title></svelte:head>

<div class="flex flex-col flex-1 h-full">
	<div class="border-b border-[#1e1e1e] px-8 py-4">
		<h2 class="text-white text-sm font-medium mb-3">Phone Manager</h2>
		<div class="flex gap-1">
			{#each ([['numbers','Numbers'],['voicemail',`Voicemail${unreadVoicemails > 0 ? ` (${unreadVoicemails})` : ''}`],['missed',`Missed${unreturned > 0 ? ` (${unreturned})` : ''}`]] as [Tab,string][]) as [t,label]}
				<button onclick={() => { tab = t; showBuy = false; showAdd = false; }}
					class="rounded-lg px-4 py-1.5 text-xs transition-colors {tab === t ? 'bg-white/10 text-white' : 'text-[#666] hover:text-white'}">
					{label}
				</button>
			{/each}
		</div>
	</div>

	{#if tab === 'numbers'}
		<div class="flex flex-col flex-1 overflow-hidden">

			<!-- Toolbar -->
			<div class="border-b border-[#1e1e1e] px-8 py-3 flex justify-between items-center">
				<p class="text-xs text-[#555]">{numbers.length} number{numbers.length !== 1 ? 's' : ''}</p>
				<div class="flex gap-2">
					<button onclick={() => { showBuy = !showBuy; showAdd = false; }}
						class="rounded-lg px-3 py-1 text-xs transition-colors {showBuy ? 'bg-white text-black' : 'border border-[#2a2a2a] text-[#999] hover:border-white hover:text-white'}">
						{showBuy ? '✕ Close' : '+ Buy Number'}
					</button>
					<button onclick={() => { showAdd = !showAdd; showBuy = false; }}
						class="rounded-lg border border-[#2a2a2a] px-3 py-1 text-xs text-[#999] hover:border-white hover:text-white transition-colors">
						{showAdd ? 'Cancel' : 'Add Existing'}
					</button>
				</div>
			</div>

			<!-- A2P Registration Status -->
			<div class="border-b border-[#1e1e1e] px-6 py-4">
				{#if loadingA2P}
					<div class="flex items-center gap-2 text-xs text-[#555]">
						<div class="w-3 h-3 rounded-full border border-[#333] border-t-white animate-spin"></div>
						Checking A2P registration status...
					</div>
				{:else if a2pStatus}
					<!-- Overall status banner -->
					<div class="flex items-center justify-between mb-3">
						<div class="flex items-center gap-2">
							<div class="w-2 h-2 rounded-full {a2pStatus.overallStatus === 'registered' ? 'bg-green-500' : a2pStatus.overallStatus === 'pending' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}"></div>
							<span class="text-xs font-medium {a2pStatus.overallStatus === 'registered' ? 'text-green-400' : a2pStatus.overallStatus === 'pending' ? 'text-yellow-400' : 'text-red-400'}">
								{a2pStatus.overallStatus === 'registered' ? 'A2P 10DLC Registered' : a2pStatus.overallStatus === 'pending' ? 'A2P Registration Pending' : 'A2P Registration Required'}
							</span>
						</div>
						<div class="flex items-center gap-2">
							<button onclick={loadA2PStatus} class="text-xs text-[#444] hover:text-white border border-[#1e1e1e] px-2 py-1 rounded transition-colors">Refresh</button>
							<a href={a2pStatus.registrationUrl} target="_blank" rel="noopener"
								class="text-xs text-blue-400 hover:text-blue-300 border border-blue-800/40 px-2 py-1 rounded transition-colors">
								Twilio Console
							</a>
						</div>
					</div>

					{#if a2pStatus.error}
						<p class="text-xs text-red-400 mb-2">{a2pStatus.error}</p>
					{/if}

					{#if a2pStatus.overallStatus === 'unregistered'}
						<!-- Registration checklist -->
						<div class="rounded-lg border border-red-900/30 bg-red-950/10 p-3 text-xs space-y-2">
							<p class="text-red-400 font-medium">SMS messages may be filtered without A2P 10DLC registration</p>
							<div class="space-y-1 text-[#777]">
								<p>Step 1: Register your brand at Twilio Console → Messaging → A2P Registration</p>
								<p>Step 2: Create a campaign (use case: "Mixed — outbound sales + follow-ups")</p>
								<p>Step 3: Assign your SMS-enabled numbers to the campaign</p>
								<p class="text-[#555] mt-2">For toll-free numbers: use separate Toll-Free Verification in the same Console</p>
							</div>
						</div>
					{:else if a2pStatus.brands.length > 0}
						<!-- Brand + campaign status grid -->
						<div class="grid grid-cols-2 gap-3 text-xs">
							<div class="rounded-lg border border-[#1e1e1e] p-2.5">
								<p class="text-[#444] uppercase tracking-widest text-xs mb-1.5">Brand</p>
								{#each a2pStatus.brands as brand}
									<p class="text-[#888] mb-0.5">{brand.brandName}</p>
									<span class="text-xs px-1.5 py-0.5 rounded {brand.status === 'APPROVED' ? 'bg-green-900/30 text-green-400' : brand.status === 'FAILED' ? 'bg-red-900/30 text-red-400' : 'bg-yellow-900/30 text-yellow-400'}">
										{brand.status}
									</span>
									{#if brand.failureReason}<p class="text-red-400 mt-1">{brand.failureReason}</p>{/if}
								{/each}
							</div>
							<div class="rounded-lg border border-[#1e1e1e] p-2.5">
								<p class="text-[#444] uppercase tracking-widest text-xs mb-1.5">Campaigns</p>
								{#if a2pStatus.campaigns.length === 0}
									<p class="text-red-400">No campaigns — create one in Twilio Console</p>
								{:else}
									{#each a2pStatus.campaigns as camp}
										<p class="text-[#888] mb-0.5">{camp.name}</p>
										<span class="text-xs text-green-400">Active</span>
									{/each}
								{/if}
							</div>
						</div>
					{/if}

					<!-- CNAM per number -->
					{#if a2pStatus.numbers.length > 0}
						<div class="mt-3 pt-3 border-t border-[#1a1a1a]">
							<p class="text-xs text-[#444] uppercase tracking-widest mb-2">Caller ID Names (CNAM)</p>
							<div class="space-y-2">
								{#each a2pStatus.numbers as num}
									<div class="flex items-center justify-between">
										<div class="flex items-center gap-2">
											<span class="text-xs font-mono text-[#888]">{num.phoneNumber}</span>
											{#if num.callerIdName}
												<span class="text-xs bg-[#1a1a1a] border border-[#2a2a2a] px-2 py-0.5 rounded text-[#aaa]">{num.callerIdName}</span>
											{:else}
												<span class="text-xs text-[#333]">No name set</span>
											{/if}
										</div>
										<div class="flex items-center gap-2">
											{#if editingCnamSid === num.sid}
												<input bind:value={cnamInput} maxlength="15" placeholder="SPARKS AGENCY"
													class="rounded border border-[#2a2a2a] bg-[#111] px-2 py-1 text-xs text-white font-mono uppercase w-36 focus:border-white focus:outline-none"
													onkeydown={(e) => { if (e.key === 'Enter') saveCnam(num.sid); if (e.key === 'Escape') editingCnamSid = null; }} />
												<button onclick={() => saveCnam(num.sid)} disabled={savingCnam}
													class="text-xs text-white bg-[#1a1a1a] border border-[#2a2a2a] px-2 py-1 rounded hover:border-white transition-colors disabled:opacity-40">
													{savingCnam ? '...' : 'Set'}
												</button>
												<button onclick={() => editingCnamSid = null} class="text-xs text-[#444] hover:text-white">x</button>
											{:else}
												<button onclick={() => { editingCnamSid = num.sid; cnamInput = num.callerIdName ?? ''; cnamMsg = ''; }}
													class="text-xs text-[#444] hover:text-white border border-[#1e1e1e] px-2 py-1 rounded hover:border-[#333] transition-colors">
													{num.callerIdName ? 'Edit' : 'Set Name'}
												</button>
											{/if}
										</div>
									</div>
								{/each}
								{#if cnamMsg}<p class="text-xs {cnamMsg.startsWith('Saved') ? 'text-green-400' : 'text-red-400'} mt-1">{cnamMsg}</p>{/if}
								<p class="text-xs text-[#333] mt-1">Max 15 chars · All caps · Propagates to carriers in 2-4 weeks</p>
							</div>
						</div>
					{/if}
				{/if}
			</div>

			<!-- Buy Numbers Panel -->
			{#if showBuy}
				<div class="border-b border-[#1e1e1e] bg-[#0a0a0a] p-6">
					<p class="text-xs text-[#555] mb-4">Search Twilio's number inventory. Numbers are provisioned instantly and auto-configured with LeadOS webhooks.</p>

					<!-- Type toggle -->
					<div class="flex gap-2 mb-4">
						<button onclick={() => { searchType = 'local'; searchResults = []; searchError = ''; }}
							class="rounded-lg px-4 py-1.5 text-xs transition-colors {searchType === 'local' ? 'bg-white/10 text-white border border-white/20' : 'border border-[#2a2a2a] text-[#666] hover:text-white'}">
							Local
						</button>
						<button onclick={() => { searchType = 'tollfree'; searchAreaCode = ''; searchResults = []; searchError = ''; }}
							class="rounded-lg px-4 py-1.5 text-xs transition-colors {searchType === 'tollfree' ? 'bg-white/10 text-white border border-white/20' : 'border border-[#2a2a2a] text-[#666] hover:text-white'}">
							Toll-Free (1-800)
						</button>
					</div>

					<!-- Search inputs -->
					<div class="flex gap-2">
						{#if searchType === 'local'}
							<input bind:value={searchAreaCode} placeholder="Area code (e.g. 612)" maxlength="3"
								class="w-36 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none font-mono" />
						{/if}
						<input bind:value={searchContains} placeholder={searchType === 'tollfree' ? 'Vanity digits (e.g. 800)' : 'Contains digits (optional)'}
							onkeydown={(e) => { if (e.key === 'Enter') searchNumbers(); }}
							class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
						<button onclick={searchNumbers} disabled={searching}
							class="rounded-lg bg-white px-5 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40 transition-colors">
							{searching ? 'Searching...' : 'Search'}
						</button>
					</div>

					{#if searchError}
						<p class="text-xs text-red-400 mt-3">{searchError}</p>
					{/if}

					<!-- Results -->
					{#if searchResults.length > 0}
						<div class="mt-4 space-y-2">
							<p class="text-xs text-[#444]">{searchResults.length} numbers available · ${searchResults[0].monthlyFee.toFixed(2)}/mo each</p>
							{#each searchResults as num}
								<div class="rounded-xl border border-[#2a2a2a] bg-[#111] px-4 py-3 flex items-center justify-between gap-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
									<div class="min-w-0">
										<p class="text-sm text-white font-mono font-medium">{num.friendlyName}</p>
										<p class="text-xs text-[#555]">{num.locality ? num.locality + ', ' : ''}{num.region} · {num.type}</p>
									</div>
									<button onclick={() => openPurchaseModal(num)}
										class="shrink-0 rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-white hover:border-white hover:bg-white/5 transition-colors">
										Select
									</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Add Existing Number Form -->
			{#if showAdd}
				<div class="border-b border-[#1e1e1e] bg-[#0a0a0a] p-6">
					<p class="text-xs text-[#555] mb-4">Manually register a Twilio number you already own.</p>
					<div class="grid grid-cols-2 gap-3 mb-3">
						<div>
							<label class="text-xs text-[#555] block mb-1">Phone Number *</label>
							<input bind:value={newPhone} placeholder="+16125550000"
								class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none font-mono" />
						</div>
						<div>
							<label class="text-xs text-[#555] block mb-1">Friendly Name</label>
							<input bind:value={newFriendly} placeholder="Sales Line"
								class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
						</div>
						<div>
							<label class="text-xs text-[#555] block mb-1">Twilio Phone SID</label>
							<input bind:value={newSid} placeholder="PNxxxxxxxx"
								class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none font-mono" />
						</div>
						<div>
							<label class="text-xs text-[#555] block mb-1">Client</label>
							<select bind:value={newClient} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
								<option value="">None</option>
								{#each clients as c}<option value={c.id}>{c.name}</option>{/each}
							</select>
						</div>
						<div>
							<label class="text-xs text-[#555] block mb-1">Campaign</label>
							<select bind:value={newCampaign} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
								<option value="">None</option>
								{#each campaigns as c}<option value={c.id}>{c.name}</option>{/each}
							</select>
						</div>
						<div class="flex items-end gap-3">
							<label class="flex items-center gap-2 text-xs text-[#888] cursor-pointer">
								<input type="checkbox" bind:checked={newPrimary} class="accent-white" />
								Set as primary
							</label>
						</div>
					</div>
					<div class="mb-3">
						<label class="text-xs text-[#555] block mb-1">Voicemail Greeting</label>
						<textarea bind:value={newGreeting} rows="2"
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none"></textarea>
					</div>
					{#if addError}
						<p class="text-xs text-red-400 rounded-lg bg-red-950/20 border border-red-900/30 px-3 py-2">{addError}</p>
					{/if}
					<button onclick={addNumber} disabled={saving || !newPhone}
						class="rounded-lg bg-white px-5 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40 transition-colors">
						{saving ? 'Adding...' : 'Add Number'}
					</button>
				</div>
			{/if}

			<!-- Number List -->
			<div class="flex-1 overflow-y-auto">
				{#if loading}
					<div class="flex items-center justify-center h-40">
						<div class="w-5 h-5 rounded-full border border-[#333] border-t-white animate-spin"></div>
					</div>
				{:else if numbers.length === 0}
					<div class="flex flex-col items-center justify-center h-40 text-center px-8">
						<p class="text-[#555] text-sm mb-2">No numbers yet</p>
						<p class="text-xs text-[#333]">Buy a new number or add an existing Twilio number above</p>
					</div>
				{:else}
					<div class="divide-y divide-[#111]">
						{#each numbers as num}
							<div class="px-6 py-4">
								<div class="flex items-start justify-between gap-4">
									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-2 mb-1">
											<span class="text-sm font-mono text-white">{num.phone_number}</span>
											{#if num.is_primary}
												<span class="text-xs bg-white/10 text-white px-1.5 py-0.5 rounded">Primary</span>
											{/if}
											<span class="text-xs px-1.5 py-0.5 rounded {num.status === 'active' ? 'text-green-400 bg-green-900/20' : 'text-yellow-400 bg-yellow-900/20'}">
												{num.status}
											</span>
										</div>
										{#if num.friendly_name}
											<p class="text-xs text-[#666] mb-1">{num.friendly_name}</p>
										{/if}
										<div class="flex items-center gap-3 text-xs text-[#444]">
											{#if num.client}<span>Client: {num.client.name}</span>{/if}
											{#if num.campaign}<span>Campaign: {num.campaign.name}</span>{/if}
										</div>
									</div>
									<div class="flex items-center gap-2 shrink-0">
										<button onclick={() => toggleStatus(num)}
											class="text-xs border border-[#2a2a2a] px-2 py-1 rounded text-[#666] hover:text-white hover:border-[#444] transition-colors">
											{num.status === 'active' ? 'Pause' : 'Resume'}
										</button>
										<button onclick={() => { expandedNumId === num.id ? (expandedNumId = null) : openNumSettings(num); }}
											class="text-xs border border-[#2a2a2a] px-2 py-1 rounded text-[#666] hover:text-white hover:border-[#444] transition-colors">
											Settings
										</button>
										<button onclick={() => copyWebhook(num)}
											class="text-xs border border-[#2a2a2a] px-2 py-1 rounded text-[#666] hover:text-white hover:border-[#444] transition-colors">
											{copiedId === num.id ? 'Copied!' : 'Webhook'}
										</button>
										<button onclick={() => releaseNumber(num)} disabled={releasingId === num.id}
											class="text-xs border border-red-900/40 px-2 py-1 rounded text-red-600 hover:text-red-400 hover:border-red-700 transition-colors disabled:opacity-40">
											{releasingId === num.id ? '...' : 'Release'}
										</button>
									</div>
								</div>

								<!-- Expanded settings -->
								{#if expandedNumId === num.id}
									<div class="mt-4 pt-4 border-t border-[#1a1a1a] space-y-3">
										<div class="grid grid-cols-2 gap-3">
											<label class="flex items-center gap-2 text-xs text-[#888] cursor-pointer">
												<input type="checkbox" bind:checked={editingNum.forwardingEnabled} class="accent-white" />
												Forward calls
											</label>
											<label class="flex items-center gap-2 text-xs text-[#888] cursor-pointer">
												<input type="checkbox" bind:checked={editingNum.smsEnabled} class="accent-white" />
												SMS enabled
											</label>
											<label class="flex items-center gap-2 text-xs text-[#888] cursor-pointer">
												<input type="checkbox" bind:checked={editingNum.voicemailEnabled} class="accent-white" />
												Voicemail enabled
											</label>
										</div>
										{#if editingNum.forwardingEnabled}
											<div>
												<label class="text-xs text-[#555] block mb-1">Forwarding Number</label>
												<input bind:value={editingNum.forwardingNumber} placeholder="+16125550000"
													class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none font-mono" />
											</div>
										{/if}
										<div>
											<label class="text-xs text-[#555] block mb-1">Ring Timeout (seconds)</label>
											<input type="number" bind:value={editingNum.ringTimeout} min="10" max="60"
												class="w-24 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" />
										</div>
										<!-- Voicemail greeting section -->
									<div class="space-y-3">
										<p class="text-xs text-[#555] uppercase tracking-widest">Voicemail Greeting</p>

										<!-- Recording controls -->
										<div class="rounded-xl border border-[var(--c-border-subtle,#2a2a2a)] bg-[var(--c-surface-2,#111)] p-3">
											<div class="flex items-center justify-between mb-2">
												<p class="text-xs text-[#888]">Record your own greeting</p>
												{#if recording}
													<span class="text-xs text-red-400 font-mono flex items-center gap-1.5">
														<span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
														{Math.floor(recordingDuration/60)}:{String(recordingDuration%60).padStart(2,'0')}
													</span>
												{/if}
											</div>

											<div class="flex gap-2">
												{#if !recording}
													<button onclick={startRecording}
														class="flex items-center gap-2 rounded-lg border border-[var(--c-border-subtle,#2a2a2a)] px-3 py-2 text-xs text-[#666] hover:text-white hover:border-white transition-colors">
														🎙️ Record
													</button>
												{:else}
													<button onclick={stopRecording}
														class="flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs text-white hover:bg-red-500 transition-colors">
														⏹ Stop
													</button>
												{/if}
											</div>

											<!-- Preview + upload -->
											{#if audioPreviewUrl}
												<div class="mt-3 space-y-2">
													<audio controls src={audioPreviewUrl} class="w-full" style="height:36px"></audio>
													<div class="flex gap-2">
														<button onclick={() => uploadGreeting(num.id)}
															disabled={uploadingGreeting}
															class="flex-1 rounded-lg bg-white py-1.5 text-xs font-semibold text-black disabled:opacity-40">
															{uploadingGreeting ? 'Uploading...' : '↑ Use as Greeting'}
														</button>
														<button onclick={() => { recordedBlob = null; audioPreviewUrl = null; }}
															class="rounded-lg border border-[var(--c-border-subtle,#2a2a2a)] px-3 py-1.5 text-xs text-[#555]">
															Discard
														</button>
													</div>
												</div>
											{/if}
										</div>

										<!-- OR: TTS text -->
										<p class="text-[10px] text-[#333] text-center">— or use text-to-speech —</p>
										<textarea bind:value={editingNum.voicemail_greeting} rows="2"
											class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none"
											placeholder="Type your voicemail greeting..."></textarea>
									</div>
										<div class="flex gap-2">
											<button onclick={() => saveNumSettings(num.id)} disabled={savingNumSettings}
												class="rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40 transition-colors">
												{savingNumSettings ? 'Saving...' : 'Save'}
											</button>
											<button onclick={() => expandedNumId = expandedNumId === num.id ? null : num.id}
								class="text-xs text-[#666] hover:text-white transition-colors px-2">
								{expandedNumId === num.id ? 'Collapse' : 'Settings'}
							</button>
						</div>
					</div>
				{/if}
						</div>
		{/each}
		</div>
	{/if}
</div>
	</div>
{/if}
</div>
