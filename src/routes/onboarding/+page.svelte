<script lang="ts">
	import { goto } from '$app/navigation';
	import { apiFetch } from '$lib/api';

	let step = $state(0);
	let saving = $state(false);

	// Step 0: welcome
	// Step 1: Twilio keys
	// Step 2: phone number
	// Step 3: Anthropic key (optional)
	// Step 4: done

	let twilioSid = $state('');
	let twilioToken = $state('');
	let twilioApiKey = $state('');
	let twilioApiSecret = $state('');
	let twilioAppSid = $state('');
	let twilioClientIdentity = $state('agent'); // must match identity in TwiML App + hooks.server.ts
	let phoneNumber = $state('');
	let phoneSid = $state('');
	let phoneFriendly = $state('My Number');
	let anthropicKey = $state('');
	let error = $state('');

	const STEPS = ['Welcome', 'Twilio', 'Phone', 'AI (optional)', 'Done'];

	async function saveTwilio() {
		if (!twilioSid || !twilioToken || !twilioApiKey || !twilioApiSecret || !twilioAppSid) {
			error = 'All Twilio fields are required'; return;
		}
		saving = true; error = '';
		// Save to Vercel env / settings — for now save to api-key-vault
		const res = await apiFetch('/api/settings', {
			method: 'POST',
			body: JSON.stringify({
				twilio_account_sid: twilioSid,
				twilio_auth_token: twilioToken,
				twilio_api_key_sid: twilioApiKey,
				twilio_api_key_secret: twilioApiSecret,
				twilio_twiml_app_sid: twilioAppSid,
				twilio_client_identity: twilioClientIdentity || 'agent',
			}),
		});
		if (!res.ok) { error = 'Failed to save Twilio settings'; saving = false; return; }
		saving = false; step = 2;
	}

	async function savePhone() {
		if (!phoneNumber) { error = 'Phone number required'; return; }
		saving = true; error = '';
		const res = await apiFetch('/api/phone/numbers', {
			method: 'POST',
			body: JSON.stringify({
				phoneNumber: phoneNumber.trim(),
				friendlyName: phoneFriendly || 'My Number',
				twilioPhoneSid: phoneSid || undefined,
				isPrimary: true,
			}),
		});
		if (!res.ok) { const d = await res.json().catch(() => ({})); error = d.message ?? 'Failed to save number'; saving = false; return; }
		saving = false; step = 3;
	}

	async function saveAI() {
		saving = true;
		if (anthropicKey.trim()) {
			await apiFetch('/api/api-key-vault', {
				method: 'POST',
				body: JSON.stringify({ service: 'anthropic', key: anthropicKey.trim(), label: 'Anthropic API Key' }),
			}).catch(() => {});
		}
		saving = false; step = 4;
	}
</script>

<svelte:head><title>Set up LeadOS</title></svelte:head>

