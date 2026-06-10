<script lang="ts">
	import { onMount } from 'svelte';

	let name = $state('');
	let email = $state('');
	let company = $state('');
	let vertical = $state('');
	let budget = $state('');
	let message = $state('');
	let submitting = $state(false);
	let submitted = $state(false);
	let error = $state('');

	const VERTICALS = [
		'Windows & Doors', 'Roofing & Restoration', 'Solar & Energy',
		'Smart Home / Electrical', 'SaaS / Software', 'Healthcare',
		'Financial Services', 'Real Estate', 'E-Commerce', 'Other',
	];

	const HOW_IT_WORKS = [
		{ icon: '🔍', title: 'We find the right rep', desc: 'Matched to your vertical, budget, and campaign goals. Every rep is AI-interview certified before they dial.' },
		{ icon: '✅', title: 'You approve the campaign', desc: 'Review the script, contact list, and qualify questions before a single call goes out. You stay in control.' },
		{ icon: '📞', title: 'Reps dial on your behalf', desc: 'Live power dialing with pre-call briefs, objection handlers, and real-time appointment booking.' },
		{ icon: '📊', title: 'You see everything', desc: 'Live portal showing calls made, appointments set, recordings, and invoices. Pay base + bonus per appointment.' },
	];

	async function submit(e: Event) {
		e.preventDefault();
		submitting = true; error = '';
		try {
			const res = await fetch('/api/contact-inquiry', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, email, company, vertical, budget, message }),
			});
			if (res.ok) { submitted = true; }
			else { error = 'Something went wrong. Email us directly at ryan@sparkscuriosity.com'; }
		} catch {
			error = 'Network error. Email ryan@sparkscuriosity.com directly.';
		}
		submitting = false;
	}
</script>

<svelte:head><title>Hire SDRs — Edelhaus</title>
	<meta property="og:title" content="Hire SDRs — Edelhaus" />
	<meta property="og:description" content="Managed outbound appointment setting for home improvement, B2B, and adjacent verticals. Performance-based. Speak with a lead generation expert." />
	<meta property="og:image" content="https://lead-os-livid.vercel.app/og-image.png" />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Edelhaus" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Hire SDRs — Edelhaus" />
	<meta name="twitter:description" content="Managed outbound appointment setting for home improvement, B2B, and adjacent verticals. Performance-based. Speak with a lead generation expert." />
	<meta name="twitter:image" content="https://lead-os-livid.vercel.app/og-image.png" /></svelte:head>

