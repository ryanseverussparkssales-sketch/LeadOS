<svelte:head>
	<title>About — Sparks Curiosity Studio</title>
	<meta property="og:title" content="About — Sparks Curiosity Studio" />
	<meta property="og:description" content="We built the outreach infrastructure we needed ourselves. LeadOS is our platform. Sparks Curiosity Studio is our agency." />
	<meta property="og:image" content="https://lead-os-livid.vercel.app/og-image.png" />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="LeadOS" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="About — Sparks Curiosity Studio" />
	<meta name="twitter:description" content="We built the outreach infrastructure we needed ourselves. LeadOS is our platform. Sparks Curiosity Studio is our agency." />
	<meta name="twitter:image" content="https://lead-os-livid.vercel.app/og-image.png" />
	<meta name="description" content="We built the outreach infrastructure we wish existed. LeadOS is our platform. Sparks Curiosity Studio is our agency. Here's the story." />
</svelte:head>

<div class="min-h-screen bg-[#000] text-white" style="font-family:var(--font-ui,'Inter',system-ui,sans-serif)">

	<!-- Nav -->
	<nav class="flex items-center justify-between px-8 py-6 border-b border-[#0f0f0f]">
		<a href="/" style="font-family:var(--font-label,'Cormorant SC',serif);font-size:14px;letter-spacing:.28em;color:#fff">LEADOS</a>
		<div class="flex items-center gap-6">
			<a href="/pricing" class="text-xs text-[#444] hover:text-white transition-colors">Pricing</a>
			<a href="/coaching" class="text-xs text-[#444] hover:text-white transition-colors">Coaching</a>
			<a href="/contact" class="text-xs text-[#444] hover:text-white transition-colors">Contact</a>
			<a href="/" class="text-xs text-[#444] hover:text-white border border-[#1e1e1e] px-4 py-1.5 rounded-lg hover:border-white transition-colors">Log in →</a>
		</div>
	</nav>

	<!-- Hero -->
	<div class="max-w-3xl mx-auto px-8 pt-20 pb-16">
		<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:10px;letter-spacing:.24em;color:#333;margin-bottom:16px">About</p>
		<h1 style="font-family:var(--font-display,'Playfair Display',Georgia,serif);font-weight:300;font-size:clamp(2.4rem,6vw,4rem);letter-spacing:-.02em;line-height:.95;color:#fff;margin-bottom:24px">
			We built the tool<br/>
			<span style="font-style:italic;color:#444">we needed ourselves.</span>
		</h1>
		<p class="text-sm text-[#555] leading-relaxed max-w-2xl">
			Sparks Curiosity Studio is a managed outreach agency. LeadOS is the platform we built to run it. Both are available to you — together or separately.
		</p>
	</div>

	<!-- Story -->
	<div class="max-w-3xl mx-auto px-8 mb-20">
		<div class="space-y-8 border-l border-[#111] pl-8">

			<div>
				<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.18em;color:#2a2a2a;margin-bottom:8px">The problem</p>
				<p class="text-sm text-[#666] leading-relaxed">
					Outbound sales tooling splits into two bad options: enterprise CRM platforms that cost a fortune and take months to configure, or cheap dialers with no analytics, no client visibility, and no way to actually improve a rep's performance. Neither was built for a lean outreach agency trying to serve multiple clients at once.
				</p>
			</div>

			<div>
				<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.18em;color:#2a2a2a;margin-bottom:8px">What we built</p>
				<p class="text-sm text-[#666] leading-relaxed">
					LeadOS started as an internal tool for managing our own SDR team. It needed three things no single platform offered: a fast, AI-enhanced dialer for reps, a transparent client portal that builds trust without weekly report calls, and an agency command center that gives one person full operational visibility across every campaign and client simultaneously.
				</p>
			</div>

			<div>
				<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.18em;color:#2a2a2a;margin-bottom:8px">Where we are now</p>
				<p class="text-sm text-[#666] leading-relaxed">
					Sparks Curiosity Studio operates outbound campaigns for brands in home improvement, B2B services, and adjacent verticals. We run appointment-setting and lead rejuvenation programs, performance-based and retainer models. LeadOS is the infrastructure behind every campaign we run — and now it's available to other teams and agencies too.
				</p>
			</div>
		</div>
	</div>

	<!-- What we believe -->
	<div class="max-w-5xl mx-auto px-8 mb-20">
		<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.22em;color:#2a2a2a;margin-bottom:20px">What we believe</p>
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			{#each [
				{
					title: 'Outreach should be measurable',
					body: 'Every call logged. Every outcome tracked. Every appointment tied to a rep and a campaign. If you can\'t see it, you can\'t improve it — and you definitely can\'t report it to a client.',
				},
				{
					title: 'Reps deserve real feedback',
					body: 'Most SDRs get vague direction and no coaching. We built AI call analysis and timestamped human feedback directly into the workflow — not as an add-on, but as the default.',
				},
				{
					title: 'Clients deserve transparency',
					body: 'The client portal shows every call, every recording, every appointment, every week — without anyone having to pull a report. Trust is built on visibility, not on claims.',
				},
			] as item}
				<div class="rounded-2xl border border-[#1a1a1a] bg-[#080808] p-7">
					<h3 class="text-white font-medium mb-3 text-sm">{item.title}</h3>
					<p class="text-xs text-[#444] leading-relaxed">{item.body}</p>
				</div>
			{/each}
		</div>
	</div>

	<!-- Who we serve -->
	<div class="max-w-5xl mx-auto px-8 mb-20">
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">

			<div class="rounded-2xl border border-[#1a1a1a] bg-[#060606] p-10">
				<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.18em;color:#333;margin-bottom:14px">For brands & companies</p>
				<h3 style="font-family:var(--font-display,'Playfair Display',Georgia,serif);font-weight:400;font-size:22px;color:#fff;margin-bottom:10px">You need appointments.<br/>We set them.</h3>
				<p class="text-xs text-[#555] leading-relaxed mb-6">Home improvement, B2B services, SaaS, fintech — if your sale starts with a conversation, we can build and run the outreach motion. Performance-based or retainer. Contact us to see if we're a fit.</p>
				<div class="space-y-2 mb-6">
					{#each ['Home improvement (windows, roofing, solar, HVAC)','B2B appointment setting','Lead database rejuvenation','Customer insight & marketing activation'] as v}
						<div class="flex items-center gap-2">
							<div class="w-1 h-1 rounded-full bg-[#2a2a2a] shrink-0"></div>
							<span class="text-[11px] text-[#444]">{v}</span>
						</div>
					{/each}
				</div>
				<a href="/contact" class="inline-block rounded-xl border border-[#2a2a2a] px-5 py-2 text-xs text-[#888] hover:border-white hover:text-white transition-colors">
					Talk to us →
				</a>
			</div>

			<div class="rounded-2xl border border-[#1a1a1a] bg-[#060606] p-10">
				<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.18em;color:#333;margin-bottom:14px">For sales reps</p>
				<h3 style="font-family:var(--font-display,'Playfair Display',Georgia,serif);font-weight:400;font-size:22px;color:#fff;margin-bottom:10px">Dial campaigns.<br/>Earn per appointment.</h3>
				<p class="text-xs text-[#555] leading-relaxed mb-6">We provide the dialer, the scripts, the leads, and the coaching. You dial when you want. You get paid per qualified appointment set — directly to your Stripe account, no invoicing required.</p>
				<div class="space-y-2 mb-6">
					{#each ['Performance-based, no hourly floor','AI coaching feedback on every call','Public marketplace profile to attract brands','Stripe Connect payouts per appointment'] as v}
						<div class="flex items-center gap-2">
							<div class="w-1 h-1 rounded-full bg-[#2a2a2a] shrink-0"></div>
							<span class="text-[11px] text-[#444]">{v}</span>
						</div>
					{/each}
				</div>
				<a href="/marketplace" class="inline-block rounded-xl border border-[#2a2a2a] px-5 py-2 text-xs text-[#888] hover:border-white hover:text-white transition-colors">
					View open campaigns →
				</a>
			</div>
		</div>
	</div>

	<!-- Team / founder -->
	<div class="max-w-3xl mx-auto px-8 mb-24">
		<div class="border-t border-[#0a0a0a] pt-14">
			<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.22em;color:#2a2a2a;margin-bottom:20px">Founded by</p>
			<div class="flex items-start gap-6">
				<div class="w-12 h-12 rounded-xl border border-[#1a1a1a] bg-[#080808] flex items-center justify-center text-lg font-semibold text-[#444] shrink-0">R</div>
				<div>
					<p class="text-white font-medium mb-0.5">Ryan Sparks</p>
					<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.14em;color:#333;margin-bottom:10px">Sparks Curiosity Studio · LeadOS</p>
					<p class="text-xs text-[#444] leading-relaxed max-w-lg">
						Sales professional, actor, writer, and builder. Spent years doing outbound the hard way before deciding to build the tool that should have existed. LeadOS runs every campaign we run — which means every bug matters and every feature has to earn its place.
					</p>
					<div class="flex items-center gap-4 mt-4">
						<a href="mailto:ryanseverussparkssales@gmail.com" class="text-[10px] text-[#333] hover:text-white transition-colors">Email</a>
						<span class="text-[#1e1e1e]">·</span>
						<a href="/contact" class="text-[10px] text-[#333] hover:text-white transition-colors">Work with us</a>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- CTA -->
	<div class="max-w-3xl mx-auto px-8 pb-32 text-center border-t border-[#0a0a0a] pt-16">
		<h2 style="font-family:var(--font-display,'Playfair Display',Georgia,serif);font-weight:300;font-size:clamp(1.8rem,4vw,2.8rem);letter-spacing:-.02em;color:#fff;margin-bottom:12px">
			Let's build something together.
		</h2>
		<p class="text-xs text-[#444] mb-10">Whether you need the platform, the team, or both — start with a conversation.</p>
		<div class="flex items-center justify-center gap-4 flex-wrap">
			<a href="/contact" class="rounded-xl bg-white px-8 py-3.5 text-sm font-semibold text-black hover:bg-[#e5e5e5] transition-colors">
				Get in touch
			</a>
			<a href="/pricing" class="rounded-xl border border-[#2a2a2a] px-8 py-3.5 text-sm text-[#888] hover:border-white hover:text-white transition-colors">
				See pricing →
			</a>
		</div>
	</div>

	<!-- Footer -->
	<div class="border-t border-[#0a0a0a] px-8 py-8 flex flex-col md:flex-row items-center justify-between gap-4 max-w-5xl mx-auto">
		<span style="font-family:var(--font-label,'Cormorant SC',serif);font-size:12px;letter-spacing:.22em;color:#222">LEADOS</span>
		<div class="flex items-center gap-6 text-[10px] text-[#2a2a2a]">
			<a href="/pricing" class="hover:text-white transition-colors">Pricing</a>
			<a href="/coaching" class="hover:text-white transition-colors">Coaching</a>
			<a href="/marketplace" class="hover:text-white transition-colors">Marketplace</a>
			<a href="/terms" class="hover:text-white transition-colors">Terms</a>
			<a href="/privacy" class="hover:text-white transition-colors">Privacy</a>
			<a href="/contact" class="hover:text-white transition-colors">Contact</a>
		</div>
		<span class="text-[10px] text-[#1a1a1a]">© 2026 Sparks Curiosity Studio</span>
	</div>

</div>
