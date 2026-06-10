<svelte:head>
	<title>Pricing — Edelhaus</title>
	<meta property="og:title" content="Pricing — Edelhaus" />
	<meta property="og:description" content="Simple, performance-based pricing. $20/mo dialer. $1/contact + $200/appointment for managed outreach. Free trial to start." />
	<meta property="og:image" content="https://lead-os-livid.vercel.app/og-image.png" />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Edelhaus" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Pricing — Edelhaus" />
	<meta name="twitter:description" content="Simple, performance-based pricing. $20/mo dialer. $1/contact + $200/appointment for managed outreach. Free trial to start." />
	<meta name="twitter:image" content="https://lead-os-livid.vercel.app/og-image.png" />
	<meta name="description" content="Simple, performance-based pricing. Pay for the dialer, pay for contacts, pay for results — never for seat-warmers." />
</svelte:head>

<div class="min-h-screen bg-[#000] text-white" style="font-family:var(--font-ui,'Inter',system-ui,sans-serif)">

	<!-- Nav -->
	<nav class="flex items-center justify-between px-8 py-6 border-b border-[#0f0f0f]">
		<a href="/" style="font-family:var(--font-label,'Cormorant SC',serif);font-size:14px;letter-spacing:.28em;color:#fff">EDELHAUS</a>
		<div class="flex items-center gap-6">
			<a href="/contact" class="text-xs text-[#6e6e6e] hover:text-white transition-colors">Contact</a>
			<a href="/" class="text-xs text-[#6e6e6e] hover:text-white border border-[#1e1e1e] px-4 py-1.5 rounded-lg hover:border-white transition-colors">Log in →</a>
		</div>
	</nav>

	<!-- Hero -->
	<div class="max-w-4xl mx-auto px-8 pt-20 pb-16 text-center">
		<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:10px;letter-spacing:.24em;color:#333;margin-bottom:16px">Pricing</p>
		<h1 style="font-family:var(--font-display,'Playfair Display',Georgia,serif);font-weight:300;font-size:clamp(2.8rem,7vw,5rem);letter-spacing:-.02em;line-height:.95;color:#fff;margin-bottom:20px">
			You pay for results.<br/>
			<span style="color:#444">Not promises.</span>
		</h1>
		<p class="text-sm text-[#7c7c7c] max-w-lg mx-auto leading-relaxed">
			Use the dialer yourself, or let our team dial for you. Either way, the model is the same — you pay for contacts worked and appointments delivered.
		</p>
	</div>

	<!-- ── TRACK 1: PLATFORM ── -->
	<div class="max-w-5xl mx-auto px-8 mb-24">
		<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.22em;color:#2a2a2a;margin-bottom:16px">The Platform</p>

		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">

			<!-- Starter -->
			<div class="rounded-2xl border border-[#1a1a1a] bg-[#080808] p-8">
				<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:10px;letter-spacing:.18em;color:#444;margin-bottom:14px">Edelhaus Platform</p>
				<div class="flex items-baseline gap-2 mb-2">
					<span style="font-size:42px;font-weight:600;letter-spacing:-.03em;color:#fff">$40</span>
					<span class="text-xs text-[#6e6e6e]">/month</span>
				</div>
				<div class="flex items-baseline gap-2 mb-6">
					<span class="text-sm text-[#7c7c7c]">+</span>
					<span style="font-size:22px;font-weight:600;color:#888;letter-spacing:-.02em">$5</span>
					<span class="text-xs text-[#6e6e6e]">per seat / month</span>
				</div>
				<p class="text-xs text-[#6e6e6e] mb-8 leading-relaxed">Full power dialer, CRM, campaign management, AI brief, SDR portal, and client reporting. Bring your own Twilio account — we handle the rest.</p>

				<div class="space-y-2.5 mb-8">
					{#each [
						'Unlimited campaigns & call lists',
						'Power dialer with local presence',
						'AMD + voicemail drop',
						'AI pre-call brief & summaries',
						'Client portal for each brand',
						'SDR onboarding & performance tracking',
						'Call coaching & feedback tools',
						'Stripe payout to reps',
						'Agency command center',
						'Weekly automated client reports',
					] as feature}
						<div class="flex items-center gap-2.5">
							<div class="w-1 h-1 rounded-full bg-[#333] shrink-0"></div>
							<span class="text-xs text-[#8a8a8a]">{feature}</span>
						</div>
					{/each}
				</div>

				<a href="/contact" class="block w-full text-center rounded-xl border border-[#2a2a2a] py-3 text-xs text-[#888] hover:border-white hover:text-white transition-colors">
					Get started
				</a>
				<p class="text-center text-[10px] text-[#2a2a2a] mt-3">Requires Twilio account · 14-day free trial</p>
			</div>

			<!-- What's included callout -->
			<div class="rounded-2xl border border-[#111] bg-[#040404] p-8 flex flex-col justify-between">
				<div>
					<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:10px;letter-spacing:.18em;color:#2a2a2a;margin-bottom:20px">How it works</p>
					<div class="space-y-6">
						<div>
							<p class="text-sm text-white font-medium mb-1">Bring your own Twilio</p>
							<p class="text-xs text-[#6e6e6e] leading-relaxed">Connect your Twilio account and own your numbers, recordings, and calling costs directly. We don't mark up your call spend.</p>
						</div>
						<div class="border-t border-[#0d0d0d] pt-6">
							<p class="text-sm text-white font-medium mb-1">One platform, three views</p>
							<p class="text-xs text-[#6e6e6e] leading-relaxed">Your admin dashboard. Your SDRs' dialer. Your clients' portal. All from one login, automatically routed by role.</p>
						</div>
						<div class="border-t border-[#0d0d0d] pt-6">
							<p class="text-sm text-white font-medium mb-1">Commission stays yours</p>
							<p class="text-xs text-[#6e6e6e] leading-relaxed">Set your own bonus rates per appointment. Pay reps directly through Stripe Connect. Edelhaus takes no cut of your appointments.</p>
						</div>
					</div>
				</div>
				<div class="mt-8 pt-6 border-t border-[#0d0d0d]">
					<p class="text-[10px] text-[#2a2a2a] leading-relaxed">Open to commission-only arrangements with a monthly platform fee. <a href="/contact" class="text-[#6e6e6e] hover:text-white underline transition-colors">Let's talk.</a></p>
				</div>
			</div>
		</div>
	</div>

	<!-- Divider -->
	<div class="max-w-5xl mx-auto px-8 mb-24">
		<div class="border-t border-[#0a0a0a]"></div>
		<div class="text-center mt-8 mb-8">
			<p style="font-family:var(--font-display,'Playfair Display',Georgia,serif);font-style:italic;font-size:18px;color:#333">or let us run the outreach for you</p>
		</div>
		<div class="border-t border-[#0a0a0a]"></div>
	</div>

	<!-- ── BASIC TIER ── -->
	<div class="max-w-5xl mx-auto px-8 mb-16">
		<div class="rounded-2xl border border-[#1a1a1a] bg-[#060606] p-8 flex flex-col md:flex-row items-start md:items-center gap-8 justify-between">
			<div class="flex-1">
				<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.18em;color:#333;margin-bottom:10px">Rep / Solo Tier</p>
				<div class="flex items-baseline gap-2 mb-3">
					<span style="font-size:34px;font-weight:600;letter-spacing:-.03em;color:#fff">$20</span>
					<span class="text-xs text-[#6e6e6e]">/month · Basic</span>
				</div>
				<p class="text-xs text-[#6e6e6e] leading-relaxed max-w-lg">Plug-and-play dialer access for individual reps or teams just getting started. Connect your own Twilio and start booking appointments. No seat math — just a flat $20.</p>
			</div>
			<div class="flex flex-col gap-3 shrink-0 w-full md:w-72">
				<div class="space-y-2">
					{#each ['Full power dialer','Unlimited contacts & campaigns','Performance dashboard','AI call summaries','$0 free trial to start'] as f}
						<div class="flex items-center gap-2">
							<div class="w-1 h-1 rounded-full bg-[#2a2a2a] shrink-0"></div>
							<span class="text-[11px] text-[#7c7c7c]">{f}</span>
						</div>
					{/each}
				</div>
				<div class="flex gap-2 mt-2">
					<a href="/" class="flex-1 text-center rounded-xl bg-white py-2.5 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors">Start free trial</a>
				</div>
			</div>
		</div>
	</div>

	<!-- ── TRACK 2: MANAGED SERVICES ── -->
	<div class="max-w-5xl mx-auto px-8 mb-24">
		<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.22em;color:#2a2a2a;margin-bottom:6px">Managed by Edelhaus</p>
		<h2 style="font-family:var(--font-display,'Playfair Display',Georgia,serif);font-weight:400;font-size:28px;letter-spacing:-.01em;color:#fff;margin-bottom:4px">Done-for-you outreach</h2>
		<p class="text-xs text-[#6e6e6e] mb-12">You provide the leads. We dial, qualify, and deliver booked appointments to your calendar.</p>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">

			<!-- Home Improvement Lead Rejuvenation -->
			<div class="rounded-2xl border border-[#1a1a1a] bg-[#080808] p-7 flex flex-col">
				<div class="mb-6">
					<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.18em;color:#444;margin-bottom:10px">Home Improvement</p>
					<h3 style="font-size:16px;font-weight:500;color:#fff;line-height:1.3;margin-bottom:8px">Lead Rejuvenation</h3>
					<p class="text-xs text-[#6e6e6e] leading-relaxed">Re-engage your existing lead database. Windows, roofing, solar, HVAC, smart home — our team calls your contacts and books qualified appointments.</p>
				</div>

				<div class="bg-[#040404] rounded-xl border border-[#111] p-4 mb-6">
					<div class="flex items-baseline gap-1.5 mb-3">
						<span style="font-size:26px;font-weight:600;letter-spacing:-.02em;color:#fff">$1</span>
						<span class="text-xs text-[#6e6e6e]">per contact worked</span>
					</div>
					<div class="flex items-baseline gap-1.5">
						<span style="font-size:26px;font-weight:600;letter-spacing:-.02em;color:#22c55e">$200</span>
						<span class="text-xs text-[#7c7c7c]">per appointment set</span>
					</div>
					<p class="text-[10px] text-[#333] mt-2">Subject to evaluation · Performance bonus available</p>
				</div>

				<div class="space-y-2 mb-8 flex-1">
					{#each [
						'Live phone outreach by vetted SDRs',
						'Qualifying questions per your ICP',
						'Appointment booked to your calendar',
						'Call recordings provided',
						'Weekly performance report',
					] as f}
						<div class="flex items-start gap-2">
							<div class="w-1 h-1 rounded-full bg-[#22c55e] shrink-0 mt-1.5"></div>
							<span class="text-[11px] text-[#7c7c7c]">{f}</span>
						</div>
					{/each}
				</div>

				<a href="/contact" class="block w-full text-center rounded-xl bg-white py-3 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors">
					Get a quote →
				</a>
			</div>

			<!-- B2B Appointment Setting -->
			<div class="rounded-2xl border border-[#2a2a2a] bg-[#0a0a0a] p-7 flex flex-col" style="box-shadow:0 0 0 1px rgba(255,255,255,.04)">
				<div class="mb-6">
					<div class="flex items-center gap-2 mb-2">
						<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.18em;color:#888">B2B</p>
						<span class="text-[9px] bg-white/10 text-white px-2 py-0.5 rounded-full border border-white/20">Most Popular</span>
					</div>
					<h3 style="font-size:16px;font-weight:500;color:#fff;line-height:1.3;margin-bottom:8px">Appointment Setting</h3>
					<p class="text-xs text-[#7c7c7c] leading-relaxed">Full outbound motion for any B2B vertical. We source or work your list, qualify prospects, and deliver meetings to your sales team.</p>
				</div>

				<div class="bg-[#050505] rounded-xl border border-[#1e1e1e] p-4 mb-6">
					<div class="flex items-baseline gap-1.5 mb-3">
						<span style="font-size:26px;font-weight:600;letter-spacing:-.02em;color:#fff">$1</span>
						<span class="text-xs text-[#6e6e6e]">per contact worked</span>
					</div>
					<div class="flex items-baseline gap-1.5">
						<span style="font-size:26px;font-weight:600;letter-spacing:-.02em;color:#22c55e">$200</span>
						<span class="text-xs text-[#7c7c7c]">per appointment set</span>
					</div>
					<p class="text-[10px] text-[#333] mt-2">Subject to evaluation · Performance bonus available</p>
				</div>

				<div class="space-y-2 mb-8 flex-1">
					{#each [
						'SaaS, fintech, healthcare, services & more',
						'Dedicated SDR team trained on your pitch',
						'Campaign approval before go-live',
						'Script + objection handling built with you',
						'Live client portal with real-time data',
						'Commission-only available with monthly fee',
					] as f}
						<div class="flex items-start gap-2">
							<div class="w-1 h-1 rounded-full bg-[#888] shrink-0 mt-1.5"></div>
							<span class="text-[11px] text-[#8a8a8a]">{f}</span>
						</div>
					{/each}
				</div>

				<a href="/contact" class="block w-full text-center rounded-xl bg-white py-3 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors">
					Speak with our team →
				</a>
			</div>

			<!-- Customer Insight & Marketing Activation -->
			<div class="rounded-2xl border border-[#1a1a1a] bg-[#080808] p-7 flex flex-col">
				<div class="mb-6">
					<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.18em;color:#444;margin-bottom:10px">Intelligence</p>
					<h3 style="font-size:16px;font-weight:500;color:#fff;line-height:1.3;margin-bottom:8px">Customer Insight &amp; Marketing Activation</h3>
					<p class="text-xs text-[#6e6e6e] leading-relaxed">Turn your contact list into actionable intelligence. AI-powered outreach to qualify intent, surface buying signals, and activate dormant leads.</p>
				</div>

				<div class="bg-[#040404] rounded-xl border border-[#111] p-4 mb-6">
					<div class="flex items-baseline gap-1.5 mb-1">
						<span class="text-xs text-[#7c7c7c]">Starting at</span>
					</div>
					<div class="flex items-baseline gap-1.5 mb-3">
						<span style="font-size:26px;font-weight:600;letter-spacing:-.02em;color:#fff">$0.30</span>
						<span class="text-xs text-[#6e6e6e]">per contact</span>
					</div>
					<p class="text-[10px] text-[#333]">AI insights &amp; brand awareness check available at additional cost</p>
				</div>

				<div class="space-y-2 mb-8 flex-1">
					{#each [
						'Contact-level intent scoring',
						'AI-generated conversation insights',
						'Brand awareness benchmarking',
						'Enriched contact profiles',
						'Segmentation for marketing activation',
						'Integrates with your existing CRM',
					] as f}
						<div class="flex items-start gap-2">
							<div class="w-1 h-1 rounded-full bg-[#3b82f6] shrink-0 mt-1.5"></div>
							<span class="text-[11px] text-[#7c7c7c]">{f}</span>
						</div>
					{/each}
				</div>

				<a href="/contact" class="block w-full text-center rounded-xl border border-[#2a2a2a] py-3 text-xs text-[#888] hover:border-white hover:text-white transition-colors">
					Learn more
				</a>
			</div>
		</div>
	</div>

	<!-- Commission-only callout -->
	<div class="max-w-5xl mx-auto px-8 mb-24">
		<div class="rounded-2xl border border-[#1a1a1a] bg-[#040404] px-8 py-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
			<div>
				<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.18em;color:#333;margin-bottom:6px">Alternative model</p>
				<p class="text-sm text-white font-medium mb-1">Open to commission-only arrangements</p>
				<p class="text-xs text-[#6e6e6e] max-w-lg">For the right partnership we work on performance only — you pay a monthly platform fee and we earn exclusively on appointments delivered. Subject to qualification.</p>
			</div>
			<a href="/contact" class="shrink-0 rounded-xl border border-[#2a2a2a] px-6 py-2.5 text-xs text-[#888] hover:border-white hover:text-white transition-colors whitespace-nowrap">
				Discuss terms →
			</a>
		</div>
	</div>

	<!-- CTA -->
	<div class="max-w-3xl mx-auto px-8 pb-32 text-center">
		<h2 style="font-family:var(--font-display,'Playfair Display',Georgia,serif);font-weight:300;font-size:clamp(2rem,5vw,3.2rem);letter-spacing:-.02em;color:#fff;margin-bottom:12px">
			Speak with a lead<br/>generation expert today.
		</h2>
		<p class="text-xs text-[#6e6e6e] mb-10 leading-relaxed">No decks. No demos for demo's sake. Tell us what you sell and who you sell to — we'll tell you if we can move the needle.</p>
		<a href="/contact"
			class="inline-block rounded-xl bg-white px-10 py-4 text-sm font-semibold text-black hover:bg-[#e5e5e5] transition-colors">
			Book a conversation
		</a>
		<p class="text-[10px] text-[#2a2a2a] mt-5">Usually responds same day · No commitment required</p>
	</div>

	<!-- Footer -->
	<div class="border-t border-[#0a0a0a] px-8 py-8 flex flex-col md:flex-row items-center justify-between gap-4 max-w-5xl mx-auto">
		<span style="font-family:var(--font-label,'Cormorant SC',serif);font-size:12px;letter-spacing:.22em;color:#222">EDELHAUS</span>
		<div class="flex items-center gap-6 text-[10px] text-[#2a2a2a]">
			<a href="/contact" class="hover:text-white transition-colors">Contact</a>
			<a href="/" class="hover:text-white transition-colors">Log in</a>
		</div>
		<span class="text-[10px] text-[#1a1a1a]">© 2026 Edelhaus</span>
	</div>

</div>