<div class="min-h-screen bg-[#0a0a0a] text-white">

	<nav class="border-b border-[#1a1a1a] px-8 py-5 flex items-center justify-between">
		<a href="/" class="font-semibold">Edelhaus</a>
		<div class="flex items-center gap-5">
			<a href="/?mode=login" class="text-xs text-[#7c7c7c] hover:text-white transition-colors">Log in</a>
		</div>
	</nav>

	<div class="max-w-5xl mx-auto px-6 py-16">

		<!-- Hero -->
		<div class="text-center mb-16">
			<p class="text-xs text-[#6e6e6e] uppercase tracking-widest mb-4">Edelhaus</p>
			<h1 class="text-5xl font-bold tracking-tight mb-5">Hire vetted SDRs.<br/><span class="text-[#6e6e6e]">Pay per appointment.</span></h1>
			<p class="text-[#7c7c7c] text-lg max-w-xl mx-auto leading-relaxed">
				We source, screen, and manage sales reps for your outbound campaigns.
				You get a live portal, real recordings, and a bill that only grows when you win.
			</p>
		</div>

		<!-- How it works -->
		<div class="grid grid-cols-2 md:grid-cols-4 gap-5 mb-16">
			{#each HOW_IT_WORKS as step, i}
				<div class="rounded-xl border border-[#1a1a1a] bg-[#111] p-5">
					<div class="flex items-center gap-2 mb-3">
						<span class="text-2xl">{step.icon}</span>
						<span class="text-[10px] text-[#333] font-mono">0{i+1}</span>
					</div>
					<p class="text-sm text-white font-medium mb-2">{step.title}</p>
					<p class="text-xs text-[#7c7c7c] leading-relaxed">{step.desc}</p>
				</div>
			{/each}
		</div>

		<!-- Pricing model -->
		<div class="rounded-2xl border border-[#2a2a2a] bg-[#111] p-8 mb-16">
			<div class="grid grid-cols-1 md:grid-cols-3 gap-8">
				<div>
					<p class="text-xs text-[#6e6e6e] uppercase tracking-widest mb-2">Base Retainer</p>
					<p class="text-3xl font-bold text-white">$1,500<span class="text-sm text-[#6e6e6e] font-normal">/mo</span></p>
					<p class="text-xs text-[#7c7c7c] mt-2">One dedicated rep, 50+ dials/day, weekly reporting. No contract lock-in.</p>
				</div>
				<div>
					<p class="text-xs text-[#6e6e6e] uppercase tracking-widest mb-2">Per Appointment</p>
					<p class="text-3xl font-bold text-yellow-400">+$50<span class="text-sm text-[#7c7c7c] font-normal"> each</span></p>
					<p class="text-xs text-[#7c7c7c] mt-2">Every qualified appointment set. You only pay more when we perform.</p>
				</div>
				<div>
					<p class="text-xs text-[#6e6e6e] uppercase tracking-widest mb-2">Portal Access</p>
					<p class="text-3xl font-bold text-blue-400">Included</p>
					<p class="text-xs text-[#7c7c7c] mt-2">Live dashboard, call recordings, approval workflow, messaging — all in the platform.</p>
				</div>
			</div>
		</div>

		<!-- Form + Social proof -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-12">

			<!-- Inquiry form -->
			<div>
				<h2 class="text-2xl font-semibold mb-6">{submitted ? '✓ Got it' : "Let's talk"}</h2>

				{#if submitted}
					<div class="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/12 p-6 space-y-2">
						<p class="text-white font-medium">We'll reach out within 24 hours.</p>
						<p class="text-xs text-[#7c7c7c]">We'll review your goals and follow up with how we can run your outreach.</p>
					</div>
				{:else}
					<form onsubmit={submit} class="space-y-4">
						<div class="grid grid-cols-2 gap-3">
							<div>
								<label class="block text-xs text-[#7c7c7c] mb-1">Your name *</label>
								<input bind:value={name} required placeholder="Ryan Sparks"
									class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2.5 text-sm text-white placeholder-[#333] focus:border-white focus:outline-none" />
							</div>
							<div>
								<label class="block text-xs text-[#7c7c7c] mb-1">Work email *</label>
								<input type="email" bind:value={email} required placeholder="you@company.com"
									class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2.5 text-sm text-white placeholder-[#333] focus:border-white focus:outline-none" />
							</div>
						</div>
						<div>
							<label class="block text-xs text-[#7c7c7c] mb-1">Company</label>
							<input bind:value={company} placeholder="Acme Inc."
								class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2.5 text-sm text-white placeholder-[#333] focus:border-white focus:outline-none" />
						</div>
						<div class="grid grid-cols-2 gap-3">
							<div>
								<label class="block text-xs text-[#7c7c7c] mb-1">Vertical / Industry</label>
								<select bind:value={vertical} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2.5 text-sm text-white focus:outline-none">
									<option value="">Select…</option>
									{#each VERTICALS as v}<option value={v}>{v}</option>{/each}
								</select>
							</div>
							<div>
								<label class="block text-xs text-[#7c7c7c] mb-1">Monthly budget</label>
								<select bind:value={budget} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2.5 text-sm text-white focus:outline-none">
									<option value="">Select…</option>
									{#each ['Under $2k','$2k-$5k','$5k-$10k','$10k+','Not sure yet'] as b}
										<option value={b}>{b}</option>
									{/each}
								</select>
							</div>
						</div>
						<div>
							<label class="block text-xs text-[#7c7c7c] mb-1">Tell us about your campaign</label>
							<textarea bind:value={message} rows="3" placeholder="Target market, what you're selling, what success looks like…"
								class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2.5 text-sm text-white placeholder-[#333] focus:border-white focus:outline-none resize-none"></textarea>
						</div>
						{#if error}<p class="text-xs text-red-400">{error}</p>{/if}
						<button type="submit" disabled={submitting || !name || !email}
							class="w-full rounded-xl bg-white py-3 text-sm font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
							{submitting ? 'Sending…' : 'Request a Conversation →'}
						</button>
						<p class="text-[10px] text-[#333] text-center">No commitment. We'll respond within 24 hours.</p>
					</form>
				{/if}
			</div>

			<!-- Trust / social proof -->
			<div class="space-y-5">
				<div>
					<p class="text-xs text-[#6e6e6e] uppercase tracking-widest mb-4">What you get</p>
					{#each [
						['📞', 'Dedicated rep dialing your list 5 days/week'],
						['📋', 'Custom script + objection handlers for your vertical'],
						['✅', 'You approve everything before a call goes out'],
						['🎧', 'Every call recorded + transcribed automatically'],
						['📅', 'Appointment booking with qualifying questions captured'],
						['📊', 'Live portal — see calls, wins, recordings, invoices'],
						['💬', 'Direct messaging between you, rep, and agency'],
						['🔄', 'Campaign adjustments anytime via approval workflow'],
					] as [icon, text]}
						<div class="flex items-start gap-3 py-2 border-b border-[#111]">
							<span class="text-base shrink-0">{icon}</span>
							<p class="text-sm text-[#888]">{text}</p>
						</div>
					{/each}
				</div>

				<div class="rounded-xl border border-[#1a1a1a] bg-[#111] p-5">
					<p class="text-xs text-[#6e6e6e] uppercase tracking-widest mb-3">Currently serving</p>
					{#each [
						['The Beard Club', 'E-Commerce / D2C', 'Abandoned cart recovery'],
						['iotty Smart Home', 'Smart Home / IoT', 'B2B channel sales'],
						['Huntt.gg', 'Creator Economy', 'Streamer partnership outreach'],
					] as [company, vertical, type]}
						<div class="flex items-start gap-3 mb-3 last:mb-0">
							<div class="w-6 h-6 rounded bg-[#1a1a1a] flex items-center justify-center text-[10px] font-bold text-[#7c7c7c] shrink-0">{company[0]}</div>
							<div>
								<p class="text-xs text-white">{company}</p>
								<p class="text-[10px] text-[#6e6e6e]">{vertical} · {type}</p>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>

	<footer class="border-t border-[#1a1a1a] px-8 py-6 text-center">
		<p class="text-xs text-[#333]">Edelhaus · <a href="mailto:ryan@sparkscuriosity.com" class="hover:text-white transition-colors">ryan@sparkscuriosity.com</a></p>
	</footer>
</div>
