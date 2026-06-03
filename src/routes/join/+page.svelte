<svelte:head>
	<title>Join the Team — LeadOS SDR Careers</title>
	<meta property="og:title" content="Join the Team — SDR Careers at LeadOS" />
	<meta property="og:description" content="Flexible hours, transparent pay, AI-assisted dialing, live coaching. No meetings. Commission-based or base + bonus. Free trial dialer access." />
	<meta property="og:image" content="https://lead-os-livid.vercel.app/og-image.png" />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="LeadOS" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Join the Team — SDR Careers at LeadOS" />
	<meta name="twitter:description" content="Flexible hours, transparent pay, AI-assisted dialing, live coaching. No meetings. Commission-based or base + bonus. Free trial dialer access." />
	<meta name="twitter:image" content="https://lead-os-livid.vercel.app/og-image.png" />
	<meta name="description" content="We're building the team for the modern sales rep. Flexible hours, transparent pay, AI-assisted dialing, live coaching. No meetings. Just results." />
</svelte:head>

<div class="min-h-screen bg-[#000] text-white" style="font-family:var(--font-ui,'Inter',system-ui,sans-serif)">

	<!-- Nav -->
	<nav class="flex items-center justify-between px-8 py-6 border-b border-[#0f0f0f]">
		<a href="/" style="font-family:var(--font-label,'Cormorant SC',serif);font-size:14px;letter-spacing:.28em;color:#fff">LEADOS</a>
		<div class="flex items-center gap-6">
			<a href="/coaching" class="text-xs text-[#444] hover:text-white transition-colors">Coaching</a>
			<a href="/marketplace" class="text-xs text-[#444] hover:text-white transition-colors">Browse Campaigns</a>
			<a href="/pricing" class="text-xs text-[#444] hover:text-white transition-colors">Pricing</a>
			<a href="/" class="text-xs text-[#444] hover:text-white border border-[#1e1e1e] px-4 py-1.5 rounded-lg hover:border-white transition-colors">Log in →</a>
		</div>
	</nav>

	<!-- Hero -->
	<div class="max-w-4xl mx-auto px-8 pt-20 pb-16">
		<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:10px;letter-spacing:.24em;color:#333;margin-bottom:16px">SDR Careers · Remote</p>
		<h1 style="font-family:var(--font-display,'Playfair Display',Georgia,serif);font-weight:300;font-size:clamp(2.8rem,7vw,5.5rem);letter-spacing:-.02em;line-height:.92;color:#fff;margin-bottom:20px">
			Your dialing experience<br/>
			<span style="font-style:italic;color:#555">should work for you.</span>
		</h1>
		<p class="text-sm text-[#555] max-w-2xl leading-relaxed mb-10">
			For experienced reps and anyone ready to build real financial independence through the art of lead generation and service-based selling. Human-centric, AI-assisted, SDR-founded. We built this because we live it.
		</p>
		<div class="flex flex-wrap gap-3">
			<a href="#apply" class="rounded-xl bg-white px-8 py-3.5 text-sm font-semibold text-black hover:bg-[#e5e5e5] transition-colors">
				Apply now →
			</a>
			<a href="/marketplace" class="rounded-xl border border-[#2a2a2a] px-8 py-3.5 text-sm text-[#888] hover:border-white hover:text-white transition-colors">
				Browse open campaigns
			</a>
		</div>
	</div>

	<!-- The deal — no fluff -->
	<div class="max-w-5xl mx-auto px-8 mb-20">
		<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.22em;color:#2a2a2a;margin-bottom:20px">The deal</p>
		<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
			{#each [
				{ stat: 'No meetings', sub: 'ever', note: 'Your time is your time. We communicate async.' },
				{ stat: 'Fully flexible', sub: 'schedule', note: 'Dial when it works for you — no mandatory hours.' },
				{ stat: 'Transparent', sub: 'pay structure', note: 'Every rate is visible upfront. No surprises.' },
				{ stat: 'Paid per', sub: 'appointment', note: 'Base or commission — you choose the model.' },
			] as item}
				<div class="rounded-2xl border border-[#1a1a1a] bg-[#080808] p-6">
					<p style="font-size:18px;font-weight:600;color:#fff;letter-spacing:-.02em;line-height:1">{item.stat}</p>
					<p class="text-xs text-[#444] mb-3">{item.sub}</p>
					<p class="text-[10px] text-[#333] leading-relaxed">{item.note}</p>
				</div>
			{/each}
		</div>
	</div>

	<!-- Two paths -->
	<div class="max-w-5xl mx-auto px-8 mb-20">
		<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.22em;color:#2a2a2a;margin-bottom:20px">Choose your model</p>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">

			<div class="rounded-2xl border border-[#1a1a1a] bg-[#080808] p-8">
				<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.16em;color:#444;margin-bottom:12px">Managed campaigns</p>
				<h3 class="text-white font-medium text-lg mb-3">Base pay + appointment bonus</h3>
				<p class="text-xs text-[#555] leading-relaxed mb-6">
					Work assigned campaigns with a monthly base retainer plus a per-appointment bonus. Predictable floor, uncapped ceiling. Best for reps who want income stability while building their book.
				</p>
				<div class="rounded-xl border border-[#111] bg-[#040404] p-4 space-y-2.5">
					<div class="flex justify-between text-xs"><span class="text-[#444]">Monthly base</span><span class="text-white">Set per engagement</span></div>
					<div class="flex justify-between text-xs"><span class="text-[#444]">Per appointment set</span><span class="text-green-400 font-medium">$50–$200+</span></div>
					<div class="flex justify-between text-xs"><span class="text-[#444]">Performance bonus</span><span class="text-yellow-400">Available</span></div>
					<div class="flex justify-between text-xs"><span class="text-[#444]">Payout method</span><span class="text-white">Stripe Connect · weekly</span></div>
				</div>
			</div>

			<div class="rounded-2xl border border-[#2a2a2a] bg-[#0a0a0a] p-8" style="box-shadow:0 0 0 1px rgba(255,255,255,.04)">
				<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.16em;color:#888;margin-bottom:12px">Commission only</p>
				<h3 class="text-white font-medium text-lg mb-3">Pure performance</h3>
				<p class="text-xs text-[#666] leading-relaxed mb-6">
					No base. No ceiling. Work the campaigns you want, at the volume you choose. Pair with our <span class="text-white">$20/month</span> platform access for the plug-and-play dialer and full campaign tools. Every appointment you set goes directly to your Stripe account.
				</p>
				<div class="rounded-xl border border-[#1e1e1e] bg-[#050505] p-4 space-y-2.5">
					<div class="flex justify-between text-xs"><span class="text-[#444]">Platform access</span><span class="text-white">$20/month (or free trial)</span></div>
					<div class="flex justify-between text-xs"><span class="text-[#444]">Per appointment</span><span class="text-green-400 font-medium">$100–$200+ per set</span></div>
					<div class="flex justify-between text-xs"><span class="text-[#444]">Hours required</span><span class="text-white">None. Zero.</span></div>
					<div class="flex justify-between text-xs"><span class="text-[#444]">Payout</span><span class="text-white">Stripe · per approval</span></div>
				</div>
			</div>
		</div>
	</div>

	<!-- The dialer -->
	<div class="max-w-5xl mx-auto px-8 mb-20">
		<div class="rounded-2xl border border-[#1a1a1a] bg-[#060606] p-10 md:p-14">
			<div class="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
				<div>
					<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.22em;color:#2a2a2a;margin-bottom:14px">The tool</p>
					<h2 style="font-family:var(--font-display,'Playfair Display',Georgia,serif);font-weight:400;font-size:26px;letter-spacing:-.01em;color:#fff;margin-bottom:12px">
						Plug-and-play dialer.<br/>Yours from day one.
					</h2>
					<p class="text-xs text-[#444] leading-relaxed mb-6">LeadOS is the platform we built to dial smarter. Power dialer, local presence, AMD voicemail drop, pre-call AI brief, real-time queue — everything you need to hit volume without grinding. Free trial to start. $20/month after that.</p>
					<div class="space-y-2">
						{#each [
							'Power dialer with configurable auto-advance',
							'Local area code matching for higher answer rates',
							'Voicemail drop — one tap, move on',
							'AI brief before every call so you walk in warm',
							'Call coaching that compares you to your own best week',
						] as f}
							<div class="flex items-center gap-2.5">
								<div class="w-1 h-1 rounded-full bg-[#2a2a2a] shrink-0"></div>
								<span class="text-xs text-[#555]">{f}</span>
							</div>
						{/each}
					</div>
				</div>
				<div class="space-y-3">
					<div class="rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] p-5">
						<p class="text-[10px] text-[#333] mb-2">Free trial</p>
						<p class="text-sm text-white font-medium">Full platform access</p>
						<p class="text-xs text-[#444] mt-1">Dial, log calls, browse campaigns — no card required</p>
					</div>
					<div class="rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] p-5">
						<div class="flex items-baseline gap-2 mb-2">
							<p style="font-size:22px;font-weight:600;color:#fff">$20</p>
							<span class="text-xs text-[#444]">/month · Basic</span>
						</div>
						<p class="text-sm text-white font-medium">Plug-and-play dialer</p>
						<p class="text-xs text-[#444] mt-1">Access to open campaigns, full dialer, performance dashboard</p>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Community + coaching -->
	<div class="max-w-5xl mx-auto px-8 mb-20">
		<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.22em;color:#2a2a2a;margin-bottom:20px">The community</p>
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">

			<div class="rounded-2xl border border-[#1a1a1a] bg-[#080808] p-7">
				<div class="w-8 h-8 rounded-lg bg-[#0f0f0f] border border-[#1a1a1a] flex items-center justify-center text-base mb-5">🏆</div>
				<h3 class="text-white font-medium mb-3">Active sales community</h3>
				<p class="text-xs text-[#444] leading-relaxed">Real reps, real conversations. Share wins, trade objection handles, swap scripts. A community that actually dials — not a Discord full of people who used to sell.</p>
			</div>

			<div class="rounded-2xl border border-[#1a1a1a] bg-[#080808] p-7">
				<div class="w-8 h-8 rounded-lg bg-[#0f0f0f] border border-[#1a1a1a] flex items-center justify-center text-base mb-5">📡</div>
				<h3 class="text-white font-medium mb-3">Live office hours with the founder</h3>
				<p class="text-xs text-[#444] leading-relaxed">Ryan hosts live-streamed office hours — open format, no agenda. Bring your cold call recordings, your objections, your deal questions. Get real feedback from someone who still dials.</p>
			</div>

			<div class="rounded-2xl border border-[#1a1a1a] bg-[#080808] p-7">
				<div class="w-8 h-8 rounded-lg bg-[#0f0f0f] border border-[#1a1a1a] flex items-center justify-center text-base mb-5">🎯</div>
				<h3 class="text-white font-medium mb-3">Sales coaching that's actually useful</h3>
				<p class="text-xs text-[#444] leading-relaxed">AI call analysis on every call you log, timestamped coach notes from your manager, weekly benchmarks against your personal best. Not motivational quotes. Specific, technical feedback.</p>
			</div>
		</div>
	</div>

	<!-- For specialists -->
	<div class="max-w-5xl mx-auto px-8 mb-20">
		<div class="rounded-2xl border border-[#1e1a0a] bg-[#09080] p-10" style="background:#070600">
			<div class="max-w-2xl">
				<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.22em;color:#4a3a00;margin-bottom:14px">For vertical specialists</p>
				<h2 style="font-family:var(--font-display,'Playfair Display',Georgia,serif);font-weight:400;font-size:24px;letter-spacing:-.01em;color:#fff;margin-bottom:12px">
					Own a vertical? Let's put it to work.
				</h2>
				<p class="text-xs text-[#555] leading-relaxed mb-6">
					If you have deep experience in a specific industry — home improvement, healthcare, SaaS, fintech, legal, real estate — we help you find clients in that space and facilitate the relationship. You bring the expertise. We bring the infrastructure, leads, and platform. You get paid when deals close.
				</p>
				<div class="grid grid-cols-2 gap-3 mb-6 text-xs">
					{#each ['Home improvement', 'Healthcare / medical', 'SaaS & software', 'Legal & compliance', 'Real estate', 'Financial services', 'Recruiting & staffing', 'Your vertical →'] as v}
						<div class="flex items-center gap-2">
							<div class="w-1 h-1 rounded-full bg-[#333] shrink-0"></div>
							<span class="text-[#444]">{v}</span>
						</div>
					{/each}
				</div>
				<a href="/contact" class="inline-block rounded-xl border border-[#2a2a2a] px-5 py-2.5 text-xs text-[#888] hover:border-white hover:text-white transition-colors">
					Tell us your specialty →
				</a>
			</div>
		</div>
	</div>

	<!-- What you'll be doing -->
	<div class="max-w-5xl mx-auto px-8 mb-20">
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			<div>
				<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.22em;color:#2a2a2a;margin-bottom:16px">What you'll do</p>
				<div class="space-y-3">
					{#each [
						'Make outbound calls to vetted contact lists in your assigned campaigns',
						'Qualify prospects against client-defined criteria',
						"Book appointments directly to the client's calendar",
						'Log outcomes and notes after each call — takes 10 seconds',
						'Improve with AI coaching feedback that shows exactly what to fix',
					] as item}
						<div class="flex items-start gap-3">
							<div class="w-1 h-1 rounded-full bg-[#22c55e] shrink-0 mt-2"></div>
							<p class="text-xs text-[#555] leading-relaxed">{item}</p>
						</div>
					{/each}
				</div>
			</div>
			<div>
				<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.22em;color:#2a2a2a;margin-bottom:16px">This isn't for you if</p>
				<div class="space-y-3">
					{#each [
						'You need a manager to tell you when to start your day',
						'You\'re not willing to accept coaching on your calls',
						'You want hourly pay regardless of results',
						'You expect guaranteed income before you\'ve proven you can book meetings',
					] as item}
						<div class="flex items-start gap-3">
							<div class="w-1 h-1 rounded-full bg-[#ef4444] shrink-0 mt-2"></div>
							<p class="text-xs text-[#444] leading-relaxed">{item}</p>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>

	<!-- Apply section -->
	<div id="apply" class="max-w-3xl mx-auto px-8 pb-32">
		<div class="border-t border-[#0a0a0a] pt-16 mb-12 text-center">
			<h2 style="font-family:var(--font-display,'Playfair Display',Georgia,serif);font-weight:300;font-size:clamp(2rem,5vw,3.2rem);letter-spacing:-.02em;color:#fff;margin-bottom:12px">
				How it actually works.
			</h2>
			<p class="text-xs text-[#444] leading-relaxed max-w-lg mx-auto">
				Three steps. No games.
			</p>
		</div>

		<!-- 3-step process -->
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
			{#each [
				{
					num: '1',
					title: 'Apply',
					body: 'Create an account and explore the platform. Browse open campaigns, see the dialer, read the scripts. Get a feel for what you\'re walking into.',
					cta: 'Start now →',
					href: '/',
					accent: false,
				},
				{
					num: '2',
					title: 'Verbal call with Ryan',
					body: 'Before your first live dial, we do a 15-minute call. You talk, Ryan listens. He hears how you sound. You hear the vision. If it\'s a fit — you\'re in the same day.',
					cta: 'Request your call →',
					href: 'mailto:ryanseverussparkssales@gmail.com?subject=Verbal call request — LeadOS&body=Hi Ryan, I\'d like to schedule my intro call.',
					accent: true,
				},
				{
					num: '3',
					title: 'Start dialing',
					body: 'Campaigns assigned, scripts loaded, dialer ready. The AI brief loads before each call. Log your outcomes. Get paid per appointment via Stripe.',
					cta: null,
					href: null,
					accent: false,
				},
			] as step}
				<div class="rounded-2xl border {step.accent ? 'border-white/20 bg-[#0a0a0a]' : 'border-[#1a1a1a] bg-[#080808]'} p-7">
					<div style="font-size:28px;font-weight:600;color:{step.accent ? '#fff' : '#1a1a1a'};letter-spacing:-.03em;line-height:1;margin-bottom:14px">{step.num}</div>
					<h3 class="text-white font-medium mb-3">{step.title}</h3>
					<p class="text-xs text-[#444] leading-relaxed">{step.body}</p>
			{#if step.href}
				<a href={step.href} class="inline-block mt-4 text-xs text-[#666] hover:text-white transition-colors">{step.cta}</a>
			{/if}
		</div>
	{/each}
	</div>
	</div>
</div>
