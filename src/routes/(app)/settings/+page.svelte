<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';
	import { supabase } from '$lib/services/auth';
	import { currentUser } from '$lib/stores';
	import { toastSuccess, toastError } from '$lib/stores/toast';

	const user = $derived($currentUser);

	// ── Active section ────────────────────────────────────────
	type Section = 'profile'|'agency'|'appearance'|'notifications'|'calling'|'communication'|'contacts'|'productivity'|'widgets'|'connections'|'integrations'|'email-accounts'|'api-keys'|'passwords'|'tokens'|'webhooks'|'data'|'security'|'voice';
	let section = $state<Section>('profile');

	// ── Bulk DNC ──────────────────────────────────────────────
	let dncInput = $state('');
	let dncLoading = $state(false);
	let dncResult = $state<{updated:number;notFound:number}|null>(null);

	async function bulkDnc() {
		if (!dncInput.trim()) return;
		dncLoading = true;
		const phones = dncInput.split('\n').map(l => l.trim()).filter(Boolean);
		const res = await apiFetch('/api/contacts/bulk-dnc', {
			method: 'POST',
			body: JSON.stringify({ phones }),
		});
		if (res.ok) {
			const d = await res.json();
			dncResult = { updated: d.updated ?? 0, notFound: phones.length - (d.updated ?? 0) };
		}
		dncLoading = false;
	}

	// ── Settings data ─────────────────────────────────────────
	let settings = $state<Record<string,unknown>>({
		company_name:'', company_email:'', company_phone:'', company_website:'',
		hourly_rate:150, currency:'USD', timezone:'America/Chicago',
		auto_record_calls:true, auto_transcribe_calls:true,
		working_hours_start:'08:00', working_hours_end:'21:00',
		working_days:['Mon','Tue','Wed','Thu','Fri'],
		call_retry_limit:3, call_retry_interval_hours:24,
		notify_new_leads:true, notify_overdue_tasks:true, notify_missed_calls:true, notify_voicemails:true, notify_new_deals:true,
		daily_digest_email:false,
		smtp_host:'', smtp_port:587, smtp_user:'', smtp_pass_encrypted:'',
		sms_auto_reply:'', default_from_number:'',
		invoice_header:'', invoice_footer:'', invoice_logo_url:'', email_signature:'',
		default_call_type:'cold_call', auto_score_on_import:true, data_retention_months:0,
		agency_name:'', agency_logo_url:'', agency_website:'', agency_phone:'', agency_address:'',
		default_task_priority:'medium', recording_compliance_message:'', recording_compliance_enabled:false,
	});
	let saving = $state(false);
	let savedSection = $state('');

	// ── API Key Vault ─────────────────────────────────────────
	interface ApiKey { id:string; name:string; service:string; environment:string; notes:string|null; created_at:string; key_value:string; }
	let apiKeys = $state<ApiKey[]>([]);
	let newKeyName = $state(''); let newKeyService = $state(''); let newKeyValue = $state(''); let newKeyEnv = $state('production'); let showNewKey = $state(false); let savingKey = $state(false);
	let revealedKeys = $state(new Set<string>());

	// ── Password Vault ────────────────────────────────────────
	interface PwdEntry { id:string; site_name:string; site_url:string|null; username:string|null; password_encrypted:string; notes:string|null; category:string; }
	let passwords = $state<PwdEntry[]>([]);
	let newPwdSite = $state(''); let newPwdUrl = $state(''); let newPwdUser = $state(''); let newPwdPass = $state(''); let newPwdNotes = $state(''); let showNewPwd = $state(false); let savingPwd = $state(false);
	let revealedPwds = $state(new Set<string>());

	// ── API Tokens + Webhooks ─────────────────────────────────
	interface Token { id:string; name:string; scopes:string[]; created_at:string; last_used_at:string|null; }
	interface OWebhook { id:string; name:string; url:string; events:string[]; enabled:boolean; delivery_count:number; }
	let tokens = $state<Token[]>([]);
	let oWebhooks = $state<OWebhook[]>([]);
	let newTokenName = $state(''); let newTokenScopes = $state<string[]>(['read']); let createdToken = $state(''); let creatingToken = $state(false);

	// ── Phone numbers for default assignment ──────────────────
	let phoneNumbers = $state<{id:string;phone_number:string;friendly_name:string|null}[]>([]);

	// ── Clients (for email account assignment) ────────────────
	let clients = $state<{id:string;name:string}[]>([]);

	// ── Email Accounts ────────────────────────────────────────
	interface EmailAccount {
		id: string; label: string; email_address: string; smtp_host: string | null;
		is_default: boolean; client_id: string | null; client?: { name: string } | null;
		provider?: string; last_synced_at?: string | null; sync_enabled?: boolean;
	}
	let emailAccounts = $state<EmailAccount[]>([]);
	let showAddEmail = $state(false);
	let emailForm = $state({ label: '', emailAddress: '', smtpHost: 'smtp.gmail.com', smtpPort: 587, smtpUser: '', appPassword: '', isDefault: false, clientId: '' });
	let addingEmail = $state(false);
	let syncingGmail = $state<Record<string, boolean>>({});
	let gmailConnectLabel = $state('Personal Gmail');
	let testingAccountId = $state<string | null>(null);
	let testResults = $state<Record<string, {success: boolean; error?: string}>>({});

	// Handle ?gmail_connected= and ?gmail_error= query params after OAuth redirect
	function handleGmailCallbackParams() {
		if (typeof window === 'undefined') return;
		const sp = new URLSearchParams(window.location.search);
		const connected = sp.get('gmail_connected');
		const err = sp.get('gmail_error');
		if (connected) {
			section = 'email-accounts';
			window.history.replaceState({}, '', window.location.pathname + '#email-accounts');
			loadEmailAccounts();
		} else if (err) {
			section = 'email-accounts';
			console.error('[gmail oauth] error:', err);
			window.history.replaceState({}, '', window.location.pathname);
		}
	}

	async function loadEmailAccounts() {
		const r = await apiFetch('/api/email-accounts');
		emailAccounts = r.ok ? await r.json() : [];
	}

	async function addEmailAccount() {
		addingEmail = true;
		const r = await apiFetch('/api/email-accounts', { method: 'POST', body: JSON.stringify({
			label: emailForm.label, emailAddress: emailForm.emailAddress, smtpHost: emailForm.smtpHost,
			smtpPort: emailForm.smtpPort, smtpUser: emailForm.smtpUser || emailForm.emailAddress,
			appPassword: emailForm.appPassword, isDefault: emailForm.isDefault, clientId: emailForm.clientId || null
		})});
		if (r.ok) {
			emailAccounts = [await r.json(), ...emailAccounts];
			showAddEmail = false;
			emailForm = { label: '', emailAddress: '', smtpHost: 'smtp.gmail.com', smtpPort: 587, smtpUser: '', appPassword: '', isDefault: false, clientId: '' };
		}
		addingEmail = false;
	}

	async function deleteEmailAccount(id: string) {
		await apiFetch(`/api/email-accounts/${id}`, { method: 'DELETE' });
		emailAccounts = emailAccounts.filter(a => a.id !== id);
	}

	async function testAccount(id: string) {
		testingAccountId = id;
		const res = await apiFetch(`/api/email-accounts/${id}/test`, { method: 'POST' });
		if (res.ok) {
			const d = await res.json();
			testResults = { ...testResults, [id]: d };
			if (d.success) toastSuccess('Connection verified');
			else toastError(d.error ?? 'Connection failed');
		}
		testingAccountId = null;
	}

	async function syncGmailAccount(emailAddress: string, accountId: string) {
		syncingGmail = { ...syncingGmail, [accountId]: true };
		try {
			const sess = await supabase.auth.getSession();
			const token = sess.data.session?.access_token ?? '';
			await fetch('/api/gmail/sync', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
				body: JSON.stringify({ email: emailAddress }),
			});
			await loadEmailAccounts();
		} finally {
			syncingGmail = { ...syncingGmail, [accountId]: false };
		}
	}

	function connectGmail() {
		const label = encodeURIComponent(gmailConnectLabel || 'Gmail');
		window.location.href = `/auth/gmail?label=${label}`;
	}

	// ── Sidebar customization ─────────────────────────────────
	const ALL_SIDEBAR_ITEMS = [
		{ href:'/dashboard', label:'Dashboard' }, { href:'/phone', label:'Phone' }, { href:'/dialer', label:'Campaign Dialer' },
		{ href:'/calls', label:'Calls' }, { href:'/scripts', label:'Scripts' }, { href:'/contacts', label:'Contacts' },
		{ href:'/my-leads', label:'⭐ My Leads' }, { href:'/leads', label:'Lead Gen' }, { href:'/clients', label:'Clients' },
		{ href:'/projects', label:'Projects' }, { href:'/campaigns', label:'Campaigns' }, { href:'/analytics', label:'Analytics' },
		{ href:'/reports', label:'Reports' }, { href:'/docs', label:'Docs' }, { href:'/time', label:'Time' },
		{ href:'/numbers', label:'Numbers' }, { href:'/team', label:'Team' }, { href:'/pipeline', label:'Pipeline' },
		{ href:'/win-loss', label:'Win/Loss' }, { href:'/leaderboard', label:'Leaderboard' }, { href:'/tasks', label:'Tasks' },
		{ href:'/sequences', label:'Sequences' }, { href:'/automations', label:'Automations' }, { href:'/snippets', label:'Snippets' },
		{ href:'/templates', label:'Templates' }, { href:'/import', label:'Import Center' }, { href:'/leads-inbox', label:'Lead Inbox' },
	];
	let hiddenItems = $state<Set<string>>(new Set());

	// ── Voice/Device ──────────────────────────────────────────
	let audioDevices = $state<MediaDeviceInfo[]>([]);
	let selectedMic = $state(''); let selectedSpeaker = $state('');
	let notifSounds = $state(true);

	// ── Tier / Plan ────────────────────────────────────────────
	let currentTier = $state<'free'|'pro'|'agency'>('free');
	const TIER_LABELS: Record<string, string> = { free: 'Free', pro: 'Pro — $39/mo', agency: 'Agency — $99/mo' };
	const TIER_COLORS: Record<string, string> = { free: 'text-[#8a8a8a]', pro: 'text-yellow-400', agency: 'text-[var(--accent)]' };

	// ── Password change ───────────────────────────────────────
	let newPassword = $state(''); let confirmPassword = $state(''); let passwordMsg = $state(''); let changingPw = $state(false);

	onMount(async () => {
		const tierRes = await apiFetch('/api/portal/tier');
		if (tierRes.ok) { const d = await tierRes.json(); currentTier = d.tier; }

		const [sr, tr, , akr, pvr, wr, nr, cr] = await Promise.all([
			apiFetch('/api/settings'),
			apiFetch('/api/settings/api-tokens'),
			apiFetch('/api/settings/activity').catch(()=>({ok:false})),
			apiFetch('/api/api-key-vault'),
			apiFetch('/api/password-vault'),
			apiFetch('/api/outbound-webhooks'),
			apiFetch('/api/phone/numbers'),
			apiFetch('/api/clients').catch(()=>({ok:false})),
		]);
		if (sr.ok) {
			const d = await sr.json();
			settings = { ...settings, ...d };
			if (typeof d.notif_sounds === 'boolean') notifSounds = d.notif_sounds;
			if (Array.isArray(d.sidebar_hidden_items)) hiddenItems = new Set(d.sidebar_hidden_items);
		}
		tokens = tr.ok ? await tr.json() : [];
		apiKeys = akr.ok ? await akr.json() : [];
		passwords = pvr.ok ? await pvr.json() : [];
		oWebhooks = wr.ok ? await wr.json() : [];
		phoneNumbers = nr.ok ? await nr.json() : [];
		clients = cr.ok ? await cr.json() : [];
		// Load email accounts + handle OAuth callback params
		handleGmailCallbackParams();
		loadEmailAccounts();
		// Load audio devices
		try {
			await navigator.mediaDevices.getUserMedia({ audio: true });
			const devices = await navigator.mediaDevices.enumerateDevices();
			audioDevices = devices.filter(d => d.kind === 'audioinput' || d.kind === 'audiooutput');
		} catch { /* permission denied */ }
	});

	async function saveSettings() {
		saving = true;
		const body = {
			...settings,
			notif_sounds: notifSounds,
			sidebar_hidden_items: [...hiddenItems],
		};
		try {
			const res = await apiFetch('/api/settings', { method:'PUT', body: JSON.stringify(body) });
			if (res.ok) { savedSection = section; setTimeout(() => savedSection = '', 2000); }
			else toastError('Could not save settings — please try again');
		} catch { toastError('Could not save settings — check your connection'); }
		saving = false;
	}

	async function createToken() {
		if (!newTokenName.trim()) return;
		creatingToken = true; createdToken = '';
		const res = await apiFetch('/api/settings/api-tokens', { method:'POST', body: JSON.stringify({ name:newTokenName, scopes:newTokenScopes }) });
		if (res.ok) { const d = await res.json(); createdToken = d.token; tokens = [d, ...tokens]; newTokenName = ''; }
		creatingToken = false;
	}

	async function revokeToken(id: string) {
		await apiFetch(`/api/settings/api-tokens/${id}`, { method:'DELETE' });
		tokens = tokens.filter(t => t.id !== id);
	}

	async function toggleWebhook(id: string, enabled: boolean) {
		const res = await apiFetch(`/api/outbound-webhooks/${id}`, { method:'PATCH', body: JSON.stringify({ enabled }) });
		if (res.ok) oWebhooks = oWebhooks.map(w => w.id === id ? { ...w, enabled } : w);
	}

	async function changePassword() {
		if (!newPassword || newPassword !== confirmPassword) { passwordMsg = 'Passwords do not match'; return; }
		changingPw = true; passwordMsg = '';
		const { error } = await supabase.auth.updateUser({ password: newPassword });
		passwordMsg = error ? `Error: ${error.message}` : '✓ Password updated';
		if (!error) { newPassword = ''; confirmPassword = ''; }
		changingPw = false;
	}

	function toggleSidebarItem(href: string) {
		const s = new Set(hiddenItems);
		s.has(href) ? s.delete(href) : s.add(href);
		hiddenItems = s;
	}

	function testNotificationSound() {
		const ctx = new AudioContext();
		const osc = ctx.createOscillator();
		osc.connect(ctx.destination);
		osc.frequency.setValueAtTime(440, ctx.currentTime);
		osc.start(); osc.stop(ctx.currentTime + 0.2);
	}

	function exportData(type: string) {
		window.open(`/api/export?type=${type}`, '_blank');
	}

	async function exportAll() {
		const types = ['contacts', 'calls', 'deals', 'time-entries', 'companies', 'tasks', 'campaigns', 'invoices'];
		for (let i = 0; i < types.length; i++) {
			setTimeout(() => window.open(`/api/export?type=${types[i]}`, '_blank'), i * 500);
		}
	}

	const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
	const SECTIONS = [
		{ group:'Account', items:[['profile','Profile'],['agency','Agency / Brand'],['appearance','Appearance']] },
		{ group:'Calling', items:[['calling','Calling Rules'],['communication','Communication'],['voice','Voice & Device']] },
		{ group:'Defaults', items:[['contacts','Contact Settings'],['productivity','Productivity'],['widgets','Widget Settings']] },
		{ group:'Integrations', items:[['connections','Connections'],['integrations','Integrations'],['email-accounts','Email Accounts'],['api-keys','API Key Vault'],['passwords','Password Vault']] },
		{ group:'Notifications', items:[['notifications','Notifications']] },
		{ group:'Tokens & Webhooks', items:[['tokens','API Tokens'],['webhooks','Webhooks']] },
		{ group:'Security & Data', items:[['security','Security'],['data','Data & Privacy']] },
	];
	// Sections whose fields persist via saveSettings() (the rest have their own save actions).
	const SETTINGS_BACKED = new Set(['profile','agency','appearance','calling','communication','voice','contacts','productivity','widgets','notifications','data']);
