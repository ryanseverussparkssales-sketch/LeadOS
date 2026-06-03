<svelte:head>
	<title>Sales Coaching — LeadOS</title>
	<meta property="og:title" content="Sales Coaching — LeadOS" />
	<meta property="og:description" content="AI call analysis, human coach feedback, and weekly benchmarks. Know exactly what to fix and watch your numbers improve." />
	<meta property="og:image" content="https://lead-os-livid.vercel.app/og-image.png" />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="LeadOS" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Sales Coaching — LeadOS" />
	<meta name="twitter:description" content="AI call analysis, human coach feedback, and weekly benchmarks. Know exactly what to fix and watch your numbers improve." />
	<meta name="twitter:image" content="https://lead-os-livid.vercel.app/og-image.png" />
	<meta name="description" content="AI-powered call analysis, human coach feedback, and weekly benchmarks. Stop guessing what's holding your numbers back." />
</svelte:head>

<div class="min-h-screen bg-[#000] text-white" style="font-family:var(--font-ui,'Inter',system-ui,sans-serif)">

	<!-- Nav -->
	<nav class="flex items-center justify-between px-8 py-6 border-b border-[#0f0f0f]">
		<a href="/" style="font-family:var(--font-label,'Cormorant SC',serif);font-size:14px;letter-spacing:.28em;color:#fff">LEADOS</a>
		<div class="flex items-center gap-6">
			<a href="/pricing" class="text-xs text-[#444] hover:text-white transition-colors">Pricing</a>
			<a href="/marketplace" class="text-xs text-[#444] hover:text-white transition-colors">Find Reps</a>
			<a href="/contact" class="text-xs text-[#444] hover:text-white transition-colors">Hire SDRs</a>
			<a href="/" class="text-xs text-[#444] hover:text-white border border-[#1e1e1e] px-4 py-1.5 rounded-lg hover:border-white transition-colors">Log in →</a>
		</div>
	</nav>

	<!-- Hero -->
	<div class="max-w-4xl mx-auto px-8 pt-20 pb-20 text-center">
		<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:10px;letter-spacing:.24em;color:#333;margin-bottom:16px">Sales Coaching</p>
		<h1 style="font-family:var(--font-display,'Playfair Display',Georgia,serif);font-weight:300;font-size:clamp(2.8rem,7vw,5rem);letter-spacing:-.02em;line-height:.95;color:#fff;margin-bottom:20px">
			Know exactly why<br/>
			<span style="font-style:italic;color:#555">you're losing the call.</span>
		</h1>
		<p class="text-sm text-[#555] max-w-xl mx-auto leading-relaxed mb-10">
			Most SDRs never hear their own calls. The ones who do — and get real feedback on what to fix — outperform everyone else. LeadOS gives every rep their own coaching system.
		</p>
		<div class="flex items-center justify-center gap-4 flex-wrap">
			<a href="/marketplace/apply" class="rounded-xl bg-white px-8 py-3.5 text-sm font-semibold text-black hover:bg-[#e5e5e5] transition-colors">
				Join as a Rep
			</a>
			<a href="/contact" class="rounded-xl border border-[#2a2a2a] px-8 py-3.5 text-sm text-[#888] hover:border-white hover:text-white transition-colors">
				For teams →
			</a>
		</div>
	</div>

	<!-- How it works -->
	<div class="max-w-5xl mx-auto px-8 mb-24">
		<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.22em;color:#2a2a2a;margin-bottom:20px">The system</p>
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">

			<div class="rounded-2xl border border-[#1a1a1a] bg-[#080808] p-8">
				<div class="w-8 h-8 rounded-lg bg-[#0f0f0f] border border-[#1a1a1a] flex items-center justify-center text-sm mb-5">1</div>
				<h3 class="text-white font-medium mb-3">AI call analysis</h3>
				<p class="text-xs text-[#444] leading-relaxed">Every call you log gets transcribed and analyzed automatically. Talk-to-listen ratio, discovery questions asked, sentiment arc, objections hit. You see it all without reviewing recordings manually.</p>
			</div>

			<div class="rounded-2xl border border-[#1a1a1a] bg-[#080808] p-8">
				<div class="w-8 h-8 rounded-lg bg-[#0f0f0f] border border-[#1a1a1a] flex items-center justify-center text-sm mb-5">2</div>
				<h3 class="text-white font-medium mb-3">Human coach notes</h3>
				<p class="text-xs text-[#444] leading-relaxed">Your manager reviews recordings and leaves timestamped notes directly on your calls. Specific, actionable feedback — not just "be more confident." You see it in your coaching dashboard the moment it's written.</p>
			</div>

			<div class="rounded-2xl border border-[#1a1a1a] bg-[#080808] p-8">
				<div class="w-8 h-8 rounded-lg bg-[#0f0f0f] border border-[#1a1a1a] flex items-center justify-center text-sm mb-5">3</div>
				<h3 class="text-white font-medium mb-3">Your personal benchmark</h3>
				<p class="text-xs text-[#444] leading-relaxed">You're compared to yourself — not a leaderboard. Your best week becomes the standard. Weekly trend charts show whether you're moving toward it or away. No shame, just signal.</p>
			</div>
		</div>
	</div>

	<!-- What you actually see -->
	<div class="max-w-5xl mx-auto px-8 mb-24">
		<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.22em;color:#2a2a2a;margin-bottom:20px">Inside the platform</p>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">

			<!-- Supercut clips -->
			<div class="rounded-2xl border border-[#1a1a1a] bg-[#080808] p-8">
				<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.16em;color:#444;margin-bottom:12px">Supercut Clips</p>
				<h3 class="text-white font-medium mb-3 text-lg">Your best moments, automatically surfaced</h3>
				<p class="text-xs text-[#444] leading-relaxed mb-6">The AI scans your transcripts and clips your strongest cold open, best objection handle, and most standout moment. Pin three to your public marketplace profile to show brands what you're capable of before they even talk to you.</p>
				<div class="space-y-2.5">
					{#each [
						['Cold opener', 'The first 15 seconds that got past the gatekeeper'],
						['Objection handle', 'The reframe that turned a "not interested" around'],
						['Standout moment', 'The exchange that best shows your style'],
					] as [type, desc]}
						<div class="flex items-start gap-3 rounded-xl border border-[#111] bg-[#040404] px-4 py-3">
							<span class="text-[10px] text-[#333] font-mono mt-0.5 shrink-0 w-20">{type}</span>
							<p class="text-[10px] text-[#444]">{desc}</p>
						</div>
					{/each}
				</div>
			</div>

			<!-- AI interview -->
			<div class="rounded-2xl border border-[#1e1e2e] bg-[#06060f] p-8">
				<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.16em;color:#555;margin-bottom:12px">AI Interview</p>
				<h3 class="text-white font-medium mb-3 text-lg">Earn your score. Unlock your profile.</h3>
				<p class="text-xs text-[#555] leading-relaxed mb-6">Five sales questions. Scored on technique, not personality. Hit 70+ and your public marketplace profile goes live — brands can find and hire you directly for their campaigns.</p>

				<div class="rounded-xl border border-purple-900/30 bg-purple-950/10 p-5 mb-4">
					<div class="flex items-center justify-between mb-3">
						<p class="text-xs text-purple-400">Interview score</p>
						<span class="text-2xl font-bold text-purple-300">84</span>
					</div>
					<div class="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
						<div class="h-full bg-purple-500 rounded-full" style="width:84%"></div>
					</div>
					<div class="flex justify-between mt-1.5">
						<span class="text-[9px] text-[#333]">0</span>
						<span class="text-[9px] text-purple-600">70 = profile live</span>
						<span class="text-[9px] text-[#333]">100</span>
					</div>
				</div>

				<p class="text-[10px] text-[#333]">Score ≥ 70 unlocks Live Roleplay mode — practice cold opens against an AI prospect in real time.</p>
			</div>
		</div>
	</div>

	<!-- For teams / managers -->
	<div class="max-w-5xl mx-auto px-8 mb-24">
		<div class="rounded-2xl border border-[#1a1a1a] bg-[#060606] p-10 md:p-14">
			<div class="max-w-2xl">
				<p style="font-family:var(--font-label,'Cormorant SC',serif);font-size:9px;letter-spacing:.22em;color:#2a2a2a;margin-bottom:14px">For managers</p>
				<h2 style="font-family:var(--font-display,'Playfair Display',Georgia,serif);font-weight:400;font-size:28px;letter-spacing:-.01em;color:#fff;margin-bottom:12px">
					You shouldn't have to listen to every call to coach well.
				</h2>
				<p class="text-xs text-[#444] leading-relaxed mb-8">
					The call review page shows every recorded call with the transcript and AI summary pre-loaded. Click into any call, scrub the recording, and leave a timestamped note in seconds. Your rep sees the feedback in their dashboard — no Slack thread, no separate doc.
				</p>
				<div class="grid grid-cols-2 gap-4 mb-8">
					{#each [
						['1 click', 'to pull up any rep\'s call with full context'],
						['Timestamped', 'notes pinned to exact moments in the recording'],
						['Star rating', 'per call — reps see their average over time'],
						['No extra tool', 'coaching lives inside the same platform they dial from'],
					] as [stat, desc]}
						<div class="border-l border-[#1a1a1a] pl-4">
							<p class="text-sm font-semibold text-white mb-0.5">{stat}</p>
							<p class="text-[10px] text-[#444]">{desc}</p>
						</div>
					{/each}
				</div>
				<a href="/contact" class="inline-block rounded-xl border border-[#2a2a2a] px-6 py-2.5 text-xs text-[#888] hover:border-white hover:text-white transition-colors">
					Set up coaching for your team →
				</a>
			</div>
		</div>
	</div>

	<!-- CTA -->
	<div class="max-w-3xl mx-auto px-8 pb-32 text-center">
		<h2 style="font-family:var(--font-display,'Playfair Display',Georgia,serif);font-weight:300;font-size:clamp(2rem,5vw,3rem);letter-spacing:-.02em;color:#fff;margin-bottom:12px">
			Ready to hear<br/>what you sound like?
		</h2>
		<p class="text-xs text-[#444] mb-10">Join as a rep and start dialing. Your coaching dashboard fills up automatically after your first calls.</p>
		<a href="/marketplace/apply" class="inline-block rounded-xl bg-white px-10 py-4 text-sm font-semibold text-black hover:bg-[#e5e5e5] transition-colors">
			Apply to join →
		</a>
	</div>

	<!-- Footer -->
	<div class="border-t border-[#0a0a0a] px-8 py-8 flex flex-col md:flex-row items-center justify-between gap-4 max-w-5xl mx-auto">
		<span style="font-family:var(--font-label,'Cormorant SC',serif);font-size:12px;letter-spacing:.22em;color:#222">LEADOS</span>
		<div class="flex items-center gap-6 text-[10px] text-[#2a2a2a]">
			<a href="/pricing" class="hover:text-white transition-colors">Pricing</a>
			<a href="/marketplace" class="hover:text-white transition-colors">Marketplace</a>
			<a href="/about" class="hover:text-white transition-colors">About</a>
			<a href="/terms" class="hover:text-white transition-colors">Terms</a>
			<a href="/privacy" class="hover:text-white transition-colors">Privacy</a>
			<a href="/contact" class="hover:text-white transition-colors">Contact</a>
		</div>
		<span class="text-[10px] text-[#1a1a1a]">© 2026 Sparks Curiosity Studio</span>
	</div>

</div>