<div class="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center px-4">
	<div class="w-full max-w-lg">

		<!-- Progress -->
		<div class="mb-8">
			<div class="flex items-center gap-2 mb-3">
				{#each STEPS as s, i}
					<div class="flex items-center gap-2">
						<div class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold {i < step ? 'bg-green-500 text-black' : i === step ? 'bg-white text-black' : 'bg-[#1a1a1a] text-[#444]'}">
							{i < step ? '✓' : i + 1}
						</div>
						{#if i < STEPS.length - 1}
							<div class="h-px w-8 {i < step ? 'bg-green-500' : 'bg-[#2a2a2a]'}"></div>
						{/if}
					</div>
				{/each}
			</div>
			<p class="text-xs text-[#555]">Step {step + 1} of {STEPS.length} — {STEPS[step]}</p>
		</div>

		<!-- Step 0: Welcome -->
		{#if step === 0}
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-8 space-y-5 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<h1 class="text-2xl font-semibold">Welcome to LeadOS 👋</h1>
				<p class="text-sm text-[#666] leading-relaxed">
					Let's get you set up in about 3 minutes. You'll need:
				</p>
				<ul class="space-y-2">
					{#each [
						['Twilio account', 'For your browser dialer — free trial available at twilio.com'],
						['Twilio phone number', 'A number to call from (you can buy one in Twilio)'],
						['Anthropic key (optional)', 'For AI brief, email drafts, call summaries — skip if you want'],
					] as [title, desc]}
						<li class="flex gap-3 text-sm">
							<span class="text-green-500 mt-0.5">→</span>
							<div>
								<p class="text-white font-medium">{title}</p>
								<p class="text-xs text-[#555] mt-0.5">{desc}</p>
							</div>
						</li>
					{/each}
				</ul>
				<button onclick={() => step = 1}
					class="w-full rounded-lg bg-white py-3 text-sm font-semibold text-black hover:bg-[#e5e5e5] transition-colors">
					Let's go →
				</button>
				<button onclick={() => goto('/dashboard')} class="w-full text-xs text-[#333] hover:text-white transition-colors text-center">
					Skip setup — I'll do this later
				</button>
			</div>

		<!-- Step 1: Twilio keys -->
		{:else if step === 1}
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-8 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<div>
					<h2 class="text-xl font-semibold mb-1">Twilio credentials</h2>
					<p class="text-xs text-[#555]">
						Find these at <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer" class="text-white underline">console.twilio.com</a>
					</p>
				</div>

				{#each [
					['Account SID', twilioSid, (v: string) => twilioSid = v, 'AC...', 'Main dashboard → Account Info'],
					['Auth Token', twilioToken, (v: string) => twilioToken = v, 'Your auth token', 'Main dashboard → Account Info'],
					['API Key SID', twilioApiKey, (v: string) => twilioApiKey = v, 'SK...', 'Account → API Keys & Tokens → Create API Key'],
					['API Key Secret', twilioApiSecret, (v: string) => twilioApiSecret = v, 'Secret (save it now)', 'Shown once when creating API key'],
					['TwiML App SID', twilioAppSid, (v: string) => twilioAppSid = v, 'AP...', 'Voice → TwiML Apps → Create App (point Voice URL to your server)'],
				['Client Identity', twilioClientIdentity, (v: string) => twilioClientIdentity = v, 'agent', 'The identity your browser registers as — must match your TwiML App. Default: agent'],
				] as [label, val, setter, placeholder, hint]}
					<div>
						<label class="block text-xs text-[#555] uppercase tracking-widest mb-1">{label}</label>
						<input type="text" value={val} oninput={(e) => setter((e.target as HTMLInputElement).value)}
							{placeholder}
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2.5 text-sm text-white placeholder-[#333] focus:border-white focus:outline-none font-mono" />
						<p class="text-[10px] text-[#333] mt-1">{hint}</p>
					</div>
				{/each}

				{#if error}<p class="text-xs text-red-400">{error}</p>{/if}
				<button onclick={saveTwilio} disabled={saving}
					class="w-full rounded-lg bg-white py-3 text-sm font-semibold text-black disabled:opacity-40 hover:bg-[#e5e5e5] transition-colors">
					{saving ? 'Saving…' : 'Save & continue →'}
				</button>
			</div>

		<!-- Step 2: Phone number -->
		{:else if step === 2}
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-8 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<div>
					<h2 class="text-xl font-semibold mb-1">Your phone number</h2>
					<p class="text-xs text-[#555]">The number you'll call from. Add it in E.164 format (+12125551234).</p>
				</div>
				<div>
					<label class="block text-xs text-[#555] uppercase tracking-widest mb-1">Phone Number *</label>
					<input type="text" bind:value={phoneNumber} placeholder="+12125551234"
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2.5 text-sm text-white placeholder-[#333] focus:border-white focus:outline-none font-mono" />
				</div>
				<div>
					<label class="block text-xs text-[#555] uppercase tracking-widest mb-1">Friendly Name</label>
					<input type="text" bind:value={phoneFriendly} placeholder="e.g. My Twilio Number"
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2.5 text-sm text-white placeholder-[#333] focus:border-white focus:outline-none" />
				</div>
				<div>
					<label class="block text-xs text-[#555] uppercase tracking-widest mb-1">Twilio Phone SID (optional)</label>
					<input type="text" bind:value={phoneSid} placeholder="PN..."
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2.5 text-sm text-white placeholder-[#333] focus:border-white focus:outline-none font-mono" />
					<p class="text-[10px] text-[#333] mt-1">Twilio Console → Phone Numbers → your number → SID</p>
				</div>
				{#if error}<p class="text-xs text-red-400">{error}</p>{/if}
				<button onclick={savePhone} disabled={saving}
					class="w-full rounded-lg bg-white py-3 text-sm font-semibold text-black disabled:opacity-40 hover:bg-[#e5e5e5] transition-colors">
					{saving ? 'Saving…' : 'Save & continue →'}
				</button>
			</div>

		<!-- Step 3: Anthropic (optional) -->
		{:else if step === 3}
			<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-8 space-y-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
				<div>
					<h2 class="text-xl font-semibold mb-1">AI features <span class="text-xs text-[#555] font-normal">— optional</span></h2>
					<p class="text-xs text-[#555] leading-relaxed">
						Add your Anthropic API key to unlock pre-call briefs, AI email drafts, and call summaries.
						Get a key at <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" class="text-white underline">console.anthropic.com</a>.
					</p>
				</div>
				<div class="rounded-lg bg-[#0d0d0d] border border-[#1a1a1a] p-4 space-y-1.5">
					<p class="text-xs text-[#666] font-medium">What you get:</p>
					{#each ['Pre-call brief — 2-sentence contact summary before you dial', 'AI email draft — send a follow-up in one click after a call', 'Call summary — auto-logged after each recorded call'] as f}
						<p class="text-xs text-[#555]">✦ {f}</p>
					{/each}
				</div>
				<div>
					<label class="block text-xs text-[#555] uppercase tracking-widest mb-1">Anthropic API Key</label>
					<input type="password" bind:value={anthropicKey} placeholder="sk-ant-..."
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2.5 text-sm text-white placeholder-[#333] focus:border-white focus:outline-none font-mono" />
				</div>
				<button onclick={saveAI} disabled={saving}
					class="w-full rounded-lg bg-white py-3 text-sm font-semibold text-black disabled:opacity-40 hover:bg-[#e5e5e5] transition-colors">
					{saving ? 'Saving…' : anthropicKey ? 'Save & finish →' : 'Skip for now →'}
				</button>
			</div>

		<!-- Step 4: Done -->
		{:else if step === 4}
			<div class="rounded-xl border border-green-800/40 bg-green-950/10 p-8 text-center space-y-4">
				<p class="text-5xl">🎉</p>
				<h2 class="text-2xl font-semibold">You're all set</h2>
				<p class="text-sm text-[#666] 