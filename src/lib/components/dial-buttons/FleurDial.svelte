<script lang="ts">
	let { callState, onclick, size = 90 }: { callState: string; onclick: () => void; size?: number } = $props();
</script>

<button {onclick} onkeydown={(e) => e.key === 'Enter' && onclick()} aria-label="Call"
	class="dial state-{callState}" style="--s:{size}px">
	<svg viewBox="0 0 100 100" width={size} height={size} fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
		<circle cx="50" cy="50" r="46" stroke-width="0.8" opacity="0.45" />
		<circle cx="50" cy="50" r="40" stroke-width="0.5" opacity="0.25" />
		<g class="crest" stroke-width="1.4">
			<!-- central bud -->
			<path d="M50 20 C 44 30, 44 44, 50 52 C 56 44, 56 30, 50 20 Z" />
			<!-- left frond -->
			<path d="M50 47 C 40 49, 32 43, 31 33 C 30 41, 33 53, 45 57" />
			<!-- right frond -->
			<path d="M50 47 C 60 49, 68 43, 69 33 C 70 41, 67 53, 55 57" />
			<!-- binding band -->
			<path d="M39 57 Q 50 61 61 57" stroke-width="1.2" />
			<!-- lower base -->
			<path d="M50 57 C 47 65, 47 72, 50 77 C 53 72, 53 65, 50 57 Z" />
			<path d="M44 61 C 40 65, 39 69, 41 73" />
			<path d="M56 61 C 60 65, 61 69, 59 73" />
		</g>
	</svg>
</button>

<style>
	.dial { position: relative; width: var(--s); height: var(--s); background: radial-gradient(circle at 50% 42%, #100c06 0%, #060503 72%); border: none; border-radius: 50%; padding: 0; cursor: pointer; color: #a8842f; display: flex; align-items: center; justify-content: center; transition: transform .15s ease, color .45s ease; }
	.dial:hover { transform: scale(1.05); }
	.dial svg { transition: filter .45s ease; }
	.crest { transform-box: fill-box; transform-origin: 50% 50%; animation: glow 5.5s ease-in-out infinite; }
	@keyframes glow { 0%, 100% { opacity: .72; } 50% { opacity: 1; } }

	.state-calling { color: #d4af37; }
	.state-calling .crest { animation-duration: 1.4s; }
	.state-calling svg { filter: drop-shadow(0 0 6px rgba(212,175,55,.55)); }

	.state-connected { color: #c8a24a; }
	.state-connected .crest { animation: none; opacity: 1; }
	.state-connected svg { filter: drop-shadow(0 0 6px rgba(200,162,74,.45)); }

	@media (prefers-reduced-motion: reduce) { .crest { animation: none; } }
</style>
