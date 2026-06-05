<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { page } from '$app/stores';
	import { apiFetch } from '$lib/api';
	import { toastSuccess, toastError, toastInfo } from '$lib/stores/toast';
	import { currentUser } from '$lib/stores';
	import { supabase } from '$lib/services/auth';
	import { twilioDevice, twilioReady as twReadyStore, twilioError as twErrorStore, initTwilioDevice } from '$lib/stores/twilio';
	import DialerWidgetPanel from '$lib/components/DialerWidgetPanel.svelte';
	import DialButtonRenderer from '$lib/components/DialButtonRenderer.svelte';
	import Icon from '$lib/components/Icon.svelte';

	let number = $state('');
	let callState = $state<'idle' | 'calling' | 'connected'>('idle');
	let callDuration = $state(0);
	// Use the ONE global Twilio device (registered for incoming). Creating a second
	// device here knocked the global one offline → inbound calls went to voicemail.
	const device = $derived($twilioDevice);
	const twilioReady = $derived($twReadyStore);
	let twilioError = $state('');
	$effect(() => { if ($twErrorStore) twilioError = $twErrorStore; });
	let muted = $state(false);
	let onHold = $state(false);
	let aiCalling = $state(false);

	// AI practice calls (rep rehearses against an AI buyer persona). Price-gated.
	let practiceEnabled = $state(false);     // tier feature flag from /api/portal/tier
	let practiceStarting = $state(false);
	let practicePersona = $state('default');
	const PERSONAS = [
		{ id: 'default', label: 'Typical prospect (mild skeptic)' },
		{ id: 'skeptical_cfo', label: 'Skeptical CFO (price/ROI focus)' },
		{ id: 'busy_owner', label: 'Busy owner (almost hangs up)' },
		{ id: 'friendly_noncommittal', label: 'Friendly but non-committal' },
		{ id: 'gatekeeper', label: 'Gatekeeper (screens the call)' },
	];

	let phoneNumbers = $state<{id:string; phone_number:string; friendly_name:string; client_id:string|null; is_primary:boolean; status:string}[]>([]);
	let selectedFromNumber = $state('');
	let durationInterval: ReturnType<typeof setInterval> | null = null;
	let activeCall: any = null;

	type RightTab = 'calls' | 'tasks' | 'sms' | 'voicemails';
	let rightTab = $state<RightTab>('calls');

	interface Call { id: string; created_at: string; outcome: string | null; summary: string | null; call_duration_seconds: number | null; phone_number: string | null; contact: { id: string; name: string; company: string; phone: string } | null; }
	let recentCalls = $state<Call[]>([]);
	let callsLoading = $state(true);

	interface Task { id: string; title: string; priority: string; status: string; due_date: string | null; task_type: string; contact: { name: string; company: string; phone: string } | null; }
	interface Project { id: string; name: string; }
	let tasks = $state<Task[]>([]);
	let projects = $state<Project[]>([]);
	let taskPriority = $state('');
	let taskDue = $state('all');
	let tasksLoading = $state(false);

	const filteredTasks = $derived((() => {
		let t = tasks;
		if (taskPriority) t = t.filter(x => x.priority === taskPriority);
		if (taskDue === 'overdue') t = t.filter(x => x.due_date && new Date(x.due_date) < new Date());
		else if (taskDue === 'today') { const tod = new Date().toISOString().slice(0,10); t = t.filter(x => x.due_date?.slice(0,10) === tod); }
		else if (taskDue === 'week') { const end = new Date(Date.now()+7*86400000).toISOString(); t = t.filter(x => x.due_date && x.due_date <= end); }
		return t;
	})());

	// ─── SMS THREAD STATE ────────────────────────────────────────────────────────
	interface SmsThread {
		id: string;
		remote_number: string;
		local_number: string;
		contact_id: string | null;
		last_message_body: string | null;
		last_message_at: string | null;
		last_message_direction: 'inbound' | 'outbound' | null;
		unread_count: number;
		is_opted_out: boolean;
		contacts?: { name: string; company?: string; contact_score?: number } | null;
	}
	interface SmsMessage {
		id: string;
		body: string;
		direction: 'inbound' | 'outbound';
		status: string;
		sent_at: string;
		intent_label?: string | null;
		sms_thread_id?: string;
		from_number?: string;
	}

	let threads = $state<SmsThread[]>([]);
	let selectedThread = $state<SmsThread | null>(null);
	let threadMessages = $state<SmsMessage[]>([]);
	let loadingThreads = $state(false);
	let loadingMessages = $state(false);
	let threadSearch = $state('');
	let replyBody = $state('');
	let sending = $state(false);
	let messagesEl = $state<HTMLElement | null>(null);
	let showNewThread = $state(false);
	let newThreadTo = $state('');
	let newThreadBody = $state('');
	let newThreadContacts = $state<any[]>([]);
	let newThreadSelectedContact = $state<any>(null);
	let sendingNew = $state(false);
	let aiDraft = $state('');
	let loadingDraft = $state(false);
	let totalUnread = $state(0);
	let realtimeChannel: any = null;

	const filteredThreads = $derived(
		threadSearch.trim()
			? threads.filter(t =>
				t.contacts?.name?.toLowerCase().includes(threadSearch.toLowerCase()) ||
				t.remote_number?.includes(threadSearch) ||
				t.contacts?.company?.toLowerCase().includes(threadSearch.toLowerCase())
			  )
			: threads
	);

	// ─── VOICEMAIL STATE ─────────────────────────────────────────────────────────
	interface Voicemail { id: string; caller_id: string; caller_name: string|null; duration_seconds: number|null; recording_url: string|null; transcript: string|null; status: string; received_at: string; contact_id?: string|null; contact_name?: string|null; from_number?: string; created_at?: string; is_read?: boolean; }
	let voicemails = $state<Voicemail[]>([]);
	let vmLoading = $state(true);
	let loadingVm = $state(false);
	let selectedVm = $state<Voicemail | null>(null);

	const OUTCOME_COLORS: Record<string,string> = { answered:'text-[var(--call)]', voicemail:'text-yellow-400', callback:'text-blue-400', not_interested:'text-[#666]', do_not_call:'text-[var(--end-text)]', no_answer:'text-[#444]' };
	const PRIORITY_COLORS: Record<string,string> = { urgent:'text-[var(--end-text)] bg-[var(--end)]/12', high:'text-orange-400 bg-orange-400/10', medium:'text-yellow-400 bg-yellow-400/10', low:'text-[#666] bg-[#1a1a1a]' };

	function fmtDur(s: number|null) { if (!s) return '—'; return `${Math.floor(s/60)}m ${s%60}s`; }
	function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); }
	function fmtDue(d: string|null) {
		if (!d) return '—';
		const date = new Date(d); const today = new Date(); today.setHours(0,0,0,0);
		const diff = Math.floor((date.getTime()-today.getTime())/86400000);
		if (diff < 0) return `${Math.abs(diff)}d overdue`;
		if (diff === 0) return 'Today'; if (diff === 1) return 'Tomorrow';
		return date.toLocaleDateString('en-US',{month:'short',day:'numeric'});
	}
	function isOverdue(d: string|null) { return d ? new Date(d) < new Date() : false; }
	function formatDuration(s: number) { return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }

	function formatDialInput(val: string): string {
		// Remove everything except digits and +
		const digits = val.replace(/[^\d+]/g, '');
		// If it's 11 digits starting with 1, add +
		if (/^1\d{10}$/.test(digits)) return '+' + digits;
		// If it's 10 digits, add +1
		if (/^\d{10}$/.test(digits)) return '+1' + digits;
		return digits;
	}
	const dialPad = [['1','2','3'],['4','5','6'],['7','8','9'],['*','0','#']];
	const unreadVm = $derived(voicemails.filter(v => v.status === 'unread' || v.is_read === false).length);

	function timeAgo(iso: string): string {
		if (!iso) return '';
		const diff = Date.now() - new Date(iso).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h`;
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function intentColor(intent: string): string {
		const map: Record<string, string> = {
			interested: 'bg-[var(--call)]/12 text-[var(--call)]',
			positive_reply: 'bg-[var(--call)]/12 text-[var(--call)]',
			callback_request: 'bg-blue-950 text-blue-400',
			objection: 'bg-yellow-950 text-yellow-400',
			question: 'bg-yellow-950 text-yellow-400',
			opt_out: 'bg-[var(--end)]/12 text-[var(--end-text)]',
			referral: 'bg-[var(--accent)]/12 text-[var(--accent)]',
		};
		return map[intent] ?? 'bg-[#1a1a1a] text-[#555]';
	}

	// ─── TWILIO ───────────────────────────────────────────────────────────────────
	onMount(async () => {
		const urlN = $page.url.searchParams.get('number');
		if (urlN) number = urlN;
		// The global device is initialized once by the (app) layout — we only consume it here.
		await Promise.all([loadCalls(), loadTasks(), loadThreads(), loadVoicemails(), loadPhoneNumbers()]);
		const pRes = await apiFetch('/api/projects');
		if (pRes.ok) projects = await pRes.json();

		// Resolve whether AI practice calls are available to this account (price gate).
		try {
			const tRes = await apiFetch('/api/portal/tier');
			if (tRes.ok) practiceEnabled = !!(await tRes.json())?.features?.practiceCalls;
		} catch {}

		// Set up realtime with current user's ID
		const user = $currentUser;
		if (user?.id) setupRealtime(user.id);
	});

	onDestroy(() => {
		if (durationInterval) clearInterval(durationInterval);
		// Do NOT destroy the global device here — it's shared and must keep receiving calls.
		if (realtimeChannel) supabase.removeChannel(realtimeChannel);
	});

	// Retry button → re-init the shared global device.
	async function initTwilio() {
		twilioError = '';
		await initTwilioDevice().catch(() => {});
	}

	async function dial(n?: string) {
		const target = formatDialInput((n ?? number).trim());
		if (!device || !twilioReady || !target) return;
		if (n) number = n;
		twilioError = ''; callState = 'calling'; muted = false; onHold = false;
		try {
			const digits = target.replace(/\D/g, '');
			const e164 = target.startsWith('+') ? target
				: digits.length === 10 ? '+1' + digits
				: digits.length === 11 && digits.startsWith('1') ? '+' + digits
				: '+' + digits;
			// Create a call row first so status/recording/transcript correlate (was missing → desk calls recorded nothing).
			let callId: string | undefined;
			try {
				const startRes = await apiFetch('/api/calls/start', {
					method: 'POST',
					body: JSON.stringify({ phone_number: e164, call_type: 'manual' }),
				});
				if (startRes.ok) callId = (await startRes.json()).call_id;
			} catch { /* non-fatal — call still places, just untracked */ }
			const connectParams: Record<string, string> = { To: e164 };
			if (callId) connectParams.CallId = callId;
			if (selectedFromNumber) connectParams.CallerId = selectedFromNumber;
			activeCall = await device.connect({ params: connectParams });
			activeCall.on('accept', () => { callState='connected'; callDuration=0; durationInterval=setInterval(()=>callDuration++,1000); });
			activeCall.on('disconnect', () => { if(durationInterval){clearInterval(durationInterval);durationInterval=null;} callState='idle'; activeCall=null; muted=false; onHold=false; setTimeout(() => loadCalls(), 2000); });
			activeCall.on('error', (err:{message:string}) => { twilioError=err.message; callState='idle'; });
		} catch (err) { twilioError = err instanceof Error ? err.message : 'Call failed'; callState='idle'; }
	}

	// Hand the call to the server-side ConversationRelay AI agent (no browser device needed).
	async function aiCall() {
		const target = formatDialInput(number.trim());
		if (!target || aiCalling) return;
		aiCalling = true;
		try {
			const digits = target.replace(/\D/g, '');
			const e164 = target.startsWith('+') ? target
				: digits.length === 10 ? '+1' + digits
				: digits.length === 11 && digits.startsWith('1') ? '+' + digits
				: '+' + digits;
			const res = await apiFetch('/api/twilio/conversation-relay/start', {
				method: 'POST',
				body: JSON.stringify({ phone_number: e164, from: selectedFromNumber || undefined }),
			});
			if (res.ok) {
				toastSuccess('AI is placing the call — it will qualify and log the outcome');
				number = '';
				setTimeout(() => loadCalls(), 3000);
			} else {
				const e = await res.json().catch(() => ({}));
				toastError(e.message ?? 'AI call failed');
			}
		} catch {
			toastError('AI call failed');
		}
		aiCalling = false;
	}

	// Start an AI practice call. The relay rings THIS browser via the shared global device
	// (to: client:<identity>); the incoming leg surfaces in the standard call card — answer
	// it and pitch the AI buyer persona. On hang-up the relay logs coaching.
	async function startPractice() {
		if (practiceStarting) return;
		if (!device || !twilioReady) { toastError('Phone not ready yet — wait a moment and retry'); return; }
		practiceStarting = true;
		try {
			const res = await apiFetch('/api/twilio/practice/start', {
				method: 'POST',
				body: JSON.stringify({ persona: practicePersona, from: selectedFromNumber || undefined }),
			});
			if (res.ok) {
				toastSuccess('Your phone will ring — answer the card and start your pitch');
				setTimeout(() => loadCalls(), 3000);
			} else {
				const e = await res.json().catch(() => ({}));
				if (res.status === 402) toastError('AI practice calls require a Pro plan');
				else if (res.status === 503) toastError('AI practice calls are not enabled');
				else toastError(e.message ?? 'Could not start practice call');
			}
		} catch {
			toastError('Could not start practice call');
		}
		practiceStarting = false;
	}

	function hangUp() { if(activeCall){activeCall.disconnect();activeCall=null;} callState='idle'; if(durationInterval){clearInterval(durationInterval);durationInterval=null;} }
	function toggleMute() {
		if(!activeCall || callState !== 'connected') return;
		muted = !muted;
		try { activeCall.mute(muted || onHold); } catch(e) { console.error('mute error', e); }
	}
	function toggleHold() {
		if(!activeCall || callState !== 'connected') return;
		onHold = !onHold;
		try { activeCall.mute(onHold || muted); } catch(e) { console.error('hold error', e); }
	}
	function pressKey(k: string) { if(callState!=='idle'){if(activeCall)activeCall.sendDigits(k);return;} number+=k; }

	async function loadPhoneNumbers() {
		try {
			const r = await apiFetch('/api/phone/numbers');
			if (r.ok) {
				const d = await r.json();
				phoneNumbers = (d.numbers ?? d ?? []).filter((n: {status:string}) => n.status === 'active');
				if (phoneNumbers.length > 0 && !selectedFromNumber) {
					selectedFromNumber = phoneNumbers[0].phone_number;
				}
			}
		} catch {}
	}

	async function loadCalls() { callsLoading=true; const r=await apiFetch('/api/calls?limit=30'); recentCalls=r.ok?await r.json():[]; callsLoading=false; }
	async function loadTasks() { tasksLoading=true; const r=await apiFetch('/api/tasks?status=pending'); tasks=r.ok?await r.json():[]; tasksLoading=false; }
	async function completeTask(id: string) {
		const res = await apiFetch(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) });
		if (res.ok) tasks = tasks.filter(t => t.id !== id);
		else toastError('Failed to complete task');
	}
	async function loadVoicemails() { vmLoading=true; const r=await apiFetch('/api/phone/voicemails?limit=20'); voicemails=r.ok?await r.json():[]; vmLoading=false; }
	async function markRead(id: string) { await apiFetch(`/api/phone/voicemails/${id}`,{method:'PATCH',body:JSON.stringify({status:'read'})}); voicemails=voicemails.map(v=>v.id===id?{...v,status:'read'}:v); }

	async function markVmRead(id: string) {
		await apiFetch(`/api/phone/voicemails/${id}/read`, { method: 'POST' }).catch(() => {});
		voicemails = voicemails.map(v => v.id === id ? { ...v, is_read: true, status: 'read' } : v);
	}

	async function deleteVm(id: string) {
		await apiFetch(`/api/phone/voicemails/${id}`, { method: 'DELETE' }).catch(() => {});
		voicemails = voicemails.filter(v => v.id !== id);
		if (selectedVm?.id === id) selectedVm = null;
	}

	// FIX 5: Quick add contact from unknown call
	let addingContact = $state<string | null>(null);
	let quickContactName = $state('');
	let quickContactCompany = $state('');

	async function quickAddContact(phone: string) {
		if (!quickContactName.trim()) return;
		const res = await apiFetch('/api/contacts/create', {
			method: 'POST',
			body: JSON.stringify({ name: quickContactName.trim(), phone, company: quickContactCompany.trim() || undefined }),
		});
		if (res.ok) {
			addingContact = null;
			quickContactName = '';
			quickContactCompany = '';
			loadCalls();
		}
	}

	// ─── SMS THREAD FUNCTIONS ─────────────────────────────────────────────────────
	async function loadThreads() {
		loadingThreads = true;
		const r = await apiFetch('/api/sms/threads');
		if (r.ok) {
			const d = await r.json();
			threads = d.threads ?? d;
			totalUnread = d.totalUnread ?? 0;
		}
		loadingThreads = false;
	}

	async function selectThread(thread: SmsThread) {
		selectedThread = thread;
		loadingMessages = true;
		threadMessages = [];

		const r = await apiFetch(`/api/sms?thread_id=${thread.id}&limit=100`);
		if (r.ok) { const d = await r.json(); threadMessages = d; }
		loadingMessages = false;

		if (thread.unread_count > 0) {
			await apiFetch(`/api/sms/threads/${thread.id}/read`, { method: 'POST' });
			threads = threads.map(t => t.id === thread.id ? { ...t, unread_count: 0 } : t);
			totalUnread = Math.max(0, totalUnread - (thread.unread_count ?? 0));
		}

		await tick();
		if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
	}

	async function sendReply() {
		if (!selectedThread || !replyBody.trim()) return;
		sending = true;
		const body = replyBody;
		const res = await apiFetch('/api/sms/send', {
			method: 'POST',
			body: JSON.stringify({
				to: selectedThread.remote_number,
				body,
				from: selectedThread.local_number,
				contactId: selectedThread.contact_id ?? null,
			})
		});
		if (res.ok) {
			const msg = await res.json();
			threadMessages = [...threadMessages, { ...msg, direction: 'outbound' as const, sent_at: new Date().toISOString(), body }];
			threads = threads.map(t => t.id === selectedThread!.id
				? { ...t, last_message_body: body, last_message_direction: 'outbound', last_message_at: new Date().toISOString() }
				: t);
			replyBody = '';
			await tick();
			if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
		} else {
			toastError('Failed to send message');
		}
		sending = false;
	}

	async function loadAiDraft() {
		if (!selectedThread) return;
		loadingDraft = true;
		aiDraft = '';
		const r = await apiFetch('/api/sms/draft-reply', {
			method: 'POST',
			body: JSON.stringify({
				threadId: selectedThread.id,
				contactId: selectedThread.contact_id,
				lastMessages: threadMessages.slice(-5).map(m => ({ direction: m.direction, body: m.body })),
			})
		});
		if (r.ok) { const d = await r.json(); aiDraft = d.draft ?? ''; }
		loadingDraft = false;
	}

	async function createContactFromThread(thread: SmsThread) {
		const r = await apiFetch('/api/contacts/create', {
			method: 'POST',
			body: JSON.stringify({ phone: thread.remote_number, lead_source: 'inbound_sms' })
		});
		if (r.ok) {
			const c = await r.json();
			await apiFetch(`/api/sms/threads/${thread.id}`, {
				method: 'PATCH',
				body: JSON.stringify({ contact_id: c.id })
			});
			threads = threads.map(t => t.id === thread.id ? { ...t, contact_id: c.id, contacts: c } : t);
			selectedThread = { ...selectedThread!, contact_id: c.id, contacts: c };
			toastSuccess('Contact created');
		} else {
			toastError('Failed to create contact');
		}
	}

	// ─── NEW THREAD COMPOSE ──────────────────────────────────────────────────────
	async function searchNewThreadContact() {
		if (newThreadTo.trim().length < 2) { newThreadContacts = []; return; }
		const r = await apiFetch(`/api/contacts/filtered?search=${encodeURIComponent(newThreadTo)}&limit=8`);
		if (r.ok) { const d = await r.json(); newThreadContacts = d.data ?? []; }
	}

	function selectNewThreadContact(c: any) {
		newThreadSelectedContact = c;
		newThreadTo = `${c.name} (${c.phone})`;
		newThreadContacts = [];
	}

	async function sendNewThread() {
		const to = newThreadSelectedContact?.phone ?? newThreadTo;
		if (!to.trim() || !newThreadBody.trim()) return;
		sendingNew = true;
		const r = await apiFetch('/api/sms/send', {
			method: 'POST',
			body: JSON.stringify({ to, body: newThreadBody, contactId: newThreadSelectedContact?.id ?? null })
		});
		if (r.ok) {
			showNewThread = false;
			newThreadTo = ''; newThreadBody = ''; newThreadSelectedContact = null;
			await loadThreads();
		} else {
			toastError('Failed to send message');
		}
		sendingNew = false;
	}

	// ─── SUPABASE REALTIME ────────────────────────────────────────────────────────
	function setupRealtime(userId: string) {
		realtimeChannel = supabase
			.channel('sms-inbox')
			.on('postgres_changes', {
				event: 'INSERT',
				schema: 'public',
				table: 'sms_logs',
				filter: `user_id=eq.${userId}`,
			}, (payload: any) => {
				const msg = payload.new as SmsMessage & { sms_thread_id: string; user_id: string; from_number: string };
				if (msg.direction !== 'inbound') return;

				// Always refresh thread list for updated last_message / unread counts
				loadThreads();

				// If this thread is currently open, append message + scroll
				if (selectedThread && msg.sms_thread_id === selectedThread.id) {
					threadMessages = [...threadMessages, msg];
					tick().then(() => { if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight; });
					// Already visible — mark read immediately
					apiFetch(`/api/sms/threads/${selectedThread.id}/read`, { method: 'POST' });
				} else {
					// Notify for background thread
					const thread = threads.find(t => t.id === msg.sms_thread_id);
					const fromName = thread?.contacts?.name ?? msg.from_number ?? 'Unknown';
					toastInfo(`SMS from ${fromName}: ${(msg.body ?? '').slice(0, 60)}`);
				}
			})
			.subscribe();
	}
</script>

<svelte:head><title>Phone — Edelhaus</title></svelte:head>

<div class="flex flex-1 h-full overflow-hidden">

	<!-- LEFT: DIALPAD -->
	<div class="w-[268px] flex-shrink-0 border-r border-[#1e1e1e] flex flex-col bg-[#0a0a0a]">
		<!-- Status bar -->
		<div class="px-8 py-4 border-b border-[#1e1e1e] flex items-center justify-between">
			<span class="text-xs text-[#555] uppercase tracking-widest">Phone</span>
			<div class="flex items-center gap-1.5">
				<div class="w-2 h-2 rounded-full {twilioReady?'bg-[var(--call)]':twilioError?'bg-[var(--end)]':'bg-yellow-500 animate-pulse'}"></div>
				<span class="text-xs text-[#555]">{twilioReady?'Ready':twilioError?'Error':'Connecting…'}</span>
				{#if twilioError}<button onclick={initTwilio} class="text-xs text-[#555] underline hover:text-white ml-1">Retry</button>{/if}
			</div>
		</div>

		<div class="flex-1 flex flex-col items-center px-5 py-4 gap-3">
			<!-- Number display -->
			<div class="w-full rounded-xl border border-[#2a2a2a] bg-[#111] px-4 h-[52px] flex items-center hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				{#if callState === 'connected'}
					<span class="flex-1 text-center text-[var(--call)] text-xl font-mono leading-none">{formatDuration(callDuration)}</span>
					<span class="flex items-center gap-1.5 text-[#777]">
						{#if muted}<Icon name="micOff" size={14} />{/if}
						{#if onHold}<Icon name="pause" size={14} />{/if}
					</span>
				{:else if callState === 'calling'}
					<span class="flex-1 text-center text-yellow-400 text-sm font-mono animate-pulse leading-none">Calling {number}…</span>
				{:else}
					<input bind:value={number} placeholder="+1 555 000 0000"
						class="flex-1 bg-transparent text-white text-center text-xl outline-none placeholder-[#333] font-mono leading-none" style="line-height:1" />
					{#if number}
						<button onclick={() => number=number.slice(0,-1)} class="text-[#555] hover:text-white px-1 leading-none flex items-center" aria-label="Delete digit"><Icon name="backspace" size={18} /></button>
					{/if}
				{/if}
			</div>

			<!-- Dialpad grid -->
			<div class="grid grid-cols-3 gap-2 w-full">
				{#each dialPad as row}
					{#each row as key}
						<button onclick={() => pressKey(key)}
							class="rounded-xl border border-[#2a2a2a] bg-[#111] h-14 w-full text-white font-medium text-xl hover:bg-[#1a1a1a] hover:border-[#444] active:bg-white/10 transition-all flex items-center justify-center select-none hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors"
							style="line-height:1;font-variant-numeric:tabular-nums;">
							{key}
						</button>
					{/each}
				{/each}
			</div>

			<!-- From number selector — always visible -->
			{#if callState === 'idle'}
				<div class="px-2 mb-1 w-full">
					<label class="block text-[10px] text-[#444] uppercase tracking-widest mb-1">Calling from</label>
					{#if phoneNumbers.length > 0}
						<select bind:value={selectedFromNumber}
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#444]">
							{#each phoneNumbers as num}
								<option value={num.phone_number}>
									{num.friendly_name || num.phone_number}{num.is_primary ? ' ★' : ''}
								</option>
							{/each}
						</select>
					{:else}
						<a href="/numbers" class="flex items-center gap-1.5 text-xs text-yellow-600 hover:text-yellow-400 transition-colors"><Icon name="alert" size={13} /> No numbers — add one in Numbers</a>
					{/if}
				</div>
			{/if}

			<!-- Call actions -->
			{#if callState === 'idle'}
				<div class="flex justify-center py-1">
					{#if twilioReady && number.trim()}
						<DialButtonRenderer callState={callState} onclick={() => dial()} size={90} />
					{:else}
						<button onclick={() => dial()} disabled={!twilioReady||!number.trim()||callState!=='idle'}
							class="w-full rounded-xl bg-[var(--call)] py-3.5 text-[var(--call-ink)] font-semibold hover:bg-[var(--call-hi)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-lg flex items-center justify-center gap-2">
							<Icon name="phone" size={20} /> Call
						</button>
					{/if}
				</div>
				<button onclick={aiCall} disabled={!number.trim()||aiCalling}
					title="Let the AI agent place this call, qualify the prospect, and log the outcome"
					class="w-full rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/12 py-2.5 text-[var(--accent)] text-sm font-medium hover:bg-[var(--accent-hi)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
					<Icon name="sparkle" size={15} /> {aiCalling ? 'Starting AI call…' : 'AI Call (auto-qualify)'}
				</button>

				<!-- AI practice calls — price-gated; only shown when the tier enables it -->
				{#if practiceEnabled}
					<div class="rounded-xl border border-[var(--call)]/40 bg-[var(--call)]/12 p-3 space-y-2">
						<div class="flex items-center gap-2 text-xs text-[var(--call)] font-medium">
							<Icon name="target" size={14} /> Practice with AI
							<span class="text-[var(--call)]/60 font-normal">— rehearse your pitch, get coached</span>
						</div>
						<select bind:value={practicePersona}
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#444]">
							{#each PERSONAS as p}
								<option value={p.id}>{p.label}</option>
							{/each}
						</select>
						<button onclick={startPractice} disabled={practiceStarting||!twilioReady}
							title="The AI plays a prospect and rings your phone — answer it and pitch. You'll get coaching after you hang up."
							class="w-full rounded-lg bg-[var(--call)] py-2.5 text-[var(--call-ink)] text-sm font-semibold hover:bg-[var(--call-hi)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
							<Icon name="mic" size={15} /> {practiceStarting ? 'Calling your phone…' : 'Start practice call'}
						</button>
					</div>
				{/if}
			{:else}
				<div class="grid grid-cols-3 gap-2 w-full">
					<button onclick={toggleMute}
						class="rounded-xl border py-3 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 {muted?'border-[var(--end)]/40 text-[var(--end-text)] bg-[var(--end)]/12':'border-[#2a2a2a] text-[#777] hover:border-white hover:text-white'}">
						<Icon name={muted?'micOff':'mic'} size={14} /> {muted?'Unmute':'Mute'}
					</button>
					<button onclick={hangUp}
						class="rounded-xl bg-[var(--end)] py-3 text-white font-semibold hover:bg-[var(--end-hi)] transition-colors text-sm flex items-center justify-center gap-1.5">
						<Icon name={callState==='calling'?'x':'phoneOff'} size={15} /> {callState==='calling'?'Cancel':'End'}
					</button>
					<button onclick={toggleHold}
						class="rounded-xl border py-3 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 {onHold?'border-yellow-500 text-yellow-400 bg-yellow-500/10':'border-[#2a2a2a] text-[#777] hover:border-white hover:text-white'}">
						<Icon name={onHold?'play':'pause'} size={14} /> {onHold?'Resume':'Hold'}
					</button>
				</div>
				{#if callState==='connected'}
					<p class="text-xs text-[#444] text-center font-mono">{number}</p>
				{/if}
			{/if}

			{#if twilioError}
				<p class="text-xs text-[var(--end-text)] text-center">{twilioError}</p>
			{/if}
		</div>

		<!-- Quick SMS shortcut -->
		<div class="border-t border-[#1e1e1e] p-4">
			<button onclick={() => rightTab='sms'}
				class="w-full text-xs text-[#555] hover:text-white border border-[#222] hover:border-[#444] rounded-lg py-2 transition-colors flex items-center justify-center gap-2">
				<Icon name="message" size={14} /> SMS Inbox {#if totalUnread > 0}<span class="ml-1 bg-[var(--call)] text-[var(--call-ink)] rounded-full px-1.5 py-0.5 text-[9px] font-bold">{totalUnread > 9 ? '9+' : totalUnread}</span>{/if}
			</button>
		</div>
	</div>

	<!-- RIGHT: TABS -->
	<div class="flex-1 flex flex-col overflow-hidden">
		<!-- Tab bar -->
		<div class="border-b border-[#1e1e1e] px-4 flex shrink-0">
			{#each [['calls','Recent Calls'],['tasks',`Tasks (${filteredTasks.length})`],['sms', totalUnread > 0 ? `SMS ●${totalUnread}` : 'SMS'],['voicemails',`Voicemails${unreadVm?` ●${unreadVm}`:''}`]] as [tab, label]}
				<button onclick={() => rightTab=tab as RightTab}
					class="px-4 py-3 text-xs border-b-2 whitespace-nowrap transition-colors {rightTab===tab?'border-white text-white':'border-transparent text-[#555] hover:text-[#999]'}">
					{label}
				</button>
			{/each}
		</div>

		<div class="flex-1 overflow-hidden">

			<!-- RECENT CALLS -->
			{#if rightTab === 'calls'}
				<div class="p-4 space-y-2 overflow-y-auto h-full">
					{#if callsLoading}
						<div class="flex justify-center py-12"><div class="w-5 h-5 border-2 border-[#333] border-t-white rounded-full animate-spin"></div></div>
					{:else if recentCalls.length === 0}
						<div class="text-center py-12 text-[#555] text-sm">No calls yet</div>
					{:else}
						{#each recentCalls as call}
							<div class="bg-[#111] border border-[#2a2a2a] rounded-lg px-4 py-3 flex items-center gap-3 hover:bg-[#141414] transition-colors">
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2">
										<span class="text-sm font-medium text-white truncate">{call.contact?.name ?? call.phone_number ?? 'Unknown'}</span>
										{#if call.outcome}<span class="text-xs {OUTCOME_COLORS[call.outcome]??'text-[#555]'} capitalize shrink-0">{call.outcome.replace(/_/g,' ')}</span>{/if}
									</div>
									{#if call.contact?.company}<div class="text-xs text-[#555]">{call.contact.company}</div>{/if}
									<div class="text-xs text-[#444] mt-0.5 flex gap-3">
										<span>{fmtDate(call.created_at)}</span>
										{#if call.call_duration_seconds}<span>{fmtDur(call.call_duration_seconds)}</span>{/if}
									</div>
									{#if call.summary}<div class="text-xs text-[#555] mt-1 truncate italic">"{call.summary}"</div>{/if}
									{#if !call.contact && call.phone_number}
										{#if addingContact === call.phone_number}
											<div class="mt-1 flex gap-1.5">
												<input bind:value={quickContactName} placeholder="Name *" class="flex-1 rounded border border-[#2a2a2a] bg-[#111] px-2 py-1 text-xs text-white placeholder-[#333] focus:outline-none" />
												<input bind:value={quickContactCompany} placeholder="Company" class="flex-1 rounded border border-[#2a2a2a] bg-[#111] px-2 py-1 text-xs text-white placeholder-[#333] focus:outline-none" />
												<button onclick={() => quickAddContact(call.phone_number!)} class="text-xs bg-white text-black px-2 py-1 rounded font-medium">+</button>
												<button onclick={() => addingContact = null} aria-label="Cancel" class="text-[#444] hover:text-white px-1"><Icon name="x" size={13} /></button>
											</div>
										{:else}
											<button onclick={() => { addingContact = call.phone_number; quickContactName = ''; }}
												class="text-xs text-[#444] hover:text-[#777] transition-colors mt-0.5">+ Add contact</button>
										{/if}
									{/if}
								</div>
								<div class="flex gap-1.5 shrink-0">
									{#if call.contact?.phone || call.phone_number}
										<button onclick={() => dial(call.contact?.phone ?? call.phone_number ?? '')}
											class="w-8 h-8 rounded-full bg-[var(--call)]/12 hover:bg-[var(--call)]/25 text-[var(--call)] flex items-center justify-center transition-colors" title="Call back" aria-label="Call back"><Icon name="phone" size={15} /></button>
									{/if}
									{#if call.contact?.phone}
										<button onclick={() => { rightTab='sms'; }}
											class="w-8 h-8 rounded-full bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 flex items-center justify-center transition-colors" title="SMS" aria-label="SMS"><Icon name="message" size={15} /></button>
									{/if}
								</div>
							</div>
						{/each}
					{/if}
				</div>

			<!-- TASKS -->
			{:else if rightTab === 'tasks'}
				<div class="sticky top-0 bg-[#0a0a0a] border-b border-[#1e1e1e] px-8 py-4 flex flex-wrap gap-2 items-center">
					<select bind:value={taskPriority} class="text-xs bg-[#111] border border-[#2a2a2a] rounded px-2 py-1.5 text-white">
						<option value="">All Priorities</option>
						<option value="urgent">Urgent</option>
						<option value="high">High</option>
						<option value="medium">Medium</option>
						<option value="low">Low</option>
					</select>
					<select bind:value={taskDue} class="text-xs bg-[#111] border border-[#2a2a2a] rounded px-2 py-1.5 text-white">
						<option value="all">All Dates</option>
						<option value="overdue">Overdue</option>
						<option value="today">Today</option>
						<option value="week">This Week</option>
					</select>
					<span class="ml-auto text-xs text-[#555]">{filteredTasks.length} task{filteredTasks.length!==1?'s':''}</span>
				</div>
				<div class="p-4 space-y-2 overflow-y-auto h-full">
					{#if tasksLoading}
						<div class="flex justify-center py-12"><div class="w-5 h-5 border-2 border-[#333] border-t-white rounded-full animate-spin"></div></div>
					{:else if filteredTasks.length === 0}
						<div class="text-center py-12 text-[#555] text-sm">No tasks match the filters</div>
					{:else}
						{#each filteredTasks as task}
							<div class="bg-[#111] border border-[#2a2a2a] rounded-lg px-4 py-3 flex items-start gap-3 hover:bg-[#141414] transition-colors">
								<button onclick={() => completeTask(task.id)}
									class="w-5 h-5 rounded border border-[#444] flex-shrink-0 mt-0.5 hover:border-[var(--call)]/40 hover:bg-[var(--call)]/12 transition-colors flex items-center justify-center text-[#444] hover:text-[var(--call)] text-xs"
									title="Mark complete" aria-label="Mark complete"><Icon name="check" size={13} /></button>
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2 flex-wrap mb-0.5">
										<span class="text-sm text-white font-medium">{task.title}</span>
										<span class="text-[10px] px-1.5 py-0.5 rounded-full {PRIORITY_COLORS[task.priority]??'text-[#666]'} capitalize">{task.priority}</span>
									</div>
									{#if task.contact}<div class="text-xs text-[#666]">{task.contact.name}{task.contact.company?` · ${task.contact.company}`:''}</div>{/if}
									<div class="text-xs mt-0.5 flex gap-3">
										<span class="{isOverdue(task.due_date)?'text-[var(--end-text)] font-medium':'text-[#555]'}">{fmtDue(task.due_date)}</span>
										<span class="text-[#444] capitalize">{task.task_type.replace(/_/g,' ')}</span>
									</div>
								</div>
								<div class="flex gap-1.5 shrink-0">
									{#if task.contact?.phone}
										<button onclick={() => dial(task.contact?.phone??'')}
											class="w-7 h-7 rounded-full bg-[var(--call)]/12 hover:bg-[var(--call)]/25 text-[var(--call)] flex items-center justify-center transition-colors" title="Call" aria-label="Call"><Icon name="phone" size={14} /></button>
										<button onclick={() => { rightTab='sms'; }}
											class="w-7 h-7 rounded-full bg-blue-600/15 hover:bg-blue-600/30 text-blue-400 flex items-center justify-center transition-colors" title="SMS" aria-label="SMS"><Icon name="message" size={14} /></button>
									{/if}
								</div>
							</div>
						{/each}
					{/if}
				</div>

			<!-- SMS — THREADED INBOX -->
			{:else if rightTab === 'sms'}
				<div class="flex h-full overflow-hidden">

					<!-- LEFT: Thread list (280px) -->
					<div class="w-70 shrink-0 border-r border-[var(--c-border,#1e1e1e)] flex flex-col" style="width:280px">
						<!-- Search -->
						<div class="p-3 border-b border-[var(--c-border,#1e1e1e)]">
							<input bind:value={threadSearch} placeholder="Search conversations..."
								class="w-full rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
						</div>

						<!-- Thread list -->
						<div class="flex-1 overflow-y-auto">
							{#if loadingThreads}
								{#each {length: 5} as _}
									<div class="p-4 border-b border-[#1e1e1e]">
										<div class="h-3 w-28 bg-[#1a1a1a] rounded animate-pulse mb-2"></div>
										<div class="h-2.5 w-40 bg-[#1a1a1a] rounded animate-pulse"></div>
									</div>
								{/each}
							{:else if filteredThreads.length === 0}
								<div class="flex flex-col items-center justify-center h-40 text-center px-4">
									<p class="text-[#555] text-sm">No conversations yet</p>
									<p class="text-[#333] text-xs mt-1">Inbound messages will appear here</p>
								</div>
							{:else}
								{#each filteredThreads as thread}
									<button onclick={() => selectThread(thread)}
										class="w-full text-left px-4 py-3 border-b border-[#1e1e1e] transition-colors {selectedThread?.id === thread.id ? 'bg-white/10' : 'hover:bg-white/5'}">
										<div class="flex items-start justify-between gap-2">
											<div class="flex-1 min-w-0">
												<div class="flex items-center gap-2">
													<p class="text-sm font-semibold truncate {thread.unread_count > 0 ? 'text-white' : 'text-[#888]'}">
														{thread.contacts?.name ?? thread.remote_number}
													</p>
													{#if thread.is_opted_out}
														<span class="text-[9px] bg-[var(--end)]/12 text-[var(--end-text)] px-1.5 py-0.5 rounded flex-shrink-0">OPT-OUT</span>
													{/if}
												</div>
												{#if thread.contacts?.company}
													<p class="text-xs text-[#555] truncate">{thread.contacts.company}</p>
												{/if}
												<p class="text-xs text-[#444] truncate mt-0.5">
													{thread.last_message_direction === 'outbound' ? '→ ' : ''}{thread.last_message_body ?? ''}
												</p>
											</div>
											<div class="flex flex-col items-end gap-1 flex-shrink-0">
												<p class="text-[10px] text-[#444]">{timeAgo(thread.last_message_at ?? '')}</p>
												{#if thread.unread_count > 0}
													<span class="bg-white text-black text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
														{thread.unread_count > 9 ? '9+' : thread.unread_count}
													</span>
												{/if}
											</div>
										</div>
									</button>
								{/each}
							{/if}
						</div>

						<!-- New conversation button -->
						<div class="p-3 border-t border-[#1e1e1e]">
							<button onclick={() => showNewThread = true}
								class="w-full rounded-lg bg-white py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors">
								+ New Message
							</button>
						</div>
					</div>

					<!-- RIGHT: Thread view -->
					<div class="flex-1 flex flex-col overflow-hidden">
						{#if showNewThread}
							<div class="flex flex-col h-full">
								<!-- Header -->
								<div class="border-b border-[var(--c-border)] px-8 py-4 flex items-center justify-between flex-shrink-0">
									<p class="text-white font-semibold text-sm">New Message</p>
									<button onclick={() => showNewThread = false} aria-label="Close" class="text-[#555] hover:text-white"><Icon name="x" size={15} /></button>
								</div>

								<!-- Compose body -->
								<div class="p-4 space-y-3 flex-1 overflow-y-auto">
									<div>
										<label class="text-xs text-[#555] uppercase tracking-widest block mb-1.5">To</label>
										<input bind:value={newThreadTo} placeholder="Search contact or enter number..."
											oninput={searchNewThreadContact}
											class="w-full rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-surface-2)] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
										{#if newThreadContacts.length > 0}
											<div class="mt-1 bg-[#111] border border-[var(--c-border-subtle)] rounded-xl shadow-xl">
												{#each newThreadContacts as c}
													<button onclick={() => selectNewThreadContact(c)}
														class="w-full text-left px-4 py-2.5 hover:bg-white/5 border-b border-[var(--c-border)] last:border-0 transition-colors">
														<p class="text-sm text-white">{c.name}</p>
														<p class="text-xs text-[#555]">{c.phone}</p>
													</button>
												{/each}
											</div>
										{/if}
									</div>

									<div>
										<label class="text-xs text-[#555] uppercase tracking-widest block mb-1.5">Message</label>
										<textarea bind:value={newThreadBody} rows="4" placeholder="Write your message..."
											class="w-full rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-surface-2)] px-3 py-3 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none">
										</textarea>
									</div>

									<button onclick={sendNewThread} disabled={sendingNew || !newThreadTo.trim() || !newThreadBody.trim()}
										class="w-full rounded-xl bg-white py-2.5 text-sm font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40 transition-colors">
										{sendingNew ? 'Sending…' : 'Send Message'}
									</button>
								</div>
							</div>
						{:else if !selectedThread}
							<div class="flex flex-col items-center justify-center flex-1 text-center">
								<div class="text-[#333] mb-4"><Icon name="message" size={40} /></div>
								<p class="text-[#555] text-sm">Select a conversation</p>
							</div>
						{:else}
							<!-- Thread header -->
							<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center justify-between flex-shrink-0">
								<div class="min-w-0">
									<div class="flex items-center gap-2">
										<p class="text-white font-semibold text-sm truncate">{selectedThread.contacts?.name ?? selectedThread.remote_number}</p>
										{#if selectedThread.contacts?.contact_score}
											<span class="text-xs font-mono {selectedThread.contacts.contact_score >= 70 ? 'text-[var(--call)]' : 'text-[#555]'}">{selectedThread.contacts.contact_score}</span>
										{/if}
										{#if selectedThread.is_opted_out}
											<span class="text-[9px] bg-[var(--end)]/12 text-[var(--end-text)] px-1.5 py-0.5 rounded flex-shrink-0">OPT-OUT</span>
										{/if}
									</div>
									<p class="text-xs text-[#555] font-mono mt-0.5">{selectedThread.remote_number}</p>
								</div>
								<div class="flex items-center gap-1.5 flex-shrink-0">
									<button onclick={() => dial(selectedThread.remote_number)}
										class="w-8 h-8 rounded-full bg-[var(--call)]/12 hover:bg-[var(--call)]/25 text-[var(--call)] flex items-center justify-center transition-colors" title="Call" aria-label="Call"><Icon name="phone" size={15} /></button>
									{#if !selectedThread.contact_id}
										<button onclick={() => createContactFromThread(selectedThread!)}
											class="text-xs text-[#555] hover:text-white border border-[#2a2a2a] hover:border-[#444] rounded-lg px-2.5 py-1.5 transition-colors flex items-center gap-1"><Icon name="plus" size={12} /> Add contact</button>
									{/if}
								</div>
							</div>

							<!-- Messages -->
							<div bind:this={messagesEl} class="flex-1 overflow-y-auto px-5 py-4 space-y-3">
								{#if loadingMessages}
									<div class="flex justify-center py-12"><div class="w-5 h-5 border-2 border-[#333] border-t-white rounded-full animate-spin"></div></div>
								{:else if threadMessages.length === 0}
									<div class="text-center py-12 text-[#555] text-sm">No messages yet</div>
								{:else}
									{#each threadMessages as msg}
										<div class="flex {msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}">
											<div class="max-w-[78%] space-y-1">
												<div class="rounded-2xl px-4 py-2.5 text-sm leading-relaxed {msg.direction === 'outbound' ? 'bg-[var(--call)] text-[var(--call-ink)] rounded-br-sm' : 'bg-[#1a1a1a] text-white border border-[#2a2a2a] rounded-bl-sm'}">
													{msg.body}
												</div>
												<div class="flex items-center gap-2 px-1 {msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}">
													<span class="text-[10px] text-[#444]">{timeAgo(msg.sent_at)}</span>
													{#if msg.intent_label}
														<span class="text-[9px] px-1.5 py-0.5 rounded-full {intentColor(msg.intent_label)}">{msg.intent_label.replace(/_/g,' ')}</span>
													{/if}
													{#if msg.direction === 'outbound' && msg.status && msg.status !== 'sent' && msg.status !== 'delivered'}
														<span class="text-[9px] text-[var(--end-text)]">{msg.status}</span>
													{/if}
												</div>
											</div>
										</div>
									{/each}
								{/if}
							</div>

							<!-- Composer -->
							<div class="border-t border-[#1e1e1e] p-4 flex-shrink-0 space-y-2">
								{#if selectedThread.is_opted_out}
									<p class="text-xs text-[var(--end-text)] text-center py-2">This contact has opted out — replies are blocked.</p>
								{:else}
									{#if aiDraft}
										<div class="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-2.5 text-xs text-[#bbb] space-y-1.5">
											<p class="leading-relaxed">{aiDraft}</p>
											<div class="flex gap-2">
												<button onclick={() => { replyBody = aiDraft; aiDraft = ''; }} class="text-[var(--accent)] hover:underline font-medium">Use this</button>
												<button onclick={() => aiDraft = ''} class="text-[#555] hover:text-white">Dismiss</button>
											</div>
										</div>
									{/if}
									<div class="flex items-end gap-2">
										<textarea bind:value={replyBody} rows="1" placeholder="Type a message…"
											onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
											class="flex-1 resize-none rounded-xl border border-[#2a2a2a] bg-[#111] px-4 py-2.5 text-sm text-white placeholder-[#444] focus:border-[#444] focus:outline-none"></textarea>
										<button onclick={loadAiDraft} disabled={loadingDraft}
											title="Draft a reply with AI"
											class="w-10 h-10 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center hover:bg-[var(--accent)]/20 disabled:opacity-40 transition-colors flex-shrink-0">
											{#if loadingDraft}<div class="w-4 h-4 border-2 border-[var(--accent)]/40 border-t-[var(--accent)] rounded-full animate-spin"></div>{:else}<Icon name="sparkle" size={16} />{/if}
										</button>
										<button onclick={sendReply} disabled={sending || !replyBody.trim()}
											class="w-10 h-10 rounded-xl bg-[var(--call)] text-[var(--call-ink)] flex items-center justify-center hover:bg-[var(--call-hi)] disabled:opacity-40 transition-colors flex-shrink-0" aria-label="Send">
											{#if sending}<div class="w-4 h-4 border-2 border-[var(--call-ink)]/40 border-t-[var(--call-ink)] rounded-full animate-spin"></div>{:else}<Icon name="send" size={16} />{/if}
										</button>
									</div>
								{/if}
							</div>
					{/if}
				</div>
			</div>

		<!-- VOICEMAILS -->
		{:else if rightTab === 'voicemails'}
			<div class="p-4 space-y-2 overflow-y-auto h-full">
				{#if vmLoading}
					<div class="flex justify-center py-12"><div class="w-5 h-5 border-2 border-[#333] border-t-white rounded-full animate-spin"></div></div>
				{:else if voicemails.length === 0}
					<div class="text-center py-12 text-[#555] text-sm">No voicemails</div>
				{:else}
					{#each voicemails as vm}
						{@const unread = vm.status === 'unread' || vm.is_read === false}
						<div class="bg-[#111] border rounded-lg px-4 py-3 transition-colors {unread ? 'border-[var(--call)]/40' : 'border-[#2a2a2a]'} hover:bg-[#141414]">
							<div class="flex items-start gap-3">
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2">
										{#if unread}<span class="w-1.5 h-1.5 rounded-full bg-[var(--call)] flex-shrink-0"></span>{/if}
										<span class="text-sm font-medium text-white truncate">{vm.contact_name ?? vm.caller_name ?? vm.from_number ?? vm.caller_id ?? 'Unknown'}</span>
									</div>
									<div class="text-xs text-[#444] mt-0.5 flex gap-3">
										<span>{fmtDate(vm.received_at ?? vm.created_at ?? '')}</span>
										{#if vm.duration_seconds}<span>{fmtDur(vm.duration_seconds)}</span>{/if}
									</div>
									{#if vm.transcript}
										<p class="text-xs text-[#999] mt-1.5 leading-relaxed italic">"{vm.transcript}"</p>
									{/if}
									{#if vm.recording_url}
										<!-- svelte-ignore a11y_media_has_caption -->
										<audio src={vm.recording_url} controls preload="none" onplay={() => unread && markVmRead(vm.id)} class="mt-2 w-full h-8"></audio>
									{/if}
								</div>
								<div class="flex flex-col gap-1.5 shrink-0">
									{#if vm.from_number || vm.caller_id}
										<button onclick={() => dial(vm.from_number ?? vm.caller_id)}
											class="w-8 h-8 rounded-full bg-[var(--call)]/12 hover:bg-[var(--call)]/25 text-[var(--call)] flex items-center justify-center transition-colors" title="Call back" aria-label="Call back"><Icon name="phone" size={15} /></button>
									{/if}
									{#if unread}
										<button onclick={() => markVmRead(vm.id)}
											class="w-8 h-8 rounded-full border border-[#2a2a2a] hover:border-[#444] text-[#555] hover:text-white flex items-center justify-center transition-colors" title="Mark read" aria-label="Mark read"><Icon name="check" size={14} /></button>
									{/if}
									<button onclick={() => deleteVm(vm.id)}
										class="w-8 h-8 rounded-full border border-[#2a2a2a] hover:border-[var(--end)]/40 text-[#555] hover:text-[var(--end-text)] flex items-center justify-center transition-colors" title="Delete" aria-label="Delete"><Icon name="trash" size={14} /></button>
								</div>
							</div>
						</div>
					{/each}
				{/if}
			</div>
		{/if}
	</div>
</div>
</div>
