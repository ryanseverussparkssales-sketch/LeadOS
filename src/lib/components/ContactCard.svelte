<script lang="ts">
	import type { Contact } from '$lib/stores';

	let { contact, onDial, onSkip }: { contact: Contact; onDial: () => void; onSkip: () => void } = $props();
</script>

<div class="rounded-xl border border-[#2a2a2a] bg-[#111111] p-8">
	<!-- Contact info -->
	<div class="mb-4 text-center">
		<div class="flex items-center justify-center gap-2">
			<h2 class="text-2xl font-semibold text-white">{contact.name}</h2>
			{#if contact.contact_score}
				<span class="text-xs font-mono font-bold {contact.contact_score >= 70 ? 'text-green-400' : contact.contact_score >= 45 ? 'text-yellow-400' : 'text-[#555]'}"
					title="Lead score">
					{contact.contact_score}
				</span>
			{/if}
		</div>
		{#if contact.title}
			<p class="text-[#999] text-sm mt-1">{contact.title}</p>
		{/if}
		{#if contact.company}
			<p class="text-[#666] text-sm">{contact.company}</p>
		{/if}
	</div>

	<div class="mb-6 text-center">
		<p class="text-[#555] text-xs uppercase tracking-widest mb-1">Phone</p>
		<a
			href="/phone?number={encodeURIComponent(contact.phone)}"
			title="Open in Phone tab"
			class="text-white text-lg hover:text-green-400 transition-colors"
			style="font-family: var(--font-mono)"
		>
			{contact.phone}
		</a>
	</div>

	{#if contact.tags && contact.tags.length > 0}
		<div class="flex flex-wrap gap-2 justify-center mb-6">
			{#each contact.tags as tag}
				<span
					class="px-2 py-1 rounded text-xs font-medium"
					style="background-color: {tag.color}20; color: {tag.color}; border: 1px solid {tag.color}40"
				>
					{tag.name}
				</span>
			{/each}
		</div>
	{/if}

	<!-- Death Star Dial Button -->
	<div class="flex flex-col items-center gap-4 mt-2">
		<button
			onclick={onDial}
			class="group relative focus:outline-none"
			title="Dial"
			style="width: 148px; height: 148px;"
		>
			<svg
				viewBox="0 0 148 148"
				xmlns="http://www.w3.org/2000/svg"
				class="w-full h-full transition-all duration-150 group-hover:scale-105 group-active:scale-95 drop-shadow-lg group-hover:drop-shadow-2xl"
			>
				<defs>
					<!-- Main sphere gradient — light at top-left, darker at bottom-right -->
					<radialGradient id="sphere" cx="35%" cy="30%" r="70%">
						<stop offset="0%"   stop-color="#f0f0ef" />
						<stop offset="40%"  stop-color="#d4d4d0" />
						<stop offset="75%"  stop-color="#a8a8a4" />
						<stop offset="100%" stop-color="#6a6a68" />
					</radialGradient>
					<!-- Superlaser dish gradient — concave shadow effect -->
					<radialGradient id="dish" cx="65%" cy="35%" r="70%">
						<stop offset="0%"   stop-color="#c8c8c4" />
						<stop offset="50%"  stop-color="#888884" />
						<stop offset="100%" stop-color="#404040" />
					</radialGradient>
					<!-- Dish highlight -->
					<radialGradient id="dishInner" cx="40%" cy="35%" r="65%">
						<stop offset="0%"   stop-color="#b0b0ac" />
						<stop offset="100%" stop-color="#505050" />
					</radialGradient>
					<!-- Hover glow -->
					<filter id="glow">
						<feGaussianBlur stdDeviation="3" result="blur" />
						<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
					</filter>
					<clipPath id="sphereClip">
						<circle cx="74" cy="74" r="70" />
					</clipPath>
				</defs>

				<!-- Main sphere -->
				<circle cx="74" cy="74" r="70" fill="url(#sphere)" />

				<!-- Surface panel lines clipped to sphere -->
				<g clip-path="url(#sphereClip)" opacity="0.25">
					<!-- Horizontal latitude lines -->
					<ellipse cx="74" cy="74" rx="70" ry="12" fill="none" stroke="#333" stroke-width="0.6"/>
					<ellipse cx="74" cy="55" rx="66" ry="9" fill="none" stroke="#444" stroke-width="0.4"/>
					<ellipse cx="74" cy="93" rx="66" ry="9" fill="none" stroke="#444" stroke-width="0.4"/>
					<!-- Vertical meridians -->
					<ellipse cx="74" cy="74" rx="12" ry="70" fill="none" stroke="#333" stroke-width="0.5"/>
					<ellipse cx="74" cy="74" rx="35" ry="70" fill="none" stroke="#333" stroke-width="0.4"/>
				</g>

				<!-- Equatorial trench — the prominent band -->
				<g clip-path="url(#sphereClip)">
					<rect x="4" y="69" width="140" height="10" fill="#2a2a28" opacity="0.55"/>
					<rect x="4" y="70.5" width="140" height="1.5" fill="#1a1a18" opacity="0.7"/>
					<rect x="4" y="77" width="140" height="1" fill="#3a3a38" opacity="0.5"/>
				</g>

				<!-- Superlaser dish — upper-left quadrant -->
				<!-- Outer dish ring -->
				<circle cx="52" cy="50" r="24" fill="#555552" clip-path="url(#sphereClip)"/>
				<!-- Dish surface -->
				<circle cx="52" cy="50" r="21" fill="url(#dish)" clip-path="url(#sphereClip)"/>
				<!-- Inner concave bowl -->
				<circle cx="52" cy="50" r="14" fill="url(#dishInner)" clip-path="url(#sphereClip)"/>
				<!-- Focal point connector lines -->
				<g clip-path="url(#sphereClip)" opacity="0.5">
					<line x1="52" y1="36" x2="52" y2="50" stroke="#777" stroke-width="0.8"/>
					<line x1="38" y1="50" x2="52" y2="50" stroke="#777" stroke-width="0.8"/>
					<line x1="44" y1="41" x2="52" y2="50" stroke="#777" stroke-width="0.6"/>
					<line x1="60" y1="41" x2="52" y2="50" stroke="#777" stroke-width="0.6"/>
					<line x1="60" y1="59" x2="52" y2="50" stroke="#777" stroke-width="0.6"/>
					<line x1="44" y1="59" x2="52" y2="50" stroke="#777" stroke-width="0.6"/>
				</g>
				<!-- Focal point -->
				<circle cx="52" cy="50" r="3.5" fill="#a8a8a4" stroke="#888" stroke-width="0.5" clip-path="url(#sphereClip)"/>
				<!-- Dish rim highlight -->
				<circle cx="52" cy="50" r="21" fill="none" stroke="#888884" stroke-width="0.8" clip-path="url(#sphereClip)"/>

				<!-- Sphere edge highlight (rim light) -->
				<circle cx="74" cy="74" r="70" fill="none" stroke="#c8c8c4" stroke-width="1" opacity="0.4"/>
				<!-- Top-left specular highlight -->
				<ellipse cx="50" cy="36" rx="16" ry="8" fill="white" opacity="0.08"/>

				<!-- DIAL label -->
				<text
					x="74" y="108"
					text-anchor="middle"
					font-family="var(--font-mono, monospace)"
					font-size="11"
					font-weight="600"
					letter-spacing="4"
					fill="#1a1a18"
					opacity="0.7"
				>DIAL</text>

				<!-- Hover green tint overlay -->
				<circle cx="74" cy="74" r="70" fill="#22c55e" opacity="0" class="group-hover:opacity-[0.08] transition-opacity duration-150"/>
			</svg>
		</button>

		<!-- Skip button — small, below the Death Star -->
		<button
			onclick={onSkip}
			class="text-xs text-[#444] hover:text-[#888] transition-colors tracking-widest uppercase border border-[#222] hover:border-[#444] rounded px-6 py-1.5"
		>
			Skip →
		</button>
	</div>
</div>
