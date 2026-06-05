<script lang="ts">
	let { callState, onclick, size = 90 }: { callState: string; onclick: () => void; size?: number } = $props();
	const outer = Array.from({ length: 12 }, (_, i) => i * 30);
	const mid = Array.from({ length: 8 }, (_, i) => i * 45);
</script>

<button {onclick} onkeydown={(e) => e.key === 'Enter' && onclick()} aria-label="Call"
	class="dial state-{callState}" style="--s:{size}px">
	<svg viewBox="0 0 100 100" width={size} height={size} fill="none" stroke="currentColor" stroke-linecap="round">
		<g class="spin-cw">
			<circle cx="50" cy="50" r="46" stroke-width="0.8" opacity="0.55" />
			{#each outer as a}
				<path d="M50 6 C 53 12, 53 17, 50 21 C 47 17, 47 12, 50 6 Z" stroke-width="0.9" transform="rotate({a} 50 50)" />
			{/each}
		</g>
		<circle cx="50" cy="50" r="33" stroke-width="0.7" opacity="0.7" />
		<g class="spin-ccw">
			{#each mid as a}
				<path d="M50 19 C 53.5 25, 53.5 31, 50 36 C 46.5 31, 46.5 25, 50 19 Z" stroke-width="0.9" transform="rotate({a} 50 50)" />
			{/each}
		</g>
		<circle cx="50" cy="50" r="16" stroke-width="0.7" opacity="0.6" />
		<!-- center handset -->
		<g transform="translate(38 38) scale(1)" stroke-width="1.6" stroke-linejoin="round">
			<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.18 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
		</g>
	</svg>
</button>

<style>
	.dial { position: relative; width: var(--s); height: var(--s); background: radial-gradient(circle at 50% 45%, #0e0b05 0%, #060503 70%); border: none; border-radius: 50%; padding: 0; cursor: pointer; color: #a8842f; display: flex; align-items: center; justify-content: center; transition: transform .15s ease, color .45s ease; }
	.dial:hover { transform: scale(1.05); }
	.dial svg { transition: filter .45s ease; }
	.spin-cw, .spin-ccw { transform-box: fill-box; transform-origin: 50% 50%; }
	.spin-cw { animation: spin 52s linear infinite; }
	.spin-ccw { animation: spin 40s linear infinite reverse; }
	@keyframes spin { to { transform: rotate(360deg); } }

	.state-calling { color: #d4af37; }
	.state-calling .spin-cw { animation-duration: 7s; }
	.state-calling .spin-ccw { animation-duration: 5.5s; }
	.state-calling svg { filter: drop-shadow(0 0 6px rgba(212,175,55,.5)); }

	.state-connected { color: #c8a24a; }
	.state-connected .spin-cw { animation-duration: 26s; }
	.state-connected .spin-ccw { animation-duration: 20s; }
	.state-connected svg { filter: drop-shadow(0 0 5px rgba(200,162,74,.4)); }

	@media (prefers-reduced-motion: reduce) { .spin-cw, .spin-ccw { animation: none; } }
</style>