</script>

<svelte:head><title>Settings — Edelhaus</title></svelte:head>

<div class="flex flex-1 h-full overflow-hidden">
	<!-- Left sidebar nav -->
	<div class="w-52 shrink-0 border-r border-[#1e1e1e] overflow-y-auto py-4">
		{#each SECTIONS as grp}
			<div class="mb-3">
				<p class="text-xs text-[#333] uppercase tracking-widest px-4 mb-1">{grp.group}</p>
				{#each grp.items as [s, label]}
					<button onclick={() => section = s as Section}
						class="w-full text-left px-4 py-2 text-xs transition-colors {section === s ? 'bg-white/10 text-white' : 'text-[#7c7c7c] hover:text-white'}">
						{label}
					</button>
				{/each}
			</div>
		{/each}
	</div>

	<!-- Content area -->
	<div class="flex-1 overflow-y-auto p-8">
		<div class="max-w-2xl space-y-6">

		<!-- ── PROFILE ─────────────────────────────────────── -->
		{#if section === 'profile'}
			<h2 class="text-white text-sm font-medium mb-6">Profile</h2>
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#999] uppercase tracking-widest">Account</p>
				<div class="grid grid-cols-2 gap-4">
					{#each [['company_name','Your Name / Display Name','Ryan Sparks'],['company_email','Email','you@company.com'],['company_phone','Phone',''],['company_website','Website','']] as [f,l,ph]}
						<div>
							<label class="text-xs text-[#7c7c7c] block mb-1">{l}</label>
							<input bind:value={settings[f as keyof typeof settings]} placeholder={ph} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
						</div>
					{/each}
				</div>
			</div>
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#999] uppercase tracking-widest">Change Password</p>
				<div class="grid grid-cols-2 gap-4">
					<div><label class="text-xs text-[#7c7c7c] block mb-1">New Password</label><input type="password" bind:value={newPassword} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" /></div>
					<div><label class="text-xs text-[#7c7c7c] block mb-1">Confirm</label><input type="password" bind:value={confirmPassword} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" /></div>
				</div>
				{#if passwordMsg}<p class="text-xs {passwordMsg.startsWith('✓') ? 'text-[var(--accent)]' : 'text-red-400'}">{passwordMsg}</p>{/if}
				<button onclick={changePassword} disabled={changingPw || !newPassword} class="rounded-lg bg-white px-5 py-2 text-xs font-semibold text-black disabled:opacity-40 hover:bg-[#e5e5e5]">{changingPw ? 'Updating...' : 'Update Password'}</button>
			</div>

		<!-- ── AGENCY ─────────────────────────────────────── -->
		{:else if section === 'agency'}
			<h2 class="text-white text-sm font-medium mb-6">Agency / Business Profile</h2>

			<!-- Plan / Tier -->
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 mb-5 flex items-center justify-between hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<div>
					<p class="text-xs text-[#7c7c7c] uppercase tracking-widest mb-1">Current Plan</p>
					<p class="text-lg font-semibold {TIER_COLORS[currentTier]}">{TIER_LABELS[currentTier]}</p>
					{#if currentTier === 'free'}
						<p class="text-xs text-[#6e6e6e] mt-1">250 contacts · 1 campaign · basic dialer</p>
					{:else if currentTier === 'pro'}
						<p class="text-xs text-[#6e6e6e] mt-1">Unlimited contacts · AI features · all campaigns</p>
					{:else}
						<p class="text-xs text-[#6e6e6e] mt-1">Full platform · team management · client portal</p>
					{/if}
				</div>
				{#if currentTier !== 'agency'}
					<a href="/#pricing" target="_blank"
						class="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-xs text-white hover:bg-white/10 transition-colors shrink-0">
						{currentTier === 'free' ? 'Upgrade to Pro →' : 'Upgrade to Agency →'}
					</a>
				{:else}
					<span class="text-xs text-[var(--accent)] border border-[var(--accent)]/40 px-3 py-1.5 rounded-lg">✓ Max plan</span>
				{/if}
			</div>
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#999] uppercase tracking-widest">Brand Info</p>
				<div class="grid grid-cols-2 gap-4">
					{#each [['agency_name','Agency/Business Name','Sparks Consulting'],['agency_website','Website','https://'],['agency_phone','Phone',''],['agency_address','Address','']] as [f,l,ph]}
						<div>
							<label class="text-xs text-[#7c7c7c] block mb-1">{l}</label>
							<input bind:value={settings[f as keyof typeof settings]} placeholder={ph} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
						</div>
					{/each}
				</div>
				<div>
					<label class="text-xs text-[#7c7c7c] block mb-1">Logo URL</label>
					<input bind:value={settings.agency_logo_url} placeholder="https://your-logo.png" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
					{#if settings.agency_logo_url}<img src={settings.agency_logo_url as string} alt="Logo" class="mt-2 h-12 object-contain rounded" />{/if}
				</div>
			</div>
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#999] uppercase tracking-widest">Invoice & Report Header</p>
				<div><label class="text-xs text-[#7c7c7c] block mb-1">Header Text (appears at top of invoices/reports)</label><textarea bind:value={settings.invoice_header} rows="3" placeholder="Sparks Consulting | ryan@sparks.com | (555) 000-0000" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none"></textarea></div>
				<div><label class="text-xs text-[#7c7c7c] block mb-1">Footer Text</label><input bind:value={settings.invoice_footer} placeholder="Thank you for your business" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" /></div>
			</div>
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#999] uppercase tracking-widest">Email Signature</p>
				<textarea bind:value={settings.email_signature} rows="4" placeholder="-- &#10;Ryan Sparks&#10;Sparks Consulting&#10;(555) 000-0000" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none"></textarea>
			</div>

		<!-- ── APPEARANCE ─────────────────────────────────── -->
		{:else if section === 'appearance'}
			<h2 class="text-white text-sm font-medium mb-6">Appearance</h2>
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#999] uppercase tracking-widest">Sidebar — Toggle Items</p>
				<p class="text-xs text-[#7c7c7c]">Hide items you don't use to keep the sidebar clean.</p>
				<div class="grid grid-cols-2 gap-2">
					{#each ALL_SIDEBAR_ITEMS as item}
						<label class="flex items-center gap-2 cursor-pointer rounded-lg border border-[#2a2a2a] px-3 py-2 hover:border-[#444] transition-colors">
							<input type="checkbox" checked={!hiddenItems.has(item.href)} onchange={() => toggleSidebarItem(item.href)} class="rounded" />
							<span class="text-xs text-white">{item.label}</span>
						</label>
					{/each}
				</div>
			</div>

		<!-- ── NOTIFICATIONS ──────────────────────────────── -->
		{:else if section === 'notifications'}
			<h2 class="text-white text-sm font-medium mb-6">Notification Preferences</h2>
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#999] uppercase tracking-widest">In-App Alerts</p>
				{#each [['notify_new_leads','New lead arrived'],['notify_overdue_tasks','Task overdue'],['notify_missed_calls','Missed incoming call'],['notify_voicemails','New voicemail'],['notify_new_deals','Deal stage changed']] as [f, label]}
					<label class="flex items-center gap-3 cursor-pointer">
						<input type="checkbox" bind:checked={settings[f as keyof typeof settings] as boolean} class="rounded" />
						<span class="text-sm text-white">{label}</span>
					</label>
				{/each}
			</div>
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#999] uppercase tracking-widest">Email Notifications</p>
				<label class="flex items-center gap-3 cursor-pointer">
					<input type="checkbox" bind:checked={settings.daily_digest_email as boolean} class="rounded" />
					<div>
						<p class="text-sm text-white">Daily digest email</p>
						<p class="text-xs text-[#7c7c7c]">Summary of calls, new leads, and overdue tasks every morning</p>
					</div>
				</label>
			</div>

		<!-- ── CALLING ────────────────────────────────────── -->
		{:else if section === 'calling'}
			<h2 class="text-white text-sm font-medium mb-6">Calling Rules</h2>
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#999] uppercase tracking-widest">Working Hours</p>
				<p class="text-xs text-[#7c7c7c]">The dialer and automations will respect these hours. Contacts will not be auto-dialed outside these times.</p>
				<div class="flex gap-4 items-end">
					<div><label class="text-xs text-[#7c7c7c] block mb-1">Start</label><input type="time" bind:value={settings.working_hours_start} class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" /></div>
					<span class="text-[#6e6e6e] pb-2">to</span>
					<div><label class="text-xs text-[#7c7c7c] block mb-1">End</label><input type="time" bind:value={settings.working_hours_end} class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" /></div>
				</div>
				<div>
					<p class="text-xs text-[#7c7c7c] mb-2">Working Days</p>
					<div class="flex gap-2">
						{#each DAYS as day}
							<button onclick={() => { const d = settings.working_days as string[]; settings = { ...settings, working_days: d.includes(day) ? d.filter(x=>x!==day) : [...d, day] }; }}
								class="rounded-lg px-3 py-1.5 text-xs transition-colors {(settings.working_days as string[]).includes(day) ? 'bg-white text-black' : 'border border-[#2a2a2a] text-[#7c7c7c] hover:text-white'}">{day}</button>
						{/each}
					</div>
				</div>
			</div>
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#999] uppercase tracking-widest">Call Retry Rules</p>
				<div class="grid grid-cols-2 gap-4">
					<div><label class="text-xs text-[#7c7c7c] block mb-1">Max retries per contact</label><input type="number" bind:value={settings.call_retry_limit} min="0" max="10" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" /></div>
					<div><label class="text-xs text-[#7c7c7c] block mb-1">Hours between retries</label><input type="number" bind:value={settings.call_retry_interval_hours} min="1" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" /></div>
				</div>
			</div>
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#999] uppercase tracking-widest">Recording Compliance</p>
				<label class="flex items-start gap-3 cursor-pointer">
					<input type="checkbox" bind:checked={settings.recording_compliance_enabled as boolean} class="rounded mt-0.5" />
					<div>
						<p class="text-sm text-white">Play compliance message before recording</p>
						<p class="text-xs text-[#7c7c7c]">Required in some US states (California, Illinois, etc.)</p>
					</div>
				</label>
				{#if settings.recording_compliance_enabled}
					<textarea bind:value={settings.recording_compliance_message} rows="2" placeholder="This call may be recorded for quality assurance purposes." class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none"></textarea>
				{/if}
			</div>
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#999] uppercase tracking-widest">Default Phone Number</p>
				<select bind:value={settings.default_from_number} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
					<option value="">Use Twilio number from env</option>
					{#each phoneNumbers as num}<option value={num.phone_number}>{num.friendly_name ?? num.phone_number}</option>{/each}
				</select>
			</div>

		<!-- ── COMMUNICATION ──────────────────────────────── -->
		{:else if section === 'communication'}
			<h2 class="text-white text-sm font-medium mb-6">Communication</h2>
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#999] uppercase tracking-widest">SMTP — Send emails from your own domain</p>
				<p class="text-xs text-[#7c7c7c]">Configure your email server so generated emails come from your address.</p>
				<div class="grid grid-cols-3 gap-4">
					<div class="col-span-2"><label class="text-xs text-[#7c7c7c] block mb-1">SMTP Host</label><input bind:value={settings.smtp_host} placeholder="smtp.gmail.com" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" /></div>
					<div><label class="text-xs text-[#7c7c7c] block mb-1">Port</label><input type="number" bind:value={settings.smtp_port} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" /></div>
					<div class="col-span-2"><label class="text-xs text-[#7c7c7c] block mb-1">Username / Email</label><input bind:value={settings.smtp_user} placeholder="you@company.com" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" /></div>
					<div><label class="text-xs text-[#7c7c7c] block mb-1">Password</label><input type="password" bind:value={settings.smtp_pass_encrypted} placeholder="••••••••" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" /></div>
				</div>
			</div>
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#999] uppercase tracking-widest">SMS Auto-Reply</p>
				<p class="text-xs text-[#7c7c7c]">Sent automatically when you receive an SMS you haven't replied to within 30 minutes.</p>
				<textarea bind:value={settings.sms_auto_reply} rows="2" placeholder="Thanks for your message! I'll get back to you shortly. - Ryan" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none"></textarea>
			</div>

		<!-- ── CONTACTS ───────────────────────────────────── -->
		{:else if section === 'contacts'}
			<h2 class="text-white text-sm font-medium mb-6">Contact Settings</h2>
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#999] uppercase tracking-widest">Defaults</p>
				<div><label class="text-xs text-[#7c7c7c] block mb-1.5">Default contact type for new contacts</label>
					<select bind:value={settings.contact_default_type} class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
						{#each ['lead','prospect','customer','partner','vendor'] as t}<option value={t} class="capitalize">{t}</option>{/each}
					</select>
				</div>
			</div>
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#999] uppercase tracking-widest">Auto Scoring</p>
				<label class="flex items-center gap-3 cursor-pointer">
					<input type="checkbox" bind:checked={settings.auto_score_on_import as boolean} class="rounded" />
					<div><p class="text-sm text-white">Auto-score contacts on import</p><p class="text-xs text-[#7c7c7c]">Calculate a 0-100 engagement score immediately after CSV import</p></div>
				</label>
			</div>

		<!-- ── PRODUCTIVITY ───────────────────────────────── -->
		{:else if section === 'productivity'}
			<h2 class="text-white text-sm font-medium mb-6">Productivity Defaults</h2>
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<div class="grid grid-cols-2 gap-4">
					<div><label class="text-xs text-[#7c7c7c] block mb-1.5">Default call type</label>
						<select bind:value={settings.default_call_type} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
							{#each ['cold_call','follow_up','callback','demo','warm','referral','check_in'] as t}<option value={t}>{t.replace(/_/g,' ')}</option>{/each}
						</select>
					</div>
					<div><label class="text-xs text-[#7c7c7c] block mb-1.5">Default task priority</label>
						<select bind:value={settings.default_task_priority} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
							{#each ['low','medium','high','urgent'] as p}<option value={p} class="capitalize">{p}</option>{/each}
						</select>
					</div>
				</div>
			</div>
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#999] uppercase tracking-widest">Billing Defaults</p>
				<div class="grid grid-cols-3 gap-4">
					<div><label class="text-xs text-[#7c7c7c] block mb-1">Hourly Rate</label><input type="number" bind:value={settings.hourly_rate} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" /></div>
					<div><label class="text-xs text-[#7c7c7c] block mb-1">Currency</label>
						<select bind:value={settings.currency} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
							{#each ['USD','EUR','GBP','CAD','AUD'] as c}<option value={c}>{c}</option>{/each}
						</select>
					</div>
					<div><label class="text-xs text-[#7c7c7c] block mb-1">Timezone</label>
						<select bind:value={settings.timezone} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
							{#each ['America/New_York','America/Chicago','America/Denver','America/Los_Angeles','UTC','Europe/London'] as tz}<option value={tz}>{tz}</option>{/each}
						</select>
					</div>
				</div>
			</div>

		<!-- ── WIDGETS ────────────────────────────────────── -->
		{:else if section === 'widgets'}
			<h2 class="text-white text-sm font-medium mb-6">Widget Settings</h2>
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#999] uppercase tracking-widest mb-3">Dashboard Layout</p>
				<p class="text-xs text-[#7c7c7c] mb-4">Your dashboard widgets are configured per-session. To reset to defaults, clear your browser's localStorage.</p>
				<button onclick={() => { localStorage.removeItem('rogueos_dashboard_layout'); window.location.reload(); }} class="rounded-lg border border-[#2a2a2a] px-4 py-2 text-xs text-[#8a8a8a] hover:text-white hover:border-white transition-colors">Reset Dashboard to Default</button>
			</div>

		<!-- ── CONNECTIONS ────────────────────────────────── -->
		{:else if section === 'connections'}
			<h2 class="text-white text-sm font-medium mb-6">Connections</h2>
			<div class="space-y-3">
				{#each [
					{ name:'Twilio', icon:'📞', desc:'Voice calls, SMS, voicemail', check:'TWILIO_ACCOUNT_SID', status:'Connected via .env.local' },
					{ name:'Groq', icon:'🎙', desc:'Call transcription (Whisper)', check:'GROQ_API_KEY', status:'Connected via .env.local' },
					{ name:'Anthropic / Claude', icon:'🤖', desc:'AI summaries, scripts, enrichment', check:'ANTHROPIC_API_KEY', status:'Connected via .env.local' },
				] as conn}
					<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 flex items-center gap-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
						<span class="text-2xl">{conn.icon}</span>
						<div class="flex-1">
							<p class="text-white text-sm font-medium">{conn.name}</p>
							<p class="text-xs text-[#7c7c7c]">{conn.desc}</p>
						</div>
						<div class="text-right">
							<span class="text-xs text-[var(--accent)] bg-[var(--accent)]/12 px-2 py-0.5 rounded-full">✓ {conn.status}</span>
						</div>
					</div>
				{/each}
				<p class="text-xs text-[#6e6e6e] mt-2">Credentials are stored in your .env.local file. To update them, edit that file and restart the server.</p>
			</div>

		<!-- ── INTEGRATIONS ───────────────────────────────── -->
		{:else if section === 'integrations'}
			<h2 class="text-white text-sm font-medium mb-6">Integrations</h2>
			<div class="space-y-3">
				{#each [
					{ name:'Gmail', icon:'✉️', desc:'Sync emails, log to contacts', href:'/api/auth/google?scope=gmail' },
					{ name:'Google Calendar', icon:'📅', desc:'See meetings on dashboard', href:'/api/auth/google?scope=calendar' },
					{ name:'Spotify', icon:'🎵', desc:'Music while you dial', href:'/api/auth/spotify' },
					{ name:'Slack', icon:'💬', desc:'Get notified on new leads', href:'/api/auth/slack' },
				] as intg}
					<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 flex items-center gap-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
						<span class="text-2xl">{intg.icon}</span>
						<div class="flex-1">
							<p class="text-white text-sm font-medium">{intg.name}</p>
							<p class="text-xs text-[#7c7c7c]">{intg.desc}</p>
						</div>
						<a href={intg.href} class="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#999] hover:border-white hover:text-white transition-colors">Connect</a>
					</div>
				{/each}
			</div>

		<!-- ── EMAIL ACCOUNTS ────────────────────────────── -->
		{:else if section === 'email-accounts'}
			<h2 class="text-white text-sm font-medium mb-6">Email Accounts</h2>

			<!-- ── Connect Gmail via OAuth ── -->
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111111] p-5 mb-4">
				<div class="flex items-center gap-3 mb-4">
					<span class="text-xl">G</span>
					<div class="flex-1">
						<p class="text-sm font-medium text-white">Connect Gmail via OAuth</p>
						<p class="text-xs text-[#7c7c7c] mt-0.5">Pulls replies directly from your inbox — no App Password needed. Syncs every 5 minutes.</p>
					</div>
				</div>
				<div class="flex items-end gap-3">
					<div class="flex-1">
						<label class="text-xs text-[#7c7c7c] block mb-1">Account label</label>
						<input bind:value={gmailConnectLabel} placeholder="Personal Gmail" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
					</div>
					<button onclick={connectGmail}
						class="rounded-lg bg-white px-5 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors whitespace-nowrap">
						Connect Gmail
					</button>
				</div>
				<p class="text-xs text-[#333] mt-3">Scopes requested: read, send, modify. You can connect multiple accounts (personal + business).</p>
			</div>

			<!-- ── SMTP / App Password accounts ── -->
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111111] p-5 mb-4">
				<div class="flex items-center justify-between mb-4">
					<div>
						<p class="text-white text-sm font-medium">SMTP / App Password</p>
						<p class="text-xs text-[#7c7c7c] mt-0.5">For client accounts or non-Gmail providers using an App Password.</p>
					</div>
					<button onclick={() => showAddEmail = !showAddEmail} class="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#9a9a9a] hover:border-white hover:text-white transition-colors">
						{showAddEmail ? '✕ Cancel' : '+ Add Account'}
					</button>
				</div>

				{#if showAddEmail}
					<div class="border border-[#1e1e1e] rounded-lg p-4 mb-4 space-y-3 bg-[#0d0d0d]">
						<div class="grid grid-cols-2 gap-3">
							<div>
								<label class="text-xs text-[#7c7c7c] block mb-1">Label</label>
								<input bind:value={emailForm.label} placeholder="Welfel Ventures — Bryan" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
							</div>
							<div>
								<label class="text-xs text-[#7c7c7c] block mb-1">Email Address *</label>
								<input bind:value={emailForm.emailAddress} type="email" placeholder="bryan@gmail.com" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
							</div>
						</div>
						<div>
							<label class="text-xs text-[#7c7c7c] block mb-1">App Password * <span class="text-[#333]">(Google Account → Security → 2FA → App Passwords)</span></label>
							<input bind:value={emailForm.appPassword} type="password" placeholder="xxxx xxxx xxxx xxxx" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none font-mono" />
						</div>
						<div class="grid grid-cols-2 gap-3">
							<div>
								<label class="text-xs text-[#7c7c7c] block mb-1">Assign to Client</label>
								<select bind:value={emailForm.clientId} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:outline-none">
									<option value="">— None (use manually) —</option>
									{#each clients as c}<option value={c.id}>{c.name}</option>{/each}
								</select>
							</div>
							<div class="flex items-end pb-1">
								<label class="flex items-center gap-2 text-xs text-[#9a9a9a] cursor-pointer">
									<input type="checkbox" bind:checked={emailForm.isDefault} class="accent-white" />
									Set as default sender
								</label>
							</div>
						</div>
						<button onclick={addEmailAccount} disabled={addingEmail || !emailForm.emailAddress || !emailForm.appPassword}
							class="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40">
							{addingEmail ? 'Adding...' : 'Add Email Account'}
						</button>
					</div>
				{/if}
			</div>

			<!-- ── All connected accounts ── -->
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111111] p-5">
				<p class="text-xs text-[#999] uppercase tracking-widest mb-3">Connected Accounts</p>
				{#if emailAccounts.length === 0}
					<p class="text-xs text-[#6e6e6e] text-center py-4">No email accounts connected yet.</p>
				{:else}
					<div class="space-y-2">
						{#each emailAccounts as acc}
							<div class="flex items-center justify-between px-3 py-2.5 rounded-lg border border-[#1e1e1e] bg-[#0d0d0d]">
								<div class="flex items-center gap-3 min-w-0">
									<span class="text-base flex-shrink-0">{acc.provider === 'gmail' ? 'G' : '✉'}</span>
									<div class="min-w-0">
										<p class="text-sm text-white truncate">{acc.label}</p>
										<p class="text-xs text-[#7c7c7c] truncate">
											{acc.email_address}
											{#if acc.provider === 'gmail'}<span class="text-[var(--accent)]"> · OAuth</span>{/if}
											{#if acc.client?.name} · {acc.client.name}{/if}
											{#if acc.is_default} · Default{/if}
											{#if acc.last_synced_at}<span class="text-[#6e6e6e]"> · synced {new Date(acc.last_synced_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>{/if}
										</p>
									</div>
								</div>
								<div class="flex items-center gap-2 flex-shrink-0">
									{#if acc.provider === 'gmail'}
										<button onclick={() => syncGmailAccount(acc.email_address, acc.id)}
											disabled={syncingGmail[acc.id]}
											class="text-xs text-[#7c7c7c] hover:text-white transition-colors px-2 py-1 disabled:opacity-40">
											{syncingGmail[acc.id] ? 'Syncing...' : 'Sync Now'}
										</button>
									{/if}
									{#if testResults[acc.id]}
										<span class="text-[10px] {testResults[acc.id].success ? 'text-[var(--accent)]' : 'text-red-400'}">
											{testResults[acc.id].success ? '✓ Connected' : '✗ ' + testResults[acc.id].error}
										</span>
									{/if}
									<button onclick={() => testAccount(acc.id)} disabled={testingAccountId === acc.id}
										class="text-xs rounded-lg border border-[var(--c-border-subtle)] px-2.5 py-1 text-[#7c7c7c] hover:text-white hover:border-white disabled:opacity-40 transition-colors">
										{testingAccountId === acc.id ? '...' : 'Test'}
									</button>
									<button onclick={() => deleteEmailAccount(acc.id)} class="text-xs text-red-700 hover:text-red-400 transition-colors px-2 py-1">Remove</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
				<p class="text-xs text-[#333] mt-3">Fallback sender: add <code class="text-[#6e6e6e]">RESEND_API_KEY</code> to Vercel env vars for sequences and automated emails.</p>
			</div>

		<!-- ── API KEYS ───────────────────────────────────── -->
		{:else if section === 'api-keys'}
			<h2 class="text-white text-sm font-medium mb-6">API Key Vault</h2>
			<p class="text-xs text-[#7c7c7c]">Store API keys for external services. Keys are masked after saving.</p>
			<button onclick={() => showNewKey = !showNewKey} class="rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#e5e5e5]">+ Add Key</button>
			{#if showNewKey}
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 space-y-3 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
					<div class="grid grid-cols-2 gap-3">
						<div><label class="text-xs text-[#7c7c7c] block mb-1">Name</label><input bind:value={newKeyName} placeholder="My OpenAI Key" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" /></div>
						<div><label class="text-xs text-[#7c7c7c] block mb-1">Service</label>
							<select bind:value={newKeyService} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white focus:border-white focus:outline-none">
								<option value="">Custom</option>
								{#each ['openai','anthropic','groq','hubspot','salesforce','mailchimp','stripe','google','slack','zapier','apollo','clearbit'] as s}<option value={s} class="capitalize">{s}</option>{/each}
							</select>
						</div>
					</div>
					<div><label class="text-xs text-[#7c7c7c] block mb-1">API Key</label><input bind:value={newKeyValue} placeholder="sk-..." class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" style="font-family:var(--font-mono)" /></div>
					<div class="flex gap-2">
						<button onclick={async () => { if (!newKeyName || !newKeyValue) return; savingKey=true; const r = await apiFetch('/api/api-key-vault', { method:'POST', body: JSON.stringify({ name:newKeyName, service:newKeyService||null, keyValue:newKeyValue, environment:newKeyEnv }) }); if (r.ok) { apiKeys=[await r.json(),...apiKeys]; showNewKey=false; newKeyName=''; newKeyValue=''; } savingKey=false; }} disabled={savingKey || !newKeyName || !newKeyValue} class="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black disabled:opacity-40">Save</button>
						<button onclick={() => showNewKey=false} class="text-xs text-[#7c7c7c] hover:text-white px-3">Cancel</button>
					</div>
				</div>
			{/if}
			{#each apiKeys as key}
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 flex items-center gap-3 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
					<div class="flex-1"><p class="text-sm text-white">{key.name}</p><p class="text-xs text-[#7c7c7c] capitalize">{key.service || 'Custom'} · {key.environment}</p></div>
					<button onclick={() => { const s = new Set(revealedKeys); s.has(key.id) ? s.delete(key.id) : s.add(key.id); revealedKeys = s; }} class="text-xs text-[#6e6e6e] hover:text-white">{revealedKeys.has(key.id) ? 'Hide' : 'Show'}</button>
					{#if revealedKeys.has(key.id)}<code class="text-xs text-[#888] max-w-xs truncate" style="font-family:var(--font-mono)">{key.key_value}</code>{/if}
					<button onclick={() => navigator.clipboard.writeText(key.key_value)} class="text-xs text-[#6e6e6e] hover:text-white">Copy</button>
				</div>
			{/each}
			{#if apiKeys.length === 0}<p class="text-xs text-[#6e6e6e]">No keys saved yet</p>{/if}

		<!-- ── PASSWORDS ──────────────────────────────────── -->
		{:else if section === 'passwords'}
			<h2 class="text-white text-sm font-medium mb-6">Password Vault</h2>
			<p class="text-xs text-[#7c7c7c]">Store login credentials for tools and websites. Never store banking credentials here.</p>
			<button onclick={() => showNewPwd = !showNewPwd} class="rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#e5e5e5]">+ Add Password</button>
			{#if showNewPwd}
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 space-y-3 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
					<div class="grid grid-cols-2 gap-3">
						<div><label class="text-xs text-[#7c7c7c] block mb-1">Site/App Name *</label><input bind:value={newPwdSite} placeholder="HubSpot" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" /></div>
						<div><label class="text-xs text-[#7c7c7c] block mb-1">URL</label><input bind:value={newPwdUrl} placeholder="https://app.hubspot.com" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" /></div>
						<div><label class="text-xs text-[#7c7c7c] block mb-1">Username / Email</label><input bind:value={newPwdUser} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" /></div>
						<div><label class="text-xs text-[#7c7c7c] block mb-1">Password *</label><input type="password" bind:value={newPwdPass} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white focus:border-white focus:outline-none" /></div>
					</div>
					<div class="flex gap-2">
						<button onclick={async () => { if (!newPwdSite || !newPwdPass) return; savingPwd=true; const r = await apiFetch('/api/password-vault', { method:'POST', body: JSON.stringify({ siteName:newPwdSite, siteUrl:newPwdUrl||null, username:newPwdUser||null, passwordEncrypted:newPwdPass, notes:newPwdNotes||null }) }); if (r.ok) { passwords=[await r.json(),...passwords]; showNewPwd=false; newPwdSite='';newPwdUser='';newPwdPass=''; } savingPwd=false; }} disabled={savingPwd || !newPwdSite || !newPwdPass} class="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black disabled:opacity-40">Save</button>
						<button onclick={() => showNewPwd=false} class="text-xs text-[#7c7c7c] hover:text-white px-3">Cancel</button>
					</div>
				</div>
			{/if}
			{#each passwords as pwd}
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 flex items-center gap-3 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
					<div class="flex-1"><p class="text-sm text-white">{pwd.site_name}</p><p class="text-xs text-[#7c7c7c]">{pwd.username ?? pwd.site_url ?? ''}</p></div>
					<button onclick={() => { const s = new Set(revealedPwds); s.has(pwd.id) ? s.delete(pwd.id) : s.add(pwd.id); revealedPwds = s; }} class="text-xs text-[#6e6e6e] hover:text-white">{revealedPwds.has(pwd.id) ? 'Hide' : 'Show'}</button>
					{#if revealedPwds.has(pwd.id)}<code class="text-xs text-[#888]" style="font-family:var(--font-mono)">{pwd.password_encrypted}</code>{/if}
					{#if pwd.site_url}<a href={pwd.site_url} target="_blank" class="text-xs text-[#6e6e6e] hover:text-white">Open ↗</a>{/if}
				</div>
			{/each}
			{#if passwords.length === 0}<p class="text-xs text-[#6e6e6e]">No passwords saved yet</p>{/if}

		<!-- ── TOKENS ──────────────────────────────────────── -->
		{:else if section === 'tokens'}
			<h2 class="text-white text-sm font-medium mb-6">API Tokens</h2>
			<p class="text-xs text-[#7c7c7c]">Tokens let external tools access Edelhaus via API.</p>
			<div class="flex gap-3">
				<input bind:value={newTokenName} placeholder="Token name" class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
				<button onclick={createToken} disabled={creatingToken || !newTokenName.trim()} class="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black disabled:opacity-40">Create</button>
			</div>
			{#if createdToken}
				<div class="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/12 p-3 space-y-1">
					<p class="text-xs text-[var(--accent)] font-medium">Copy now — won't be shown again</p>
					<div class="flex gap-2"><code class="flex-1 text-xs text-white break-all" style="font-family:var(--font-mono)">{createdToken}</code><button onclick={() => navigator.clipboard.writeText(createdToken)} class="text-xs text-[#6e6e6e] hover:text-white shrink-0">Copy</button></div>
				</div>
			{/if}
			{#each tokens as t}
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 flex items-center gap-3 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
					<div class="flex-1"><p class="text-sm text-white">{t.name}</p><p class="text-xs text-[#7c7c7c]">{t.scopes?.join(', ')} · Created {new Date(t.created_at).toLocaleDateString()}</p></div>
					<button onclick={() => revokeToken(t.id)} class="text-xs text-red-700 hover:text-red-400">Revoke</button>
				</div>
			{/each}

		<!-- ── WEBHOOKS ────────────────────────────────────── -->
		{:else if section === 'webhooks'}
			<h2 class="text-white text-sm font-medium mb-6">Outbound Webhooks</h2>
			{#each oWebhooks as wh}
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 flex items-start gap-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
					<button onclick={() => toggleWebhook(wh.id, !wh.enabled)} class="w-10 h-6 rounded-full shrink-0 mt-0.5 transition-colors {wh.enabled ? 'bg-[var(--accent)]' : 'bg-[#2a2a2a]'} relative">
						<span class="absolute top-1 w-4 h-4 rounded-full bg-white transition-all {wh.enabled ? 'left-5' : 'left-1'}"></span>
					</button>
					<div class="flex-1 min-w-0">
						<p class="text-sm text-white">{wh.name}</p>
						<p class="text-xs text-[#7c7c7c] truncate">{wh.url}</p>
						<div class="flex gap-1 mt-1 flex-wrap">{#each wh.events as e}<span class="text-xs bg-white/5 text-[#8a8a8a] px-1.5 py-0.5 rounded">{e.replace(/_/g,' ')}</span>{/each}</div>
					</div>
				</div>
			{/each}
			{#if oWebhooks.length === 0}<p class="text-xs text-[#6e6e6e]">No webhooks configured. Add them here.</p>{/if}
			<p class="text-xs text-[#6e6e6e]">To add webhooks, use the Webhooks tab above or go to <a href="/settings" class="underline hover:text-white">Settings → Webhooks</a>.</p>

		<!-- ── DATA & PRIVACY ─────────────────────────────── -->
		{:else if section === 'data'}
			<h2 class="text-white text-sm font-medium mb-6">Data & Privacy</h2>

			<!-- Bulk DNC Upload -->
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 space-y-4 mb-4">
				<div>
					<p class="text-xs text-[#999] uppercase tracking-widest mb-1">Bulk Do Not Call</p>
					<p class="text-xs text-[#7c7c7c]">Paste phone numbers (one per line). Matching contacts will be marked Do Not Call immediately.</p>
				</div>
				{#if !dncResult}
					<textarea bind:value={dncInput} rows="5"
						placeholder="+15125550100&#10;(737) 555-0112&#10;9725550114&#10;..."
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2 text-xs text-white placeholder-[#333] font-mono focus:border-white focus:outline-none resize-none"></textarea>
					<button onclick={bulkDnc} disabled={dncLoading || !dncInput.trim()}
						class="rounded-lg border border-red-900/40 px-4 py-2 text-xs text-red-400 hover:bg-red-950/20 disabled:opacity-40 transition-colors">
						{dncLoading ? 'Processing…' : 'Mark as Do Not Call'}
					</button>
				{:else}
					<div class="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/12 p-3">
						<p class="text-xs text-[var(--accent)]">✓ {dncResult.updated} contacts marked Do Not Call · {dncResult.notFound} not found</p>
					</div>
					<button onclick={() => { dncResult = null; dncInput = ''; }} class="text-xs text-[#6e6e6e] hover:text-white transition-colors">Upload another batch</button>
				{/if}
			</div>

			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#999] uppercase tracking-widest">Export Your Data</p>
				<p class="text-xs text-[#7c7c7c]">Download your data as CSV files. Click individual exports or export everything at once.</p>
				<div class="flex flex-wrap gap-2">
					<button onclick={() => exportData('contacts')} class="rounded-lg border border-[#2a2a2a] px-3 py-2 text-xs text-[#999] hover:border-white hover:text-white transition-colors">↓ Contacts</button>
					<button onclick={() => exportData('calls')} class="rounded-lg border border-[#2a2a2a] px-3 py-2 text-xs text-[#999] hover:border-white hover:text-white transition-colors">↓ Calls</button>
					<button onclick={() => exportData('deals')} class="rounded-lg border border-[#2a2a2a] px-3 py-2 text-xs text-[#999] hover:border-white hover:text-white transition-colors">↓ Deals</button>
					<button onclick={() => exportData('time-entries')} class="rounded-lg border border-[#2a2a2a] px-3 py-2 text-xs text-[#999] hover:border-white hover:text-white transition-colors">↓ Time Entries</button>
					<button onclick={() => exportData('companies')} class="rounded-lg border border-[#2a2a2a] px-3 py-2 text-xs text-[#999] hover:border-white hover:text-white transition-colors">↓ Companies</button>
					<button onclick={() => exportData('tasks')} class="rounded-lg border border-[#2a2a2a] px-3 py-2 text-xs text-[#999] hover:border-white hover:text-white transition-colors">↓ Tasks</button>
					<button onclick={() => exportData('campaigns')} class="rounded-lg border border-[#2a2a2a] px-3 py-2 text-xs text-[#999] hover:border-white hover:text-white transition-colors">↓ Campaigns</button>
					<button onclick={() => exportData('invoices')} class="rounded-lg border border-[#2a2a2a] px-3 py-2 text-xs text-[#999] hover:border-white hover:text-white transition-colors">↓ Invoices</button>
				</div>
				<div class="border-t border-[#1a1a1a] pt-3">
					<button onclick={exportAll} class="rounded-lg border border-[#2a2a2a] px-4 py-2 text-xs text-[#999] hover:border-white hover:text-white transition-colors">↓ Export All Data (8 files)</button>
				</div>
			</div>
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#999] uppercase tracking-widest">Data Retention</p>
				<div><label class="text-xs text-[#7c7c7c] block mb-1.5">Auto-delete calls older than (0 = never)</label>
					<div class="flex items-center gap-2">
						<input type="number" bind:value={settings.data_retention_months} min="0" max="60" class="w-24 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" />
						<span class="text-xs text-[#7c7c7c]">months</span>
					</div>
				</div>
			</div>
			<div class="rounded-xl border border-red-900/30 bg-red-950/10 p-5 space-y-3">
				<p class="text-xs text-red-400 uppercase tracking-widest">Danger Zone</p>
				<p class="text-xs text-[#7c7c7c]">Deleting your account is permanent and cannot be undone.</p>
				<button onclick={() => { if (confirm('Are you absolutely sure? This cannot be undone.')) { alert('Contact support to delete your account.'); } }} class="rounded-lg border border-red-900 px-4 py-2 text-xs text-red-400 hover:bg-red-950/30">Delete Account</button>
			</div>

		<!-- ── SECURITY ───────────────────────────────────── -->
		{:else if section === 'security'}
			<h2 class="text-white text-sm font-medium mb-6">Security</h2>
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<p class="text-xs text-[#999] uppercase tracking-widest">Two-Factor Authentication</p>
				<p class="text-xs text-[#7c7c7c]">2FA adds an extra layer of security to your account. Coming soon — use Supabase's built-in MFA for now.</p>
				<a href="https://supabase.com/dashboard/project/_/auth/users" target="_blank" class="rounded-lg border border-[#2a2a2a] px-4 py-2 text-xs text-[#8a8a8a] hover:text-white inline-block">Manage in Supabase →</a>
			</div>

		<!-- ── VOICE & DEVICE ───────── -->
		{/if}
		</div>

		{#if SETTINGS_BACKED.has(section)}
			<div class="sticky bottom-0 -mx-8 -mb-8 mt-8 px-8 py-4 border-t border-[#1e1e1e] bg-[#0a0a0a]/95 backdrop-blur flex items-center justify-end gap-3">
				{#if savedSection}<span class="text-xs text-[var(--accent)]">✓ Saved</span>{/if}
				<button onclick={saveSettings} disabled={saving}
					class="rounded-lg bg-white px-5 py-2 text-xs font-semibold text-black hover:bg-white/90 disabled:opacity-50 transition-colors">
					{saving ? 'Saving…' : 'Save Changes'}
				</button>
			</div>
		{/if}
	</div>
</div>
