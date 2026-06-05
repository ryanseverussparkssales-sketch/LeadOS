<svelte:head><title>Help & Support — RogueOS</title></svelte:head>
<div class="flex flex-col flex-1 h-full items-center justify-center px-8">
	<div class="max-w-lg text-center space-y-6">
		<p class="text-5xl">🛟</p>
		<h1 class="text-white text-2xl font-semibold">Help & Support</h1>
		<p class="text-[#555] text-sm leading-relaxed">
			Need help with RogueOS? Jump back into setup or your account below.
		</p>
		<div class="rounded-xl border border-[#1a1a1a] bg-[#111] p-5 text-left">
			<p class="text-xs text-[#555] uppercase tracking-widest mb-3">Quick links</p>
			<div class="space-y-2">
				{#each [
					['/onboarding', 'Re-run setup wizard'],
					['/settings', 'Account settings'],
					['/numbers', 'Phone numbers & Twilio'],
					['/team', 'Manage your team'],
				] as [href, label]}
					<a {href} class="flex items-center gap-2 text-sm text-[#888] hover:text-white transition-colors">
						<span class="text-[#333]">→</span> {label}
					</a>
				{/each}
			</div>
		</div>
	</div>
</div>
