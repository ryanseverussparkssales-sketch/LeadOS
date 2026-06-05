<script lang="ts">
	let { callState, onclick, size = 90 }: { callState: string; onclick: () => void; size?: number } = $props();
	// petals fanned symmetrically around the base at (50,72)
	const petals = [-60, -40, -20, 0, 20, 40, 60];
</script>

<button {onclick} onkeydown={(e) => e.key === 'Enter' && onclick()} aria-label="Call"
	class="dial state-{callState}" style="--s:{size}px">
	<svg viewBox="0 0 100 100" width={size} height={size} fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
		<circle cx="50" cy="50" r="46" stroke-width="0.8" opacity="0.45" />
		<g class="bloom">
			{#each petals as a, i}
				<path d="M50 72 C 42 54, 46 36, 50 26 C 54 36, 58 54, 50 72 Z"
					stroke-width={a === 0 ? 1.3 : 1} opacity={1 - Math.abs(a) / 110}
					transform="rotate({a} 50 72)" />
			{/each}
		</g>
		<!-- water line + reflection ticks -->
		<path d="M30 78 H70" stroke-width="0.9" opacity="0.5" />
		<path d="M40 82 H60" stroke-width="0.7" opacity="0.3" />
	</svg>
</button>

<style>
	.dial { position: relative; width: var(--s); height: var(--s); background: radial-gradient(circle at 50% 40%, #0e0b05 0%, #060503 72%); border: none; border-radius: 50%; padding: 0; cursor: pointer; color: #a8842f; display: flex; align-items: center; justify-content: center; transition: transform .15s ease, color .45s ease; }
	.dial:hover { transform: scale(1.05); }
	.dial svg { transition: filter .45s ease; }
	.bloom { transform-box: fill-box; transform-origin: 50% 72%; animation: breathe 6s ease-in-out infinite; }
	@keyframes breathe { 0%, 100% { transform: scale(.92); } 50% { transform: scale(1); } }

	.state-calling { color: #d4af37; }
	.state-calling .bloom { animation-duration: 1.6s; }
	.state-calling svg { filter: drop-shadow(0 0 6px rgba(212,175,55,.5)); }

	.state-connected { color: #c8a24a; }
	.state-connected .bloom { animation: none; transform: scale(1.04); }
	.state-connected svg { filter: drop-shadow(0 0 6px rgba(200,162,74,.45)); }

	@media (prefers-reduced-motion: reduce) { .bloom { animation: none; } }
</style>
